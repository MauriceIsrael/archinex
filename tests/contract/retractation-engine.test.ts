import { describe, it, expect } from 'vitest';
import type { Statement } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import {
	buildCausalDAG,
	findTransitiveDependents,
	executeRetractionCascade
} from '$lib/domain/retractation';

describe('Retractation Engine Contract Tests (Lot 5 - Truth Maintenance)', () => {
	const statementS1: Statement = {
		id: 'S-0031',
		section: '§3.1',
		triplet: { subject: 'sub_dc_resilience', predicate: 'power_redundancy', value: 'dual_cord' },
		justification: { basedOn: [] },
		authority: { author: 'M. Israel', role: 'infra_expert_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
		revisability: { antecedents: [] },
		status: 'active',
		createdAt: '2026-09-01T00:00:00Z',
		updatedAt: '2026-09-01T00:00:00Z'
	};

	const statementS2: Statement = {
		id: 'S-0042',
		section: '§4.2',
		triplet: { subject: 'sub_sync', predicate: 'holdover', value: '30 j' },
		justification: { basedOn: ['S-0031'] },
		authority: { author: 'P. Durand', role: 'infra_expert_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
		revisability: { antecedents: ['S-0031'] },
		status: 'active',
		createdAt: '2026-09-02T00:00:00Z',
		updatedAt: '2026-09-02T00:00:00Z'
	};

	const statementS3: Statement = {
		id: 'S-0055',
		section: '§4.3',
		triplet: { subject: 'sub_radio', predicate: 'mcx_priority_1', value: true },
		justification: { basedOn: ['S-0042'] },
		authority: { author: 'Agent Élicitation', role: 'AI Assistant', productionMode: 'llm-proposed-human-approved' },
		maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
		revisability: { antecedents: ['S-0042'] },
		status: 'active',
		createdAt: '2026-09-03T00:00:00Z',
		updatedAt: '2026-09-03T00:00:00Z'
	};

	const statementIndependent: Statement = {
		id: 'S-0099',
		section: '§6.2',
		triplet: { subject: 'sub_pqc', predicate: 'encryption', value: 'ML-KEM-768' },
		justification: { basedOn: ['KH:P-0023'] },
		authority: { author: 'Security Officer', role: 'security_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
		revisability: { antecedents: [] },
		status: 'active',
		createdAt: '2026-09-04T00:00:00Z',
		updatedAt: '2026-09-04T00:00:00Z'
	};

	const mockSubjects: MaturitySubject[] = [
		{
			id: 'sub_dc_resilience',
			section_ref: '§3.1',
			name: 'Résilience Datacenter',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 2,
			waiting_for_role: 'infra_expert_architect',
			relative_effort: 'M',
			last_transition_date: '2026-09-01T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: ['sub_sync']
		},
		{
			id: 'sub_sync',
			section_ref: '§4.2',
			name: 'Synchronisation Réseau',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 1,
			waiting_for_role: 'lead_architect',
			relative_effort: 'S',
			last_transition_date: '2026-09-02T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: ['sub_radio']
		},
		{
			id: 'sub_pqc',
			section_ref: '§6.2',
			name: 'Cryptographie Post-Quantique',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'security_architect',
			relative_effort: 'S',
			last_transition_date: '2026-09-04T00:00:00Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		}
	];

	const mockDrafts: Record<string, TelegraphicDraft> = {
		sub_sync: {
			section_id: '§4.2',
			subject: 'Synchronisation Réseau',
			maturity: 'L3_decided',
			is_provisional: false,
			retenu: ['KH:ADR-0042'],
			suppose: [],
			conflit: [],
			manque: []
		}
	};

	it('Scenario: Clôture transitive dans le DAG de dérivation (S1 -> S2 -> S3)', () => {
		const statements = [statementS1, statementS2, statementS3, statementIndependent];
		const { dependentsOf } = buildCausalDAG(statements);

		const dependentsOfS1 = findTransitiveDependents('S-0031', dependentsOf);
		expect(dependentsOfS1).toContain('S-0042');
		expect(dependentsOfS1).toContain('S-0055');
		expect(dependentsOfS1).not.toContain('S-0099'); // Énoncé indépendant immunisé
	});

	it('Scenario: Rétrogradation automatique en cascade vers assumed', () => {
		const statements = [statementS1, statementS2, statementS3, statementIndependent];

		const result = executeRetractionCascade({
			targetStatementId: 'S-0031',
			reason: 'Le fournisseur a annulé la certification Tier IV sur le site nord',
			statements,
			subjects: mockSubjects,
			drafts: mockDrafts
		});

		expect(result.retractedStatement?.status).toBe('contested');
		expect(result.retractedStatement?.maturity.confidence).toBe('assumed');
		expect(result.impactedDescendantIds).toEqual(expect.arrayContaining(['S-0042', 'S-0055']));

		// S2 et S3 doivent être déclassés à assumed
		const s2Demoted = result.demotedStatements.find((s) => s.id === 'S-0042');
		const s3Demoted = result.demotedStatements.find((s) => s.id === 'S-0055');
		expect(s2Demoted?.maturity.confidence).toBe('assumed');
		expect(s3Demoted?.maturity.confidence).toBe('assumed');

		// L'énoncé indépendant ne doit pas figurer dans les déclassés
		expect(result.demotedStatements.some((s) => s.id === 'S-0099')).toBe(false);
	});

	it('Scenario: Rétrogradation automatique de la maturité du sujet (L3 -> L2) et réactivation provisoire', () => {
		const statements = [statementS1, statementS2, statementS3, statementIndependent];

		const result = executeRetractionCascade({
			targetStatementId: 'S-0031',
			reason: 'Alimentation non secourue',
			statements,
			subjects: mockSubjects,
			drafts: mockDrafts
		});

		// Le sujet sub_sync doit être rétrogradé de L3_decided à L2_decomposed
		const updatedSync = result.updatedSubjects.find((s) => s.id === 'sub_sync');
		expect(updatedSync).toBeDefined();
		expect(updatedSync?.level).toBe('L2_decomposed');
		expect(updatedSync?.blocking_count).toBeGreaterThan(0);

		// Le sujet indépendant ne bouge pas
		const updatedPqc = result.updatedSubjects.find((s) => s.id === 'sub_pqc');
		expect(updatedPqc?.level).toBe('L3_decided');

		// Le brouillon de sub_sync doit redevenir provisoire
		expect(result.updatedDrafts['sub_sync'].is_provisional).toBe(true);
		expect(result.updatedDrafts['sub_sync'].maturity).toBe('L2_decomposed');
	});

	it('Scenario: Tolérance aux boucles causales (cycles de dépendance)', () => {
		const cycleStmtA: Statement = {
			...statementS1,
			id: 'CYCLE-A',
			justification: { basedOn: ['CYCLE-B'] },
			revisability: { antecedents: ['CYCLE-B'] }
		};
		const cycleStmtB: Statement = {
			...statementS2,
			id: 'CYCLE-B',
			justification: { basedOn: ['CYCLE-A'] },
			revisability: { antecedents: ['CYCLE-A'] }
		};

		const { dependentsOf } = buildCausalDAG([cycleStmtA, cycleStmtB]);
		// Ne doit pas boucler à l'infini
		const deps = findTransitiveDependents('CYCLE-A', dependentsOf);
		expect(deps).toContain('CYCLE-B');
	});
});
