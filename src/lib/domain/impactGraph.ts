/**
 * Module de Modélisation Causal et Simulation de Compromis d'Architecture
 *
 * Permet de visualiser et d'évaluer les impacts croisés d'un arbitrage
 * (notamment l'optimisation des coûts en V1) sur :
 * - Les exigences client (SLA, performance, résilience)
 * - La conformité réglementaire (NIS2, DORA, RGPD, SecNumCloud)
 * - Les décisions d'architecture (ADR) et options retenues
 */

export type GraphNodeType = 'requirement' | 'compliance' | 'cost_constraint' | 'decision' | 'option';

export type ImpactSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface GraphNode {
	id: string;
	type: GraphNodeType;
	label: string;
	description: string;
	severity?: ImpactSeverity;
	status: 'compliant' | 'degraded' | 'violated' | 'retained' | 'candidate' | 'active';
	metadata?: {
		framework?: string;
		article?: string;
		legalRisk?: string;
		clientMetric?: string;
		nominalValue?: string;
		degradedValue?: string;
		financialDelta?: string;
		sunsetTarget?: string;
	};
}

export type GraphEdgeType = 'satisfies' | 'violates' | 'based_on' | 'tradeoff_degrades' | 'enforces';

export interface GraphEdge {
	from: string;
	to: string;
	type: GraphEdgeType;
	label?: string;
	active: boolean;
	impactSeverity?: ImpactSeverity;
}

export type ImpactSimulationScenario = 'nominal_v2' | 'cost_optimized_v1';

export interface DegradedRequirementImpact {
	id: string;
	label: string;
	nominal: string;
	degraded: string;
	severity: ImpactSeverity;
	cause: string;
}

export interface CompromisedComplianceImpact {
	id: string;
	framework: string;
	article: string;
	legalRisk: string;
	severity: ImpactSeverity;
	mitigation: string;
}

export interface AssumedTechnicalDebt {
	decisionId: string;
	title: string;
	savings: string;
	sunsetClause: string;
	residualRisk: string;
}

