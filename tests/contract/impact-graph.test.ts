import { describe, it, expect } from 'vitest';
import {
	buildDefaultImpactGraph,
	simulateCostOptimization,
	generateMermaidImpactDiagram
} from '$lib/domain/impactGraph';

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

		// Vérifie que les nœuds d'exigences et conformité sont bien marqués 'compliant'
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

		// Dégradations clients identifiées (SLA, RTO/RPO, latence)
		expect(result.degradedRequirements.length).toBe(3);
		const slaDegraded = result.degradedRequirements.find((r) => r.id === 'REQ-SLA-AVAIL');
		expect(slaDegraded).toBeDefined();
		expect(slaDegraded?.nominal).toContain('99.95%');
		expect(slaDegraded?.degraded).toContain('99.00%');

		// Non-conformité réglementaire DORA détectée
		expect(result.compromisedCompliance.length).toBeGreaterThanOrEqual(1);
		const doraViolation = result.compromisedCompliance.find((c) => c.framework.includes('DORA'));
		expect(doraViolation).toBeDefined();
		expect(doraViolation?.severity).toBe('CRITICAL');

		// Dette technique formalisée avec sunset clause
		expect(result.assumedTechnicalDebt.length).toBe(2);
		expect(result.assumedTechnicalDebt[0].sunsetClause).toBeTruthy();
	});

	it('génère un diagramme Mermaid valide contenant les 4 sous-graphes essentiels', () => {
		const graph = buildDefaultImpactGraph();
		const mermaidCode = generateMermaidImpactDiagram(graph, 'cost_optimized_v1');

		expect(mermaidCode).toContain('flowchart TD');
		expect(mermaidCode).toContain('subgraph G_COST');
		expect(mermaidCode).toContain('subgraph G_DEC');
		expect(mermaidCode).toContain('subgraph G_REQ');
		expect(mermaidCode).toContain('subgraph G_REG');
		expect(mermaidCode).toContain('classDef costNode');
		expect(mermaidCode).toContain('classDef regViolated');
	});

	it('s\'intègre dans le store de délibération avec le mode de vue "graph"', async () => {
		const { deliberationStore } = await import('$lib/stores/deliberationStore.svelte');

		expect(deliberationStore.deliberationViewMode).toBeDefined();
		deliberationStore.setDeliberationViewMode('graph');
		expect(deliberationStore.deliberationViewMode).toBe('graph');

		// Peut rebasculer sur 'board' sans erreur
		deliberationStore.setDeliberationViewMode('board');
		expect(deliberationStore.deliberationViewMode).toBe('board');
	});
});
