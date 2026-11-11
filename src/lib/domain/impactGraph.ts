/**
 * Module de Modélisation Causal et Simulation de Compromis d'Architecture
 *
 * Permet de visualiser et d'évaluer dynamiquement les impacts croisés d'un arbitrage
 * (notamment l'optimisation des coûts en V1) pour un sujet donné sur :
 * - Les exigences client (SLA, performance, résilience, fonctionnel)
 * - La conformité réglementaire (NIS2, DORA, RGPD, SecNumCloud, etc.)
 * - Les décisions d'architecture (ADR) et options évaluées
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
	scenarioRole?: 'nominal' | 'cost_v1' | 'both';
	metadata?: {
		framework?: string;
		article?: string;
		legalRisk?: string;
		mitigation?: string;
		clientMetric?: string;
		nominalValue?: string;
		degradedValue?: string;
		financialDelta?: string;
		sunsetTarget?: string;
		residualRisk?: string;
		cause?: string;
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
	scenarioScope?: 'nominal_v2' | 'cost_optimized_v1' | 'always';
	cause?: string;
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
	meta?: ImpactGraphMeta;
}

export interface ImpactGraphMeta {
	subjectId?: string;
	subjectName?: string;
	sectionRef?: string;
	projectTitle?: string;
	source: 'default' | 'deterministic' | 'llm';
	modelUsed?: string;
	generatedAt?: string;
	estimatedSavingsOpex?: string;
	estimatedSavingsCapex?: string;
	fallbackReason?: string;
}

export interface ImpactGraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	meta?: ImpactGraphMeta;
}

export interface ContextualSubjectInput {
	projectId: string;
	projectTitle: string;
	subject: {
		id: string;
		sectionRef?: string;
		name: string;
		problemStatement?: string;
		maturityLevel?: string;
	};
	criteria: Array<{
		id: string;
		name: string;
		description?: string;
		kind: 'functional' | 'nfr' | 'cost' | 'risk' | 'compliance' | string;
		weight: number;
	}>;
	options: Array<{
		id: string;
		title: string;
		summary?: string;
		status: string;
	}>;
	evaluations: Array<{
		optionId: string;
		criterionId: string;
		score: number; // -2 à +2
		justification: string;
	}>;
	decision?: {
		id: string;
		retainedOptionId: string;
		rationale: string;
		reversibility: string;
		complianceStatus?: string;
		acceptedViolations?: Array<{ typedId: string; justification: string }>;
	} | null;
	requirements?: Array<{
		id: string;
		clauseRef: string;
		title: string;
		criticality?: string;
	}>;
	frameworks?: string[];
	tradeoffs?: Array<{
		id: string;
		optionId: string;
		gains: string;
		sacrifices: string;
	}>;
	statements?: Array<{
		id: string;
		section: string;
		triplet: { subject: string; predicate: string; value: string | number | boolean };
		status: string;
	}>;
}

/**
 * Normalise un identifiant arbitraire pour qu'il soit sûr comme identifiant de nœud Mermaid.
 */
export function sanitizeMermaidId(rawId: string): string {
	const cleaned = rawId.replace(/[^a-zA-Z0-9_]/g, '_');
	return /^[a-zA-Z]/.test(cleaned) ? cleaned : `N_${cleaned}`;
}

const SEVERITY_RANK: Record<ImpactSeverity, number> = {
	CRITICAL: 4,
	HIGH: 3,
	MEDIUM: 2,
	LOW: 1
};

