import { describe, it, expect } from 'vitest';
import {
	buildDefaultImpactGraph,
	buildContextualImpactGraph,
	simulateCostOptimization,
	generateMermaidImpactDiagram,
	type ContextualSubjectInput
} from '$lib/domain/impactGraph';
import {
	generateContextualImpactGraphWithLlm,
	type LlmChatClient
} from '$lib/server/agents/impactGraphGenerator';

describe('Graphe d\'Impact & Simulation de Compromis Coût V1 (Contrat & Domaine)', () => {
	it('construit un graphe par défaut complet avec les 5 types de nœuds nécessaires', () => {
		const graph = buildDefaultImpactGraph();

		expect(graph.nodes.length).toBeGreaterThan(0);
		expect(graph.edges.length).toBeGreaterThan(0);

		const nodeTypes = new Set(graph.nodes.map((n) => n.type));
		expect(nodeTypes.has('cost_constraint')).toBe(true);
		expect(nodeTypes.has('decision')).toBe(true);
		expect(nodeTypes.has('option')).toBe(true);
		expect(nodeTypes.has('requirement')).toBe(true);
		expect(nodeTypes.has('compliance')).toBe(true);
	});

	it('simule le scénario nominal V2 où toutes les exigences et conformités sont satisfaites', () => {
		const graph = buildDefaultImpactGraph();
		const result = simulateCostOptimization(graph, 'nominal_v2');

		expect(result.scenario).toBe('nominal_v2');
		expect(result.degradedRequirements.length).toBe(0);
		expect(result.compromisedCompliance.length).toBe(0);
		expect(result.severityMax).toBe('LOW');

		const reqs = result.nodes.filter((n) => n.type === 'requirement' || n.type === 'compliance');
		expect(reqs.every((r) => r.status === 'compliant')).toBe(true);
	});

	it('simule le compromis V1 avec calcul immédiat des dégradations et non-conformités DORA/NIS2', () => {
		const graph = buildDefaultImpactGraph();
		const result = simulateCostOptimization(graph, 'cost_optimized_v1');

		expect(result.scenario).toBe('cost_optimized_v1');
		expect(result.estimatedSavingsOpex).toContain('90');
		expect(result.estimatedSavingsCapex).toContain('45');
		expect(result.severityMax).toBe('CRITICAL');

		expect(result.degradedRequirements.length).toBe(3);
		const slaDegraded = result.degradedRequirements.find((r) => r.id === 'REQ-SLA-AVAIL');
		expect(slaDegraded).toBeDefined();
		expect(slaDegraded?.nominal).toContain('99.95%');
		expect(slaDegraded?.degraded).toContain('99.00%');

		expect(result.compromisedCompliance.length).toBeGreaterThanOrEqual(1);
		const doraViolation = result.compromisedCompliance.find((c) => c.framework.includes('DORA'));
		expect(doraViolation).toBeDefined();
		expect(doraViolation?.severity).toBe('CRITICAL');

		expect(result.assumedTechnicalDebt.length).toBe(2);
		expect(result.assumedTechnicalDebt[0].sunsetClause).toBeTruthy();
	});

	it('génère un diagramme Mermaid valide avec coloration explicite des sous-graphes, nœuds et arêtes', () => {
		const graph = buildDefaultImpactGraph();
		const sim = simulateCostOptimization(graph, 'cost_optimized_v1');
		const mermaidCode = generateMermaidImpactDiagram(sim, 'cost_optimized_v1');

		expect(mermaidCode).toContain('flowchart TD');
		expect(mermaidCode).toContain('subgraph G_COST');
		expect(mermaidCode).toContain('subgraph G_DEC');
		expect(mermaidCode).toContain('subgraph G_REQ');
		expect(mermaidCode).toContain('subgraph G_REG');
		expect(mermaidCode).toContain('classDef costNode');
		expect(mermaidCode).toContain('classDef regViolated');
		expect(mermaidCode).toContain('style G_COST');
		expect(mermaidCode).toContain('style G_REG');
		expect(mermaidCode).toContain('style REG_DORA_RESILIENCE fill:#fee2e2');
		expect(mermaidCode).toContain('linkStyle ');
		expect(mermaidCode).toContain('stroke:#dc2626');
	});

	it('s\'intègre dans le store de délibération avec le mode de vue "graph"', async () => {
		const { deliberationStore } = await import('$lib/stores/deliberationStore.svelte');

		expect(deliberationStore.deliberationViewMode).toBeDefined();
		deliberationStore.setDeliberationViewMode('graph');
		expect(deliberationStore.deliberationViewMode).toBe('graph');

		deliberationStore.setDeliberationViewMode('board');
		expect(deliberationStore.deliberationViewMode).toBe('board');
	});

	it('construit dynamiquement un graphe contextualisé pour un sujet spécifique (domaine santé / SaaS)', () => {
		const saasSubjectInput: ContextualSubjectInput = {
			projectId: 'proj-sante-1',
			projectTitle: 'Portail Patient Cloud Souverain',
			subject: {
				id: 'sub-hds-db',
				sectionRef: '§3.2',
				name: 'Hébergement Base Dossiers Patients',
				problemStatement: 'Choisir entre Cloud HDS dédié multi-région vs instance mutualisée V1',
				maturityLevel: 'L2_decomposed'
			},
			criteria: [
				{ id: 'c-cost', name: 'Coût mensuel Cloud V1', kind: 'cost', weight: 5 },
				{ id: 'c-nfr', name: 'Temps de réponse requête dossier < 200ms', kind: 'nfr', weight: 4 },
				{ id: 'c-comp', name: 'Certification HDS & RGPD', kind: 'compliance', weight: 5 }
			],
			options: [
				{
					id: 'opt-hds-dedie',
					title: 'Cluster HDS SecNumCloud dédié',
					summary: 'Hébergement certifié isolé multi-AZ',
					status: 'proposed'
				},
				{
					id: 'opt-mutualise',
					title: 'Base PostgreSQL mutualisée V1',
					summary: 'Réduction des coûts initiaux de 65% sur instance partagée',
					status: 'debated'
				}
			],
			evaluations: [
				{
					optionId: 'opt-hds-dedie',
					criterionId: 'c-cost',
					score: -2,
					justification: 'Coût fixe élevé dès le premier mois'
				},
				{
					optionId: 'opt-hds-dedie',
					criterionId: 'c-nfr',
					score: 2,
					justification: 'Latence maîtrisée < 80ms'
				},
				{
					optionId: 'opt-hds-dedie',
					criterionId: 'c-comp',
					score: 2,
					justification: 'Conforme HDS natif'
				},
				{
					optionId: 'opt-mutualise',
					criterionId: 'c-cost',
					score: 2,
					justification: 'Économie de -42 k€/an en V1'
				},
				{
					optionId: 'opt-mutualise',
					criterionId: 'c-nfr',
					score: -1,
					justification: 'Latence variable jusqu\'à 450ms aux heures de pointe'
				},
				{
					optionId: 'opt-mutualise',
					criterionId: 'c-comp',
					score: -2,
					justification: 'Rupture exigence d\'isolation physique HDS'
				}
			],
			requirements: [
				{
					id: 'REQ-HDS-01',
					clauseRef: 'CL-3.2.1',
					title: 'Isolation stricte des données de santé',
					criticality: 'bloquant'
				}
			],
			frameworks: ['HDS', 'RGPD'],
			tradeoffs: [
				{
					id: 'to-1',
					optionId: 'opt-mutualise',
					gains: '-42 k€/an OPEX V1',
					sacrifices: 'Perte certification HDS physique et latence dégradée'
				}
			]
		};

		const contextualGraph = buildContextualImpactGraph(saasSubjectInput);
		expect(contextualGraph.meta?.source).toBe('deterministic');
		expect(contextualGraph.meta?.subjectId).toBe('sub-hds-db');

		// Vérifie que le graphe parle bien du sujet Santé/HDS et pas de télécoms
		const allLabels = contextualGraph.nodes.map((n) => n.label).join(' ');
		expect(allLabels).toContain('Cluster HDS SecNumCloud dédié');
		expect(allLabels).toContain('Base PostgreSQL mutualisée V1');
		expect(allLabels).not.toContain('SecGW');

		// Simule le compromis coût V1 sur ce graphe contextuel
		const simV1 = simulateCostOptimization(contextualGraph, 'cost_optimized_v1');
		expect(simV1.degradedRequirements.length).toBeGreaterThanOrEqual(1);
		expect(simV1.compromisedCompliance.length).toBeGreaterThanOrEqual(1);
		expect(simV1.severityMax).toBe('CRITICAL');
		expect(simV1.estimatedSavingsOpex).toContain('-42 k€/an');

		// Le diagramme Mermaid généré doit être syntaxiquement valide
		const mermaid = generateMermaidImpactDiagram(simV1, 'cost_optimized_v1');
		expect(mermaid).toContain('flowchart TD');
		expect(mermaid).toContain('HDS');
	});

	it('génère un graphe enrichi via LLM et gère proprement le fallback si le LLM échoue', async () => {
		const input: ContextualSubjectInput = {
			projectId: 'proj-erp',
			projectTitle: 'Modernisation ERP Achats',
			subject: {
				id: 'sub-sso',
				sectionRef: '§1.4',
				name: 'Fédération d\'Identité OIDC vs Comptes Locaux',
				problemStatement: 'Connecter l\'annuaire interne en V1 ou différer le SSO en V2 ?'
			},
			criteria: [
				{ id: 'c1', name: 'Coût d\'intégration V1', kind: 'cost', weight: 4 },
				{ id: 'c2', name: 'Sécurité des accès', kind: 'compliance', weight: 5 }
			],
			options: [
				{ id: 'o1', title: 'SSO OIDC + MFA matériel', status: 'proposed' },
				{ id: 'o2', title: 'Authentification locale temporaire', status: 'debated' }
			],
			evaluations: [],
			frameworks: ['ISO 27001']
		};

		// 1. Cas nominal avec réponse JSON valide du LLM
		const mockClientSuccess: LlmChatClient = {
			async chat() {
				return JSON.stringify({
					costConstraintLabel: 'Réduction délai & budget V1 (-18 j/h)',
					estimatedSavingsOpex: '-12 k€/an',
					estimatedSavingsCapex: '-25 k€ intégration',
					nominalOption: {
						title: 'SSO OIDC Enterprise + MFA',
						description: 'Fédération complète avec révocation immédiate',
						financialDelta: 'Budget nominal (+25 k€)'
					},
					costOption: {
						title: 'Comptes locaux chiffrés V1',
						description: 'Gestion autonome des comptes sans connecteur AD en V1',
						financialDelta: '-25 k€ CAPEX initial',
						sunsetClause: 'Migration SSO obligatoire avant ouverture à > 100 utilisateurs',
						residualRisk: 'Révocation manuelle en cas de départ collaborateur'
					},
					degradedRequirements: [
						{
							id: 'UX_SSO',
							label: 'Authentification unique (Single Sign-On)',
							nominalValue: 'Connexion transparente via annuaire corporate',
							degradedValue: 'Mot de passe spécifique à l\'application V1',
							severity: 'MEDIUM',
							cause: 'Report du connecteur OIDC pour économiser 25 k€ en V1'
						}
					],
					compromisedCompliance: [
						{
							id: 'ISO_A9',
							framework: 'ISO 27001',
							article: 'Annexe A.9 (Contrôle d\'accès)',
							legalRisk: 'Absence de déprovisionnement automatique des comptes inactifs',
							severity: 'HIGH',
							violated: false,
							mitigation: 'Revue hebdomadaire manuelle des comptes actifs'
						}
					]
				});
			}
		};

		const llmGraph = await generateContextualImpactGraphWithLlm(input, mockClientSuccess);
		expect(llmGraph.meta?.source).toBe('llm');
		expect(llmGraph.meta?.subjectId).toBe('sub-sso');

		const simLlm = simulateCostOptimization(llmGraph, 'cost_optimized_v1');
		expect(simLlm.estimatedSavingsCapex).toBe('-25 k€ intégration');
		expect(simLlm.degradedRequirements[0].label).toContain('Single Sign-On');
		expect(simLlm.compromisedCompliance[0].framework).toBe('ISO 27001');
		expect(simLlm.assumedTechnicalDebt[0].sunsetClause).toContain('100 utilisateurs');

		// 2. Cas dégradé : LLM hors-ligne -> fallback déterministe sans crash
		const mockClientFailure: LlmChatClient = {
			async chat() {
				throw new Error('Ollama timeout 504');
			}
		};

		const fallbackGraph = await generateContextualImpactGraphWithLlm(input, mockClientFailure);
		expect(fallbackGraph.meta?.source).toBe('deterministic');
		expect(fallbackGraph.meta?.fallbackReason).toContain('Ollama timeout');
		expect(fallbackGraph.nodes.some((n) => n.label.includes('Fédération d\'Identité'))).toBe(true);
	});
});
