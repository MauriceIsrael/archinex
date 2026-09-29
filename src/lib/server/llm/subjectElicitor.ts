/**
 * Moteur d'Élicitation Architecturale & Provocation Dialectique (Lot A2)
 * Conçu pour forcer la maturation d'un sujet (L1 -> L2 -> L3)
 * Génère au moins 3 critères et 3 options multi-critères
 * Fonctionne en local souverain via Ollama (Ministral 14B / Qwen 14B).
 */

import type { ArchitectRole } from '$lib/types/epistemic';
import type {
	TelegraphicHypothesis,
	TelegraphicConflict,
	TelegraphicGap,
	TelegraphicVariant
} from '$lib/domain/telegraphic';
import {
	convertVarianteBToOption,
	type CriterionKind,
	type OptionOrigin,
	type OptionStatus
} from '$lib/domain/options';
import { localLlmClient } from './localLlmClient';
import type { KbItemSummary } from './rfpFactorizer';

export interface ElicitationRequest {
	subjectId: string;
	subjectName: string;
	sectionRef: string;
	currentLevel?: string;
	existingRetenu?: string[];
	existingHypotheses?: TelegraphicHypothesis[];
	existingConflicts?: TelegraphicConflict[];
	clausesText?: string;
	model?: string;
}

export interface ElicitedCriterion {
	id?: string;
	name: string;
	description: string;
	kind: CriterionKind;
	weight: number;
	kbRef?: string | null;
}

export interface ElicitedOption {
	id?: string;
	title: string;
	summary: string;
	origin: OptionOrigin;
	status: OptionStatus;
	kbRefs: string[];
}

export interface ElicitationResult {
	status: 'ok' | 'fallback';
	modelUsed: string;
	subjectId: string;
	criteria: ElicitedCriterion[];
	options: ElicitedOption[];
	elicitedDraft: {
		suppose: TelegraphicHypothesis[];
		conflit: TelegraphicConflict[];
		manque: TelegraphicGap[];
		variante_b?: TelegraphicVariant;
	};
	provocationMessage: string;
	summary: string;
}

