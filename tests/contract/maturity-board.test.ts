import { describe, it, expect } from 'vitest';
import {
	sortMaturityBoard,
	computeStallDays,
	canTransitionMaturity,
	resolveSubjectArbitration,
	type MaturitySubject
} from '$lib/domain/maturityBoard';

describe('Lot 3 - Maturity Board & Unlocks Sorting Contract Tests', () => {
	it('Scénario 1: Priorisation d\'un sujet à fort déblocage (unlocks_count) sur un sujet avec beaucoup de bloquants', () => {
		const subjects: MaturitySubject[] = [
			{
				id: 'sub_ppdr',
				section_ref: '§5.1',
				name: 'Terminaux PPDR',
				level: 'L2_decomposed',
				blocking_count: 8,
				unlocks_count: 0,
				waiting_for_role: 'domain_architect',
				relative_effort: 'M',
				last_transition_date: '2026-09-10T00:00:00Z',
				stall_days: 10,
				is_stalled: false,
				dependent_subject_ids: []
			},
			{
				id: 'sub_dc_resilience',
				section_ref: '§3.1',
				name: 'Résilience datacenter',
				level: 'L0_named',
				blocking_count: 3,
				unlocks_count: 4,
				waiting_for_role: 'infra_expert_architect',
				relative_effort: 'S',
				last_transition_date: '2026-09-18T00:00:00Z',
				stall_days: 2,
				is_stalled: false,
				dependent_subject_ids: ['sub_sync', 'sub_storage', 'sub_network', 'sub_backup']
			}
		];

		const sorted = sortMaturityBoard(subjects);

		// Résilience datacenter (débloque 4) doit être en tête de liste devant Terminaux PPDR (débloque 0)
		expect(sorted[0].id).toBe('sub_dc_resilience');
		expect(sorted[1].id).toBe('sub_ppdr');
	});

	it('Scénario 2: Détection et alerte sur un sujet stagnant (stall_days >= 14 jours)', () => {
		const currentDate = new Date('2026-09-20T12:00:00Z');
		const resultStalled = computeStallDays('2026-08-30T00:00:00Z', currentDate, 14);
		expect(resultStalled.is_stalled).toBe(true);
		expect(resultStalled.stall_days).toBe(21);

		const resultFresh = computeStallDays('2026-09-15T00:00:00Z', currentDate, 14);
		expect(resultFresh.is_stalled).toBe(false);
		expect(resultFresh.stall_days).toBe(5);
	});

	it('Scénario 3: Interdiction formelle aux agents IA de promouvoir un sujet à L3 (Porte G3)', () => {
		const aiActor = { role: 'infra_expert_architect' as const, is_human: false };
		const result = canTransitionMaturity('L2_decomposed', 'L3_decided', aiActor);

		expect(result.allowed).toBe(false);
		expect(result.code).toBe('HUMAN_GATE_REQUIRED');
	});

	it('Scénario 4: Seul le Lead Architect humain peut homologuer à L4 (Porte d\'homologation)', () => {
		const expertHuman = { role: 'infra_expert_architect' as const, is_human: true };
		const leadHuman = { role: 'lead_architect' as const, is_human: true };

		// Expert architect ne peut pas homologuer à L4
		const expertResult = canTransitionMaturity('L3_decided', 'L4_specified', expertHuman);
		expect(expertResult.allowed).toBe(false);
		expect(expertResult.code).toBe('LEAD_ARCHITECT_ROLE_REQUIRED');

		// Lead architect humain peut homologuer à L4
		const leadResult = canTransitionMaturity('L3_decided', 'L4_specified', leadHuman);
		expect(leadResult.allowed).toBe(true);
		expect(leadResult.code).toBe('SUCCESS');
	});

	it('Scénario 5: Matérialisation du franchissement d\'un gap et déblocage en cascade des sujets dépendants', () => {
		const allSubjects: MaturitySubject[] = [
			{
				id: 'sub_sync',
				section_ref: '§4.2',
				name: 'Synchronisation',
				level: 'L2_decomposed',
				blocking_count: 1,
				unlocks_count: 2,
				waiting_for_role: 'lead_architect',
				relative_effort: 'S',
				last_transition_date: '2026-09-10T00:00:00Z',
				stall_days: 10,
				is_stalled: false,
				dependent_subject_ids: ['sub_radio', 'sub_core']
			},
			{
				id: 'sub_radio',
				section_ref: '§4.3',
				name: 'Transmission Radio',
				level: 'L1_framed',
				blocking_count: 2,
				unlocks_count: 0,
				waiting_for_role: 'domain_architect',
				relative_effort: 'M',
				last_transition_date: '2026-09-15T00:00:00Z',
				stall_days: 5,
				is_stalled: false,
				dependent_subject_ids: []
			},
			{
				id: 'sub_core',
				section_ref: '§4.4',
				name: 'Cœur de Réseau',
				level: 'L1_framed',
				blocking_count: 1,
				unlocks_count: 0,
				waiting_for_role: 'domain_architect',
				relative_effort: 'L',
				last_transition_date: '2026-09-15T00:00:00Z',
				stall_days: 5,
				is_stalled: false,
				dependent_subject_ids: []
			}
		];

		const arbitrationResult = resolveSubjectArbitration('sub_sync', allSubjects);

		// sub_sync est passé à L3_decided avec 0 bloquants
		const updatedSync = arbitrationResult.updatedSubjects.find((s) => s.id === 'sub_sync');
		expect(updatedSync?.level).toBe('L3_decided');
		expect(updatedSync?.blocking_count).toBe(0);

		// Les deux sujets dépendants ont vu leur compteur de bloquants diminuer
		const updatedRadio = arbitrationResult.updatedSubjects.find((s) => s.id === 'sub_radio');
		const updatedCore = arbitrationResult.updatedSubjects.find((s) => s.id === 'sub_core');

		expect(updatedRadio?.blocking_count).toBe(1); // 2 - 1 = 1
		expect(updatedCore?.blocking_count).toBe(0); // 1 - 1 = 0
		expect(arbitrationResult.unblockedSubjectIds).toEqual(['sub_radio', 'sub_core']);
	});
});
