import { describe, it, expect, afterAll } from 'vitest';
import { runMigration } from '../../scripts/migrate-json-engagements';
import { prisma } from '$lib/server/prisma';
import * as fs from 'fs';
import * as path from 'path';

describe('Project Migration Integration (JSON Engagements -> Relational)', () => {
	const tempBackup = path.resolve(process.cwd(), 'prisma', 'temp-test-backup.json');

	afterAll(() => {
		if (fs.existsSync(tempBackup)) {
			fs.unlinkSync(tempBackup);
		}
	});

	it('1. Exécute la migration en mode --dry-run sans altérer les tables', async () => {
		const stats = await runMigration({ dryRun: true });
		expect(stats).toBeDefined();
		expect(stats.projects).toBeGreaterThanOrEqual(1);
	});

	it('2. Génère un fichier de sauvegarde JSON valide', async () => {
		const stats = await runMigration({ dryRun: true, backupFile: 'prisma/temp-test-backup.json' });
		expect(fs.existsSync(tempBackup)).toBe(true);

		const content = fs.readFileSync(tempBackup, 'utf-8');
		const parsed = JSON.parse(content);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed.length).toBe(stats.projects);
	});

	it('3. Exécute la migration réelle et garantit l\'idempotence (deuxième passe identique)', async () => {
		// Première exécution réelle
		const stats1 = await runMigration({ dryRun: false });
		expect(stats1.projects).toBeGreaterThanOrEqual(1);

		// Vérification de la présence des projets normalisés
		const projectsCount = await prisma.project.count();
		expect(projectsCount).toBeGreaterThanOrEqual(stats1.projects);

		// Deuxième exécution pour valider l'idempotence (upsert sans doublons ni erreurs)
		const stats2 = await runMigration({ dryRun: false });
		expect(stats2.projects).toBeGreaterThanOrEqual(stats1.projects);
		expect(stats2.subjects).toBeGreaterThanOrEqual(stats1.subjects);

		const projectsCountAfter = await prisma.project.count();
		expect(projectsCountAfter).toBeGreaterThanOrEqual(projectsCount);
	});
});
