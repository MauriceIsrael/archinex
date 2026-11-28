import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { checkMarkdownContent, checkAllDocLinks } from '../../scripts/check-doc-links.mjs';
import {
	collectRepoMetrics,
	renderMetricsMarkdown,
	countTestCases,
	countRegoRules
} from '../../scripts/generate-doc-metrics.mjs';

const repoRoot = process.cwd();

describe('Documentation — Liens, Parcours Unique, ADRs et Métriques Générées (Issue #395)', () => {
	describe('check-doc-links.mjs (tests unitaires)', () => {
		it('détecte les liens absolus file:///', () => {
			const errors = checkMarkdownContent({
				filePath: path.join(repoRoot, 'docs/sample.md'),
				content: 'Voir [guide](file:///c:/Users/Momo/Documents/Dev/archinex/docs/fresh-install.md).',
				rootDir: repoRoot
			});
			expect(errors.some((e) => e.kind === 'absolute-file-url')).toBe(true);
		});

		it('détecte les liens relatifs cassés', () => {
			const errors = checkMarkdownContent({
				filePath: path.join(repoRoot, 'docs/sample.md'),
				content: 'Voir [manquant](./fichier-qui-nexiste-pas.md).',
				rootDir: repoRoot
			});
			expect(errors.some((e) => e.kind === 'broken-relative-link')).toBe(true);
		});

		it('détecte les chemins source inexistants entre backticks', () => {
			const errors = checkMarkdownContent({
				filePath: path.join(repoRoot, 'docs/sample.md'),
				content: 'Le module `src/lib/server/arckit/automationMarkers.ts` doit être vérifié.',
				rootDir: repoRoot
			});
			expect(errors.some((e) => e.kind === 'broken-source-path')).toBe(true);
		});

		it('accepte les liens valides, ancres, URLs externes et chemins existants', () => {
			const errors = checkMarkdownContent({
				filePath: path.join(repoRoot, 'docs/sample.md'),
				content: [
					'Voir [Concepts](concepts.md#1-un-seul-modele-de-parcours) et [Web](https://example.com).',
					'Module existant : `src/lib/domain/automationMarkers.ts`.',
					'```ts',
					'// dans un bloc de code : `src/lib/inexistant/demo.ts` ignoré',
					'```'
				].join('\n'),
				rootDir: repoRoot
			});
			expect(errors).toEqual([]);
		});
	});

	describe('Intégrité de la documentation du dépôt', () => {
		it('0 lien cassé et 0 lien absolu file:/// sur tout le dépôt', () => {
			const result = checkAllDocLinks(repoRoot);
			expect(result.filesChecked).toBeGreaterThan(10);
			expect(result.errors).toEqual([]);
		});

		it('docs/concepts.md expose le modèle unique de parcours en 5 phases et le glossaire', () => {
			const conceptsPath = path.join(repoRoot, 'docs/concepts.md');
			expect(fs.existsSync(conceptsPath)).toBe(true);
			const content = fs.readFileSync(conceptsPath, 'utf-8');
			expect(content).toContain('Phase 1 · Corpus & Règles');
			expect(content).toContain('Phase 2 · Délibération');
			expect(content).toContain('Phase 3 · Rendu HLD');
			expect(content).toContain('Phase 4 · Raffinement');
			expect(content).toContain('Phase 5 · Consolidation');
			expect(content).toContain('## 5. Glossaire');
		});

		it('ARCHITECTURE.md est scindé avec docs/architecture-contracts.md et docs/roadmap.md, sans numérotation dupliquée', () => {
			const arch = fs.readFileSync(path.join(repoRoot, 'ARCHITECTURE.md'), 'utf-8');
			expect(fs.existsSync(path.join(repoRoot, 'docs/architecture-contracts.md'))).toBe(true);
			expect(fs.existsSync(path.join(repoRoot, 'docs/roadmap.md'))).toBe(true);

			const h2Numbers = [...arch.matchAll(/^## (\d+)\.\s/gm)].map((m) => Number(m[1]));
			expect(h2Numbers.length).toBeGreaterThanOrEqual(5);
			expect(new Set(h2Numbers).size).toBe(h2Numbers.length);
		});

		it('au moins 4 ADRs couvrent Hub souverain, EDP/OPA, fail-closed en production et Nautobot', () => {
			const adrDir = path.join(repoRoot, 'docs/adr');
			const adrFiles = fs
				.readdirSync(adrDir)
				.filter((f) => /^ADR-\d+.*\.md$/i.test(f));
			expect(adrFiles.length).toBeGreaterThanOrEqual(4);
			expect(fs.existsSync(path.join(adrDir, 'README.md'))).toBe(true);
		});

		it('le prérequis OPA est documenté dans README.md et docs/fresh-install.md', () => {
			const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf-8');
			const freshInstall = fs.readFileSync(path.join(repoRoot, 'docs/fresh-install.md'), 'utf-8');
			expect(readme).toContain('install-opa.sh');
			expect(readme).toContain('install-opa.ps1');
			expect(freshInstall).toContain('install-opa.sh');
			expect(freshInstall).toContain('install-opa.ps1');
		});
	});

	describe('generate-doc-metrics.mjs', () => {
		it('compte correctement les cas de tests et les règles Rego', () => {
			expect(countTestCases('it("a", () => {});\n  test.skip("b", () => {});')).toBe(2);
			expect(countRegoRules('deny contains msg if {\n}\nviolations contains v if {\n}')).toBe(2);
		});

		it('supporte les formats array et map (Hub 1.42) pour raw.entities dans ontology_export.json', () => {
			const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archinex-metrics-'));
			try {
				const fixtureDir = path.join(tmpRoot, 'tests', 'fixtures', 'edp');
				fs.mkdirSync(fixtureDir, { recursive: true });
				const fixturePath = path.join(fixtureDir, 'ontology_export.json');

				// Format Hub 1.42 : entities est un dictionnaire URN -> entité
				fs.writeFileSync(
					fixturePath,
					JSON.stringify({
						entities: {
							'urn:c1': { kind: 'concept' },
							'urn:c2': { kind: 'hld_concept' },
							'urn:a1': { kind: 'axis' },
							'urn:l1': { kind: 'leaf' },
							'urn:l2': { kind: 'leaf' }
						},
						triplets: [{ s: 'a', p: 'b', o: 'c' }]
					}),
					'utf-8'
				);
				const mapMetrics = collectRepoMetrics(tmpRoot);
				expect(mapMetrics.ontologyStats).toEqual({ concepts: 2, axes: 1, leaves: 2, triplets: 1 });

				// Format historique : entities est un tableau
				fs.writeFileSync(
					fixturePath,
					JSON.stringify({
						entities: [{ kind: 'concept' }, { kind: 'axis' }, { kind: 'leaf' }],
						relations: [{ s: 'a', p: 'b', o: 'c' }, { s: 'd', p: 'e', o: 'f' }]
					}),
					'utf-8'
				);
				const arrayMetrics = collectRepoMetrics(tmpRoot);
				expect(arrayMetrics.ontologyStats).toEqual({ concepts: 1, axes: 1, leaves: 1, triplets: 2 });
			} finally {
				fs.rmSync(tmpRoot, { recursive: true, force: true });
			}
		});

		it('génère des métriques cohérentes et synchronisées avec docs/metrics.md', () => {
			const metrics = collectRepoMetrics(repoRoot);
			expect(metrics.vitestFiles).toBeGreaterThan(50);
			expect(metrics.vitestCases).toBeGreaterThan(500);
			expect(metrics.regoFiles).toBeGreaterThanOrEqual(3);
			expect(metrics.totalRegoRules).toBeGreaterThan(15);
			expect(metrics.adrCount).toBeGreaterThanOrEqual(4);
			expect(metrics.ontologyStats.concepts).toBeGreaterThan(0);
			expect(metrics.ontologyStats.axes).toBeGreaterThan(0);
			expect(metrics.ontologyStats.leaves).toBeGreaterThan(0);
			expect(metrics.ontologyStats.triplets).toBeGreaterThan(0);

			const rendered = renderMetricsMarkdown(metrics);
			const current = fs
				.readFileSync(path.join(repoRoot, 'docs/metrics.md'), 'utf-8')
				.replace(/\r\n/g, '\n');
			expect(current).toBe(rendered);
		});
	});
});
