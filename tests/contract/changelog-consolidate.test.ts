import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	listFragments,
	validateFragment,
	insertFragmentsIntoChangelog,
	consolidateChangelog
} from '../../scripts/consolidate-changelog.mjs';

describe('Contract: Consolidation de changelog.d/ (consolidate-changelog.mjs)', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archinex-changelog-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('liste les fragments .md triés en excluant README.md', () => {
		const dir = path.join(tmpDir, 'changelog.d');
		fs.mkdirSync(dir);
		fs.writeFileSync(path.join(dir, 'README.md'), '# README');
		fs.writeFileSync(path.join(dir, 'feat-b.md'), '### B\n- item\n');
		fs.writeFileSync(path.join(dir, 'feat-a.md'), '### A\n- item\n');
		fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

		expect(listFragments(dir)).toEqual(['feat-a.md', 'feat-b.md']);
	});

	it('valide les fragments conformes et rejette les fragments vides ou contenant ## Non publié', () => {
		expect(validateFragment('### Titre\n- Détail\n', 'ok.md').valid).toBe(true);
		expect(validateFragment('- Entrée simple\n', 'bullet.md').valid).toBe(true);
		expect(validateFragment('   \n  ', 'empty.md').valid).toBe(false);
		expect(validateFragment('## Non publié\n\n### Titre\n', 'bad.md').valid).toBe(false);
		expect(validateFragment('Texte libre sans titre', 'plain.md').valid).toBe(false);
	});

	it('insère les fragments juste sous ## Non publié en préservant les entrées existantes et les fins de ligne', () => {
		const existing = '# Changelog\n\n## Non publié\n\n### Ancienne entrée\n- Détail\n';
		const updated = insertFragmentsIntoChangelog(existing, [
			'### Nouvelle A\n- Point A',
			'### Nouvelle B\n- Point B'
		]);

		expect(updated).toBe(
			'# Changelog\n\n## Non publié\n\n### Nouvelle A\n- Point A\n\n### Nouvelle B\n- Point B\n\n### Ancienne entrée\n- Détail\n'
		);

		const crlfExisting = existing.replace(/\n/g, '\r\n');
		const crlfUpdated = insertFragmentsIntoChangelog(crlfExisting, ['### Nouvelle C\n- Point C']);
		expect(crlfUpdated).toContain('\r\n## Non publié\r\n\r\n### Nouvelle C\r\n- Point C\r\n');
	});

	it('consolide les fragments sur disque et supprime les fichiers traités (hors README.md)', () => {
		const dir = path.join(tmpDir, 'changelog.d');
		fs.mkdirSync(dir);
		fs.writeFileSync(path.join(dir, 'README.md'), '# Guide\n');
		fs.writeFileSync(path.join(dir, 'feat-alpha.md'), '### Alpha\n- Fonction A\n');
		fs.writeFileSync(path.join(dir, 'fix-beta.md'), '### Beta\n- Correctif B\n');
		fs.writeFileSync(
			path.join(tmpDir, 'CHANGELOG.md'),
			'# Changelog\n\n## Non publié\n\n### Existant\n- Historique\n'
		);

		const checkRes = consolidateChangelog({ rootDir: tmpDir, check: true });
		expect(checkRes.fragments).toEqual(['feat-alpha.md', 'fix-beta.md']);
		expect(fs.existsSync(path.join(dir, 'feat-alpha.md'))).toBe(true);

		const res = consolidateChangelog({ rootDir: tmpDir });
		expect(res.changed).toBe(true);
		expect(res.fragments).toEqual(['feat-alpha.md', 'fix-beta.md']);

		const finalChangelog = fs.readFileSync(path.join(tmpDir, 'CHANGELOG.md'), 'utf-8');
		expect(finalChangelog).toContain('### Alpha\n- Fonction A\n\n### Beta\n- Correctif B\n\n### Existant');
		expect(fs.existsSync(path.join(dir, 'feat-alpha.md'))).toBe(false);
		expect(fs.existsSync(path.join(dir, 'fix-beta.md'))).toBe(false);
		expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
	});
});
