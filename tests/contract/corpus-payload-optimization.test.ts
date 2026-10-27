import { describe, it, expect } from 'vitest';
import {
	mapPrismaToCorpusDocument,
	mapPrismaToEngagementProfile
} from '$lib/server/engagementsDb';

describe('Corpus & Engagements Payload Optimization Contract', () => {
	it('allège les keyClauses tout en préservant le compteur extractedClausesCount quand includeKeyClauses=false', () => {
		const fakePrismaDoc = {
			id: 'DOC-TEST-01',
			title: 'Cahier des charges Test',
			origin: 'local_upload',
			category: 'rfp',
			categoryLabel: 'RFP',
			sourceOrAuthor: 'Client DSI',
			version: 'v1.0',
			pageCount: 150,
			extractedClausesCount: 1594,
			summary: 'RFP contenant 1594 exigences détaillées',
			keyIdeas: JSON.stringify(['Idée 1', 'Idée 2']),
			inducedRules: '[]',
			keyClauses: JSON.stringify(
				Array.from({ length: 1594 }, (_, i) => ({
					id: `C-${i}`,
					text: `Clause contractuelle critique numéro ${i} imposant un SLA de 99.99% et le respect des normes ISO 27001 et NIS2.`,
					page: Math.floor(i / 10) + 1,
					confidence: 0.95
				}))
			),
			isGlobalStandard: 1,
			engagementIds: JSON.stringify(['proj-1']),
			addedDate: new Date(),
			lastUpdated: new Date()
		};

		// 1. Version complète (pour consultation unitaire de document)
		const fullDoc = mapPrismaToCorpusDocument(fakePrismaDoc, { includeKeyClauses: true });
		expect(fullDoc.keyClauses.length).toBe(1594);
		expect(fullDoc.extractedClausesCount).toBe(1594);
		const fullSizeKb = JSON.stringify(fullDoc).length / 1024;
		expect(fullSizeKb).toBeGreaterThan(200);

		// 2. Version allégée (pour overview, dashboard et listes de navigation)
		const lightDoc = mapPrismaToCorpusDocument(fakePrismaDoc, { includeKeyClauses: false });
		expect(lightDoc.keyClauses.length).toBe(0);
		expect(lightDoc.extractedClausesCount).toBe(1594); // Compteur intact pour les calculs KPI
		const lightSizeKb = JSON.stringify(lightDoc).length / 1024;
		expect(lightSizeKb).toBeLessThan(5); // Réduction spectaculaire > 98%
	});

	it('supprime les propositions mortes subjects.proposal lorsque stripSubjectProposals=true', () => {
		const fakeSubjectWithProposal = {
			id: 'sub-01',
			section_ref: '§1.1',
			name: 'Choix de la base de données',
			level: 'L1_scoped',
			blocking_count: 2,
			unlocks_count: 5,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: new Date().toISOString(),
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: [],
			proposal: {
				problemStatement: 'Problème complexe',
				suggestedCriteria: Array.from({ length: 100 }, (_, i) => ({ id: `c-${i}`, label: `Critère ${i}` })),
				suggestedOptions: Array.from({ length: 50 }, (_, i) => ({ id: `opt-${i}`, label: `Option ${i}` }))
			}
		};

		const fakePrismaEngagement = {
			id: 'eng-01',
			title: 'Projet Test',
			shortName: 'PT',
			type: 'cloud_migration',
			badge: 'PROJET',
			description: 'Test',
			subjects: JSON.stringify([fakeSubjectWithProposal]),
			createdAt: new Date()
		};

		const fullProfile = mapPrismaToEngagementProfile(fakePrismaEngagement, { stripSubjectProposals: false });
		expect(fullProfile.subjects[0].proposal).toBeDefined();

		const lightProfile = mapPrismaToEngagementProfile(fakePrismaEngagement, { stripSubjectProposals: true });
		expect(lightProfile.subjects[0].proposal).toBeUndefined();
		expect(lightProfile.subjects[0].id).toBe('sub-01');
		expect(lightProfile.subjects[0].name).toBe('Choix de la base de données');
	});
});