export interface ImpactSimulationResult {
	scenario: ImpactSimulationScenario;
	summaryMessage: string;
	estimatedSavingsOpex: string;
	estimatedSavingsCapex: string;
	severityMax: ImpactSeverity;
	degradedRequirements: DegradedRequirementImpact[];
	compromisedCompliance: CompromisedComplianceImpact[];
	assumedTechnicalDebt: AssumedTechnicalDebt[];
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface ImpactGraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

/**
 * Construit le jeu de données du graphe d'impact pour un espace de travail.
 * Fournit un graphe par défaut riche et représentatif des enjeux télécom / cloud / réglementaires
 * pour mettre en lumière le compromis Coût V1 vs Résilience / Conformité.
 */
export function buildDefaultImpactGraph(): ImpactGraphData {
	const nodes: GraphNode[] = [
		// 1. Contraintes de coût & Budget V1
		{
			id: 'COST-V1',
			type: 'cost_constraint',
			label: 'Plafond Budget Infra V1 (-45% CAPEX / OPEX)',
			description: 'Contrainte budgétaire stricte sur le lot initial V1 pour accélérer le Go-to-Market',
			status: 'active',
			metadata: {
				financialDelta: '-135 k€/an'
			}
		},

		// 2. Décisions & Options d'architecture
		{
			id: 'DEC-01-HOSTING',
			type: 'decision',
			label: 'ADR-001 : Hébergement & Topologie Multi-Cluster',
			description: 'Choix de topologie pour les passerelles de sécurité et flux d\'interconnexion',
			status: 'retained',
			metadata: {
				sunsetTarget: 'Phase V2 (Jalon J+12m)'
			}
		},
		{
			id: 'OPT-NOMINAL',
			type: 'option',
			label: 'Option A : Cluster Multi-AZ Managé + SecGW Redondé',
			description: 'Double site actif-actif avec réplication synchrone et bascule automatique < 30s',
			status: 'candidate',
			metadata: {
				financialDelta: 'Coût Nominal (Base 100%)'
			}
		},
		{
			id: 'OPT-COST-DEGRADED',
			type: 'option',
			label: 'Option B (Compromis V1) : Mono-Cluster Standalone & Sauvegarde Froide',
			description: 'Un seul nœud actif sans réplication inter-AZ, restauration sur backup J-1',
			status: 'retained',
			metadata: {
				financialDelta: 'Économie : -90 k€/an'
			}
		},
		{
			id: 'DEC-02-CRYPTO',
			type: 'decision',
			label: 'ADR-002 : Médiation & Chiffrement des Flux Tiers',
			description: 'Arbitrage entre chiffrement IPsec matériel dédié vs terminaison mutualisée logicielle',
			status: 'retained',
			metadata: {
				sunsetTarget: 'Revue Trimestrielle G4'
			}
		},
		{
			id: 'OPT-CRYPTO-MUTUALIZED',
			type: 'option',
			label: 'Option V1 : Terminaison Logicielle Partagée',
			description: 'Suppression des boîtiers HSM dédiés en V1 pour mutualiser sur les instances de calcul',
			status: 'retained',
			metadata: {
				financialDelta: 'Économie : -45 k€ CAPEX'
			}
		},

		// 3. Exigences Client (Contractuelles & NFR)
		{
			id: 'REQ-SLA-AVAIL',
			type: 'requirement',
			label: 'REQ-SLA-01 : Disponibilité de Service 99.95%',
			description: 'Disponibilité garantie aux abonnés avec pénalités contractuelles de rupture',
			severity: 'HIGH',
			status: 'compliant',
			metadata: {
				clientMetric: 'Disponibilité annuelle',
				nominalValue: '99.95% (arrêt max 4.38h/an)',
				degradedValue: '99.00% (arrêt possible 3.65j/an)'
			}
		},
		{
			id: 'REQ-RTO-RPO',
			type: 'requirement',
			label: 'REQ-RES-02 : Continuité de Service RTO < 15 min & RPO < 1 min',
			description: 'Reprise d\'activité quasi-instantanée en cas de panne de centre de données',
			severity: 'HIGH',
			status: 'compliant',
			metadata: {
				clientMetric: 'RTO / RPO',
				nominalValue: 'RTO 15 min / RPO 0 min',
				degradedValue: 'RTO 24h / RPO 24h'
			}
		},
		{
			id: 'REQ-LATENCY',
			type: 'requirement',
			label: 'REQ-PERF-03 : Latence Traversée Passerelle S6a < 5ms',
			description: 'Temps de traversée cryptographique pour l\'enregistrement des cellules mobiles',
			severity: 'MEDIUM',
			status: 'compliant',
			metadata: {
				clientMetric: 'Latence p99',
				nominalValue: '2.8 ms (accélération matérielle DPDK)',
				degradedValue: '8.5 ms (gigue sous forte charge)'
			}
		},

		// 4. Conformité Réglementaire
		{
			id: 'REG-DORA-RESILIENCE',
			type: 'compliance',
			label: 'DORA Art. 12 : Résilience Opérationnelle & Sauvegardes Géographiques',
			description: 'Obligation légale de résilience des fonctions critiques avec tests de bascule périodiques',
			severity: 'CRITICAL',
			status: 'compliant',
			metadata: {
				framework: 'EU DORA',
				article: 'Article 12 (Continuité et Sauvegarde)',
				legalRisk: 'Mise en demeure de l\'ACPR / Sanction réglementaire'
			}
		},
		{
			id: 'REG-NIS2-INCIDENT',
			type: 'compliance',
			label: 'NIS2 Art. 21 : Mesures de Gestion des Risques Cybersécurité',
			description: 'Garanties d\'isolation cryptographique stricte et étanchéité des flux tiers',
			severity: 'HIGH',
			status: 'compliant',
			metadata: {
				framework: 'Directive NIS2',
				article: 'Article 21 (Mesures de sécurité)',
				legalRisk: 'Responsabilité personnelle des dirigeants et audit ANSSI'
			}
		},
		{
			id: 'REG-RGPD-SECURITY',
			type: 'compliance',
			label: 'RGPD Art. 32 : Sécurité du Traitement & Confidentialité des Données',
			description: 'Chiffrement de bout en bout des identifiants abonnés (IMSI / identifiants télécoms)',
			severity: 'HIGH',
			status: 'compliant',
			metadata: {
				framework: 'RGPD',
				article: 'Article 32',
				legalRisk: 'Non-conformité CNIL'
			}
		}
	];

	const edges: GraphEdge[] = [
		// Relations Nominales (V2)
		{ from: 'OPT-NOMINAL', to: 'REQ-SLA-AVAIL', type: 'satisfies', label: 'Assure 99.95%', active: false },
		{ from: 'OPT-NOMINAL', to: 'REQ-RTO-RPO', type: 'satisfies', label: 'Bascule automatique', active: false },
		{ from: 'OPT-NOMINAL', to: 'REG-DORA-RESILIENCE', type: 'satisfies', label: 'Multi-site validé', active: false },

		// Contrainte de coût V1 imposant les choix low-cost
		{ from: 'COST-V1', to: 'OPT-COST-DEGRADED', type: 'enforces', label: 'Force l\'arbitrage', active: true },
		{ from: 'COST-V1', to: 'OPT-CRYPTO-MUTUALIZED', type: 'enforces', label: 'Suppression CAPEX', active: true },

		// Dérivation de décisions
		{ from: 'DEC-01-HOSTING', to: 'OPT-COST-DEGRADED', type: 'based_on', label: 'Option retenue V1', active: true },
		{ from: 'DEC-02-CRYPTO', to: 'OPT-CRYPTO-MUTUALIZED', type: 'based_on', label: 'Option retenue V1', active: true },

		// Ruptures et dégradations induites par le compromis V1
		{
			from: 'OPT-COST-DEGRADED',
			to: 'REQ-SLA-AVAIL',
			type: 'tradeoff_degrades',
			label: 'SLA chute à 99.0%',
			active: true,
			impactSeverity: 'HIGH'
		},
		{
			from: 'OPT-COST-DEGRADED',
			to: 'REQ-RTO-RPO',
			type: 'tradeoff_degrades',
			label: 'Perte RPO/RTO instantané',
			active: true,
			impactSeverity: 'HIGH'
		},
		{
			from: 'OPT-COST-DEGRADED',
			to: 'REG-DORA-RESILIENCE',
			type: 'violates',
			label: 'Rupture exigence multi-AZ DORA',
			active: true,
			impactSeverity: 'CRITICAL'
		},
		{
			from: 'OPT-CRYPTO-MUTUALIZED',
			to: 'REQ-LATENCY',
			type: 'tradeoff_degrades',
			label: 'Gigue accrue (+5.7ms)',
			active: true,
			impactSeverity: 'MEDIUM'
		},
		{
			from: 'OPT-CRYPTO-MUTUALIZED',
			to: 'REG-NIS2-INCIDENT',
			type: 'tradeoff_degrades',
			label: 'Isolation mutualisée sous surveillance',
			active: true,
			impactSeverity: 'HIGH'
		},
		{
			from: 'OPT-CRYPTO-MUTUALIZED',
			to: 'REG-RGPD-SECURITY',
			type: 'satisfies',
			label: 'Chiffrement maintenu (logiciel)',
			active: true
		}
	];

	return { nodes, edges };
}

/**
 * Exécute la simulation d'impact selon le scénario sélectionné.
 */
export function simulateCostOptimization(
	baseGraph: ImpactGraphData,
	scenario: ImpactSimulationScenario
): ImpactSimulationResult {
	const nodes = baseGraph.nodes.map((n) => ({ ...n }));
	const edges = baseGraph.edges.map((e) => ({ ...e }));

	if (scenario === 'nominal_v2') {
		// Scénario Nominal V2 : Tout est vert, cher mais 100% conforme
		for (const node of nodes) {
			if (node.type === 'requirement' || node.type === 'compliance') {
				node.status = 'compliant';
			} else if (node.id === 'OPT-NOMINAL') {
				node.status = 'retained';
			} else if (node.id === 'OPT-COST-DEGRADED' || node.id === 'OPT-CRYPTO-MUTUALIZED') {
				node.status = 'candidate';
			}
		}

		for (const edge of edges) {
			if (edge.type === 'satisfies' && edge.from === 'OPT-NOMINAL') {
				edge.active = true;
			}
			if (edge.type === 'tradeoff_degrades' || edge.type === 'violates' || edge.type === 'enforces') {
				edge.active = false;
			}
		}

		return {
			scenario: 'nominal_v2',
			summaryMessage: 'Scénario Nominal V2 : Toutes les exigences clients et conformités réglementaires sont satisfaites. Budget nominal élevé sans concession technique.',
			estimatedSavingsOpex: '0 k€ (Base)',
			estimatedSavingsCapex: '0 k€ (Base)',
			severityMax: 'LOW',
			degradedRequirements: [],
			compromisedCompliance: [],
			assumedTechnicalDebt: [],
			nodes,
			edges
		};
	}

	// Scénario Optimisé Coût V1 : Arbitrage avec dégradation assumée
	for (const node of nodes) {
		if (node.id === 'REQ-SLA-AVAIL' || node.id === 'REQ-RTO-RPO' || node.id === 'REQ-LATENCY') {
			node.status = 'degraded';
		} else if (node.id === 'REG-DORA-RESILIENCE') {
			node.status = 'violated';
		} else if (node.id === 'REG-NIS2-INCIDENT') {
			node.status = 'degraded';
		} else if (node.id === 'OPT-COST-DEGRADED' || node.id === 'OPT-CRYPTO-MUTUALIZED') {
			node.status = 'retained';
		} else if (node.id === 'OPT-NOMINAL') {
			node.status = 'candidate';
		}
	}

	for (const edge of edges) {
		if (edge.from === 'OPT-NOMINAL') {
			edge.active = false;
		}
		if (edge.type === 'tradeoff_degrades' || edge.type === 'violates' || edge.type === 'enforces') {
			edge.active = true;
		}
	}

	const degradedRequirements: DegradedRequirementImpact[] = [
		{
			id: 'REQ-SLA-AVAIL',
			label: 'SLA Disponibilité Annuelle',
			nominal: '99.95% (Haute Disponibilité Active-Active)',
			degraded: '99.00% (Mono-cluster : tolérance arrêt prolongé en cas d\'incident)',
			severity: 'HIGH',
			cause: 'Suppression du cluster secondaire multi-AZ pour économiser 90 k€/an'
		},
		{
			id: 'REQ-RTO-RPO',
			label: 'Objectif de Reprise & Perte de Données (RTO / RPO)',
			nominal: 'RTO < 15 min · RPO < 1 min',
			degraded: 'RTO 24h · RPO 24h (Restauration manuelle sur bande / snapshots)',
			severity: 'HIGH',
			cause: 'Remplacement de la réplication synchrone par un backup asynchrone froid'
		},
		{
			id: 'REQ-LATENCY',
			label: 'Latence Traversée S6a (p99)',
			nominal: '2.8 ms (Accélération matérielle DPDK dédiée)',
			degraded: '8.5 ms (Terminaison mutualisée sur CPU standard)',
			severity: 'MEDIUM',
			cause: 'Suppression des boîtiers d\'offload matériel dédiés (-45 k€ CAPEX)'
		}
	];

	const compromisedCompliance: CompromisedComplianceImpact[] = [
		{
			id: 'REG-DORA-RESILIENCE',
			framework: 'EU DORA (Règlement 2022/2554)',
			article: 'Article 12 (Politiques de sauvegarde et restauration)',
			legalRisk: 'NON-CONFORME MAJEUR : DORA exige une continuité d\'activité sans point unique de défaillance.',
			severity: 'CRITICAL',
			mitigation: 'Dérogation formelle temporaire avec engagement de livraison de la bascule multi-région en J+9 mois.'
		},
		{
			id: 'REG-NIS2-INCIDENT',
			framework: 'Directive NIS2',
			article: 'Article 21 (Sécurité des chaînes d\'approvisionnement)',
			legalRisk: 'RISQUE ÉLEVÉ : La mutualisation logicielle augmente la surface d\'attaque en cas de compromission d\'instance.',
			severity: 'HIGH',
			mitigation: 'Renforcement du monitoring EDR et isolation stricte par namespaces réseau kernel durcis.'
		}
	];

	const assumedTechnicalDebt: AssumedTechnicalDebt[] = [
		{
			decisionId: 'ADR-001',
			title: 'Topologie Mono-Cluster V1 avec Dette Assumée',
			savings: '-90 k€/an OPEX',
			sunsetClause: 'Obligation de re-bascule multi-AZ dès le dépassement de 50 000 abonnés actifs ou à J+12 mois max',
			residualRisk: 'Interruption de service prolongée si le datacenter primaire subit un sinistre matériel'
		},
		{
			decisionId: 'ADR-002',
			title: 'Chiffrement IPsec Logiciel Partagé',
			savings: '-45 k€ CAPEX initial',
			sunsetClause: 'Revue trimestrielle de la gigue et bascule sur HSM dédié si saturation CPU > 70%',
			residualRisk: 'Pics de latence perceptibles sur l\'attachement des équipements mobiles tiers'
		}
	];

	return {
		scenario: 'cost_optimized_v1',
		summaryMessage: 'Scénario Optimisé Coût V1 : Économie massive de 135 k€ sur la V1 au prix de 2 exigences clients dégradées et 1 non-conformité DORA critique requérant un ADR de dérogation.',
		estimatedSavingsOpex: '-90 k€/an',
		estimatedSavingsCapex: '-45 k€',
		severityMax: 'CRITICAL',
		degradedRequirements,
		compromisedCompliance,
		assumedTechnicalDebt,
		nodes,
		edges
	};
}

/**
 * Génère la représentation syntaxique Mermaid (flowchart TD) pour le rendu interactif.
 */
export function generateMermaidImpactDiagram(
	graph: ImpactGraphData,
	scenario: ImpactSimulationScenario = 'cost_optimized_v1'
): string {
	const lines: string[] = ['flowchart TD'];

	// Sous-graphe 1 : Contrainte Coût
	lines.push('    subgraph G_COST ["💰 Contraintes de Coût & Budget V1"]');
	for (const node of graph.nodes.filter((n) => n.type === 'cost_constraint')) {
		lines.push(`        ${node.id}["<b>${escapeMermaid(node.label)}</b><br/><i>${escapeMermaid(node.metadata?.financialDelta || '')}</i>"]:::costNode`);
	}
	lines.push('    end');

	// Sous-graphe 2 : Décisions & Options
	lines.push('    subgraph G_DEC ["⚖️ Décisions d\'Architecture & Options"]');
	for (const node of graph.nodes.filter((n) => n.type === 'decision')) {
		lines.push(`        ${node.id}["<b>${escapeMermaid(node.label)}</b><br/>${escapeMermaid(node.description)}"]:::decisionNode`);
	}
	for (const node of graph.nodes.filter((n) => n.type === 'option')) {
		const isRetained = node.status === 'retained';
		const cssClass = isRetained ? 'optionRetained' : 'optionCandidate';
		const badge = isRetained ? '⭐ [RETENU V1]' : '⚪ [CANDIDAT V2]';
		lines.push(`        ${node.id}["<b>${badge} ${escapeMermaid(node.label)}</b><br/><i>${escapeMermaid(node.metadata?.financialDelta || '')}</i>"]:::${cssClass}`);
	}
	lines.push('    end');

	// Sous-graphe 3 : Exigences Client
	lines.push('    subgraph G_REQ ["🎯 Exigences Client & Engagements de Service"]');
	for (const node of graph.nodes.filter((n) => n.type === 'requirement')) {
		const isDegraded = node.status === 'degraded';
		const cssClass = isDegraded ? 'reqDegraded' : 'reqCompliant';
		const badge = isDegraded ? '⚠️ [DÉGRADÉ V1]' : '✅ [SATISFAIT]';
		const metric = isDegraded ? node.metadata?.degradedValue : node.metadata?.nominalValue;
		lines.push(`        ${node.id}["<b>${badge} ${escapeMermaid(node.label)}</b><br/>Valeur : ${escapeMermaid(metric || '')}"]:::${cssClass}`);
	}
	lines.push('    end');

	// Sous-graphe 4 : Conformité Réglementaire
	lines.push('    subgraph G_REG ["🛡️ Conformité Légale & Réglementaire"]');
	for (const node of graph.nodes.filter((n) => n.type === 'compliance')) {
		const isViolated = node.status === 'violated';
		const isDegraded = node.status === 'degraded';
		let cssClass = 'regCompliant';
		let badge = '✅ [CONFORME]';
		if (isViolated) {
			cssClass = 'regViolated';
			badge = '🚨 [NON-CONFORME DORA/CRITIQUE]';
		} else if (isDegraded) {
			cssClass = 'regDegraded';
			badge = '⚠️ [SOUS SURVEILLANCE]';
		}
		lines.push(`        ${node.id}["<b>${badge} ${escapeMermaid(node.label)}</b><br/><i>${escapeMermaid(node.metadata?.framework || '')}</i>"]:::${cssClass}`);
	}
	lines.push('    end');

	// Liens
	for (const edge of graph.edges) {
		if (!edge.active) continue;

		const edgeLabel = edge.label ? `|"${escapeMermaid(edge.label)}"|` : '';

		if (edge.type === 'violates') {
			lines.push(`    ${edge.from} ==x ${edgeLabel} ${edge.to}`);
		} else if (edge.type === 'tradeoff_degrades') {
			lines.push(`    ${edge.from} -.-> ${edgeLabel} ${edge.to}`);
		} else if (edge.type === 'enforces') {
			lines.push(`    ${edge.from} ==> ${edgeLabel} ${edge.to}`);
		} else if (edge.type === 'satisfies') {
			lines.push(`    ${edge.from} --> ${edgeLabel} ${edge.to}`);
		} else {
			lines.push(`    ${edge.from} --- ${edgeLabel} ${edge.to}`);
		}
	}

	// Styles de classes CSS pour Mermaid
	lines.push('');
	lines.push('    classDef costNode fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#92400e;');
	lines.push('    classDef decisionNode fill:#e0e7ff,stroke:#4f46e5,stroke-width:2px,color:#3730a3;');
	lines.push('    classDef optionRetained fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#065f46;');
	lines.push('    classDef optionCandidate fill:#f3f4f6,stroke:#9ca3af,stroke-width:1px,color:#4b5563,stroke-dasharray: 4 4;');
	lines.push('    classDef reqCompliant fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#047857;');
	lines.push('    classDef reqDegraded fill:#fffbeb,stroke:#f59e0b,stroke-width:2px,color:#b45309;');
	lines.push('    classDef regCompliant fill:#f5f3ff,stroke:#8b5cf6,stroke-width:1.5px,color:#6d28d9;');
	lines.push('    classDef regDegraded fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#c2410c;');
	lines.push('    classDef regViolated fill:#fee2e2,stroke:#dc2626,stroke-width:3px,color:#991b1b;');

	return lines.join('\n');
}

function escapeMermaid(text: string): string {
	return text.replace(/"/g, "'").replace(/[\[\]\(\)\{\}]/g, ' ');
}
