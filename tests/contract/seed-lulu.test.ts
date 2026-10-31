import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Ensemencement Démo Lulu "Juste Après Ingestion" (seed-lulu)', () => {
	const root = process.cwd();
	const dir = resolve(root, 'examples/lumicc-ingested');

	it('présente tous les fichiers nécessaires au projet', () => {
		expect(existsSync(resolve(dir, 'project.json'))).toBe(true);
		expect(existsSync(resolve(dir, 'subjects.json'))).toBe(true);
		expect(existsSync(resolve(dir, 'drafts.json'))).toBe(true);
		expect(existsSync(resolve(dir, 'dialogue.json'))).toBe(true);
		expect(existsSync(resolve(dir, 'statements.json'))).toBe(true);
		expect(existsSync(resolve(dir, 'corpus.json'))).toBe(true);
		expect(existsSync(resolve(dir, 'factorization-result.json'))).toBe(true);
	});

	it('définit un état vierge de délibération (0 statements scellés, 0 messages)', () => {
		const dialogue = JSON.parse(readFileSync(resolve(dir, 'dialogue.json'), 'utf-8'));
		const statements = JSON.parse(readFileSync(resolve(dir, 'statements.json'), 'utf-8'));
		expect(dialogue).toEqual([]);
		expect(statements).toEqual([]);
	});

	it('cadre l’ensemble complet des 16 sujets d’architecture au niveau L1_framed avec options en draft', () => {
		const subjects = JSON.parse(readFileSync(resolve(dir, 'subjects.json'), 'utf-8'));
		expect(subjects).toHaveLength(16);

		for (const subj of subjects) {
			expect(subj.level).toBe('L1_framed');
			expect(subj.requirement_ids.length).toBeGreaterThan(0);
			expect(subj.problem_statement).toBeDefined();

			if (subj.proposal?.options) {
				expect(subj.proposal.options.length).toBeGreaterThanOrEqual(2);
				for (const opt of subj.proposal.options) {
					expect(opt.status).toBe('draft');
				}
			}
		}
	});

	it('contient les 4 sujets cibles pour les scénarios de démonstration', () => {
		const subjects = JSON.parse(readFileSync(resolve(dir, 'subjects.json'), 'utf-8'));
		const subjectIds = subjects.map((s: { id: string }) => s.id);

		// Cas 1 : Nominal (Topologie 3 DC & RTO UDR)
		expect(subjectIds).toContain('SUBJ-LUMICC-01');
		// Cas 2 : Discussion experts / controverse (Holdover horloge 30j sans GNSS)
		expect(subjectIds).toContain('SUBJ-LUMICC-03');
		// Cas 3 : Contradiction réglementaire (Gouvernance eSIM SM-DP+ & HSM FIPS 140-3 L3)
		expect(subjectIds).toContain('SUBJ-LUMICC-05');
		// Cas 4 : Capitalisation base de connaissances (Wi-Fi offload sans N3IWF)
		expect(subjectIds).toContain('SUBJ-LUMICC-02');
	});

	it('couvre les nouveaux sujets factorisés de supervision, QoS, médiation et automatisation', () => {
		const subjects = JSON.parse(readFileSync(resolve(dir, 'subjects.json'), 'utf-8'));
		const subjectIds = subjects.map((s: { id: string }) => s.id);

		expect(subjectIds).toContain('SUBJ-LUMICC-08'); // HA NOC
		expect(subjectIds).toContain('SUBJ-LUMICC-09'); // Médiation OSS NRM
		expect(subjectIds).toContain('SUBJ-LUMICC-10'); // Supervision RAN MNO
		expect(subjectIds).toContain('SUBJ-LUMICC-11'); // Corrélation alarmes RCA
		expect(subjectIds).toContain('SUBJ-LUMICC-12'); // Pipeline collecte NOC / SOC
		expect(subjectIds).toContain('SUBJ-LUMICC-13'); // Automatisation SMO/OSS
		expect(subjectIds).toContain('SUBJ-LUMICC-14'); // Gouvernance QoS 5QI
		expect(subjectIds).toContain('SUBJ-LUMICC-15'); // Assurance de service sondes
		expect(subjectIds).toContain('SUBJ-LUMICC-16'); // Inventaire / CMDB
	});
});
