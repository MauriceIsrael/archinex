import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';

describe('Isolation de la Persistance et Pureté du Code (Issue #252 & #253)', () => {
	const repoRoot = process.cwd();

	it('.gitignore contient les règles d’exclusion des artefacts de run et persistance', () => {
		const gitignorePath = resolve(repoRoot, '.gitignore');
		expect(existsSync(gitignorePath)).toBe(true);
		const content = readFileSync(gitignorePath, 'utf-8');

		expect(content).toMatch(/eval-results\//);
		expect(content).toMatch(/projects\/\*/);
		expect(content).toMatch(/\*\.db/);
		expect(content).toMatch(/\*\.sqlite/);
	});

	it('aucun fichier binaire de base de données sqlite (*.db, *.sqlite) n’est suivi dans Git', () => {
		try {
			const trackedDbs = execSync('git ls-files "*.db" "*.sqlite" "prisma/**/*.db" "prisma/**/*.sqlite"', {
				cwd: repoRoot,
				encoding: 'utf-8'
			}).trim();
			expect(trackedDbs).toBe('');
		} catch (e: any) {
			expect(e.stdout ? e.stdout.trim() : '').toBe('');
		}
	});

	it('aucun fichier d’artefacts d’évaluation eval-results/ n’est suivi dans Git', () => {
		try {
			const trackedEval = execSync('git ls-files "eval-results/"', {
				cwd: repoRoot,
				encoding: 'utf-8'
			}).trim();
			expect(trackedEval).toBe('');
		} catch (e: any) {
			expect(e.stdout ? e.stdout.trim() : '').toBe('');
		}
	});

	it('aucun projet utilisateur arbitraire hors structure 000-global n’est suivi dans projects/', () => {
		try {
			const trackedProjects = execSync('git ls-files "projects/"', {
				cwd: repoRoot,
				encoding: 'utf-8'
			}).trim().split('\n').filter(Boolean);

			// Seuls les fichiers de structure/policies globales (ex: .gitkeep) sont autorisés
			const nonGlobalTracked = trackedProjects.filter(
				(p) => !p.startsWith('projects/000-global/') && !p.endsWith('.gitkeep')
			);
			expect(nonGlobalTracked).toEqual([]);
		} catch (e: any) {
			expect(e.stdout ? e.stdout.trim() : '').toBe('');
		}
	});

	it('la documentation de sauvegarde et restauration de base (docs/backup-restore.md) existe et est référencée', () => {
		const backupRestoreDoc = resolve(repoRoot, 'docs/backup-restore.md');
		expect(existsSync(backupRestoreDoc)).toBe(true);
		const docContent = readFileSync(backupRestoreDoc, 'utf-8');

		expect(docContent).toMatch(/prisma\/dev\.db/);
		expect(docContent).toMatch(/dev\.db-wal/);
		expect(docContent).toMatch(/bootstrap-admin\.ts/);
		expect(docContent).toMatch(/prisma db push/);

		const freshInstall = readFileSync(resolve(repoRoot, 'docs/fresh-install.md'), 'utf-8');
		expect(freshInstall).toMatch(/backup-restore\.md/);

		const devGuide = readFileSync(resolve(repoRoot, 'docs/developer-guide.md'), 'utf-8');
		expect(devGuide).toMatch(/backup-restore\.md/);
	});

	describe('Interdiction absolue des fallbacks gracieux et mocks masqués (Règles de codage)', () => {
		it('lève une erreur explicite sans fallback si le Knowledge Hub configuré est inaccessible', async () => {
			await expect(
				loadOntologyCatalog({ hubUrl: 'http://127.0.0.1:54321/hub-down' })
			).rejects.toThrow(/Knowledge Hub indisponible.*Aucun repli silencieux autorisé/);
		});

		it('refuse de charger silencieusement une fixture en production si aucun Hub n’est configuré', async () => {
			const originalNodeEnv = process.env.NODE_ENV;
			const originalVitest = process.env.VITEST;
			const originalLlmopsUrl = process.env.LLMOPS_BASE_URL;

			try {
				process.env.NODE_ENV = 'production';
				delete (process.env as any).VITEST;
				delete (process.env as any).LLMOPS_BASE_URL;

				await expect(loadOntologyCatalog()).rejects.toThrow(
					/Aucun Knowledge Hub configuré.*aucun mock en dur ni repli gracieux n'est autorisé en production/
				);
			} finally {
				process.env.NODE_ENV = originalNodeEnv;
				if (originalVitest !== undefined) process.env.VITEST = originalVitest;
				if (originalLlmopsUrl !== undefined) process.env.LLMOPS_BASE_URL = originalLlmopsUrl;
			}
		});
	});
});
