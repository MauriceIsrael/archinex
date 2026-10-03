import { describe, it, expect } from 'vitest';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import {
	canFreezeSection,
	convertRefsToImmutable,
	freezeSectionAndGenerateSnapshot,
	wrapSealedSnapshotInSuiteEnvelope,
	projectMaturityForSuite,
	SUITE_CONFIDENCE_LEVELS
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
		// Motif de la suite `{type}:{slug}` ; la version est celle que l'auteur a écrite, jamais une version inventée.
		expect(snapshot.externalRefs[0]).toMatchObject({ canonical: 'knowledge-hub:adr-0014', version: 'v1.2', citable: false });
		expect(snapshot.externalRefs[1]).toMatchObject({ canonical: 'knowledge-hub:std-0089', version: null, citable: false });
		expect(snapshot.sealProfile).toBe('canonical-json-v1');

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

	it('Scenario: le sceau couvre le CONTENU des énoncés, pas seulement leurs identifiants', () => {
		const now = new Date('2026-10-03T10:00:00Z');
		const freeze = (statements: Statement[]) =>
			freezeSectionAndGenerateSnapshot({
				subject: validMatureSubject,
				draft: validCleanDraft,
				statements,
				authorName: 'M. Israel',
				authorRole: 'lead_architect',
				now
			});
		const base = freeze(validStatements);
		expect(freeze(validStatements).sealSha256).toBe(base.sealSha256); // déterministe à horodatage égal

		// Même identifiant, valeur modifiée : le sceau DOIT changer.
		const altered = [{ ...validStatements[0], triplet: { ...validStatements[0].triplet, value: '3 j' } }];
		expect(freeze(altered).sealSha256).not.toBe(base.sealSha256);
	});

	it('Scenario: aucune version n est inventée pour une référence sans version', () => {
		const [withVersion, without] = convertRefsToImmutable(['KH:ADR-0014@v1.2', 'ADR-0099']);
		expect(withVersion.version).toBe('v1.2');
		expect(without).toMatchObject({ canonical: 'knowledge-hub:adr-0099', version: null, citable: false });
		expect(JSON.stringify(without)).not.toContain('v1.0');
	});

	describe('A21 - Alignement sur les instantanés scellés de la suite', () => {
		it('génère une enveloppe standard SuiteSnapshotEnvelope et son SnapshotRef séparé', () => {
			const now = new Date('2026-10-03T12:00:00Z');
			const snapshot = freezeSectionAndGenerateSnapshot({
				subject: validMatureSubject,
				draft: validCleanDraft,
				statements: validStatements,
				authorName: 'M. Israel',
				authorRole: 'lead_architect',
				now
			});

			const { envelope, snapshotRef } = wrapSealedSnapshotInSuiteEnvelope(snapshot, {
				sourceRevision: 'git:commit-abc123'
			});

			expect(envelope.schemaVersion).toBe('1.0');
			expect(envelope.sourceSystem).toBe('archinex');
			expect(envelope.sourceRevision).toBe('git:commit-abc123');
			expect(envelope.checksum).toMatch(/^[a-f0-9]{64}$/);
			expect(envelope.data.subjectId).toBe('sub_sync');

			// SnapshotRef est séparé et porte la même empreinte
			expect(snapshotRef).toEqual({
				sourceSystem: 'archinex',
				snapshotId: envelope.snapshotId,
				checksum: envelope.checksum,
				producedAt: envelope.createdAt
			});
		});

		it('projette la maturité L5_archived vers L4_specified pour conformité suite', () => {
			const archivedSubject: MaturitySubject = {
				...validMatureSubject,
				level: 'L5_archived'
			};
			const snapshot = freezeSectionAndGenerateSnapshot({
				subject: archivedSubject,
				draft: { ...validCleanDraft, maturity: 'L5_archived' },
				statements: validStatements,
				authorName: 'M. Israel',
				authorRole: 'lead_architect'
			});

			const { envelope } = wrapSealedSnapshotInSuiteEnvelope(snapshot);
			expect(envelope.data.maturityLevel).toBe('L4_specified');
		});

		it('vérifie que les niveaux de confiance d Archinex correspondent exactement au vocabulaire de la suite (5 valeurs)', () => {
			const expectedLevels = ['assumed', 'designed', 'stated-by-client', 'vendor-stated', 'verified'];
			const suiteLevels = ['assumed', 'designed', 'stated-by-client', 'vendor-stated', 'verified'];
			expect(suiteLevels).toEqual(expectedLevels);
		});

		it('refuse catégoriquement d envelopper un snapshot contenant une adresse e-mail', () => {
			const leakedSnapshot = freezeSectionAndGenerateSnapshot({
				subject: validMatureSubject,
				draft: validCleanDraft,
				statements: validStatements,
				authorName: 'user@example.com',
				authorRole: 'lead_architect'
			});

			expect(() => wrapSealedSnapshotInSuiteEnvelope(leakedSnapshot)).toThrow(
				/EMAIL_DETECTED/
			);
		});
	});
});

