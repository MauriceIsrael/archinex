import { describe, it, expect, beforeAll } from 'vitest';
import {
	getAllEngagementsFromDb,
	getEngagementByIdFromDb,
	saveEngagementToDb,
	updateEngagementInDb,
	getAllCorpusDocumentsFromDb
} from '$lib/server/engagementsDb';
import { seedProject } from '../../scripts/seed';

describe('Prisma Engagements & Knowledge Base Persistence Integration', () => {
	beforeAll(async () => {
		await seedProject('examples/suse-telco-cloud');
		await seedProject('examples/cctp-rfp');
	});

	it('1. Initialise et charge les engagements depuis Prisma SQLite', async () => {
		const engagements = await getAllEngagementsFromDb();
		expect(engagements.length).toBeGreaterThanOrEqual(2);

		const suse = engagements.find((e) => e.id === 'suse-telco-cloud-generic');
		expect(suse).toBeDefined();
		expect(suse?.title).toContain('SUSE Telco Cloud');
		expect(suse?.subjects.length).toBeGreaterThan(0);
		expect(suse?.drafts).toBeDefined();
		expect(suse?.corpusDocuments.length).toBeGreaterThan(0);

		const cctp = engagements.find((e) => e.id === 'cctp-mcx-nordwave');
		expect(cctp).toBeDefined();
		expect(cctp?.subjects.length).toBeGreaterThan(0);
	});

	it('2. Persiste un nouvel engagement dans Prisma et le relit avec intégrité', async () => {
		const testId = `test-eng-${Date.now()}`;
		const newEngagement = {
			id: testId,
			title: 'Projet Test Centralisé Prisma',
			shortName: 'Test Prisma',
			type: 'poc_migration' as const,
			badge: 'TEST · Prisma Persisté',
			description: 'Engagement de test pour valider la persistance globale SQLite.',
			defaultSubjectId: 'sub-test-01',
			defaultDocId: 'doc-test-01',
			strategy: {
				objectives: ['Objectif test 1'],
				principles: ['Principe test 1'],
				constraints: ['Contrainte 500 k€']
			},
			participants: [
				{
					id: 'part-01',
					name: 'M. Test',
					role: 'lead_architect' as const,
					email: 'test@archinex.local',
					isLead: true
				}
			],
			subjects: [
				{
					id: 'sub-test-01',
					section_ref: '§1.1',
					name: 'Cadrage Test',
					level: 'L1_framed' as const,
					blocking_count: 0,
					unlocks_count: 1,
					waiting_for_role: 'lead_architect' as const,
					relative_effort: 'S' as const,
					last_transition_date: new Date().toISOString(),
					stall_days: 0,
					is_stalled: false,
					dependent_subject_ids: []
				}
			],
			drafts: {},
			statements: [],
			corpusDocuments: [],
			dialogueMessages: []
		};

		const saved = await saveEngagementToDb(newEngagement);
		expect(saved.id).toBe(testId);

		const retrieved = await getEngagementByIdFromDb(testId);
		expect(retrieved).toBeDefined();
		expect(retrieved?.title).toBe('Projet Test Centralisé Prisma');
		expect(retrieved?.strategy?.objectives[0]).toBe('Objectif test 1');
		expect(retrieved?.subjects[0].name).toBe('Cadrage Test');
	});

	it('3. Récupère le patrimoine commun de documents depuis Prisma', async () => {
		const docs = await getAllCorpusDocumentsFromDb();
		expect(docs.length).toBeGreaterThanOrEqual(5);

		const cctpDoc = docs.find((d) => d.id === 'DOC-CLI-01');
		expect(cctpDoc).toBeDefined();
		expect(cctpDoc?.keyClauses.length).toBeGreaterThan(0);
	});
});
