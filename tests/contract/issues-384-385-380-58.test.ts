import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	computeMaturity,
	isViolationVerificationArgument,
	isUnknownVerificationVerdict
} from '$lib/domain/maturityRules';
import { hasVerifierPassed } from '$lib/domain/maturityCriteria';
import { runVerifierAgentWithStatus } from '$lib/server/agents/verifier';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { canFreezeSection, freezeSectionAndGenerateSnapshot } from '$lib/domain/freezeExport';
import { assembleEngagementBundle } from '$lib/domain/bundleAssembly';
import { buildComplianceMatrix } from '$lib/domain/complianceMatrix';
import {
	inferOracleVerdictSource,
	sanitizeHostnameSegment,
	composeMultiAxisHydration,
	evaluateMultiAxisOracle
} from '$lib/server/edp/refinementCoverage';
import { generateArchitectureLockManifest } from '$lib/server/edp/decisionSlotRegistry';
import { loadOntologyCatalog, type OntologyBindingItem } from '$lib/server/edp/ontologyClient';
import { InvariantViolationError } from '$lib/server/edp/edpRepository';
import {
	requirementIdsOf,
	buildImportedSubjects,
	buildEngagementProfileFromWorkspaceInput,
	DEFAULT_PARTICIPANTS
} from '$lib/domain/engagements';
import type { Argument } from '$lib/domain/debate';
import type { Criterion, Option, OptionEvaluation, CoverageReserve } from '$lib/domain/options';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';

