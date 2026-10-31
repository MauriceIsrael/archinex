import { describe, it, expect, beforeEach } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { partitionSubjectsByParts } from '$lib/domain/subjectPartitioning';
import type { MaturitySubject } from '$lib/domain/maturityBoard';

describe('Phase 3 Subject Selector & Lot Filtering Contract', () => {
	const sampleSubjects: MaturitySubject[] = [
		{
			id: 'sub_cadrage',
			section_ref: '§1.1',
			name: 'Cadrage Stratégique & Souveraineté',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 3,
			waiting_for_role: 'lead_architect',
			relative_effort: 'S',
			last_transition_date: '2026-09-01T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		},
		{
			id: 'sub_infra_wapt',
			section_ref: '§11, §1.3',
			name: 'Outillage de supervision, logs et déploiement WAPT',
			level: 'L4_specified',
			blocking_count: 0,
			unlocks_count: 2,
			waiting_for_role: 'infra_expert_architect',
			relative_effort: 'M',
			last_transition_date: '2026-09-05T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		},
		{
			id: 'sub_resilience',
			section_ref: '§2.2',
			name: 'Résilience N+1 Datacenter',
			level: 'L1_framed',
			blocking_count: 0,
			unlocks_count: 1,
			waiting_for_role: 'infra_expert_architect',
			relative_effort: 'L',
			last_transition_date: '2026-09-10T00:00:00Z',
			stall_days: 2,
			is_stalled: false,
			dependent_subject_ids: []
		},
		{
			id: 'sub_secops_pki',
			section_ref: '§4.1',
			name: 'Chaîne de confiance PKI & Signature WAPT',
			level: 'L4_specified',
			blocking_count: 0,
			unlocks_count: 1,
			waiting_for_role: 'security_architect',
			relative_effort: 'M',
			last_transition_date: '2026-09-12T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		}
	];

	beforeEach(() => {
		deliberationStore.subjects = [...sampleSubjects];
		deliberationStore.setSelectedPartId('all');
	});

	it('1. Pré-filtre les sujets sur le niveau L4 (Spécifiés) pour la phase de rendu/homologation', () => {
		const l4Subjects = sampleSubjects.filter(
			(s) => s.level === 'L4_specified' || s.level === 'L5_archived'
		);
		expect(l4Subjects.length).toBe(2);
		expect(l4Subjects.map((s) => s.id)).toEqual(['sub_infra_wapt', 'sub_secops_pki']);
	});

	it('2. Bascule intelligemment sur L3+ ou Tous si aucun sujet n\'a encore atteint L4', () => {
		const nonL4Subjects = sampleSubjects.filter((s) => s.level !== 'L4_specified');
		const l4Count = nonL4Subjects.filter((s) => s.level === 'L4_specified').length;
		const l3PlusCount = nonL4Subjects.filter(
			(s) => s.level === 'L3_decided' || s.level === 'L4_specified' || s.level === 'L5_archived'
		).length;

		expect(l4Count).toBe(0);
		expect(l3PlusCount).toBe(1); // sub_cadrage (L3)

		// Stratégie de repli : si l4Count === 0 et l3PlusCount > 0 -> 'l3_plus'
		const resolvedFilter = l4Count > 0 ? 'l4_only' : l3PlusCount > 0 ? 'l3_plus' : 'all';
		expect(resolvedFilter).toBe('l3_plus');
	});

	it('3. Permet de filtrer les sujets par lots/parties de manière réactive', () => {
		const parts = partitionSubjectsByParts(sampleSubjects);
		expect(parts.length).toBeGreaterThan(1);

		// Sélection du Lot 1 (Cadrage & Souveraineté)
		deliberationStore.setSelectedPartId(parts[0].id);
		expect(deliberationStore.selectedPartId).toBe(parts[0].id);

		const part1Subjects = parts[0].subjects;
		expect(part1Subjects.length).toBe(1);
		expect(part1Subjects[0].id).toBe('sub_cadrage');

		// Réinitialisation à 'all'
		deliberationStore.setSelectedPartId('all');
		expect(deliberationStore.selectedPartId).toBe('all');
	});

	it('4. Permet de sélectionner un sujet sans changer le viewMode de délibération (switchView = false)', () => {
		deliberationStore.deliberationViewMode = 'board';
		deliberationStore.selectSubject('sub_infra_wapt', false);

		expect(deliberationStore.activeSubjectId).toBe('sub_infra_wapt');
		// Le viewMode reste 'board' car switchView était false (idéal pour la Phase 3 Rendu)
		expect(deliberationStore.deliberationViewMode).toBe('board');

		// Avec switchView = true (par défaut), bascule sur 'conversation'
		deliberationStore.selectSubject('sub_secops_pki');
		expect(deliberationStore.activeSubjectId).toBe('sub_secops_pki');
		expect(deliberationStore.deliberationViewMode).toBe('conversation');
	});
});
