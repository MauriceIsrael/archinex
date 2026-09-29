import { describe, it, expect } from 'vitest';
import {
	partitionSubjectsByParts,
	extractPartNumberFromSection,
	computePartMetrics
} from '$lib/domain/subjectPartitioning';
import type { MaturitySubject } from '$lib/domain/maturityBoard';

describe('Subject Partitioning & Lots Contract', () => {
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
			dependent_subject_ids: ['sub_infra']
		},
		{
			id: 'sub_infra',
			section_ref: '§2.1',
			name: 'Socle Bare-Metal & K8s',
			level: 'L2_decomposed',
			blocking_count: 1,
			unlocks_count: 2,
			waiting_for_role: 'infra_expert_architect',
			relative_effort: 'M',
			last_transition_date: '2026-09-05T00:00:00Z',
			stall_days: 5,
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
			id: 'sub_sync',
			section_ref: '§3.1',
			name: 'Synchronisation PTP G.8275.1',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 2,
			waiting_for_role: 'infra_expert_architect',
			relative_effort: 'M',
			last_transition_date: '2026-09-12T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		},
		{
			id: 'sub_secnum',
			section_ref: '§4.1',
			name: 'Conformité NIS2 & Homologation',
			level: 'L0_named',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'security_architect',
			relative_effort: 'S',
			last_transition_date: '2026-09-02T00:00:00Z',
			stall_days: 15,
			is_stalled: true,
			dependent_subject_ids: []
		}
	];

	it('1. Extrait le numéro de partie depuis les références de section', () => {
		expect(extractPartNumberFromSection('§1.1')).toBe(1);
		expect(extractPartNumberFromSection('§2.4.1')).toBe(2);
		expect(extractPartNumberFromSection('Art. 3.2')).toBe(3);
		expect(extractPartNumberFromSection('Lot 4 - Réseau')).toBe(4);
		expect(extractPartNumberFromSection('sans-chiffre')).toBe(1);
	});

	it('2. Découpe un ensemble plat de sujets en lots / parties distincts', () => {
		const parts = partitionSubjectsByParts(sampleSubjects);

		expect(parts.length).toBe(4);
		expect(parts[0].partNumber).toBe(1);
		expect(parts[0].code).toBe('LOT-01-SOUV');
		expect(parts[0].subjects.length).toBe(1);

		expect(parts[1].partNumber).toBe(2);
		expect(parts[1].code).toBe('LOT-02-INFRA');
		expect(parts[1].subjects.length).toBe(2);
		expect(parts[1].sectionRange).toBe('§2.1 → §2.2');

		expect(parts[2].partNumber).toBe(3);
		expect(parts[3].partNumber).toBe(4);
		expect(parts[3].leadRole).toBe('security_architect');
	});

	it('3. Calcule les métriques d\'avancement et de blocage par partie', () => {
		const parts = partitionSubjectsByParts(sampleSubjects);

		// Partie 1 : 1 sujet L3 -> 100% complété
		expect(parts[0].metrics.totalCount).toBe(1);
		expect(parts[0].metrics.decidedCount).toBe(1);
		expect(parts[0].metrics.maturityRate).toBe(100);
		expect(parts[0].metrics.status).toBe('completed');

		// Partie 2 : 2 sujets (1 L2 + 1 L1), 1 bloquant -> status blocked, 0% L3
		expect(parts[1].metrics.totalCount).toBe(2);
		expect(parts[1].metrics.decidedCount).toBe(0);
		expect(parts[1].metrics.blockingCount).toBe(1);
		expect(parts[1].metrics.maturityRate).toBe(0);
		expect(parts[1].metrics.status).toBe('blocked');

		// Partie 4 : 1 sujet L0 -> 0% complété, unstarted
		expect(parts[3].metrics.namedCount).toBe(1);
		expect(parts[3].metrics.maturityRate).toBe(0);
		expect(parts[3].metrics.status).toBe('unstarted');
	});

	it('4. Gère une liste vide sans lever d\'erreur', () => {
		const emptyParts = partitionSubjectsByParts([]);
		expect(emptyParts).toEqual([]);

		const emptyMetrics = computePartMetrics([]);
		expect(emptyMetrics.totalCount).toBe(0);
		expect(emptyMetrics.status).toBe('unstarted');
	});
});
