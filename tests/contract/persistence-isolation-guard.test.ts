import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

describe('Isolation de la Persistance et Pureté du Code (Issue #252)', () => {
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
});
