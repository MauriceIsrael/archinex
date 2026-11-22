import { describe, it, expect } from 'vitest';
import {
	COVERAGE_STAGES,
	COVERAGE_STAGE_RANK,
	computeCoverageReport,
	computeRequirementCoverage,
	coverageFromBundle,
	evaluateSealingReadiness,
	isMonotonicStageTransition,
	type CoverageRequirementInput
} from '$lib/domain/coverageModel';
import { computeExtractionReport } from '$lib/domain/rfpExtractionReport';
import { renderTraceabilityMatrix } from '$lib/domain/bundleRtm';
import { sealEngagementBundle } from '$lib/domain/bundleVerifier';
import { buildEngagementBundle } from '$lib/domain/engagementBundle';

describe('Issue #401 — Modèle unique de complétude de la couverture des exigences', () => {
	it('calcule les 6 étapes monotones de couverture à partir des faits structurés (jamais saisies)', () => {
		const base: CoverageRequirementInput = {
			id: 'req-1',
			clauseRef: 'REQ-01',
			title: 'Haute disponibilité',
			criticality: 'bloquant',
			domain: 'Résilience'
		};

		expect(computeRequirementCoverage(base).stage).toBe('unqualified');

		const qualified: CoverageRequirementInput = {
			...base,
			disposition: 'deliberated',
			dispositionReason: 'Exigence structurante à arbitrer'
		};
		expect(computeRequirementCoverage(qualified).stage).toBe('qualified');

		const attached: CoverageRequirementInput = {
			...qualified,
			subjects: [{ id: 'sub-1', title: 'Topologie HA', domain: 'Résilience' }]
		};
		expect(computeRequirementCoverage(attached).stage).toBe('attached');

		// Décision sans trace KB ne suffit pas pour passer à `decided`
		const decidedNoKb: CoverageRequirementInput = {
			...attached,
			decisions: [{ id: 'dec-1', subjectId: 'sub-1', rationale: 'Choix actif/actif justifié', kbCheckStatus: 'not_checked' }]
		};
		const noKbItem = computeRequirementCoverage(decidedNoKb);
		expect(noKbItem.stage).toBe('attached');
		expect(noKbItem.gap?.code).toBe('DECISION_WITHOUT_KB_TRACE');

		// Décision avec justification et vérification KB tracée -> `decided`
		const decided: CoverageRequirementInput = {
			...attached,
			decisions: [{ id: 'dec-1', subjectId: 'sub-1', rationale: 'Choix actif/actif justifié', kbCheckStatus: 'checked' }]
		};
		expect(computeRequirementCoverage(decided).stage).toBe('decided');

		// Planifiée (>= 1 objet Nautobot marqué) -> `planned`
		const planned: CoverageRequirementInput = {
			...decided,
			plannedObjects: [{ id: 'nb-1', kind: 'device', label: 'cluster-ha-01', realizedProven: false }]
		};
		expect(computeRequirementCoverage(planned).stage).toBe('planned');

		// Réalisée prouvée (write-back confirmé) -> `realized_proven`
		const proven: CoverageRequirementInput = {
			...decided,
			plannedObjects: [{ id: 'nb-1', kind: 'device', label: 'cluster-ha-01', realizedProven: true, realizedAt: '2026-10-01T10:00:00Z' }]
		};
		expect(computeRequirementCoverage(proven).stage).toBe('realized_proven');
	});

	it('vérifie la propriété de monotonie : aucune régression sans événement explicite', () => {
		for (const from of COVERAGE_STAGES) {
			for (const to of COVERAGE_STAGES) {
				const isRegression = COVERAGE_STAGE_RANK[to] < COVERAGE_STAGE_RANK[from];
				if (isRegression) {
					expect(isMonotonicStageTransition(from, to, null)).toBe(false);
					expect(isMonotonicStageTransition(from, to, 'retraction')).toBe(true);
					expect(isMonotonicStageTransition(from, to, 'drift_detected')).toBe(true);
				} else {
					expect(isMonotonicStageTransition(from, to, null)).toBe(true);
				}
			}
		}
	});

	it('interdit une évacuation sans motif et refuse le scellement si une exigence bloquante n’est pas décidée', () => {
		const report = computeCoverageReport([
			{
				id: 'req-ok',
				clauseRef: 'REQ-01',
				title: 'Exigence décidée',
				criticality: 'bloquant',
				domain: 'Sécurité',
				disposition: 'deliberated',
				subjects: [{ id: 's1', title: 'Sujet 1' }],
				decisions: [{ id: 'd1', subjectId: 's1', rationale: 'Justification complète', kbCheckStatus: 'checked' }]
			},
			{
				id: 'req-gap',
				clauseRef: 'REQ-02',
				title: 'Exigence bloquante non décidée',
				criticality: 'bloquant',
				domain: 'Sécurité',
				disposition: 'deliberated',
				subjects: [{ id: 's2', title: 'Sujet 2' }]
			},
			{
				id: 'req-bad-evac',
				clauseRef: 'REQ-03',
				title: 'Évacuation sans motif',
				criticality: 'majeur',
				domain: 'Exploitation',
				disposition: 'evacuated',
				dispositionReason: ''
			}
		]);

		expect(report.indicators.blockingDecided.covered).toBe(1);
		expect(report.indicators.blockingDecided.total).toBe(2);
		expect(report.indicators.headline).toBe('1 / 2 exigences bloquantes décidées');

		// Scellement refusé sans acceptation
		const readinessRefused = evaluateSealingReadiness(report);
		expect(readinessRefused.canSeal).toBe(false);
		expect(readinessRefused.invalidEvacuations.map((g) => g.requirementId)).toContain('req-bad-evac');
		expect(readinessRefused.unacceptedBlockingGaps.map((g) => g.requirementId)).toContain('req-gap');

		// Même avec acceptation sur req-gap, une évacuation sans motif reste interdite
		const stillRefused = evaluateSealingReadiness(report, [
			{ requirementId: 'req-gap', justification: 'Dérogation comité architecture', acceptedBy: '@lead' }
		]);
		expect(stillRefused.canSeal).toBe(false);

		// Une fois l'évacuation motivée et la dérogation tracée, le scellement est autorisé
		const fixedReport = computeCoverageReport([
			{
				id: 'req-ok',
				clauseRef: 'REQ-01',
				title: 'Exigence décidée',
				criticality: 'bloquant',
				domain: 'Sécurité',
				disposition: 'deliberated',
				subjects: [{ id: 's1', title: 'Sujet 1' }],
				decisions: [{ id: 'd1', subjectId: 's1', rationale: 'Justification complète', kbCheckStatus: 'checked' }]
			},
			{
				id: 'req-gap',
				clauseRef: 'REQ-02',
				title: 'Exigence bloquante avec dérogation',
				criticality: 'bloquant',
				domain: 'Sécurité',
				disposition: 'deliberated',
				subjects: [{ id: 's2', title: 'Sujet 2' }]
			},
			{
				id: 'req-good-evac',
				clauseRef: 'REQ-03',
				title: 'Évacuation motivée',
				criticality: 'majeur',
				domain: 'Exploitation',
				disposition: 'evacuated',
				dispositionReason: 'Hors périmètre contractuel validé en comité'
			}
		]);
		const allowed = evaluateSealingReadiness(fixedReport, [
			{ requirementId: 'req-gap', justification: 'Acceptation temporaire tracée en comité', acceptedBy: '@lead' }
		]);
		expect(allowed.canSeal).toBe(true);
		expect(allowed.acceptedDeviations).toHaveLength(1);
	});

	it('produit les mêmes chiffres dans le modèle de domaine et dans l’export RTM (cohérence)', () => {
		const bundle = sealEngagementBundle(
			buildEngagementBundle({
				snapshotId: 'snap-cov-1',
				createdAt: '2026-10-01T10:00:00.000Z',
				engagement: {
					id: 'eng-cov-1',
					title: 'Projet Test Couverture',
					language: 'fr',
					confidentiality: 'internal',
					client_label: 'Client'
				},
				sourceDocuments: [
					{ id: 'SRC-1', kind: 'rfp', title: 'CCTP', language: 'fr', sha256: 'a'.repeat(64) }
				],
				requirements: [
					{
						id: 'REQ-1',
						source_document_id: 'SRC-1',
						clause_ref: 'ART-1',
						text: 'Exigence bloquante couverte',
						title: 'Exigence 1',
						language: 'fr',
						criticality: 'bloquant',
						disposition: 'deliberated',
						assertion_level: 'asserted',
						provenance: { basis: 'human_validation', by: ['@lead'], at: '2026-10-01T10:00:00.000Z' }
					},
					{
						id: 'REQ-2',
						source_document_id: 'SRC-1',
						clause_ref: 'ART-2',
						text: 'Exigence bloquante non décidée',
						title: 'Exigence 2',
						language: 'fr',
						criticality: 'bloquant',
						disposition: 'deliberated',
						assertion_level: 'asserted',
						provenance: { basis: 'human_validation', by: ['@lead'], at: '2026-10-01T10:00:00.000Z' }
					}
				],
				subjects: [
					{
						id: 'SUB-1',
						title: 'Sujet 1',
						domains: ['Sécurité'],
						maturity: 'L3_decided',
						status: 'decided',
						requirement_ids: ['REQ-1'],
						decision_ids: ['DEC-1']
					},
					{
						id: 'SUB-2',
						title: 'Sujet 2 (non encore arbitré)',
						domains: ['Sécurité'],
						maturity: 'L3_decided',
						status: 'open',
						requirement_ids: ['REQ-2'],
						decision_ids: []
					}
				],
				decisions: [
					{
						id: 'DEC-1',
						subject_id: 'SUB-1',
						status: 'validated',
						title: 'Décision Sujet 1',
						decision: 'Option A retenue',
						rationale: 'Justification complète et vérifiée',
						epistemic_status: 'validated',
						assertion_level: 'asserted',
						provenance: { basis: 'human_validation', by: ['@lead'], at: '2026-10-01T10:00:00.000Z' },
						compliance_check: {
							status: 'checked',
							hub_revision: 'rev-1',
							checked_at: '2026-10-01T09:59:00.000Z',
							unassessed_rule_ids: [],
							frameworks: ['ISO27001']
						}
					}
				],
				statements: [],
				compliance: [],
				gaps: [
					{
						id: 'GAP-1',
						kind: 'uncovered_requirement',
						requirement_id: 'REQ-2',
						description: 'REQ-2 non encore rattachée',
						blocking: true
					}
				]
			})
		);

		const cov = coverageFromBundle(bundle);
		const rtm = renderTraceabilityMatrix(bundle);

		expect(cov.indicators.headline).toBe('1 / 2 exigences bloquantes décidées');
		expect(rtm).toContain(cov.indicators.headline);
		expect(rtm).toContain(`${cov.gaps.length} dont ${cov.blockingGaps.length} bloquant(s)`);
	});

	it('expose extractionCharCoverage dans rfpExtractionReport pour lever toute ambiguïté', () => {
		const report = computeExtractionReport('Texte brut du cahier des charges complet.', [
			{ id: 'c1', clauseRef: 'ART-1', title: 'Article 1', text: 'Texte brut du cahier des charges', criticality: 'bloquant' }
		]);
		expect(typeof report.extractionCharCoverage).toBe('number');
		expect(report.extractionCharCoverage).toBeGreaterThan(0);
		expect((report as unknown as Record<string, unknown>).coverageRate).toBeUndefined();
	});
});
