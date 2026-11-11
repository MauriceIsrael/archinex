import { z } from 'zod';
import { localLlmClient } from '../llm/localLlmClient';
import { AGENT_TIMEOUT_MS } from './agentConfig';
import {
	buildContextualImpactGraph,
	sanitizeMermaidId,
	type ContextualSubjectInput,
	type ImpactGraphData,
	type GraphNode,
	type GraphEdge,
	type ImpactSeverity
} from '$lib/domain/impactGraph';

export const ImpactGraphLlmSchema = z.object({
	costConstraintLabel: z.string().min(3),
	estimatedSavingsOpex: z.string().min(1),
	estimatedSavingsCapex: z.string().min(1),
	nominalOption: z.object({
		title: z.string().min(3),
		description: z.string().min(3),
		financialDelta: z.string().min(1)
	}),
	costOption: z.object({
		title: z.string().min(3),
		description: z.string().min(3),
		financialDelta: z.string().min(1),
		sunsetClause: z.string().min(3),
		residualRisk: z.string().min(3)
	}),
	degradedRequirements: z
		.array(
			z.object({
				id: z.string().min(2),
				label: z.string().min(3),
				nominalValue: z.string().min(2),
				degradedValue: z.string().min(2),
				severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
				cause: z.string().min(3)
			})
		)
		.min(1)
		.max(5),
	compromisedCompliance: z
		.array(
			z.object({
				id: z.string().min(2),
				framework: z.string().min(2),
				article: z.string().min(2),
				legalRisk: z.string().min(3),
				severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
				violated: z.boolean(),
				mitigation: z.string().min(3)
			})
		)
		.max(4)
});

export type ImpactGraphLlmPayload = z.infer<typeof ImpactGraphLlmSchema>;

export interface LlmChatClient {
	chat(opts: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
		temperature?: number;
		format?: 'json';
		timeoutMs?: number;
	}): Promise<string>;
}

/**
 * Construit un ImpactGraphData complet à partir d'une réponse structurée validée du LLM
 * et du contexte du sujet.
 */
