import { describe, it, expect } from 'vitest';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import {
	canFreezeSection,
	convertRefsToImmutable,
	freezeSectionAndGenerateSnapshot
} from '$lib/domain/freezeExport';

describe('Freeze & Export Contract Tests (Lot 6 - freeze-export)', () => {
	const validMatureSubject: MaturitySubject = {
		id: 'sub_sync',
		section_ref: '§4.2',
		name: 'Synchronisation Réseau & Holdover',
		level: 'L3_decided',
		blocking_count: 0,
		unlocks_count: 0,
		waiting_for_role: 'lead_architect',
		relative_effort: 'S',
		last_transition_date: '2026-09-20T00:00:00Z',
		stall_days: 0,
		is_stalled: false,
		dependent_subject_ids: []
	};

	const validCleanDraft: TelegraphicDraft = {
		section_id: '§4.2',
		subject: 'Synchronisation Réseau & Holdover',
		maturity: 'L3_decided',
		is_provisional: false,
		retenu: ['KH:ADR-0014@v1.2', 'KH:STD-0089'],
		suppose: [],
		conflit: [],
		manque: []
	};

	const validStatements: Statement[] = [
		{
			id: 'S-0042',
			section: '§4.2',
			triplet: { subject: 'sub_sync', predicate: 'holdover_duration', value: '30 j' },
			justification: { basedOn: ['KH:ADR-0014@v1.2'] },
			authority: { author: 'M. Israel', role: 'lead_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
			revisability: { antecedents: ['KH:ADR-0014@v1.2'] },
			status: 'active',
			createdAt: '2026-09-20T00:00:00Z',
			updatedAt: '2026-09-20T00:00:00Z'
		}
	];

	it('Scenario: Gel réussi d une section stabilisée par le Lead Architect', () => {
		const gateCheck = canFreezeSection(validMatureSubject, validCleanDraft, validStatements, 'lead_architect');
		expect(gateCheck.allowed).toBe(true);
		expect(gateCheck.code).toBe('SUCCESS');

		const snapshot = freezeSectionAndGenerateSnapshot({
			subject: validMatureSubject,
			draft: validCleanDraft,
			statements: validStatements,
			authorName: 'M. Israel',
			authorRole: 'lead_architect'
		});

		expect(snapshot.sealSha256).toBeDefined();
		expect(snapshot.sealSha256).toHaveLength(64); // SHA-256 standard
		expect(snapshot.sectionRef).toBe('§4.2');
		expect(snapshot.externalRefs.length).toBe(2);
		expect(snapshot.externalRefs[0].canonical).toBe('KH:ADR-0014@v1.2');
		expect(snapshot.externalRefs[1].canonical).toBe('KH:STD-0089@v1.0');

		// Vérification des projections déterministes (No Doc Drift)
		expect(snapshot.projections.mermaid).toContain('flowchart TD');
		expect(snapshot.projections.structurizrDSL).toContain('workspace');
		expect(snapshot.projections.sysmlV2).toContain('package');
		expect(JSON.parse(snapshot.projections.configJSON)).toBeDefined();
	});

	it('Scenario: Refus de gel sur section comportant un conflit ouvert', () => {
		const draftWithConflict: TelegraphicDraft = {
			...validCleanDraft,
			conflit: [
				{
					text: 'Liaison PTP',
					opposing_reference: 'SLA Fédérateur',
					requires_arbitration: true
				}
			]
		};

		const gateCheck = canFreezeSection(validMatureSubject, draftWithConflict, validStatements, 'lead_architect');
		expect(gateCheck.allowed).toBe(false);
		expect(gateCheck.code).toBe('OPEN_CONFLICT_GATING_VIOLATION');
		expect(gateCheck.reason).toContain('conflit');
	});

	it('Scenario: Refus de gel si le sujet est en dessous de L3_decided', () => {
		const immatureSubject: MaturitySubject = {
			...validMatureSubject,
			level: 'L2_decomposed'
		};

		const gateCheck = canFreezeSection(immatureSubject, validCleanDraft, validStatements, 'lead_architect');
		expect(gateCheck.allowed).toBe(false);
		expect(gateCheck.code).toBe('MATURITY_INSUFFICIENT');
	});

	it('Scenario: Refus de gel si l acteur n est pas le Lead Architect', () => {
		const gateCheck = canFreezeSection(validMatureSubject, validCleanDraft, validStatements, 'infra_expert_architect');
		expect(gateCheck.allowed).toBe(false);
		expect(gateCheck.code).toBe('ROLE_NOT_AUTHORIZED');
	});

	it('Scenario: Refus de gel en présence d énoncés non prouvés (assumed)', () => {
		const statementsWithAssumed: Statement[] = [
			{
				...validStatements[0],
				maturity: { subjectLevel: 'L2_decomposed', confidence: 'assumed' }
			}
		];

		const gateCheck = canFreezeSection(validMatureSubject, validCleanDraft, statementsWithAssumed, 'lead_architect');
		expect(gateCheck.allowed).toBe(false);
		expect(gateCheck.code).toBe('UNPROVEN_HYPOTHESIS_PRESENT');
	});
});
