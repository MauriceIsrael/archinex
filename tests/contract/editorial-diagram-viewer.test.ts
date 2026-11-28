import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import EditorialDiagramViewer from '$lib/components/deliberation/EditorialDiagramViewer.svelte';
import {
	DEFAULT_EDITORIAL_DIALS,
	recommendEditorialViews,
	renderArchitectureDelta,
	renderRequirementTraceability,
	renderTraceableBlockTree,
	type EditorialDiagramResult,
	type EditorialViewRecommendation
} from '$lib/domain/editorialSvg';
import type { ProjectionBlockGraph } from '$lib/domain/projectionBlocks';
import type { Statement } from '$lib/types/epistemic';

function makeStatement(id: string, predicate: string, value: string): Statement {
	return {
		id,
		section: 'S-1',
		triplet: { subject: 'sub_test', predicate, value },
		maturity: { confidence: 'verified', status: 'active' },
		authority: { authorId: 'u_arch', productionMode: 'human' },
		justification: { basedOn: [], appliedRule: '' },
		createdAt: '2026-11-20T00:00:00Z'
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
						statement: makeStatement('stmt_1', 'Authentification', 'OIDC + MFA'),
						index: 0,
						badge: { tag: 'Verified', label: 'Vérifié' } as any,
						componentName: 'IdP OIDC'
					}
				],
				requirementRefs: ['REQ-01'],
				settledCount: 1,
				unsettledCount: 0
			}
		],
		requirements: [
			{
				clauseRef: 'REQ-01',
				safeId: 'REQ_01',
				title: 'Authentification forte des opérateurs',
				targetAxisId: 'security-iam'
			}
		],
		statementAxis: new Map([['stmt_1', 'security-iam']])
	};
}

describe('EditorialDiagramViewer.svelte — Contrat de rendu des cadrans, exports et badges', () => {
	const graph = makeSampleBlockGraph();
	const blockTreeDiagram = renderTraceableBlockTree({
		subjectId: 'sub_test',
		sectionRef: 'S-1',
		subjectName: 'Architecture Sécurité & Réseau',
		graph,
		dials: DEFAULT_EDITORIAL_DIALS
	});
	const reqTraceDiagram = renderRequirementTraceability({
		subjectId: 'sub_test',
		sectionRef: 'S-1',
		subjectName: 'Architecture Sécurité & Réseau',
		rows: [
			{
				requirementId: 'REQ-01',
				sourceRef: 'CCTP-1',
				sourceLabel: 'CCTP',
				requirementTitle: 'Authentification forte des opérateurs',
				designElementId: 'stmt_1',
				designElementLabel: 'IdP OIDC + MFA',
				verificationId: 'ver_1',
				verificationLabel: 'Test OIDC'
			}
		],
		dials: DEFAULT_EDITORIAL_DIALS
	});
	const recommendations: EditorialViewRecommendation[] = recommendEditorialViews({
		blockCount: 2,
		statementCount: 4,
		unsettledCount: 1,
		requirementCount: 3,
		missingVerificationCount: 0,
		optionCount: 2,
		criteriaCount: 3,
		hasRetainedDecision: true,
		hasAcceptedViolations: false,
		hasDriftSignals: false
	});

	it('affiche le viewer, les 4 cadrans, le badge 4px · AA · OK et les exports .svg / .html / .registry.json', () => {
		const { html } = render(EditorialDiagramViewer, {
			props: {
				diagram: blockTreeDiagram,
				recommendations,
				dials: { ...DEFAULT_EDITORIAL_DIALS }
			}
		});

		expect(html).toContain('data-testid="editorial-diagram-viewer"');
		expect(html).toContain('Directeur éditorial :');
		expect(html).toContain('data-testid="editorial-dial-skin"');
		expect(html).toContain('data-testid="editorial-dial-detail"');
		expect(html).toContain('data-testid="editorial-dial-audience"');
		expect(html).toContain('data-testid="editorial-dial-size"');
		expect(html).toContain('4px · AA · OK');
		expect(html).toContain('data-testid="editorial-toggle-ledger"');
		expect(html).toContain('data-testid="editorial-export-svg"');
		expect(html).toContain('data-testid="editorial-export-html"');
		expect(html).toContain('data-testid="editorial-export-registry"');
		expect(html).toContain('<svg');
	});

	it('affiche le bouton Affiner par IA en mode repos et en mode chargement (isAskingLlm)', () => {
		const idle = render(EditorialDiagramViewer, {
			props: {
				diagram: blockTreeDiagram,
				recommendations,
				onAskLlmAdvice: () => {},
				isAskingLlm: false
			}
		});
		expect(idle.html).toContain('data-testid="editorial-ask-llm-btn"');
		expect(idle.html).toContain('Affiner par IA');

		const busy = render(EditorialDiagramViewer, {
			props: {
				diagram: blockTreeDiagram,
				recommendations,
				onAskLlmAdvice: () => {},
				isAskingLlm: true
			}
		});
		expect(busy.html).toContain('data-testid="editorial-ask-llm-btn"');
		expect(busy.html).toContain('Analyse…');
	});

	it('masque la barre Directeur éditorial sans recommandations et le bouton registry.json si absent', () => {
		const noRegistryDiagram: EditorialDiagramResult = {
			...reqTraceDiagram,
			registryJson: undefined
		};

		const { html } = render(EditorialDiagramViewer, {
			props: {
				diagram: noRegistryDiagram,
				recommendations: []
			}
		});

		expect(html).not.toContain('Directeur éditorial :');
		expect(html).not.toContain('data-testid="editorial-export-registry"');
		expect(html).toContain('data-testid="editorial-export-svg"');
		expect(html).toContain('data-testid="editorial-export-html"');
	});

	it('bascule sur le badge d’alertes si le SVG échoue à la vérification éditoriale', () => {
		const brokenDiagram: EditorialDiagramResult = {
			...blockTreeDiagram,
			svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
		};

		const { html } = render(EditorialDiagramViewer, {
			props: {
				diagram: brokenDiagram,
				recommendations: []
			}
		});

		expect(html).toContain('alerte(s)');
		expect(html).not.toContain('4px · AA · OK');
	});

	it('supporte le vérificateur dédié pour diagramType architecture-delta', () => {
		const deltaDiagram = renderArchitectureDelta({
			subjectId: 'sub_delta',
			sectionRef: 'S-2',
			title: 'Delta d’impact',
			beforeLabel: 'Avant',
			afterLabel: 'Après',
			components: [
				{ id: 'n1', name: 'Cluster A', status: 'unchanged' },
				{ id: 'n2', name: 'Passerelle B', status: 'changed', changeSummary: 'TLS 1.3 activé' }
			],
			relations: [
				{ id: 'r1', fromBefore: 'n1', toBefore: 'n2', fromAfter: 'n1', toAfter: 'n2', status: 'unchanged', label: 'dépend de' }
			],
			dials: DEFAULT_EDITORIAL_DIALS
		});

		const { html } = render(EditorialDiagramViewer, {
			props: {
				diagram: deltaDiagram,
				recommendations: []
			}
		});

		expect(html).toContain('data-testid="editorial-diagram-viewer"');
		expect(html).toContain('<svg');
	});

	it('ne contient aucun identifiant de projet codé en dur (AGENTS.md §1)', () => {
		const content = readFileSync(
			resolve(process.cwd(), 'src/lib/components/deliberation/EditorialDiagramViewer.svelte'),
			'utf-8'
		);
		expect(content).not.toMatch(/sub_lulu|DEMOLULU|LULUDEMO|REQ-Lot1/i);
	});
});
