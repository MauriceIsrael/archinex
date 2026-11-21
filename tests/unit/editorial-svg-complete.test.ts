import { describe, expect, it } from 'vitest';
import {
	buildEditorialHldPackage,
	buildImpactSimulationDeltaInput,
	renderArchitectureDelta,
	renderCompensatingLayers,
	renderCoverageUnitGrid,
	renderDecisionHeatmap,
	renderDecisionRadar,
	renderDeploymentSequenceSvg,
	renderLifecyclePhaseMap,
	renderPairedPolicyTraces,
	renderRequirementTraceability,
	verifyArchitectureDeltaSvg,
	verifyEditorialSvg,
	verifyRequirementTraceabilitySvg
} from '$lib/domain/editorialSvg';
import { buildDefaultImpactGraph, simulateCostOptimization } from '$lib/domain/impactGraph';
import { adviseEditorialViewsWithLlm } from '$lib/server/agents/editorialRecommenderAgent';

describe('Editorial SVG Complete Suite (#421, #423, #424, #427)', () => {
	it('renders Architecture Delta with stable unchanged coordinates and exact ledger bijection (#421)', () => {
		const res = renderArchitectureDelta({
			subjectId: 'sub_delta',
			sectionRef: 'S-4',
			title: 'Migration Passerelle API',
			beforeLabel: 'Before · V2 Nominale',
			afterLabel: 'After · V1 Optimisée',
			components: [
				{ id: 'GW', name: 'Passerelle API', beforeSignature: 'v1', afterSignature: 'v1', status: 'unchanged' },
				{ id: 'AUTH', name: 'Service Auth', beforeSignature: 'direct', afterSignature: 'queued', status: 'changed' },
				{ id: 'LEGACY', name: 'Ancien Proxy', beforeSignature: 'legacy', status: 'removed' },
				{ id: 'QUEUE', name: 'File Durable', afterSignature: 'broker', status: 'added' }
			],
			relations: [
				{ id: 'R1', fromBefore: 'GW', toBefore: 'AUTH', fromAfter: 'GW', toAfter: 'AUTH', status: 'unchanged' },
				{ id: 'R2', fromBefore: 'AUTH', toBefore: 'LEGACY', fromAfter: 'AUTH', toAfter: 'QUEUE', status: 'rewired' }
			],
			dials: { skin: 'light', detail: 'balanced', audience: 'mixed', size: 'doc-wide' }
		});

		expect(res.svg).toContain('data-diagram="architecture-delta"');
		expect(res.svg).toContain('data-snapshot="before"');
		expect(res.svg).toContain('data-snapshot="after"');
		expect(res.svg).toContain('data-change="CHANGED" data-target="AUTH"');
		expect(res.svg).toContain('data-change="REMOVED" data-target="LEGACY"');
		expect(res.svg).toContain('data-change="ADDED" data-target="QUEUE"');
		expect(res.svg).toContain('data-change="REWIRED" data-target="R2"');

		const report = verifyArchitectureDeltaSvg(res.svg);
		expect(report.ok, JSON.stringify(report.issues)).toBe(true);
	});

	it('adapts ImpactGraph simulation directly into a valid Architecture Delta SVG', () => {
		const base = buildDefaultImpactGraph();
		const sim = simulateCostOptimization(base, 'cost_optimized_v1');
		const input = buildImpactSimulationDeltaInput(sim, 'Compromis Coût V1', 'S-2');
		const res = renderArchitectureDelta(input);
		const report = verifyArchitectureDeltaSvg(res.svg);
		expect(report.ok, JSON.stringify(report.issues)).toBe(true);
	});

	it('renders Paired Policy-Evaluation Traces with first-divergence marker and distinct UNVERIFIED state (#423)', () => {
		const res = renderPairedPolicyTraces({
			subjectId: 'sub_kb',
			sectionRef: 'S-3',
			subjectName: 'Conformité Chiffrement',
			optionALabel: 'Option A · HSM',
			optionBLabel: 'Option B · Logiciel',
			rules: [
				{ ruleId: 'KB-01', ruleTitle: 'TLS 1.3 obligatoire', optionAStatus: 'PASS', optionBStatus: 'PASS' },
				{ ruleId: 'KB-02', ruleTitle: 'Clés matérielles FIPS', optionAStatus: 'PASS', optionBStatus: 'FAIL' },
				{ ruleId: 'KB-03', ruleTitle: 'Audit externe', optionAStatus: 'UNVERIFIED', optionBStatus: 'SKIPPED' }
			]
		});

		expect(res.svg).toContain('data-diagram="paired-policy-traces"');
		expect(res.svg).toContain('data-policy-row="KB-02" data-first-divergence="true"');
		expect(res.svg).toContain('? UNVERIFIED');
		expect(res.svg).toContain('✕ FAIL');
		expect(res.svg).toContain('⊘ SKIPPED');
		expect(verifyEditorialSvg(res.svg).ok).toBe(true);
	});

	it('renders Compensating Security Layers with explicit residual risk (#423)', () => {
		const res = renderCompensatingLayers({
			subjectId: 'sub_sec',
			sectionRef: 'S-5',
			subjectName: 'Défense en Profondeur',
			layers: [
				{ id: 'L1', surface: 'Conception', controlName: 'Revue d’architecture', actor: 'human', timing: 'write', coverageNote: '100% clauses' },
				{ id: 'L2', surface: 'CI / GitOps', controlName: 'Porte OPA Rego', actor: 'code', timing: 'merge', coverageNote: 'Blocage auto', isGap: true }
			],
			residualRiskSummary: 'Dérogation temporaire V1 couverte par supervision continue.'
		});

		expect(res.svg).toContain('data-diagram="compensating-security-layers"');
		expect(res.svg).toContain('data-role="residual-risk"');
		expect(verifyEditorialSvg(res.svg).ok).toBe(true);
	});

	it('renders Decision Card Heatmap with explicit numeric scores and editorial callout (#423)', () => {
		const res = renderDecisionHeatmap({
			subjectId: 'sub_dec',
			sectionRef: 'S-6',
			subjectName: 'Choix Plateforme',
			criteria: [
				{ id: 'c1', name: 'Résilience', weight: 3 },
				{ id: 'c2', name: 'Coût', weight: 2 }
			],
			options: [
				{ id: 'o1', title: 'Actif-Actif', retained: true, scores: { c1: 5, c2: 3 } },
				{ id: 'o2', title: 'Actif-Passif', retained: false, scores: { c1: 3, c2: 5 } }
			],
			calloutText: 'Réversible sous 30 jours'
		});

		expect(res.svg).toContain('data-diagram="decision-heatmap"');
		expect(res.svg).toContain('5/5');
		expect(res.svg).toContain('4.20');
		expect(verifyEditorialSvg(res.svg).ok).toBe(true);
	});

	it('verifies Requirement Traceability contract and packages HLD artifacts (#424)', () => {
		const res = renderRequirementTraceability({
			subjectId: 'sub_rtm',
			sectionRef: 'S-7',
			subjectName: 'Couverture',
			rows: [
				{
					requirementId: 'REQ-10',
					sourceRef: 'RFP §4',
					sourceLabel: 'Disponibilité',
					requirementTitle: 'RPO < 5 min',
					designElementId: null,
					verificationId: null
				}
			]
		});
		expect(verifyRequirementTraceabilitySvg(res.svg).ok).toBe(true);

		const pkg = buildEditorialHldPackage(res);
		expect(pkg.artifacts.map((a) => a.mimeType)).toEqual(['image/svg+xml', 'text/html']);
		expect(pkg.markdownEmbed).toContain('![Traçabilité des exigences');
	});

	it('validates LLM focalId against real entity IDs and falls back transparently on LLM failure (#427)', async () => {
		const fakeOkLlm = {
			async chat() {
				return JSON.stringify({
					recommendations: [
						{
							viewId: 'paired-policy-traces',
							score: 94,
							rationale: 'Deux options divergent sur une règle KB critique.',
							suggestedDetail: 'balanced',
							suggestedAudience: 'executive',
							focalId: 'REAL-ID'
						},
						{
							viewId: 'traceable-blocks',
							score: 80,
							rationale: 'Arbre TOGAF complet.',
							suggestedDetail: 'faithful',
							suggestedAudience: 'mixed',
							focalId: 'HALLUCINATED-ID'
						}
					],
					calloutText: 'Divergence sur KB-02'
				});
			}
		};

		const okRes = await adviseEditorialViewsWithLlm(
			{
				subjectName: 'Test Sujet',
				signals: {
					blockCount: 2,
					statementCount: 5,
					unsettledCount: 1,
					requirementCount: 3,
					missingVerificationCount: 1,
					optionCount: 2,
					hasRetainedDecision: true
				},
				validEntityIds: ['REAL-ID']
			},
			fakeOkLlm
		);

		expect(okRes.source).toBe('llm');
		expect(okRes.recommendations[0].viewId).toBe('paired-policy-traces');
		expect(okRes.recommendations[0].focalId).toBe('REAL-ID');
		expect(okRes.recommendations.find((r) => r.viewId === 'traceable-blocks')?.focalId).toBeUndefined();
		expect(okRes.calloutText).toBe('Divergence sur KB-02');

		const failingLlm = {
			async chat() {
				throw new Error('Ollama offline');
			}
		};
		const fallbackRes = await adviseEditorialViewsWithLlm(
			{
				subjectName: 'Test Sujet',
				signals: {
					blockCount: 3,
					statementCount: 8,
					unsettledCount: 0,
					requirementCount: 0,
					missingVerificationCount: 0,
					optionCount: 1,
					hasRetainedDecision: false
				},
				validEntityIds: []
			},
			failingLlm
		);

		expect(fallbackRes.source).toBe('deterministic');
		expect(fallbackRes.fallbackReason).toContain('Ollama offline');
		expect(fallbackRes.recommendations.length).toBe(10);
	});

	it('renders Lifecycle Phase Map, Decision Radar, Deployment Sequence, and Coverage Unit Grid passing all verifiers', () => {
		const lifecycle = renderLifecyclePhaseMap({
			subjectId: 'sub_lc',
			sectionRef: 'S-8',
			subjectName: 'Maturité Réseau',
			currentLevel: 3,
			unsettledCount: 2,
			hasRetainedDecision: true,
			isFrozen: false
		});
		expect(lifecycle.svg).toContain('data-diagram="lifecycle-phase-map"');
		expect(verifyEditorialSvg(lifecycle.svg).ok).toBe(true);

		const radar = renderDecisionRadar({
			subjectId: 'sub_rad',
			sectionRef: 'S-9',
			subjectName: 'Compromis Plateforme',
			criteria: [
				{ id: 'c1', name: 'Résilience', weight: 3 },
				{ id: 'c2', name: 'Coût', weight: 2 },
				{ id: 'c3', name: 'Souveraineté', weight: 4 }
			],
			options: [
				{ id: 'o1', title: 'Option A', retained: true, scores: { c1: 5, c2: 3, c3: 5 } },
				{ id: 'o2', title: 'Option B', retained: false, scores: { c1: 3, c2: 5, c3: 2 } }
			]
		});
		expect(radar.svg).toContain('data-diagram="decision-radar"');
		expect(verifyEditorialSvg(radar.svg).ok).toBe(true);

		const seq = renderDeploymentSequenceSvg({
			subjectId: 'sub_seq',
			sectionRef: 'S-10',
			subjectName: 'Homologation Continue',
			actors: ['Arbitre', 'Archinex', 'KB / OPA', 'Nautobot'],
			steps: [
				{ id: 'S1', fromActorIndex: 0, toActorIndex: 1, label: 'Signe décision', isFocal: true },
				{ id: 'S2', fromActorIndex: 1, toActorIndex: 2, label: 'Vérifie KB' },
				{ id: 'S3', fromActorIndex: 2, toActorIndex: 1, label: 'Verdict', isReturn: true }
			],
			altBranchPrimary: 'Planification validée',
			altBranchFallback: 'Remédiation'
		});
		expect(seq.svg).toContain('data-diagram="deployment-sequence"');
		expect(seq.svg).toContain('>ALT<');
		expect(verifyEditorialSvg(seq.svg).ok).toBe(true);

		const unitGrid = renderCoverageUnitGrid({
			subjectId: 'sub_ug',
			sectionRef: 'S-11',
			subjectName: 'Couverture Globale',
			rows: [
				{ requirementId: 'R1', sourceRef: 'RFP', sourceLabel: 'Sec', requirementTitle: 'MFA', designElementId: 'D1', verificationId: 'V1' },
				{ requirementId: 'R2', sourceRef: 'RFP', sourceLabel: 'Sec', requirementTitle: 'Logs', designElementId: 'D2', verificationId: null },
				{ requirementId: 'R3', sourceRef: 'RFP', sourceLabel: 'Sec', requirementTitle: 'PRA', designElementId: null, verificationId: null }
			]
		});
		expect(unitGrid.svg).toContain('data-diagram="coverage-unit-grid"');
		expect(unitGrid.svg).toContain('data-unit-status="verified"');
		expect(unitGrid.svg).toContain('data-unit-status="unlinked"');
		expect(verifyEditorialSvg(unitGrid.svg).ok).toBe(true);
	});
});
