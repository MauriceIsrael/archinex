import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	buildDecisionDiagramModel,
	projectDecisionModelToC4x,
	projectDecisionModelToImpactGraph,
	projectDecisionModelToMermaid,
	projectDecisionModelToStructurizr,
	validateC4xDslSyntax,
	validateDiagramProvenance,
	validateMermaidSyntax,
	validateStructurizrDslSyntax,
	verifyDiagramFreshness,
	type DecisionDiagramInput
} from '$lib/domain/decisionDiagramModel';

describe('Issue #404 — Schémas générés d’un modèle de décision unique avec provenance et empreinte', () => {
	const baseInput: DecisionDiagramInput = {
		subjectId: 'sub-net-1',
		subjectTitle: 'Passerelle de sécurité périmétrique',
		sectionRef: '§2.1',
		requirements: [{ id: 'req-sec-1', clauseRef: 'REQ-SEC-01', title: 'Chiffrement inter-zones' }],
		options: [
			{ id: 'opt-1', title: 'Passerelle dédiée + médiation' },
			{ id: 'opt-2', title: 'Flux direct sans médiation' }
		],
		decision: {
			id: 'dec-1',
			retainedOptionId: 'opt-1',
			rationale: 'Garantit le filtrage et le masquage topologique.',
			rejected: [{ optionId: 'opt-2', reason: 'Non conforme à la politique de sécurité' }]
		},
		kbConstraints: [{ id: 'kb-1', title: 'Isolation DMZ obligatoire', verdict: 'conforme', clauseRef: 'KB-DMZ-01' }],
		components: [
			{ id: 'gw', name: 'Passerelle Sécurité', role: 'Terminaison tunnel', zone: 'DMZ', sourceId: 'dec-1', sourceKind: 'decision' },
			{ id: 'core', name: 'Service Cœur', role: 'Traitement', zone: 'Cœur', sourceId: 'dec-1', sourceKind: 'decision' }
		],
		flows: [{ fromComponentId: 'gw', toComponentId: 'core', label: 'Flux inspecté', sourceId: 'dec-1', sourceKind: 'decision' }],
		plannedObjects: [{ id: 'nb-gw', kind: 'device', label: 'sec-gw-01' }]
	};

	it('dérive Mermaid, Structurizr DSL, C4X DSL et Graphe d’impact d’un modèle unique avec provenance complète et syntaxe valide', () => {
		const model = buildDecisionDiagramModel(baseInput);
		const prov = validateDiagramProvenance(model);
		expect(prov.valid).toBe(true);
		expect(prov.errors).toEqual([]);
		expect(prov.hypothesesCount).toBe(0);

		const mermaid = projectDecisionModelToMermaid(model);
		const structurizr = projectDecisionModelToStructurizr(model);
		const c4x = projectDecisionModelToC4x(model);
		const impact = projectDecisionModelToImpactGraph(model);

		// Validation syntaxique CI sur toutes les projections
		expect(validateMermaidSyntax(mermaid).valid).toBe(true);
		expect(validateStructurizrDslSyntax(structurizr).valid).toBe(true);
		expect(validateC4xDslSyntax(c4x).valid).toBe(true);

		// Tout élément Mermaid est cliquable vers sa source
		for (const ent of model.entities) {
			expect(mermaid).toContain(`click ${ent.id} "#source/`);
		}

		// Empreinte présente dans les schémas
		expect(mermaid).toContain(model.modelFingerprint);
		expect(structurizr).toContain(model.modelFingerprint);
		expect(c4x).toContain(model.modelFingerprint);

		// Graphe d'impact porte la provenance
		expect(impact.nodes.length).toBe(model.entities.length);
		expect(impact.edges.length).toBe(model.relations.length);
		expect(impact.nodes.every((n) => Boolean(n.metadata?.cause))).toBe(true);
	});

	it('test de mutation : modifier une décision modifie l’empreinte et le schéma généré (dérive = 0)', () => {
		const originalModel = buildDecisionDiagramModel(baseInput);
		const originalMermaid = projectDecisionModelToMermaid(originalModel);

		expect(verifyDiagramFreshness(originalModel, baseInput).fresh).toBe(true);

		const mutatedInput: DecisionDiagramInput = {
			...baseInput,
			decision: {
				...baseInput.decision!,
				rationale: 'Arbitrage révisé suite à revue sécurité : double médiation active.'
			}
		};

		expect(verifyDiagramFreshness(originalModel, mutatedInput).fresh).toBe(false);
		const mutatedModel = buildDecisionDiagramModel(mutatedInput);
		const mutatedMermaid = projectDecisionModelToMermaid(mutatedModel);
		expect(mutatedModel.modelFingerprint).not.toBe(originalModel.modelFingerprint);
		expect(mutatedMermaid).not.toBe(originalMermaid);
	});

	it('marque explicitement en « hypothèse » un composant sans décision ni source, et rejette un élément sans provenance', () => {
		const hypModel = buildDecisionDiagramModel({
			subjectId: 'sub-hyp',
			subjectTitle: 'Sujet exploratoire',
			components: [{ id: 'c1', name: 'Composant hypothétique' }]
		});
		const prov = validateDiagramProvenance(hypModel);
		expect(prov.valid).toBe(true);
		expect(prov.hypothesesCount).toBe(1);
		expect(projectDecisionModelToMermaid(hypModel)).toContain('[HYPOTHÈSE]');

		// Injection d'un élément sans source -> refusé par validateDiagramProvenance
		const broken = {
			...hypModel,
			entities: [
				...hypModel.entities,
				{
					id: 'orphan',
					kind: 'component' as const,
					label: 'Orphelin',
					provenance: { sourceKind: 'decision' as const, sourceId: '', sourceLabel: '', isHypothesis: false }
				}
			]
		};
		expect(validateDiagramProvenance(broken).valid).toBe(false);
	});

	it('ne contient plus le diagramme de scénario codé en dur (Lot 1 / Lot 3) dans artifactProjections.ts', () => {
		const content = readFileSync(
			resolve(process.cwd(), 'src/lib/domain/artifactProjections.ts'),
			'utf-8'
		);
		expect(content).not.toContain('MME_Lot3');
		expect(content).not.toContain('SecGW_Lot1');
		expect(content).not.toContain('DEA_Lot1');
		expect(content).not.toContain('HSS_Lot1');
	});
});
