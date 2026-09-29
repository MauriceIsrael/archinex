/**
 * Moteur d'Élicitation Architecturale & Provocation Dialectique
 * Conçu pour forcer la maturation d'un sujet (L1 -> L2 -> L3)
 * Fonctionne en local souverain sur raptor-nino:11434 (Ministral 14B / Qwen 14B).
 */

import type { ArchitectRole } from '$lib/types/epistemic';
import type {
	TelegraphicHypothesis,
	TelegraphicConflict,
	TelegraphicGap,
	TelegraphicVariant
} from '$lib/domain/telegraphic';
import { localLlmClient } from './localLlmClient';
import { DEFAULT_KB_STANDARDS, type KbItemSummary } from './rfpFactorizer';

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

export interface ElicitationResult {
	status: 'ok' | 'fallback';
	modelUsed: string;
	subjectId: string;
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

RÈGLES D'OR DE L'ÉLICITATION D'ARCHITECTURE :
1. DÉBUSQUER LES NON-DITS ET ANGLES MORTS : Ce que le client ou l'équipe n'a pas formulé (exigences implicites, contraintes de gigue, surcoût caché, limites thermiques, adhérences juridiques).
2. REFUSER LE BLABLA DIPLOMATIQUE : Utiliser un style télégraphique, direct, incisif et rigoureux.
3. ASSIGNER DES QUESTIONS ULTRA-CIBLÉES (MANQUE) : Chaque question doit être attribuée au rôle expert pertinent :
   - "lead_architect" (gouvernance, arbitrage financier/légal, souveraineté)
   - "infra_expert_architect" (bare-metal, serveurs, baies, k8s, stockage)
   - "domain_architect" (réseau, cœurs télécom, radio, latence, PTP)
   - "security_architect" (chiffrement, ANSSI, NIS2, IAM, durcissement)
   - "data_architect" (persistance, flux, rétention)
4. FORMULER UNE VARIANTE B : Proposer une alternative technique concrète avec son compromis coût/performance ("Trade-Off").
5. RÉDIGER UNE PROVOCATION DIALECTIQUE : Un court message percutant (2-3 phrases) destiné au fil de discussion des experts pour lancer immédiatement le débat contradictoire en atelier.

FORMAT DE SORTIE : Réponds STRICTEMENT en JSON :
{
  "summary": "Synthèse de l'élicitation en 1 phrase",
  "suppose": [
    {
      "text": "Hypothèse non-dite élicitée",
      "consequence": "Conséquence technique sur la conception",
      "cost_hint": "Impact budgétaire estimé (ex: +15% matériel)"
    }
  ],
  "conflit": [
    {
      "text": "Contradiction technique ou économique révélée",
      "opposing_reference": "Référence de la règle ou standard opposé (ex: NIS2 Art. 21 ou Standard Infra)",
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
    "title": "Nom de l'alternative de repli ou innovante",
    "cost_delta": "Variation de coût (ex: -40% matériel)",
    "trade_off": "Compromis consenti (ex: holdover 7j au lieu de 30j)"
  },
  "provocationMessage": "Message incisif pour provoquer le débat entre experts dans le chat"
}`;

	const kbText = kbStandards.length > 0
		? kbStandards.map((k) => `[${k.id}] ${k.title}: ${k.ruleOrStatement}`).join('\n')
		: '(Patrimoine Commun vierge pour ce premier projet - éliciter à partir des principes généraux)';

	const userMessage = `SUJET D'ARCHITECTURE À ÉLICITER :
Réf : ${req.sectionRef} - ${req.subjectName}
Niveau actuel : ${req.currentLevel || 'L1_dilemma'}

ACQUIS ACTUELS (RETENU) :
${req.existingRetenu?.join('\n') || 'Aucun acquis verrouillé pour le moment.'}

CONTEXTE / EXIGENCES LIÉES DU RFP :
${req.clausesText || req.subjectName}

PATRIMOINE COMMUN DISPONIBLE (KB LLMOps) :
${kbText}

Procède à l'élicitation approfondie : dégage les hypothèses cachées (SUPPOSE), les controverses (CONFLIT), les questions ouvertes spécialisées (MANQUE), une Variante B et le message de provocation pour les experts.`;

	return { systemPrompt, userMessage };
}

/**
 * Élicite les quadrants et provoque le débat via LLM local
 */
export async function elicitSubjectDetails(
	req: ElicitationRequest,
	kbStandards: KbItemSummary[] = DEFAULT_KB_STANDARDS
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

		return {
			status: 'ok',
			modelUsed: model,
			subjectId: req.subjectId,
			summary: parsed.summary || `Élicitation réussie pour ${req.subjectName}`,
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
							title: parsed.variante_b.title || 'Variante de compromis',
							cost_delta: parsed.variante_b.cost_delta || 'Non chiffré',
							trade_off: parsed.variante_b.trade_off || 'Arbitrage performance / coût'
						}
					: undefined
			},
			provocationMessage:
				parsed.provocationMessage ||
				`[Agent Élicitation IA] Débat ouvert sur ${req.subjectName} : Quelles hypothèses retenons-nous pour lever les ambiguïtés techniques ?`
		};
	} catch (err: unknown) {
		console.warn('⚠️ Échec de l\'élicitation LLM locale, bascule sur générateur heuristique :', err);
		return fallbackDeterministicElicitation(req);
	}
}

/**
 * Fallback heuristique en cas de timeout ou LLM local non démarré
 */
export function fallbackDeterministicElicitation(req: ElicitationRequest): ElicitationResult {
	const sName = req.subjectName.toLowerCase();
	const isTelco = sName.includes('ptp') || sName.includes('upf') || sName.includes('telco') || sName.includes('radio');
	const isSec = sName.includes('chiffr') || sName.includes('sec') || sName.includes('nis2') || sName.includes('cert');

	const role: ArchitectRole = isTelco
		? 'domain_architect'
		: isSec
			? 'security_architect'
			: 'infra_expert_architect';

	return {
		status: 'fallback',
		modelUsed: 'heuristic-engine',
		subjectId: req.subjectId,
		summary: `Élicitation heuristique structurée pour ${req.subjectName}`,
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
				title: `Variante Asymétrique : Déploiement Allégé pour ${req.subjectName}`,
				cost_delta: '-30% sur le matériel',
				trade_off: 'Bascule active-passive au lieu d une réplication active-active synchrone'
			}
		},
		provocationMessage: `[Agent Élicitation IA] Sur le sujet "${req.subjectName}", nous devons trancher : acceptons-nous le surcoût de la solution nominale ou instruisons-nous la Variante B ?`,
	};
}

function cleanJson(str: string): string {
	let c = str.trim();
	const match = c.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	if (match && match[1]) {
		c = match[1].trim();
	}
	return c;
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
