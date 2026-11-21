import { describe, expect, it } from 'vitest';
import {
	EDITORIAL_SKINS,
	orthogonalTreeConnector,
	recommendEditorialViews,
	renderRequirementTraceability,
	renderTraceableBlockTree,
	snap4,
	verifyBlockRegistry,
	verifyEditorialSvg,
	verifySkinContrast,
	wcagContrastRatio,
	wrapStandaloneHtml,
	type BlockRegistrySidecar
} from '$lib/domain/editorialSvg';
import type { ProjectionBlockGraph } from '$lib/domain/projectionBlocks';
import type { Statement } from '$lib/types/epistemic';

function makeStatement(id: string, predicate: string, value: string, confidence: 'verified' | 'designed' | 'hypothesis' = 'verified'): Statement {
	return {
		id,
		section: 'S-1',
		triplet: { subject: 'sub_test', predicate, value },
		maturity: { confidence, status: 'active' },
		authority: { authorId: 'u_arch', productionMode: 'human' },
		justification: { basedOn: [], appliedRule: '' },
		createdAt: '2026-01-01T00:00:00Z'
	} as unknown as Statement;
}

function makeSampleBlockGraph(): ProjectionBlockGraph {
	return {
		blocks: [
			{
				axisId: 'security-iam',
				safeId: 'security_iam',
				label: 'Sécurité & IAM',
				togafRef: 'TOGAF-SEC',
				components: ['IdP OIDC', 'Coffre Secrets'],
				items: [
					{
						statement: makeStatement('stmt_1', 'Authentification', 'OIDC + MFA', 'verified'),
						index: 0,
						badge: { tag: 'Verified', label: 'Vérifié' } as any,
						componentName: 'IdP OIDC'
					},
					{
						statement: makeStatement('stmt_2', 'Rotation clés', '90 jours', 'hypothesis'),
						index: 1,
						badge: { tag: 'Hypothesis', label: 'Hypothèse' } as any,
						componentName: 'Coffre Secrets'
					}
				],
				requirementRefs: ['REQ-01', 'REQ-02'],
				settledCount: 1,
				unsettledCount: 1
			},
			{
				axisId: 'network-connectivity',
				safeId: 'network_connectivity',
				label: 'Réseau & Connectivité',
				togafRef: 'TOGAF-NET',
				components: ['Passerelle API'],
				items: [
					{
						statement: makeStatement('stmt_3', 'Chiffrement transport', 'TLS 1.3', 'designed'),
						index: 2,
						badge: { tag: 'Designed', label: 'Conçu' } as any,
						componentName: 'Passerelle API'
					}
				],
				requirementRefs: ['REQ-03'],
				settledCount: 1,
				unsettledCount: 0
			}
		],
		requirements: [
			{ clauseRef: 'REQ-01', safeId: 'REQ_01', title: 'Authentification forte des opérateurs', targetAxisId: 'security-iam' },
			{ clauseRef: 'REQ-02', safeId: 'REQ_02', title: 'Rotation automatique des secrets', targetAxisId: 'security-iam' },
			{ clauseRef: 'REQ-03', safeId: 'REQ_03', title: 'Chiffrement des flux inter-zones', targetAxisId: 'network-connectivity' }
		],
		statementAxis: new Map([
			['stmt_1', 'security-iam'],
			['stmt_2', 'security-iam'],
			['stmt_3', 'network-connectivity']
		])
	};
}