function maxSeverity(a: ImpactSeverity, b: ImpactSeverity): ImpactSeverity {
	return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Construit dynamiquement un graphe causal d'impact contextualisé à partir
 * des données réelles d'un sujet (critères, options, évaluations, décision, exigences et référentiels).
 */
export function buildContextualImpactGraph(input: ContextualSubjectInput): ImpactGraphData {
	const {
		projectTitle,
		subject,
		criteria,
		options,
		evaluations,
		decision,
		requirements = [],
		frameworks = [],
		tradeoffs = []
	} = input;

	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	const sectionLabel = subject.sectionRef ? `${subject.sectionRef} · ` : '';

	// 1. Identification des critères par catégorie
	const costCriteria = criteria.filter((c) => c.kind === 'cost');
	const complianceCriteria = criteria.filter((c) => c.kind === 'compliance' || c.kind === 'risk');
	const functionalAndNfrCriteria = criteria.filter((c) => c.kind === 'functional' || c.kind === 'nfr');

	// 2. Nœud Contrainte de Coût V1 spécifique au sujet
	const costNodeId = 'COST_V1_SUBJECT';
	const costLabel =
		costCriteria.length > 0
			? `Optimisation Coût V1 : ${costCriteria.map((c) => c.name).join(' / ')}`
			: `Contrainte Budgétaire V1 sur ${sectionLabel}${subject.name}`;

	nodes.push({
		id: costNodeId,
		type: 'cost_constraint',
		label: costLabel,
		description:
			costCriteria[0]?.description ||
			`Réduction d'investissement V1 (CAPEX/OPEX) appliquée au sujet « ${subject.name} »`,
		status: 'active',
		scenarioRole: 'cost_v1',
		metadata: {
			financialDelta: 'Cible optimisation coûts V1'
		}
	});

	// 3. Nœud Décision d'Architecture du sujet
	const decisionNodeId = sanitizeMermaidId(`DEC_${subject.id}`);
	nodes.push({
		id: decisionNodeId,
		type: 'decision',
		label: `Décision ${sectionLabel}${subject.name}`,
		description:
			decision?.rationale ||
			subject.problemStatement ||
			`Arbitrage d'architecture pour ${subject.name}`,
		status: decision ? 'retained' : 'candidate',
		scenarioRole: 'both',
		metadata: {
			sunsetTarget:
				decision?.reversibility === 'irreversible'
					? 'Attention : décision irréversible — audit requis avant V1'
					: 'Clause de révision V2 (jalon post-MVP)',
			residualRisk:
				decision?.acceptedViolations && decision.acceptedViolations.length > 0
					? `${decision.acceptedViolations.length} dérogation(s) acceptée(s) consignée(s)`
					: `Réversibilité : ${decision?.reversibility || 'à qualifier'}`
		}
	});

	// 4. Identification ou synthèse des options (Nominale V2 vs Compromis Coût V1)
	const scoreFor = (optionId: string, kindFilter: (k: string) => boolean): number => {
		let sum = 0;
		for (const ev of evaluations) {
			if (ev.optionId !== optionId) continue;
			const crit = criteria.find((c) => c.id === ev.criterionId);
			if (crit && kindFilter(crit.kind)) {
				sum += ev.score * (crit.weight || 1);
			}
		}
		return sum;
	};

	let nominalOpt = options[0];
	let costOpt = options.length > 1 ? options[1] : undefined;

	if (options.length >= 2) {
		const sortedByQuality = [...options].sort(
			(a, b) =>
				scoreFor(b.id, (k) => k !== 'cost') - scoreFor(a.id, (k) => k !== 'cost')
		);
		nominalOpt = sortedByQuality[0];

		const sortedByCost = [...options]
			.filter((o) => o.id !== nominalOpt.id)
			.sort((a, b) => scoreFor(b.id, (k) => k === 'cost') - scoreFor(a.id, (k) => k === 'cost'));
		costOpt = sortedByCost[0] || sortedByQuality[sortedByQuality.length - 1];
	}

	const nominalOptNodeId = nominalOpt ? sanitizeMermaidId(`OPT_NOM_${nominalOpt.id}`) : 'OPT_NOMINAL_SYNTH';
	const costOptNodeId = costOpt ? sanitizeMermaidId(`OPT_COST_${costOpt.id}`) : 'OPT_COST_V1_SYNTH';

	if (nominalOpt) {
		nodes.push({
			id: nominalOptNodeId,
			type: 'option',
			label: `Option Nominale V2 : ${nominalOpt.title}`,
			description: nominalOpt.summary || 'Variante nominale maximisant les exigences techniques et réglementaires',
			status: decision?.retainedOptionId === nominalOpt.id ? 'retained' : 'candidate',
			scenarioRole: 'nominal',
			metadata: {
				financialDelta: 'Coût nominal (cible V2)'
			}
		});
	} else {
		nodes.push({
			id: nominalOptNodeId,
			type: 'option',
			label: `Architecture Nominale V2 · ${subject.name}`,
			description: 'Architecture de référence couvrant l’ensemble des exigences sans compromis',
			status: 'candidate',
			scenarioRole: 'nominal',
			metadata: {
				financialDelta: 'Budget complet V2'
			}
		});
	}

	const costTradeoff = costOpt ? tradeoffs.find((t) => t.optionId === costOpt!.id) : undefined;
	if (costOpt) {
		nodes.push({
			id: costOptNodeId,
			type: 'option',
			label: `Compromis Coût V1 : ${costOpt.title}`,
			description:
				costOpt.summary ||
				costTradeoff?.gains ||
				'Variante optimisée sur la dimension financière pour le lancement V1',
			status: decision?.retainedOptionId === costOpt.id ? 'retained' : 'candidate',
			scenarioRole: 'cost_v1',
			metadata: {
				financialDelta: costTradeoff?.gains || 'Économie V1 estimée',
				sunsetTarget: `Re-bascule vers ${nominalOpt?.title || 'cible V2'} après validation marché`,
				residualRisk: costTradeoff?.sacrifices || 'Concessions NFR / conformité à borner par ADR'
			}
		});
	} else {
		nodes.push({
			id: costOptNodeId,
			type: 'option',
			label: `Variante Allégée Coût V1 · ${subject.name}`,
			description: `Simplification temporaire de « ${subject.name} » pour tenir l'enveloppe V1`,
			status: 'candidate',
			scenarioRole: 'cost_v1',
			metadata: {
				financialDelta: 'Réduction CAPEX/OPEX V1',
				sunsetTarget: 'Montée en charge V2 dès levée des contraintes budgétaires',
				residualRisk: 'Dégradation ciblée des capacités non-critiques en V1'
			}
		});
	}

	edges.push({
		from: costNodeId,
		to: costOptNodeId,
		type: 'enforces',
		label: 'Impose arbitrage coût',
		active: true,
		scenarioScope: 'cost_optimized_v1'
	});
	edges.push({
		from: decisionNodeId,
		to: nominalOptNodeId,
		type: 'based_on',
		label: 'Cible V2',
		active: true,
		scenarioScope: 'nominal_v2'
	});
	edges.push({
		from: decisionNodeId,
		to: costOptNodeId,
		type: 'based_on',
		label: 'Arbitrage V1',
		active: true,
		scenarioScope: 'cost_optimized_v1'
	});

	// 5. Exigences Client & Critères Fonctionnels / NFR du sujet
	const reqTargets: Array<{
		id: string;
		label: string;
		description: string;
		nominalVal: string;
		degradedVal: string;
		severity: ImpactSeverity;
		cause: string;
	}> = [];

	for (const req of requirements.slice(0, 4)) {
		const isBlocking = /bloquant|critique|critical|must/i.test(req.criticality || '');
		reqTargets.push({
			id: sanitizeMermaidId(`REQ_${req.clauseRef || req.id}`),
			label: `${req.clauseRef ? req.clauseRef + ' : ' : ''}${req.title}`,
			description: `Exigence client contractuelle (${req.criticality || 'standard'})`,
			nominalVal: 'Conforme à 100% aux spécifications contractuelles',
			degradedVal: 'Couverture partielle en V1 (dérogation contractuelle requise)',
			severity: isBlocking ? 'HIGH' : 'MEDIUM',
			cause: `Arbitrage coût V1 sur ${subject.name}`
		});
	}

	for (const crit of functionalAndNfrCriteria.slice(0, 4)) {
		const costEval = costOpt
			? evaluations.find((e) => e.optionId === costOpt!.id && e.criterionId === crit.id)
			: undefined;
		const nomEval = nominalOpt
			? evaluations.find((e) => e.optionId === nominalOpt!.id && e.criterionId === crit.id)
			: undefined;

		const isNegativeImpact = costEval ? costEval.score < 0 : true;
		if (reqTargets.length < 4 && (isNegativeImpact || requirements.length === 0)) {
			reqTargets.push({
				id: sanitizeMermaidId(`CRIT_${crit.id}`),
				label: `${crit.name} (poids ${crit.weight}/5)`,
				description: crit.description || `Critère ${crit.kind.toUpperCase()} du sujet`,
				nominalVal: nomEval
					? `Score ${nomEval.score >= 0 ? '+' : ''}${nomEval.score} · ${nomEval.justification}`
					: 'Niveau nominal V2 garanti',
				degradedVal: costEval
					? `Score ${costEval.score} · ${costEval.justification}`
					: `Niveau réduit en V1 (${costTradeoff?.sacrifices || 'capacité allégée'})`,
				severity: crit.weight >= 4 || (costEval && costEval.score <= -2) ? 'HIGH' : 'MEDIUM',
				cause: costEval?.justification || `Compromis financier sur ${crit.name}`
			});
		}
	}

	if (reqTargets.length === 0) {
		reqTargets.push({
			id: sanitizeMermaidId(`REQ_SCOPE_${subject.id}`),
			label: `Périmètre fonctionnel & SLA · ${subject.name}`,
			description: `Engagements de service attendus pour ${subject.name}`,
			nominalVal: 'Périmètre complet et redondance nominale',
			degradedVal: 'Périmètre MVP V1 allégé',
			severity: 'MEDIUM',
			cause: `Réduction de coût V1 sur ${subject.name}`
		});
	}

	for (const req of reqTargets) {
		nodes.push({
			id: req.id,
			type: 'requirement',
			label: req.label,
			description: req.description,
			severity: req.severity,
			status: 'compliant',
			metadata: {
				nominalValue: req.nominalVal,
				degradedValue: req.degradedVal,
				cause: req.cause
			}
		});

		edges.push({
			from: nominalOptNodeId,
			to: req.id,
			type: 'satisfies',
			label: 'Garantit',
			active: false,
			scenarioScope: 'nominal_v2'
		});
		edges.push({
			from: costOptNodeId,
			to: req.id,
			type: 'tradeoff_degrades',
			label: req.severity === 'HIGH' ? 'Dégradation majeure' : 'Concession V1',
			active: true,
			impactSeverity: req.severity,
			scenarioScope: 'cost_optimized_v1',
			cause: req.cause
		});
	}

	// 6. Conformité Réglementaire & Risques liés au sujet / projet
	const complianceTargets: Array<{
		id: string;
		label: string;
		framework: string;
		article: string;
		legalRisk: string;
		severity: ImpactSeverity;
		mitigation: string;
		violated: boolean;
	}> = [];

	for (const crit of complianceCriteria.slice(0, 3)) {
		const costEval = costOpt
			? evaluations.find((e) => e.optionId === costOpt!.id && e.criterionId === crit.id)
			: undefined;
		const isViolated = costEval ? costEval.score <= -2 : false;
		const isRisk = costEval ? costEval.score < 0 : true;

		if (isRisk) {
			complianceTargets.push({
				id: sanitizeMermaidId(`COMP_${crit.id}`),
				label: crit.name,
				framework: crit.kind === 'compliance' ? 'Conformité Réglementaire' : 'Maîtrise des Risques',
				article: crit.name,
				legalRisk:
					costEval?.justification ||
					`Exposition réglementaire ou risque accru sur « ${crit.name} » en configuration V1 allégée`,
				severity: isViolated || crit.weight >= 4 ? 'CRITICAL' : 'HIGH',
				mitigation: `Consigner un ADR transitoire avec mesure compensatoire et échéance V2 sur ${subject.name}`,
				violated: isViolated
			});
		}
	}

	for (const fw of frameworks.slice(0, 3)) {
		if (!complianceTargets.some((c) => c.label.toLowerCase().includes(fw.toLowerCase()))) {
			const hasViolation = decision?.acceptedViolations?.some((v) =>
				v.typedId.toLowerCase().includes(fw.toLowerCase())
			);
			complianceTargets.push({
				id: sanitizeMermaidId(`FW_${fw}`),
				label: `Référentiel ${fw}`,
				framework: fw,
				article: `Exigences applicables (${fw})`,
				legalRisk: hasViolation
					? `Dérogation explicite enregistrée vis-à-vis de ${fw}`
					: `Vérifier l'absence de régression ${fw} suite aux compromis de coût V1 sur ${subject.name}`,
				severity: hasViolation ? 'CRITICAL' : 'HIGH',
				mitigation: `Contrôle de conformité ${fw} obligatoire avant mise en production V1`,
				violated: Boolean(hasViolation)
			});
		}
	}

	for (const comp of complianceTargets) {
		nodes.push({
			id: comp.id,
			type: 'compliance',
			label: comp.label,
			description: comp.legalRisk,
			severity: comp.severity,
			status: 'compliant',
			metadata: {
				framework: comp.framework,
				article: comp.article,
				legalRisk: comp.legalRisk,
				mitigation: comp.mitigation
			}
		});

		edges.push({
			from: nominalOptNodeId,
			to: comp.id,
			type: 'satisfies',
			label: 'Conforme',
			active: false,
			scenarioScope: 'nominal_v2'
		});
		edges.push({
			from: costOptNodeId,
			to: comp.id,
			type: comp.violated ? 'violates' : 'tradeoff_degrades',
			label: comp.violated ? 'Non-conformité' : 'Risque à encadrer',
			active: true,
			impactSeverity: comp.severity,
			scenarioScope: 'cost_optimized_v1',
			cause: comp.legalRisk
		});
	}

	return {
		nodes,
		edges,
		meta: {
			subjectId: subject.id,
			subjectName: subject.name,
			sectionRef: subject.sectionRef,
			projectTitle,
			source: 'deterministic',
			generatedAt: new Date().toISOString(),
			estimatedSavingsOpex: costTradeoff?.gains ? costTradeoff.gains : 'Optimisation V1 ciblée',
			estimatedSavingsCapex: 'À chiffrer selon devis V1'
		}
	};
}

/**
 * Jeu de données par défaut (utilisé uniquement si aucun projet/sujet n'est chargé).
 */
export function buildDefaultImpactGraph(): ImpactGraphData {
	const nodes: GraphNode[] = [
		{
			id: 'COST-V1',
			type: 'cost_constraint',
			label: 'Plafond Budget Infra V1 (-45% CAPEX / OPEX)',
			description: 'Contrainte budgétaire stricte sur le lot initial V1 pour accélérer le Go-to-Market',
			status: 'active',
			scenarioRole: 'cost_v1',
			metadata: {
				financialDelta: '-135 k€/an'
			}
		},
		{
			id: 'DEC-01-HOSTING',
			type: 'decision',
			label: 'ADR-001 : Hébergement & Topologie Multi-Cluster',
			description: 'Choix de topologie pour les passerelles de sécurité et flux d\'interconnexion',
			status: 'retained',
			scenarioRole: 'both',
			metadata: {
				sunsetTarget: 'Obligation de re-bascule multi-AZ dès le dépassement de 50 000 abonnés actifs ou à J+12 mois max',
				residualRisk: 'Interruption de service prolongée si le datacenter primaire subit un sinistre matériel',
				financialDelta: '-90 k€/an OPEX'
			}
		},
		{
			id: 'OPT-NOMINAL',
			type: 'option',
			label: 'Option A : Cluster Multi-AZ Managé + SecGW Redondé',
			description: 'Double site actif-actif avec réplication synchrone et bascule automatique < 30s',
			status: 'candidate',
			scenarioRole: 'nominal',
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
			scenarioRole: 'cost_v1',
			metadata: {
				financialDelta: '-90 k€/an OPEX',
				sunsetTarget: 'Obligation de re-bascule multi-AZ dès 50 000 abonnés ou J+12 mois',
				residualRisk: 'Interruption prolongée si sinistre matériel primaire'
			}
		},
		{
			id: 'DEC-02-CRYPTO',
			type: 'decision',
			label: 'ADR-002 : Médiation & Chiffrement des Flux Tiers',
			description: 'Arbitrage entre chiffrement IPsec matériel dédié vs terminaison mutualisée logicielle',
			status: 'retained',
			scenarioRole: 'both',
			metadata: {
				sunsetTarget: 'Revue trimestrielle de la gigue et bascule sur HSM dédié si saturation CPU > 70%',
				residualRisk: 'Pics de latence perceptibles sur l\'attachement des équipements mobiles tiers',
				financialDelta: '-45 k€ CAPEX initial'
			}
		},
		{
			id: 'OPT-CRYPTO-MUTUALIZED',
			type: 'option',
			label: 'Option V1 : Terminaison Logicielle Partagée',
			description: 'Suppression des boîtiers HSM dédiés en V1 pour mutualiser sur les instances de calcul',
			status: 'retained',
			scenarioRole: 'cost_v1',
			metadata: {
				financialDelta: '-45 k€ CAPEX'
			}
		},
		{
			id: 'REQ-SLA-AVAIL',
			type: 'requirement',
			label: 'REQ-SLA-01 : Disponibilité de Service 99.95%',
			description: 'Disponibilité garantie aux abonnés avec pénalités contractuelles de rupture',
			severity: 'HIGH',
			status: 'compliant',
			metadata: {
				clientMetric: 'Disponibilité annuelle',
				nominalValue: '99.95% (Haute Disponibilité Active-Active)',
				degradedValue: '99.00% (Mono-cluster : tolérance arrêt prolongé en cas d\'incident)',
				cause: 'Suppression du cluster secondaire multi-AZ pour économiser 90 k€/an'
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
				nominalValue: 'RTO < 15 min · RPO < 1 min',
				degradedValue: 'RTO 24h · RPO 24h (Restauration manuelle sur bande / snapshots)',
				cause: 'Remplacement de la réplication synchrone par un backup asynchrone froid'
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
				nominalValue: '2.8 ms (Accélération matérielle DPDK dédiée)',
				degradedValue: '8.5 ms (Terminaison mutualisée sur CPU standard)',
				cause: 'Suppression des boîtiers d\'offload matériel dédiés (-45 k€ CAPEX)'
			}
		},
		{
			id: 'REG-DORA-RESILIENCE',
			type: 'compliance',
			label: 'DORA Art. 12 : Résilience Opérationnelle & Sauvegardes Géographiques',
			description: 'Obligation légale de résilience des fonctions critiques avec tests de bascule périodiques',
			severity: 'CRITICAL',
			status: 'compliant',
			metadata: {
				framework: 'EU DORA (Règlement 2022/2554)',
				article: 'Article 12 (Politiques de sauvegarde et restauration)',
				legalRisk: 'NON-CONFORME MAJEUR : DORA exige une continuité d\'activité sans point unique de défaillance.',
				mitigation: 'Dérogation formelle temporaire avec engagement de livraison de la bascule multi-région en J+9 mois.'
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
				article: 'Article 21 (Sécurité des chaînes d\'approvisionnement)',
				legalRisk: 'RISQUE ÉLEVÉ : La mutualisation logicielle augmente la surface d\'attaque en cas de compromission d\'instance.',
				mitigation: 'Renforcement du monitoring EDR et isolation stricte par namespaces réseau kernel durcis.'
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
		{ from: 'OPT-NOMINAL', to: 'REQ-SLA-AVAIL', type: 'satisfies', label: 'Assure 99.95%', active: false, scenarioScope: 'nominal_v2' },
		{ from: 'OPT-NOMINAL', to: 'REQ-RTO-RPO', type: 'satisfies', label: 'Bascule automatique', active: false, scenarioScope: 'nominal_v2' },
		{ from: 'OPT-NOMINAL', to: 'REQ-LATENCY', type: 'satisfies', label: 'Offload matériel', active: false, scenarioScope: 'nominal_v2' },
		{ from: 'OPT-NOMINAL', to: 'REG-DORA-RESILIENCE', type: 'satisfies', label: 'Multi-site validé', active: false, scenarioScope: 'nominal_v2' },
		{ from: 'OPT-NOMINAL', to: 'REG-NIS2-INCIDENT', type: 'satisfies', label: 'Isolation dédiée', active: false, scenarioScope: 'nominal_v2' },
		{ from: 'OPT-NOMINAL', to: 'REG-RGPD-SECURITY', type: 'satisfies', label: 'Chiffrement HSM', active: false, scenarioScope: 'nominal_v2' },

		{ from: 'COST-V1', to: 'OPT-COST-DEGRADED', type: 'enforces', label: 'Force l\'arbitrage', active: true, scenarioScope: 'cost_optimized_v1' },
		{ from: 'COST-V1', to: 'OPT-CRYPTO-MUTUALIZED', type: 'enforces', label: 'Suppression CAPEX', active: true, scenarioScope: 'cost_optimized_v1' },

		{ from: 'DEC-01-HOSTING', to: 'OPT-COST-DEGRADED', type: 'based_on', label: 'Option retenue V1', active: true, scenarioScope: 'cost_optimized_v1' },
		{ from: 'DEC-01-HOSTING', to: 'OPT-NOMINAL', type: 'based_on', label: 'Cible V2', active: false, scenarioScope: 'nominal_v2' },
		{ from: 'DEC-02-CRYPTO', to: 'OPT-CRYPTO-MUTUALIZED', type: 'based_on', label: 'Option retenue V1', active: true, scenarioScope: 'cost_optimized_v1' },

		{
			from: 'OPT-COST-DEGRADED',
			to: 'REQ-SLA-AVAIL',
			type: 'tradeoff_degrades',
			label: 'SLA chute à 99.0%',
			active: true,
			impactSeverity: 'HIGH',
			scenarioScope: 'cost_optimized_v1',
			cause: 'Suppression du cluster secondaire multi-AZ pour économiser 90 k€/an'
		},
		{
			from: 'OPT-COST-DEGRADED',
			to: 'REQ-RTO-RPO',
			type: 'tradeoff_degrades',
			label: 'Perte RPO/RTO instantané',
			active: true,
			impactSeverity: 'HIGH',
			scenarioScope: 'cost_optimized_v1',
			cause: 'Remplacement de la réplication synchrone par un backup asynchrone froid'
		},
		{
			from: 'OPT-COST-DEGRADED',
			to: 'REG-DORA-RESILIENCE',
			type: 'violates',
			label: 'Rupture exigence multi-AZ DORA',
			active: true,
			impactSeverity: 'CRITICAL',
			scenarioScope: 'cost_optimized_v1'
		},
		{
			from: 'OPT-CRYPTO-MUTUALIZED',
			to: 'REQ-LATENCY',
			type: 'tradeoff_degrades',
			label: 'Gigue accrue (+5.7ms)',
			active: true,
			impactSeverity: 'MEDIUM',
			scenarioScope: 'cost_optimized_v1',
			cause: 'Suppression des boîtiers d\'offload matériel dédiés (-45 k€ CAPEX)'
		},
		{
			from: 'OPT-CRYPTO-MUTUALIZED',
			to: 'REG-NIS2-INCIDENT',
			type: 'tradeoff_degrades',
			label: 'Isolation mutualisée sous surveillance',
			active: true,
			impactSeverity: 'HIGH',
			scenarioScope: 'cost_optimized_v1'
		},
		{
			from: 'OPT-CRYPTO-MUTUALIZED',
			to: 'REG-RGPD-SECURITY',
			type: 'satisfies',
			label: 'Chiffrement maintenu (logiciel)',
			active: true,
			scenarioScope: 'cost_optimized_v1'
		}
	];

	return {
		nodes,
		edges,
		meta: {
			source: 'default',
			subjectName: 'Modèle de référence multi-cluster & sécurité',
			estimatedSavingsOpex: '-90 k€/an',
			estimatedSavingsCapex: '-45 k€'
		}
	};
}

/**
 * Exécute dynamiquement la simulation d'impact sur n'importe quel graphe (déterministe ou généré par LLM).
 */
export function simulateCostOptimization(
	baseGraph: ImpactGraphData,
	scenario: ImpactSimulationScenario
): ImpactSimulationResult {
	const nodes = baseGraph.nodes.map((n) => ({
		...n,
		metadata: n.metadata ? { ...n.metadata } : undefined
	}));
	const edges = baseGraph.edges.map((e) => ({ ...e }));

	const nodeById = new Map(nodes.map((n) => [n.id, n]));

	if (scenario === 'nominal_v2') {
		for (const node of nodes) {
			if (node.type === 'requirement' || node.type === 'compliance') {
				node.status = 'compliant';
			} else if (node.type === 'option') {
				node.status = node.scenarioRole === 'nominal' ? 'retained' : 'candidate';
			}
		}

		for (const edge of edges) {
			if (edge.scenarioScope === 'nominal_v2') {
				edge.active = true;
			} else if (edge.scenarioScope === 'cost_optimized_v1') {
				edge.active = false;
			} else {
				edge.active = edge.type === 'satisfies' || edge.type === 'based_on';
			}
		}

		const subjectContext = baseGraph.meta?.subjectName ? ` sur « ${baseGraph.meta.subjectName} »` : '';
		return {
			scenario: 'nominal_v2',
			summaryMessage: `Scénario Nominal V2${subjectContext} : Toutes les exigences clients et conformités réglementaires sont satisfaites. Budget nominal sans concession technique.`,
			estimatedSavingsOpex: '0 k€ (Base)',
			estimatedSavingsCapex: '0 k€ (Base)',
			severityMax: 'LOW',
			degradedRequirements: [],
			compromisedCompliance: [],
			assumedTechnicalDebt: [],
			nodes,
			edges,
			meta: baseGraph.meta
		};
	}

	// Scénario Optimisé Coût V1 : activation des compromis et propagation dynamique sur les cibles
	for (const node of nodes) {
		if (node.type === 'requirement' || node.type === 'compliance') {
			node.status = 'compliant';
		} else if (node.type === 'option') {
			node.status = node.scenarioRole === 'cost_v1' ? 'retained' : 'candidate';
		}
	}

	for (const edge of edges) {
		if (edge.scenarioScope === 'nominal_v2') {
			edge.active = false;
		} else if (edge.scenarioScope === 'cost_optimized_v1') {
			edge.active = true;
		} else {
			edge.active =
				edge.type === 'tradeoff_degrades' ||
				edge.type === 'violates' ||
				edge.type === 'enforces' ||
				edge.type === 'based_on';
		}

		if (edge.active) {
			const target = nodeById.get(edge.to);
			if (target && (target.type === 'requirement' || target.type === 'compliance')) {
				if (edge.type === 'violates') {
					target.status = 'violated';
				} else if (edge.type === 'tradeoff_degrades' && target.status !== 'violated') {
					target.status = 'degraded';
				}
			}
		}
	}

	const degradedRequirements: DegradedRequirementImpact[] = [];
	const seenReqIds = new Set<string>();
	const compromisedCompliance: CompromisedComplianceImpact[] = [];
	const seenCompIds = new Set<string>();
	let severityMax: ImpactSeverity = 'LOW';

	for (const edge of edges) {
		if (!edge.active) continue;
		const target = nodeById.get(edge.to);
		if (!target) continue;

		if (
			target.type === 'requirement' &&
			(edge.type === 'tradeoff_degrades' || edge.type === 'violates') &&
			!seenReqIds.has(target.id)
		) {
			seenReqIds.add(target.id);
			const sev: ImpactSeverity = edge.impactSeverity || target.severity || 'MEDIUM';
			severityMax = maxSeverity(severityMax, sev);
			degradedRequirements.push({
				id: target.id,
				label: target.label,
				nominal: target.metadata?.nominalValue || 'Cible nominale V2',
				degraded: target.metadata?.degradedValue || edge.label || 'Dégradation V1',
				severity: sev,
				cause: edge.cause || target.metadata?.cause || edge.label || 'Arbitrage coût V1'
			});
		}

		if (
			target.type === 'compliance' &&
			(edge.type === 'violates' || edge.type === 'tradeoff_degrades') &&
			!seenCompIds.has(target.id)
		) {
			seenCompIds.add(target.id);
			const sev: ImpactSeverity =
				edge.impactSeverity ||
				target.severity ||
				(edge.type === 'violates' ? 'CRITICAL' : 'HIGH');
			severityMax = maxSeverity(severityMax, sev);
			compromisedCompliance.push({
				id: target.id,
				framework: target.metadata?.framework || target.label,
				article: target.metadata?.article || target.label,
				legalRisk: target.metadata?.legalRisk || target.description,
				severity: sev,
				mitigation:
					target.metadata?.mitigation ||
					'Consigner un ADR de dérogation avec clause d\'extinction V2 et mesure compensatoire.'
			});
		}
	}

	// Extraction dynamique de la dette technique assumée (à partir des décisions & options V1)
	const assumedTechnicalDebt: AssumedTechnicalDebt[] = [];
	const decisionNodes = nodes.filter((n) => n.type === 'decision');
	const costOptionNodes = nodes.filter((n) => n.type === 'option' && n.scenarioRole === 'cost_v1');

	if (decisionNodes.length > 0 && decisionNodes.every((d) => d.metadata?.sunsetTarget)) {
		for (const dec of decisionNodes) {
			assumedTechnicalDebt.push({
				decisionId: dec.id,
				title: dec.label,
				savings: dec.metadata?.financialDelta || baseGraph.meta?.estimatedSavingsOpex || 'Économie V1',
				sunsetClause: dec.metadata?.sunsetTarget || 'Re-bascule V2 planifiée',
				residualRisk: dec.metadata?.residualRisk || dec.description
			});
		}
	} else if (costOptionNodes.length > 0) {
		for (const opt of costOptionNodes) {
			assumedTechnicalDebt.push({
				decisionId: decisionNodes[0]?.id || opt.id,
				title: opt.label,
				savings: opt.metadata?.financialDelta || baseGraph.meta?.estimatedSavingsOpex || 'Économie V1',
				sunsetClause:
					opt.metadata?.sunsetTarget ||
					decisionNodes[0]?.metadata?.sunsetTarget ||
					'Clause de révision V2 à définir lors de l\'arbitrage',
				residualRisk: opt.metadata?.residualRisk || opt.description
			});
		}
	}

	const opex = baseGraph.meta?.estimatedSavingsOpex || '-90 k€/an';
	const capex = baseGraph.meta?.estimatedSavingsCapex || '-45 k€';
	const subjectContext = baseGraph.meta?.subjectName ? ` sur « ${baseGraph.meta.subjectName} »` : '';

	return {
		scenario: 'cost_optimized_v1',
		summaryMessage: `Scénario Optimisé Coût V1${subjectContext} : ${degradedRequirements.length} exigence(s) client dégradée(s) et ${compromisedCompliance.length} alerte(s) de conformité identifiée(s) pour une économie estimée (${opex} OPEX / ${capex} CAPEX).`,
		estimatedSavingsOpex: opex,
		estimatedSavingsCapex: capex,
		severityMax,
		degradedRequirements,
		compromisedCompliance,
		assumedTechnicalDebt,
		nodes,
		edges,
		meta: baseGraph.meta
	};
}

/**
 * Génère la représentation syntaxique Mermaid (flowchart TD) pour le rendu interactif.
 */
export function generateMermaidImpactDiagram(
	graph: ImpactGraphData,
	_scenario: ImpactSimulationScenario = 'cost_optimized_v1'
): string {
	const lines: string[] = ['flowchart TD'];

	const safeId = (id: string) => sanitizeMermaidId(id);

	// Sous-graphe 1 : Contrainte Coût
	const costNodes = graph.nodes.filter((n) => n.type === 'cost_constraint');
	if (costNodes.length > 0) {
		lines.push('    subgraph G_COST ["💰 Contraintes de Coût & Budget V1"]');
		for (const node of costNodes) {
			lines.push(
				`        ${safeId(node.id)}["<b>${escapeMermaid(node.label)}</b><br/><i>${escapeMermaid(node.metadata?.financialDelta || '')}</i>"]:::costNode`
			);
		}
		lines.push('    end');
	}

	// Sous-graphe 2 : Décisions & Options
	const decNodes = graph.nodes.filter((n) => n.type === 'decision' || n.type === 'option');
	if (decNodes.length > 0) {
		lines.push('    subgraph G_DEC ["⚖️ Décisions d\'Architecture & Options"]');
		for (const node of graph.nodes.filter((n) => n.type === 'decision')) {
			lines.push(
				`        ${safeId(node.id)}["<b>${escapeMermaid(node.label)}</b><br/>${escapeMermaid(truncate(node.description, 85))}"]:::decisionNode`
			);
		}
		for (const node of graph.nodes.filter((n) => n.type === 'option')) {
			const isRetained = node.status === 'retained';
			const cssClass = isRetained ? 'optionRetained' : 'optionCandidate';
			const badge = isRetained ? '⭐ [RETENU]' : '⚪ [ALTERNATIVE]';
			lines.push(
				`        ${safeId(node.id)}["<b>${badge} ${escapeMermaid(node.label)}</b><br/><i>${escapeMermaid(node.metadata?.financialDelta || '')}</i>"]:::${cssClass}`
			);
		}
		lines.push('    end');
	}

	// Sous-graphe 3 : Exigences Client
	const reqNodes = graph.nodes.filter((n) => n.type === 'requirement');
	if (reqNodes.length > 0) {
		lines.push('    subgraph G_REQ ["🎯 Exigences Client & Engagements de Service"]');
		for (const node of reqNodes) {
			const isDegraded = node.status === 'degraded' || node.status === 'violated';
			const cssClass = isDegraded ? 'reqDegraded' : 'reqCompliant';
			const badge = isDegraded ? '⚠️ [DÉGRADÉ V1]' : '✅ [SATISFAIT]';
			const metric = isDegraded ? node.metadata?.degradedValue : node.metadata?.nominalValue;
			lines.push(
				`        ${safeId(node.id)}["<b>${badge} ${escapeMermaid(node.label)}</b><br/>${escapeMermaid(truncate(metric || '', 90))}"]:::${cssClass}`
			);
		}
		lines.push('    end');
	}

	// Sous-graphe 4 : Conformité Réglementaire
	const compNodes = graph.nodes.filter((n) => n.type === 'compliance');
	if (compNodes.length > 0) {
		lines.push('    subgraph G_REG ["🛡️ Conformité Légale & Réglementaire"]');
		for (const node of compNodes) {
			const isViolated = node.status === 'violated';
			const isDegraded = node.status === 'degraded';
			let cssClass = 'regCompliant';
			let badge = '✅ [CONFORME]';
			if (isViolated) {
				cssClass = 'regViolated';
				badge = '🚨 [NON-CONFORME]';
			} else if (isDegraded) {
				cssClass = 'regDegraded';
				badge = '⚠️ [SOUS SURVEILLANCE]';
			}
			lines.push(
				`        ${safeId(node.id)}["<b>${badge} ${escapeMermaid(node.label)}</b><br/><i>${escapeMermaid(node.metadata?.framework || '')}</i>"]:::${cssClass}`
			);
		}
		lines.push('    end');
	}

	// Liens actifs
	for (const edge of graph.edges) {
		if (!edge.active) continue;

		const edgeLabel = edge.label ? `|"${escapeMermaid(truncate(edge.label, 45))}"|` : '';
		const fromId = safeId(edge.from);
		const toId = safeId(edge.to);

		if (edge.type === 'violates') {
			lines.push(`    ${fromId} ==x ${edgeLabel} ${toId}`);
		} else if (edge.type === 'tradeoff_degrades') {
			lines.push(`    ${fromId} -.-> ${edgeLabel} ${toId}`);
		} else if (edge.type === 'enforces') {
			lines.push(`    ${fromId} ==> ${edgeLabel} ${toId}`);
		} else if (edge.type === 'satisfies') {
			lines.push(`    ${fromId} --> ${edgeLabel} ${toId}`);
		} else {
			lines.push(`    ${fromId} --- ${edgeLabel} ${toId}`);
		}
	}

	// Styles CSS Mermaid
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
	return text.replace(/"/g, "'").replace(/[\[\]\(\)\{\}<>]/g, ' ');
}

function truncate(text: string, maxLen: number): string {
	if (!text) return '';
	return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}