export function buildElicitationPrompt(req: ElicitationRequest, kbStandards: KbItemSummary[]): {
	systemPrompt: string;
	userMessage: string;
} {
	const systemPrompt = `Tu es un Facilitateur Dialectique et Principal Enterprise Architect pour systèmes critiques.
Ta mission est de PROVOQUER L'ÉLICITATION et LA MATURATION d'un sujet d'architecture (passage de L1 cadrage à L2 décomposition et L3 arbitrage).

RÈGLES D'OR DE L'ÉLICITATION MULTI-OPTIONS (LOT A2) :
1. DÉFINIR AU MOINS 3 CRITÈRES D'ÉVALUATION EXPLICITES :
   - Catégories valides (kind) : "functional", "nfr", "cost", "risk", "compliance"
   - Poids (weight) de 1 (secondaire) à 5 (critique/réglementaire)
2. FORMULER AU MOINS 3 OPTIONS DISTINCTES :
   - Option 1 (Nominale) : Alignée sur l'exigence brute du client
   - Option 2 (Alternative / Variante B) : Compromis coût/performance ou simplicité
   - Option 3 (Innovante ou Pattern souverain) : Pattern de doctrine ou rupture technologique
3. DÉBUSQUER LES NON-DITS ET ANGLES MORTS (SUPPOSE) : Ce que le client ou l'équipe n'a pas formulé.
4. METTRE EN LUMIÈRE LES CONTRADICTIONS (CONFLIT) : Oppositions entre contraintes techniques, budget ou normes.
5. ASSIGNER DES QUESTIONS ULTRA-CIBLÉES (MANQUE) : Aux rôles experts concernés.
6. RÉDIGER UNE PROVOCATION DIALECTIQUE : Un court message percutant pour lancer le débat contradictoire.

FORMAT DE SORTIE STRICT EN JSON :
{
  "summary": "Synthèse de l'élicitation en 1 phrase",
  "criteria": [
    {
      "name": "Conformité NIS2 & Isolation",
      "description": "Exigence de cloisonnement matériel et logique",
      "kind": "compliance",
      "weight": 5
    },
    {
      "name": "Résilience & Temps de bascule RTO",
      "description": "Disponibilité opérationnelle sous panne majeure",
      "kind": "nfr",
      "weight": 4
    },
    {
      "name": "Coût d acquisition et TCO 5 ans",
      "description": "CAPEX matériel et OPEX support",
      "kind": "cost",
      "weight": 3
    }
  ],
  "options": [
    {
      "title": "Option 1 : Architecture Dual-Node Active/Active",
      "summary": "Réplication synchrone et redondance intégrale",
      "origin": "llm-proposed",
      "status": "proposed",
      "kbRefs": []
    },
    {
      "title": "Option 2 : Architecture Active/Passive avec Stockage Réparti",
      "summary": "Bascule automatique sous 30s avec compromis de coût",
      "origin": "llm-proposed",
      "status": "proposed",
      "kbRefs": []
    },
    {
      "title": "Option 3 : Nœud Edge Découplé & Buffer Local",
      "summary": "Autonomie locale 72h sans lien réseau amont",
      "origin": "kb-pattern",
      "status": "proposed",
      "kbRefs": []
    }
  ],
  "suppose": [
    {
      "text": "Hypothèse technique non-dite",
      "consequence": "Conséquence sur la conception",
      "cost_hint": "Impact budgétaire estimé"
    }
  ],
  "conflit": [
    {
      "text": "Contradiction technique ou économique révélée",
      "opposing_reference": "Référence de la règle ou standard opposé",
      "requires_arbitration": true
    }
  ],
  "manque": [
    {
      "id": "Q-01",
      "question": "Question technique précise et fermée à instruire",
      "assigned_role": "domain_architect" | "infra_expert_architect" | "security_architect" | "lead_architect"
    }
  ],
  "variante_b": {
    "title": "Nom de l'alternative de repli",
    "cost_delta": "-30% matériel",
    "trade_off": "Compromis consenti"
  },
  "provocationMessage": "Message incisif pour provoquer le débat entre experts"
}`;

	const kbText =
		kbStandards.length > 0
			? kbStandards.map((k) => `[${k.id}] ${k.title}: ${k.ruleOrStatement}`).join('\n')
			: '(Patrimoine Commun vierge pour ce premier projet - éliciter à partir des principes généraux)';

	const userMessage = `SUJET D'ARCHITECTURE À ÉLICITER :
Réf : ${req.sectionRef} - ${req.subjectName}
Niveau actuel : ${req.currentLevel || 'L1_framed'}

ACQUIS ACTUELS (RETENU) :
${req.existingRetenu?.join('\n') || 'Aucun acquis verrouillé pour le moment.'}

CONTEXTE / EXIGENCES LIÉES DU RFP :
${req.clausesText || req.subjectName}

PATRIMOINE COMMUN DISPONIBLE (KB LLMOps) :
${kbText}

Procède à l'élicitation approfondie avec au moins 3 critères pondérés, 3 options concurrentes, les cadrages télégraphiques (SUPPOSE, CONFLIT, MANQUE) et la provocation pour les experts.`;

	return { systemPrompt, userMessage };
}

/**
 * Élicite les critères, options et quadrants via LLM local
 */