export function buildImpactGraphFromLlmPayload(
	input: ContextualSubjectInput,
	payload: ImpactGraphLlmPayload,
	modelUsed?: string
): ImpactGraphData {
	const { subject, projectTitle } = input;
	const sectionLabel = subject.sectionRef ? `${subject.sectionRef} · ` : '';

	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	const costId = 'COST_V1_LLM';
	const decId = sanitizeMermaidId(`DEC_${subject.id}`);
	const nomOptId = 'OPT_NOMINAL_LLM';
	const costOptId = 'OPT_COST_V1_LLM';

	nodes.push({
		id: costId,
		type: 'cost_constraint',
		label: payload.costConstraintLabel,
		description: `Contrainte budgétaire appliquée au sujet « ${subject.name} »`,
		status: 'active',
		scenarioRole: 'cost_v1',
		metadata: {
			financialDelta: `${payload.estimatedSavingsOpex} OPEX · ${payload.estimatedSavingsCapex} CAPEX`
		}
	});

	const revTag = input.decision?.version ? ` (rév. v${input.decision.version})` : '';
	nodes.push({
		id: decId,
		type: 'decision',
		label: `Décision ${sectionLabel}${subject.name}${revTag}`,
		description: subject.problemStatement || `Arbitrage coûts vs optimum nominal`,
		status: 'retained',
		scenarioRole: 'both',
		metadata: {
			sunsetTarget: payload.costOption.sunsetClause,
			residualRisk: payload.costOption.residualRisk,
			financialDelta: payload.costOption.financialDelta
		}
	});

	nodes.push({
		id: nomOptId,
		type: 'option',
		label: payload.nominalOption.title,
		description: payload.nominalOption.description,
		status: 'candidate',
		scenarioRole: 'nominal',
		metadata: {
			financialDelta: payload.nominalOption.financialDelta
		}
	});

	nodes.push({
		id: costOptId,
		type: 'option',
		label: payload.costOption.title,
		description: payload.costOption.description,
		status: 'retained',
		scenarioRole: 'cost_v1',
		metadata: {
			financialDelta: payload.costOption.financialDelta,
			sunsetTarget: payload.costOption.sunsetClause,
			residualRisk: payload.costOption.residualRisk
		}
	});

	edges.push({
		from: costId,
		to: costOptId,
		type: 'enforces',
		label: 'Impose arbitrage coût',
		active: true,
		scenarioScope: 'cost_optimized_v1'
	});
	edges.push({
		from: decId,
		to: nomOptId,
		type: 'based_on',
		label: 'Optimum nominal',
		active: false,
		scenarioScope: 'nominal_v2'
	});
	edges.push({
		from: decId,
		to: costOptId,
		type: 'based_on',
		label: 'Compromis coût',
		active: true,
		scenarioScope: 'cost_optimized_v1'
	});

	for (const req of payload.degradedRequirements) {
		const reqNodeId = sanitizeMermaidId(`REQ_${req.id}`);
		nodes.push({
			id: reqNodeId,
			type: 'requirement',
			label: req.label,
			description: req.cause,
			severity: req.severity as ImpactSeverity,
			status: 'compliant',
			metadata: {
				nominalValue: req.nominalValue,
				degradedValue: req.degradedValue,
				cause: req.cause
			}
		});

		edges.push({
			from: nomOptId,
			to: reqNodeId,
			type: 'satisfies',
			label: 'Satisfait cible',
			active: false,
			scenarioScope: 'nominal_v2'
		});
		edges.push({
			from: costOptId,
			to: reqNodeId,
			type: 'tradeoff_degrades',
			label: req.degradedValue,
			active: true,
			impactSeverity: req.severity as ImpactSeverity,
			scenarioScope: 'cost_optimized_v1',
			cause: req.cause
		});
	}

	for (const comp of payload.compromisedCompliance) {
		const compNodeId = sanitizeMermaidId(`COMP_${comp.id}`);
		nodes.push({
			id: compNodeId,
			type: 'compliance',
			label: `${comp.framework} · ${comp.article}`,
			description: comp.legalRisk,
			severity: comp.severity as ImpactSeverity,
			status: 'compliant',
			metadata: {
				framework: comp.framework,
				article: comp.article,
				legalRisk: comp.legalRisk,
				mitigation: comp.mitigation
			}
		});

		edges.push({
			from: nomOptId,
			to: compNodeId,
			type: 'satisfies',
			label: 'Conforme',
			active: false,
			scenarioScope: 'nominal_v2'
		});
		edges.push({
			from: costOptId,
			to: compNodeId,
			type: comp.violated ? 'violates' : 'tradeoff_degrades',
			label: comp.violated ? 'Non-conformité' : 'Risque réglementaire',
			active: true,
			impactSeverity: comp.severity as ImpactSeverity,
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
			source: 'llm',
			modelUsed: modelUsed || 'local-llm',
			generatedAt: new Date().toISOString(),
			estimatedSavingsOpex: payload.estimatedSavingsOpex,
			estimatedSavingsCapex: payload.estimatedSavingsCapex
		}
	};
}

/**
 * Génère dynamiquement un graphe d'impact contextualisé pour un sujet précis via le LLM.
 * En cas d'indisponibilité ou d'erreur LLM, bascule proprement sur le graphe déterministe du sujet.
 */
export async function generateContextualImpactGraphWithLlm(
	input: ContextualSubjectInput,
	client: LlmChatClient = localLlmClient
): Promise<ImpactGraphData> {
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

	const criteriaText = criteria
		.map((c) => `- [${c.kind.toUpperCase()} | poids ${c.weight}/5] ${c.name}: ${c.description || ''}`)
		.join('\n');

	const optionsText = options
		.map((o) => {
			const evals = evaluations
				.filter((e) => e.optionId === o.id)
				.map((e) => {
					const cName = criteria.find((c) => c.id === e.criterionId)?.name || e.criterionId;
					return `${cName}: ${e.score}/2 (${e.justification})`;
				})
				.join(' ; ');
			return `- Option "${o.title}" (${o.status}): ${o.summary || ''} | Évaluations: ${evals || 'aucune'}`;
		})
		.join('\n');

	const reqsText = requirements
		.map((r) => `- ${r.clauseRef} (${r.criticality || 'standard'}): ${r.title}`)
		.join('\n');

	const tradeoffsText = tradeoffs
		.map((t) => `- Gains: ${t.gains} | Sacrifices: ${t.sacrifices}`)
		.join('\n');

	const systemPrompt = `Tu es l'architecte principal d'Archinex spécialisé en analyse d'impact causal et compromis entre Optimum Nominal (Vx) et Variante Optimisée Coût (Vy).
À partir du sujet d'architecture réel fourni, produis une analyse de graphe d'impact STRICTEMENT contextualisée à CE sujet (domaines, composants, exigences et lois applicables).
NE JAMAIS inventer un domaine étranger au sujet (pas de télécoms si le sujet est du cloud/ERP/IA, pas de DORA si hors finance/critique sauf si mentionné).
Ne suppose pas d'ordre fixe V1/V2 : l'optimum nominal peut être l'état initial et le compromis coût une révision ultérieure (ou inversement).

Réponds STRICTEMENT en JSON valide respectant ce schéma exact :
{
  "costConstraintLabel": "Titre court de la contrainte budgétaire pour ce sujet",
  "estimatedSavingsOpex": "ex: -45 k€/an",
  "estimatedSavingsCapex": "ex: -30 k€",
  "nominalOption": {
    "title": "Optimum Nominal (fidèle au sujet)",
    "description": "Description technique concise",
    "financialDelta": "Budget nominal complet"
  },
  "costOption": {
    "title": "Variante Compromis Coût (fidèle au sujet)",
    "description": "Compromis technique concret",
    "financialDelta": "ex: -75 k€",
    "sunsetClause": "Condition exacte de révision ou retour à l'optimum (Vx → Vy : seuil, date ou jalon)",
    "residualRisk": "Risque résiduel assumé"
  },
  "degradedRequirements": [
    {
      "id": "REQ_1",
      "label": "Exigence client impactée",
      "nominalValue": "Niveau optimum nominal",
      "degradedValue": "Niveau dégradé sous compromis coût",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "cause": "Lien causal exact avec l'option économique"
    }
  ],
  "compromisedCompliance": [
    {
      "id": "COMP_1",
      "framework": "Référentiel ou loi applicable au sujet",
      "article": "Article ou contrôle",
      "legalRisk": "Impact sur la conformité",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "violated": true,
      "mitigation": "Mesure compensatoire requise"
    }
  ]
}`;

	const userPrompt = `Projet : ${projectTitle}
Sujet : ${subject.sectionRef || ''} ${subject.name}
Problématique : ${subject.problemStatement || 'Non spécifiée'}
Référentiels applicables : ${frameworks.join(', ') || 'Aucun spécifié'}
Décision actuelle : ${decision ? `${decision.rationale} (réversibilité: ${decision.reversibility})` : 'Non encore tranchée'}

Critères :
${criteriaText || '(aucun critère renseigné)'}

Options & Évaluations :
${optionsText || '(aucune option renseignée)'}

Compromis déclarés :
${tradeoffsText || '(aucun)'}

Exigences client liées :
${reqsText || '(aucune exigence liée)'}

Génère le graphe d'impact contextualisé pour ce sujet :`;

	try {
		const raw = await client.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			temperature: 0.2,
			format: 'json',
			timeoutMs: AGENT_TIMEOUT_MS
		});

		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('Réponse LLM sans bloc JSON exploitable');
		}

		const parsed = JSON.parse(jsonMatch[0]);
		const validated = ImpactGraphLlmSchema.parse(parsed);
		return buildImpactGraphFromLlmPayload(input, validated);
	} catch (err: unknown) {
		const fallback = buildContextualImpactGraph(input);
		fallback.meta = {
			...fallback.meta,
			source: 'deterministic',
			fallbackReason: err instanceof Error ? err.message : 'LLM indisponible'
		};
		return fallback;
	}
}