describe('Issues #384, #385, #380, #58 — Contrats de fiabilité, provenance et import', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	// ── Issue #384 ─────────────────────────────────────────────────────────────
	describe('Issue #384 — Verdict structuré du vérificateur', () => {
		const subject = {
			id: 'sub-384',
			name: 'Isolation Réseau',
			problemStatement: 'Cloisonnement est-ouest entre zones sensibles.'
		};
		const criteria: Criterion[] = [
			{
				id: 'c1',
				subjectId: 'sub-384',
				name: 'Sécurité',
				description: 'Cloisonnement strict',
				kind: 'compliance',
				weight: 5,
				author: 'Lead',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			},
			{
				id: 'c2',
				subjectId: 'sub-384',
				name: 'Opérabilité',
				description: 'Simplicité MCO',
				kind: 'nfr',
				weight: 3,
				author: 'Lead',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			}
		];
		const options: Option[] = [
			{
				id: 'opt-a',
				subjectId: 'sub-384',
				title: 'Option A',
				summary: 'Segmentation stricte',
				origin: 'human',
				kbRefs: [],
				status: 'proposed',
				author: 'Lead',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			},
			{
				id: 'opt-b',
				subjectId: 'sub-384',
				title: 'Option B',
				summary: 'Réseau plat',
				origin: 'human',
				kbRefs: [],
				status: 'proposed',
				author: 'Lead',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			}
		];
		const evaluations: OptionEvaluation[] = [
			{ optionId: 'opt-a', criterionId: 'c1', score: 2, justification: 'Conforme', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
			{ optionId: 'opt-a', criterionId: 'c2', score: 1, justification: 'Acceptable', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
			{ optionId: 'opt-b', criterionId: 'c1', score: -2, justification: 'Risqué', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' },
			{ optionId: 'opt-b', criterionId: 'c2', score: 2, justification: 'Simple', evidenceRefs: [], author: 'Lead', role: 'lead_architect', productionMode: 'human-authored' }
		];

		it('bloque sur verdict=violates et ne considère jamais unknown/absent comme conforme', () => {
			const violatesArg: Argument = {
				id: 'a-viol',
				subjectId: 'sub-384',
				optionId: 'opt-b',
				stance: 'verification',
				verdict: 'violates',
				claim: 'Exigence non respectée',
				grounds: 'Réseau plat contraire à SEC-01.',
				kbRefs: ['SEC-01'],
				confidence: 'designed',
				author: 'agent:verifier',
				authorKind: 'agent:verifier',
				productionMode: 'llm-derived',
				round: 1,
				resolution: 'open',
				version: 1
			};

			const unknownArg: Argument = {
				...violatesArg,
				id: 'a-unk',
				optionId: 'opt-a',
				verdict: undefined,
				claim: 'Exigence non respectée (sans verdict structuré)'
			};

			expect(isViolationVerificationArgument(violatesArg)).toBe(true);
			expect(isViolationVerificationArgument(unknownArg)).toBe(false);
			expect(isUnknownVerificationVerdict(unknownArg)).toBe(true);
			expect(hasVerifierPassed([unknownArg])).toBe(false);

			const res = computeMaturity({ subject, criteria, options, evaluations, arguments: [violatesArg, unknownArg] });
			expect(res.readyForArbitration).toBe(false);
			expect(res.blockers.some((b) => b.code === 'UNRESOLVED_VIOLATION' && b.targetId === 'a-viol')).toBe(true);
			expect(res.warnings.some((w) => w.code === 'VERIFICATION_VERDICT_UNKNOWN' && w.targetId === 'a-unk')).toBe(true);
		});

		it('ne lit plus aucune propriété fantôme violationDetected dans src/', () => {
			const maturityRulesSrc = readFileSync(resolve(process.cwd(), 'src/lib/domain/maturityRules.ts'), 'utf-8');
			expect(maturityRulesSrc).not.toContain('violationDetected');
		});

		it('renvoie not_evaluated (0 argument fabriqué) en cas de JSON invalide ou modèle indisponible', async () => {
			vi.spyOn(localLlmClient, 'chat').mockResolvedValue('{ invalid json');
			const invalidRes = await runVerifierAgentWithStatus({
				subject: { id: 'sub-384', name: 'Isolation', sectionRef: '§2.1' },
				options,
				allowedKbRefs: ['SEC-01'],
				round: 1
			});
			expect(invalidRes.status).toBe('not_evaluated');
			expect(invalidRes.arguments).toHaveLength(0);

			vi.spyOn(localLlmClient, 'chat').mockRejectedValue(new Error('LLM offline'));
			const offlineRes = await runVerifierAgentWithStatus({
				subject: { id: 'sub-384', name: 'Isolation', sectionRef: '§2.1' },
				options,
				allowedKbRefs: ['SEC-01'],
				round: 1
			});
			expect(offlineRes.status).toBe('not_evaluated');
			expect(offlineRes.arguments).toHaveLength(0);
		});
	});

	// ── Issue #385 ─────────────────────────────────────────────────────────────
	describe('Issue #385 — Réserves de couverture réglementaire au scellement et dans HLD/RTM', () => {
		const reserves: CoverageReserve[] = [
			{
				frameworkId: 'NIS2',
				name: 'Directive NIS 2',
				status: 'missing',
				validatedCount: 0,
				expectedCount: 12,
				hubRevision: 'rev-42'
			}
		];

		const maturitySubject: MaturitySubject = {
			id: 'sub-385',
			section_ref: '§4.1',
			name: 'Journalisation SIEM',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: '2026-11-21T00:00:00.000Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const draft: TelegraphicDraft = {
			section_id: '§4.1',
			subject: 'Journalisation SIEM',
			maturity: 'L3_decided',
			is_provisional: false,
			retenu: ['Collecte centralisée des journaux sécurité'],
			suppose: [],
			conflit: [],
			manque: []
		};

		it('refuse le scellement freezeExport si un référentiel applicable est missing/unknown sans acceptation tracée, puis autorise avec justification', () => {
			const refused = canFreezeSection(maturitySubject, draft, [], 'lead_architect', {
				coverageReserves: reserves
			});
			expect(refused.allowed).toBe(false);
			expect(refused.code).toBe('COVERAGE_RESERVE_UNACCEPTED');

			const accepted = canFreezeSection(maturitySubject, draft, [], 'lead_architect', {
				coverageReserves: reserves,
				acceptedCoverageReserves: [
					{ frameworkId: 'NIS2', justification: 'Couverture NIS2 planifiée en lot 2, validée par le RSSI.' }
				]
			});
			expect(accepted.allowed).toBe(true);

			const snap = freezeSectionAndGenerateSnapshot({
				subject: maturitySubject,
				draft,
				statements: [],
				authorName: 'Lead',
				authorRole: 'lead_architect',
				coverageReserves: reserves,
				acceptedCoverageReserves: [
					{ frameworkId: 'NIS2', justification: 'Couverture NIS2 planifiée en lot 2, validée par le RSSI.' }
				]
			});
			expect(snap.coverageReserves).toHaveLength(1);
			expect(snap.acceptedCoverageReserves).toHaveLength(1);
		});

		it('reporte les réserves de couverture dans le bundle HLD et la matrice RTM, et ARCHITECTURE.md décrit la règle réelle', () => {
			const bundle = assembleEngagementBundle({
				project: { id: 'proj-385', title: 'Projet Réserves' },
				confidentiality: 'internal',
				now: new Date('2026-11-21T12:00:00.000Z'),
				sources: [
					{
						title: 'CCTP',
						kind: 'rfp',
						language: 'fr',
						sha256: 'a'.repeat(64),
						requirements: [
							{
								clauseRef: '§4.1',
								position: 0,
								title: 'Journalisation',
								text: 'Les journaux doivent être conservés 12 mois.',
								criticality: 'bloquant',
								proposedDisposition: 'deliberated',
								proposedBy: 'model:test',
								proposedAt: new Date('2026-11-21T12:00:00.000Z')
							}
						]
					}
				],
				subjects: [
					{
						id: 'sub-385',
						sectionRef: '§4.1',
						name: 'Journalisation SIEM',
						maturityLevel: 'L3_decided',
						requirementRefs: ['SRC-aaaaaaaa:§4.1'],
						options: [{ id: 'opt-1', title: 'SIEM Souverain' }],
						questions: [],
						decision: {
							id: 'dec-1',
							retainedOptionId: 'opt-1',
							rejected: [],
							rationale: 'Choix validé.',
							complianceStatus: 'Compliant',
							complianceCheck: {
								status: 'checked',
								hubRevision: 'rev-42',
								checkedAt: '2026-11-21T12:00:00.000Z',
								unassessedRuleIds: [],
								frameworks: ['NIS2'],
								coverageReserves: reserves
							},
							arbiterId: 'lead_1',
							decidedAt: new Date('2026-11-21T12:00:00.000Z')
						}
					}
				],
				statements: []
			});

			expect(bundle.data.decisions[0].compliance_check?.coverage_reserves).toHaveLength(1);
			expect(bundle.data.decisions[0].consequences?.some((c) => c.startsWith('coverage_reserve:'))).toBe(true);

			const matrix = buildComplianceMatrix(bundle);
			expect(matrix.rows[0].justification).toContain('Réserves de couverture réglementaire');
			expect(matrix.rows[0].justification).toContain('Directive NIS 2:missing (0/12)');

			const archDoc = readFileSync(resolve(process.cwd(), 'ARCHITECTURE.md'), 'utf-8');
			expect(archDoc).toContain('COVERAGE_INCOMPLETE');
			expect(archDoc).toContain('Non bloquant à l\'arbitrage');
			expect(archDoc).toContain('bloquant au scellement');
		});

		it('refuse architecture.lock si une réserve de couverture missing/unknown n’est pas acceptée', async () => {
			await expect(
				generateArchitectureLockManifest({
					projectId: 'proj-lock-385',
					sealedBy: 'lead',
					sealedByRole: 'lead_architect',
					coverageReserves: reserves
				})
			).rejects.toThrow(InvariantViolationError);
		});
	});

	// ── Issue #380 ─────────────────────────────────────────────────────────────
	describe('Issue #380 — Provenance du verdict Oracle et nommage hôtes', () => {
		it('infère la provenance defaults / catalogue / inventaire_reel et renseigne evaluatedAt + ontologyRevision', async () => {
			const catalog = await loadOntologyCatalog();
			const defaultBinding: OntologyBindingItem & { source?: string; ratificationStatus?: string } = {
				urn: 'urn:archinex:leaf:baremetal',
				revision: 1,
				source: 'default',
				ratificationStatus: 'default_proposed'
			};
			const ratifiedBinding: OntologyBindingItem & { source?: string; ratificationStatus?: string } = {
				urn: 'urn:archinex:leaf:baremetal',
				revision: 1,
				source: 'human',
				ratificationStatus: 'ratified'
			};

			expect(inferOracleVerdictSource([])).toBe('defaults');
			expect(inferOracleVerdictSource([defaultBinding])).toBe('defaults');
			expect(inferOracleVerdictSource([ratifiedBinding])).toBe('catalogue');
			expect(inferOracleVerdictSource([defaultBinding], { hasRealInventory: true })).toBe('inventaire_reel');

			const inv = composeMultiAxisHydration('sub-proposes-89', [defaultBinding], catalog);
			const evalRes = await evaluateMultiAxisOracle(inv, [defaultBinding], catalog);
			expect(evalRes.source).toBe('defaults');
			expect(evalRes.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(evalRes.ontologyRevision.length).toBeGreaterThan(0);
		});

		it('corrige le double tiret dans le nommage généré (jamais srv--proposes-89-01)', () => {
			expect(sanitizeHostnameSegment('sub-test--proposes-89')).toBe('proposes-89');
			expect(`srv-${sanitizeHostnameSegment('sub-test--proposes-89')}-01`).toBe('srv-proposes-89-01');
			expect(sanitizeHostnameSegment('---')).toBe('edge');
		});

		it('refuse architecture.lock lorsque oracleSource === defaults', async () => {
			const catalog = await loadOntologyCatalog();
			await expect(
				generateArchitectureLockManifest(
					{
						projectId: 'proj-lock-380-defaults',
						sealedBy: 'lead',
						sealedByRole: 'lead_architect',
						oracleSource: 'defaults',
						coverageInput: {
							projectTitle: 'Projet Test 380'
						}
					},
					catalog
				)
			).rejects.toThrow(InvariantViolationError);
		});
	});

	// ── Issue #58 ──────────────────────────────────────────────────────────────
	describe('Issue #58 — Chemin d’import commun des sujets et unicité des identifiants', () => {
		it('préserve coveredClauseRefs avec et sans requirementAudit', () => {
			const withAudit = requirementIdsOf(
				{ coveredClauseRefs: ['§4.1', '§4.2', '§4.1'] },
				{
					source: { title: 'CCTP', kind: 'rfp', language: 'fr', sha256: 'deadbeef12345678' },
					model: 'test',
					auditedAt: '2026-11-21T12:00:00.000Z',
					items: [],
					confirmedDeliberated: []
				}
			);
			expect(withAudit.requirement_ids).toEqual(['SRC-deadbeef:§4.1', 'SRC-deadbeef:§4.2']);

			const withoutAudit = requirementIdsOf({ coveredClauseRefs: ['§4.1', '§4.2', '§4.1'] });
			expect(withoutAudit.requirement_ids).toEqual(['§4.1', '§4.2']);
		});

		it('préserve problemStatement, expertQuestions, proposal, nature, dependsOn et génère des IDs uniques préfixés par le projet', () => {
			const inputSubjects = [
				{
					factorizationId: 'SUBJ-01',
					sectionRef: '§2.1',
					name: 'Topologie Cœur',
					waitingForRole: 'lead_architect' as const,
					problemStatement: 'Choisir entre actif/actif et actif/passif.',
					expertQuestions: ['Quel RTO maximal est contractuel ?'],
					nature: 'architecture' as const,
					coveredClauseRefs: ['REQ-01', 'REQ-02'],
					proposal: {
						criteria: [{ name: 'Disponibilité', kind: 'nfr' as const, weight: 5, description: 'RTO' }],
						options: [
							{ title: 'Actif/Actif', summary: 'Double site actif' },
							{ title: 'Actif/Passif', summary: 'Bascule à froid' }
						],
						evaluations: []
					}
				},
				{
					factorizationId: 'SUBJ-02',
					sectionRef: '§2.2',
					name: 'Plan de reprise',
					waitingForRole: 'infra_expert_architect' as const,
					dependsOn: ['SUBJ-01'],
					coveredClauseRefs: ['REQ-03']
				}
			];

			const imported = buildImportedSubjects({
				projectId: 'Mon Projet Test',
				subjects: inputSubjects
			});

			expect(imported.subjects).toHaveLength(2);
			expect(imported.subjects[0].id).toMatch(/^sub_mon_projet_test_/);
			expect(imported.subjects[0].problem_statement).toBe('Choisir entre actif/actif et actif/passif.');
			expect(imported.subjects[0].nature).toBe('architecture');
			expect(imported.subjects[0].proposal?.options).toHaveLength(2);
			expect(imported.subjects[0].requirement_ids).toEqual(['REQ-01', 'REQ-02']);
			expect(imported.drafts[imported.subjects[0].id].expertQuestions).toEqual([
				'Quel RTO maximal est contractuel ?'
			]);
			expect(imported.subjects[1].depends_on_subject_ids).toEqual([imported.subjects[0].id]);
			expect(imported.subjects[0].unlocks_count).toBe(1);

			// Deux espaces de même titre produisent des Subject.id distincts (pas de collision globale)
			const spaceA = buildEngagementProfileFromWorkspaceInput({
				title: 'Même Titre',
				type: 'project_rfp',
				description: 'A',
				strategy: { objectives: ['O1'], principles: ['P1'], constraints: ['C1'] },
				participants: DEFAULT_PARTICIPANTS,
				initialSubjects: inputSubjects
			});
			const spaceB = buildEngagementProfileFromWorkspaceInput({
				title: 'Même Titre',
				type: 'project_rfp',
				description: 'B',
				strategy: { objectives: ['O1'], principles: ['P1'], constraints: ['C1'] },
				participants: DEFAULT_PARTICIPANTS,
				initialSubjects: inputSubjects
			});

			expect(spaceA.engagement.subjects[0].id).not.toBe(spaceB.engagement.subjects[0].id);
		});
	});
});