export async function elicitSubjectDetails(
	req: ElicitationRequest,
	kbStandards: KbItemSummary[] = []
): Promise<ElicitationResult> {
	const model = req.model || 'ministral:latest';

	try {
		const { systemPrompt, userMessage } = buildElicitationPrompt(req, kbStandards);

		const rawContent = await localLlmClient.chat({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			format: 'json',
			temperature: 0.2
		});

		const cleaned = cleanJson(rawContent);
		const parsed = JSON.parse(cleaned);

		// Extraction et validation des critères (au moins 3)
		let criteria: ElicitedCriterion[] = Array.isArray(parsed.criteria)
			? parsed.criteria.map((c: any, idx: number) => ({
					id: `crit-${req.subjectId}-${idx + 1}`,
					name: c.name || `Critère ${idx + 1}`,
					description: c.description || '',
					kind: sanitizeKind(c.kind),
					weight: Math.max(1, Math.min(5, Number(c.weight) || 3)),
					kbRef: c.kbRef || null
				}))
			: [];

		// Extraction des options (au moins 3)
		let options: ElicitedOption[] = Array.isArray(parsed.options)
			? parsed.options.map((o: any, idx: number) => ({
					id: `opt-${req.subjectId}-${idx + 1}`,
					title: o.title || `Option ${idx + 1}`,
					summary: o.summary || '',
					origin: (o.origin as OptionOrigin) || 'llm-proposed',
					status: 'proposed' as OptionStatus,
					kbRefs: Array.isArray(o.kbRefs) ? o.kbRefs : []
				}))
			: [];

		// Rétrocompatibilité : si options absentes ou insuffisantes mais variante_b présente
		if (options.length < 3 && parsed.variante_b) {
			const converted = convertVarianteBToOption(req.subjectId, parsed.variante_b.trade_off || parsed.variante_b.title);
			if (!options.some((o) => o.title.includes('Variante B'))) {
				options.push({
					id: converted.id,
					title: parsed.variante_b.title || converted.title,
					summary: converted.summary,
					origin: 'llm-proposed',
					status: 'proposed',
					kbRefs: []
				});
			}
		}

		// Si toujours < 3, compléter par des propositions de repli structurées
		if (criteria.length < 3) {
			criteria = fallbackDeterministicCriteria(req.subjectId, req.subjectName);
		}
		if (options.length < 3) {
			options = fallbackDeterministicOptions(req.subjectId, req.subjectName);
		}

		return {
			status: 'ok',
			modelUsed: model,
			subjectId: req.subjectId,
			summary: parsed.summary || `Élicitation réussie pour ${req.subjectName}`,
			criteria,
			options,
			elicitedDraft: {
				suppose: Array.isArray(parsed.suppose)
					? parsed.suppose.map((h: any) => ({
							text: h.text || 'Hypothèse technique élicitée',
							consequence: h.consequence || 'Impact sur le dimensionnement',
							cost_hint: h.cost_hint || 'À chiffrer'
						}))
					: [],
				conflit: Array.isArray(parsed.conflit)
					? parsed.conflit.map((c: any) => ({
							text: c.text || 'Contradiction à arbitrer',
							opposing_reference: c.opposing_reference || 'Contrainte RFP',
							requires_arbitration: Boolean(c.requires_arbitration ?? true)
						}))
					: [],
				manque: Array.isArray(parsed.manque)
					? parsed.manque.map((m: any, idx: number) => ({
							id: m.id || `Q-${String(idx + 1).padStart(2, '0')}`,
							question: m.question || 'Point technique à vérifier',
							assigned_role: sanitizeRole(m.assigned_role)
						}))
					: [],
				variante_b: parsed.variante_b
					? {
							title: parsed.variante_b.title || options[1]?.title || 'Variante de compromis',
							cost_delta: parsed.variante_b.cost_delta || 'Non chiffré',
							trade_off: parsed.variante_b.trade_off || options[1]?.summary || 'Arbitrage performance / coût'
						}
					: {
							title: options[1]?.title || 'Variante B',
							cost_delta: '-20% matériel',
							trade_off: options[1]?.summary || 'Compromis d architecture'
						}
			},
			provocationMessage:
				parsed.provocationMessage ||
				`[Agent Élicitation IA] Débat ouvert sur ${req.subjectName} : 3 options formulées pour arbitrage contradictoire.`
		};
	} catch (err: unknown) {
		console.warn('⚠️ Échec de l\'élicitation LLM locale, bascule sur générateur heuristique :', err);
		return fallbackDeterministicElicitation(req);
	}
}

/**
 * Fallback heuristique déterministe avec au moins 3 critères et 3 options
 */