describe('Editorial SVG Engine (diagram-design integration)', () => {
	it('verifies WCAG AA (>= 4.5:1) contrast on all text tokens across light, dark, and full-editorial skins', () => {
		for (const skin of Object.keys(EDITORIAL_SKINS) as Array<keyof typeof EDITORIAL_SKINS>) {
			const result = verifySkinContrast(skin);
			expect(result.ok, `Skin ${skin} failed contrast: ${JSON.stringify(result.checks)}`).toBe(true);
		}
		expect(wcagContrastRatio('#2d3142', '#f5f5f5')).toBeGreaterThanOrEqual(4.5);
	});

	it('quantifies coordinates strictly onto the 4px grid and produces orthogonal-only paths', () => {
		expect(snap4(13)).toBe(12);
		expect(snap4(14)).toBe(16);

		const elbow = orthogonalTreeConnector(100, 168, 220, 240);
		expect(elbow).toContain('Q');
		expect(elbow).not.toMatch(/\bL\b/);

		const straight = orthogonalTreeConnector(100, 168, 100, 240);
		expect(straight).toBe('M 100 168 V 240');
	});

	it('renders Traceable Block Decomposition with data-block-* attributes, valid .registry.json sidecar, and passes geometry/a11y verification', () => {
		const graph = makeSampleBlockGraph();
		const res = renderTraceableBlockTree({
			subjectId: 'sub_auth',
			sectionRef: 'S-1',
			subjectName: 'Architecture d’Accès & Flux',
			retainedOptionTitle: 'Option A · Zéro Confiance',
			graph,
			dials: { skin: 'light', detail: 'balanced', audience: 'mixed', size: 'doc-wide' }
		});

		expect(res.svg).toContain('data-diagram="traceable-block-decomposition"');
		expect(res.svg).toContain('data-block-id="S-1"');
		expect(res.svg).toContain('data-block-id="S-1-01"');
		expect(res.svg).toContain('data-statement-id="stmt_1"');

		const report = verifyEditorialSvg(res.svg);
		expect(report.ok, JSON.stringify(report.issues)).toBe(true);

		expect(res.registryJson).toBeTruthy();
		const sidecar = JSON.parse(res.registryJson!) as BlockRegistrySidecar;
		expect(sidecar.blocks.length).toBeGreaterThanOrEqual(3);
		expect(sidecar.blocks[0].parent).toBeUndefined();
		expect(sidecar.blocks[1].parent).toBe('S-1');

		const regReport = verifyBlockRegistry(sidecar);
		expect(regReport.ok, JSON.stringify(regReport.issues)).toBe(true);

		const html = wrapStandaloneHtml(res.title, res.svg, 'light');
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain(res.svg);
	});

	it('produces deterministic output across runs and updates when input data changes (mutation test)', () => {
		const graph = makeSampleBlockGraph();
		const run1 = renderTraceableBlockTree({
			subjectId: 'sub_auth',
			sectionRef: 'S-1',
			subjectName: 'Architecture d’Accès',
			graph
		});
		const run2 = renderTraceableBlockTree({
			subjectId: 'sub_auth',
			sectionRef: 'S-1',
			subjectName: 'Architecture d’Accès',
			graph
		});
		expect(run1.svg).toBe(run2.svg);
		expect(run1.registryJson).toBe(run2.registryJson);

		const mutated = renderTraceableBlockTree({
			subjectId: 'sub_auth',
			sectionRef: 'S-1',
			subjectName: 'Architecture d’Accès',
			retainedOptionTitle: 'Option B · Souveraine',
			graph
		});
		expect(mutated.svg).not.toBe(run1.svg);
	});

	it('renders Requirement Traceability with explicit missing-link contract (data-trace-missing="true")', () => {
		const res = renderRequirementTraceability({
			subjectId: 'sub_auth',
			sectionRef: 'S-1',
			subjectName: 'Architecture d’Accès',
			rows: [
				{
					requirementId: 'REQ-01',
					sourceRef: 'RFP §2.1',
					sourceLabel: 'Sécurité des accès',
					requirementTitle: 'Authentification forte MFA',
					designElementId: 'SEC-01',
					designElementLabel: 'IdP OIDC',
					verificationId: 'stmt_1',
					verificationLabel: 'Vérifié · IdP OIDC'
				},
				{
					requirementId: 'REQ-02',
					sourceRef: 'RFP §2.2',
					sourceLabel: 'Gestion des secrets',
					requirementTitle: 'Rotation 90 jours',
					designElementId: null,
					designElementLabel: null,
					verificationId: null,
					verificationLabel: null
				}
			],
			dials: { skin: 'dark', detail: 'balanced', audience: 'engineer', size: 'doc-wide' }
		});

		expect(res.svg).toContain('data-diagram="requirement-traceability"');
		expect(res.svg).toContain('data-trace-row="REQ-01"');
		expect(res.svg).toContain('data-trace-row="REQ-02"');
		expect(res.svg).toContain('data-trace-missing="true"');
		expect(res.svg).toContain('Aucun élément rattaché');
		expect(res.svg).toContain('Aucune vérification');

		const report = verifyEditorialSvg(res.svg);
		expect(report.ok, JSON.stringify(report.issues)).toBe(true);
	});

	it('rejects adversarial SVGs with diagonal connectors, non-4px bounds, or duplicate IDs', () => {
		const badSvg = [
			`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="a b" data-skin="light" viewBox="0 0 400 200">`,
			`  <title id="a">Test</title>`,
			`  <desc id="a">Duplicate ID</desc>`,
			`  <path d="M 10 10 L 120 90" marker-end="url(#arr)"/>`,
			`  <rect data-role="bounds" x="13" y="20" width="100" height="40"/>`,
			`</svg>`
		].join('\n');

		const report = verifyEditorialSvg(badSvg);
		expect(report.ok).toBe(false);
		const rules = new Set(report.issues.map((i) => i.rule));
		expect(rules.has('a11y')).toBe(true);
		expect(rules.has('grid-4px')).toBe(true);
		expect(rules.has('orthogonal')).toBe(true);
	});

	it('detects cyclic or dangling parent references in block registry sidecars', () => {
		const cyclic: BlockRegistrySidecar = {
			source: 'test.html',
			blocks: [
				{ id: 'A', parent: 'B', name: 'Bloc A' },
				{ id: 'B', parent: 'A', name: 'Bloc B' },
				{ id: 'C', parent: 'MISSING', name: 'Bloc C' }
			]
		};
		const report = verifyBlockRegistry(cyclic);
		expect(report.ok).toBe(false);
		expect(report.issues.length).toBeGreaterThanOrEqual(2);
	});

	it('ranks editorial views deterministically based on subject signals', () => {
		const traceFirst = recommendEditorialViews({
			blockCount: 1,
			statementCount: 2,
			unsettledCount: 0,
			requirementCount: 8,
			missingVerificationCount: 5,
			optionCount: 1,
			hasRetainedDecision: false
		});
		expect(traceFirst[0].viewId).toBe('requirement-traceability');

		const blocksFirst = recommendEditorialViews({
			blockCount: 4,
			statementCount: 10,
			unsettledCount: 2,
			requirementCount: 0,
			missingVerificationCount: 0,
			optionCount: 1,
			hasRetainedDecision: true
		});
		expect(blocksFirst[0].viewId).toBe('traceable-blocks');
	});
});
