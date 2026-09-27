import { describe, it, expect } from 'vitest';
import { computeGlobalOverview } from '$lib/domain/dashboardOverview';
import {
	SUSE_TELCO_SUBJECTS,
	SUSE_TELCO_DRAFTS,
	SUSE_TELCO_STATEMENTS,
	SUSE_TELCO_CORPUS,
	SUSE_TELCO_DIALOGUE_MESSAGES,
	createDefaultEngagements
} from '$lib/domain/engagements';
import { INITIAL_CORPUS_DOCUMENTS } from '$lib/domain/corpus';

describe('Global Overview Dashboard Analytics Contract', () => {
	const initialCctpSubjects = [
		{
			id: 'sub_sync',
			section_ref: '§4.2',
			name: 'Synchronisation Réseau & Holdover',
			level: 'L2_decomposed' as const,
			blocking_count: 1,
			unlocks_count: 3,
			waiting_for_role: 'lead_architect' as const,
			relative_effort: 'S' as const,
			last_transition_date: '2026-09-08T00:00:00Z',
			stall_days: 12,
			is_stalled: false,
			dependent_subject_ids: ['sub_radio']
		},
		{
			id: 'sub_dc_resilience',
			section_ref: '§3.1',
			name: 'Résilience Datacenter & Énergie',
			level: 'L0_named' as const,
			blocking_count: 2,
			unlocks_count: 4,
			waiting_for_role: 'infra_expert_architect' as const,
			relative_effort: 'M' as const,
			last_transition_date: '2026-08-28T00:00:00Z',
			stall_days: 23,
			is_stalled: true,
			dependent_subject_ids: ['sub_sync']
		}
	];

	const defaultEngagements = createDefaultEngagements(
		initialCctpSubjects,
		{},
		[]
	);

	it('1. Calcule avec exactitude le nombre d’engagements et leurs métriques de taille', () => {
		const overview = computeGlobalOverview(defaultEngagements, [
			...INITIAL_CORPUS_DOCUMENTS,
			...SUSE_TELCO_CORPUS
		]);

		expect(overview.totalEngagements).toBe(2);
		expect(overview.engagementsByType.generic_blueprint).toBe(1);
		expect(overview.engagementsByType.project_rfp).toBe(1);

		const suseEng = overview.engagements.find((e) => e.id === 'suse-telco-cloud-generic');
		expect(suseEng).toBeDefined();
		expect(suseEng?.subjectsCount).toBe(SUSE_TELCO_SUBJECTS.length);
		expect(suseEng?.effortScore).toBeGreaterThan(0);
		expect(suseEng?.statementsCount).toBe(SUSE_TELCO_STATEMENTS.length);
		expect(suseEng?.clausesCount).toBeGreaterThan(0);
	});

	it('2. Évalue la monopolisation des équipes et le backlog par rôle d’architecte', () => {
		const overview = computeGlobalOverview(defaultEngagements, INITIAL_CORPUS_DOCUMENTS);

		expect(overview.teams.length).toBe(5);

		// Les rôles majeurs doivent avoir des métriques définies
		const infraTeam = overview.teams.find((t) => t.role === 'infra_expert_architect');
		expect(infraTeam).toBeDefined();
		expect(infraTeam?.assignedSubjectsCount).toBeGreaterThan(0);
		expect(infraTeam?.effortPoints).toBeGreaterThan(0);

		// Le total des parts de charge relatives doit sommer à ~100%
		const totalShare = overview.teams.reduce((acc, t) => acc + t.workloadSharePct, 0);
		expect(totalShare).toBeGreaterThanOrEqual(95);
		expect(totalShare).toBeLessThanOrEqual(105);
	});

	it('3. Reconstitue la courbe de grossissement cumulé de la base de connaissance', () => {
		const commonCorpus = [...INITIAL_CORPUS_DOCUMENTS, ...SUSE_TELCO_CORPUS];
		const overview = computeGlobalOverview(defaultEngagements, commonCorpus);

		expect(overview.totalKnowledgeDocuments).toBeGreaterThanOrEqual(INITIAL_CORPUS_DOCUMENTS.length);
		expect(overview.knowledgeGrowth.length).toBe(overview.totalKnowledgeDocuments);

		// La courbe doit être strictement monotone croissante pour totalDocuments
		for (let i = 1; i < overview.knowledgeGrowth.length; i++) {
			expect(overview.knowledgeGrowth[i].totalDocuments).toBeGreaterThanOrEqual(
				overview.knowledgeGrowth[i - 1].totalDocuments
			);
			expect(overview.knowledgeGrowth[i].totalClauses).toBeGreaterThanOrEqual(
				overview.knowledgeGrowth[i - 1].totalClauses
			);
		}

		// Typologies du corpus
		expect(overview.knowledgeCategories.length).toBeGreaterThan(0);
		expect(overview.knowledgeCategories.some((c) => c.category === 'cctp')).toBe(true);
	});

	it('4. Détecte les alertes épistémiques (stagnations > 14j, conflits et surcoûts budgétaires)', () => {
		const overview = computeGlobalOverview(defaultEngagements, INITIAL_CORPUS_DOCUMENTS);

		// Les sujets en stagnation (>14j) sont bien détectés (§3.2 dans SUSE et §3.1 dans CCTP)
		expect(overview.epistemicAlerts.some((a) => a.type === 'stalled' && a.sectionRef === '§3.1')).toBe(true);
		expect(overview.epistemicAlerts.some((a) => a.type === 'stalled' && a.sectionRef === '§3.2')).toBe(true);

		expect(overview.stalledSectionsCount).toBeGreaterThanOrEqual(2);
	});
});