export function fallbackDeterministicElicitation(req: ElicitationRequest): ElicitationResult {
	const sName = req.subjectName.toLowerCase();
	const isTelco = sName.includes('synchro') || sName.includes('upf') || sName.includes('telco') || sName.includes('radio');
	const isSec = sName.includes('chiffr') || sName.includes('sec') || sName.includes('nis2') || sName.includes('cert');

	const role: ArchitectRole = isTelco
		? 'domain_architect'
		: isSec
			? 'security_architect'
			: 'infra_expert_architect';

	const criteria = fallbackDeterministicCriteria(req.subjectId, req.subjectName);
	const options = fallbackDeterministicOptions(req.subjectId, req.subjectName);

	return {
		status: 'fallback',
		modelUsed: 'heuristic-engine',
		subjectId: req.subjectId,
		summary: `Élicitation heuristique structurée pour ${req.subjectName}`,
		criteria,
		options,
		elicitedDraft: {
			suppose: [
				{
					text: `Dimensionnement crête basé sur les charges nominales du site pour ${req.subjectName}`,
					consequence: 'Nécessite une marge de sur-provisionnement CPU/mémoire de 25%',
					cost_hint: '+10% à +15% sur les nœuds'
				},
				{
					text: 'Alimentation secourue et continuité d énergie garantie par le site d accueil',
					consequence: 'Délègue l autonomie 72h au bailleur d infrastructure',
					cost_hint: 'Neutre'
				}
			],
			conflit: [
				{
					text: `Contradiction entre l exigence de haute résilience pour ${req.subjectName} et les contraintes d encombrement sur site`,
					opposing_reference: 'ADR-0014 (Spécification de Résilience)',
					requires_arbitration: true
				}
			],
			manque: [
				{
					id: 'Q-01',
					question: `Quel est le temps maximal d interruption admissible (RTO) validé par le client pour ${req.subjectName} ?`,
					assigned_role: 'lead_architect'
				},
				{
					id: 'Q-02',
					question: `Quelles sont les métriques de gigue et de tolérance aux pannes exigées sur le plan de données ?`,
					assigned_role: role
				}
			],
			variante_b: {
				title: options[1].title,
				cost_delta: '-30% sur le matériel',
				trade_off: options[1].summary
			}
		},
		provocationMessage: `[Agent Élicitation IA] Sur le sujet "${req.subjectName}", 3 options distinctes sont proposées avec leurs compromis. Quel scénario le Lead Architect retient-il ?`
	};
}

function fallbackDeterministicCriteria(subjectId: string, subjectName: string): ElicitedCriterion[] {
	return [
		{
			id: `crit-${subjectId}-1`,
			name: 'Conformité NIS2 & Exigences de Sécurité',
			description: `Contrôles réglementaires et durcissement pour ${subjectName}`,
			kind: 'compliance',
			weight: 5
		},
		{
			id: `crit-${subjectId}-2`,
			name: 'Résilience Opérationnelle & Disponibilité',
			description: 'Tolérance aux pannes matérielles et bascule sans coupure',
			kind: 'nfr',
			weight: 4
		},
		{
			id: `crit-${subjectId}-3`,
			name: 'TCO & Sobriété d Implémentation',
			description: 'Coût total de possession, complexité d intégration et licences',
			kind: 'cost',
			weight: 3
		}
	];
}

function fallbackDeterministicOptions(subjectId: string, subjectName: string): ElicitedOption[] {
	return [
		{
			id: `opt-${subjectId}-1`,
			title: `Option 1 (Nominale) : Architecture Intégrale Active/Active`,
			summary: `Redondance complète inter-sites avec bascule transparente pour ${subjectName}.`,
			origin: 'llm-proposed',
			status: 'proposed',
			kbRefs: []
		},
		{
			id: `opt-${subjectId}-2`,
			title: `Option 2 (Alternative) : Déploiement Active/Passive Découplé`,
			summary: `Réduction de complexité avec bascule asynchrone tolérant 30s d indisponibilité.`,
			origin: 'llm-proposed',
			status: 'proposed',
			kbRefs: []
		},
		{
			id: `opt-${subjectId}-3`,
			title: `Option 3 (Souveraine) : Pattern Haute Résilience Hybride`,
			summary: `Nœuds bare-metal locaux autonomes 72h sans dépendance cloud centrale.`,
			origin: 'kb-pattern',
			status: 'proposed',
			kbRefs: ['KH:SEC-HARDENING-01']
		}
	];
}

function cleanJson(str: string): string {
	let c = str.trim();
	const match = c.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	if (match && match[1]) {
		c = match[1].trim();
	}
	return c;
}

function sanitizeKind(k: any): CriterionKind {
	const valid: CriterionKind[] = ['functional', 'nfr', 'cost', 'risk', 'compliance'];
	if (valid.includes(k)) return k;
	return 'nfr';
}

function sanitizeRole(r: any): ArchitectRole {
	const valid: ArchitectRole[] = [
		'lead_architect',
		'infra_expert_architect',
		'domain_architect',
		'security_architect',
		'data_architect',
		'domain_expert'
	];
	if (valid.includes(r)) return r;
	return 'domain_architect';
}
