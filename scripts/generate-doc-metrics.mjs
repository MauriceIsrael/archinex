import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Recursively list files matching a predicate under a directory.
 * @param {string} dir
 * @param {(relPath: string) => boolean} predicate
 * @param {string} [baseDir]
 * @returns {string[]}
 */
function walkFiles(dir, predicate, baseDir = dir) {
	if (!fs.existsSync(dir)) return [];
	const results = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkFiles(full, predicate, baseDir));
		} else if (entry.isFile()) {
			const rel = path.relative(baseDir, full).replace(/\\/g, '/');
			if (predicate(rel)) results.push(full);
		}
	}
	return results.sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Count `it(...)` and `test(...)` declarations in a Vitest / Playwright file.
 * @param {string} content
 * @returns {number}
 */
export function countTestCases(content) {
	const matches = content.match(/^\s*(?:it|test)(?:\.(?:only|skip|todo|each))?\s*\(/gm);
	return matches ? matches.length : 0;
}

/**
 * Count OPA/Rego rule blocks (`deny`, `violations`, `warn`, `allow`, etc.) in a `.rego` file.
 * @param {string} content
 * @returns {number}
 */
export function countRegoRules(content) {
	const matches = content.match(
		/^\s*(?:deny(?:_[a-zA-Z0-9_]+)?|violations?|warn(?:_[a-zA-Z0-9_]+)?)\s+contains\b/gm
	);
	return matches ? matches.length : 0;
}

/**
 * Collect objective repository metrics directly from source files.
 * @param {string} [rootDir]
 */
export function collectRepoMetrics(rootDir = process.cwd()) {
	const testsDir = path.join(rootDir, 'tests');
	const vitestFiles = walkFiles(
		testsDir,
		(rel) => /\.(test|spec)\.(ts|js|mjs)$/.test(rel) && !rel.startsWith('e2e/browser/')
	);
	const playwrightFiles = walkFiles(
		testsDir,
		(rel) => /\.(test|spec)\.(ts|js|mjs)$/.test(rel) && rel.startsWith('e2e/browser/')
	);

	let vitestCases = 0;
	for (const f of vitestFiles) {
		vitestCases += countTestCases(fs.readFileSync(f, 'utf-8'));
	}

	let playwrightCases = 0;
	for (const f of playwrightFiles) {
		playwrightCases += countTestCases(fs.readFileSync(f, 'utf-8'));
	}

	const policiesDir = path.join(rootDir, 'edp', 'policies');
	const regoFiles = walkFiles(policiesDir, (rel) => rel.endsWith('.rego'));
	const regoBreakdown = regoFiles.map((filePath) => {
		const content = fs.readFileSync(filePath, 'utf-8');
		return {
			file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
			rules: countRegoRules(content)
		};
	});
	const totalRegoRules = regoBreakdown.reduce((sum, item) => sum + item.rules, 0);

	const adrDir = path.join(rootDir, 'docs', 'adr');
	const adrFiles = walkFiles(adrDir, (rel) => /^ADR-\d+.*\.md$/i.test(rel));

	let ontologyStats = { concepts: 0, axes: 0, leaves: 0, triplets: 0 };
	const ontologyPath = path.join(rootDir, 'tests', 'fixtures', 'edp', 'ontology_export.json');
	if (fs.existsSync(ontologyPath)) {
		const raw = JSON.parse(fs.readFileSync(ontologyPath, 'utf-8'));
		/** @type {Array<{ kind?: string }>} */
		const entities = Array.isArray(raw.entities) ? raw.entities : [];
		const relations = Array.isArray(raw.relations)
			? raw.relations
			: Array.isArray(raw.triplets)
				? raw.triplets
				: [];
		ontologyStats = {
			concepts: entities.filter((e) => e.kind === 'concept' || e.kind === 'hld_concept').length,
			axes: entities.filter((e) => e.kind === 'axis').length,
			leaves: entities.filter((e) => e.kind === 'leaf').length,
			triplets: relations.length
		};
	}

	return {
		vitestFiles: vitestFiles.length,
		vitestCases,
		playwrightFiles: playwrightFiles.length,
		playwrightCases,
		regoFiles: regoFiles.length,
		totalRegoRules,
		regoBreakdown,
		adrCount: adrFiles.length,
		ontologyStats
	};
}

/**
 * Render `docs/metrics.md` deterministically from collected metrics.
 * @param {ReturnType<typeof collectRepoMetrics>} metrics
 * @returns {string}
 */
export function renderMetricsMarkdown(metrics) {
	const policyRows = metrics.regoBreakdown
		.map((p) => `| \`${p.file}\` | ${p.rules} |`)
		.join('\n');

	return `# Métriques Générées du Dépôt — Archinex

> **Fichier généré automatiquement** par \`npm run docs:metrics\` (\`scripts/generate-doc-metrics.mjs\`).
> Ne pas modifier les chiffres à la main : exécuter \`npm run docs:metrics\` après ajout de tests, de règles OPA ou d'ADR.

---

## 1. Synthèse Qualité & Couverture

| Indicateur | Valeur mesurée | Source |
| :--- | ---: | :--- |
| Fichiers de tests Vitest (unitaires, contrat, intégration, API) | **${metrics.vitestFiles}** | \`tests/\` (hors \`tests/e2e/browser/\`) |
| Cas de tests Vitest (\`it\` / \`test\`) | **${metrics.vitestCases}** | \`tests/\` (hors \`tests/e2e/browser/\`) |
| Fichiers de parcours E2E Playwright | **${metrics.playwrightFiles}** | \`tests/e2e/browser/\` |
| Cas de tests E2E Playwright | **${metrics.playwrightCases}** | \`tests/e2e/browser/\` |
| Politiques OPA / Rego v1 | **${metrics.regoFiles}** | \`edp/policies/\` |
| Règles d'évaluation OPA (\`deny\` / \`violation\` / \`warn\`) | **${metrics.totalRegoRules}** | \`edp/policies/\` |
| Décisions d'Architecture (ADR) | **${metrics.adrCount}** | \`docs/adr/\` |

---

## 2. Détail des Politiques OPA / Rego

| Fichier de politique | Règles détectées |
| :--- | ---: |
${policyRows}

---

## 3. Socle Ontologique de Référence (Fixture CI)

Mesuré sur \`tests/fixtures/edp/ontology_export.json\` :
- **Concepts HLD** : ${metrics.ontologyStats.concepts}
- **Axes de raffinement (\`kind: "axis"\`)** : ${metrics.ontologyStats.axes}
- **Feuilles d'implémentation (\`kind: "leaf"\`)** : ${metrics.ontologyStats.leaves}
- **Relations / Triplets** : ${metrics.ontologyStats.triplets}
`;
}

function runCli() {
	const rootDir = process.cwd();
	const checkOnly = process.argv.includes('--check');
	const outPath = path.join(rootDir, 'docs', 'metrics.md');

	const metrics = collectRepoMetrics(rootDir);
	const rendered = renderMetricsMarkdown(metrics);

	if (checkOnly) {
		if (!fs.existsSync(outPath)) {
			console.error('❌ docs/metrics.md est absent. Exécutez `npm run docs:metrics`.');
			process.exit(1);
		}
		const current = fs.readFileSync(outPath, 'utf-8').replace(/\r\n/g, '\n');
		if (current !== rendered) {
			console.error('❌ docs/metrics.md n\'est pas à jour. Exécutez `npm run docs:metrics`.');
			process.exit(1);
		}
		console.log('✓ docs/metrics.md est à jour.');
		process.exit(0);
	}

	fs.writeFileSync(outPath, rendered, 'utf-8');
	console.log(
		`✓ docs/metrics.md généré (${metrics.vitestFiles} fichiers Vitest / ${metrics.vitestCases} cas, ${metrics.totalRegoRules} règles OPA, ${metrics.adrCount} ADR).`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	runCli();
}
