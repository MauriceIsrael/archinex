/**
 * Moteur de Factorisation Sémantique de RFP / CCTP par LLM Local Souverain
 * Ancré sur le Patrimoine Commun (LLMOps KB en lecture seule).
 * Conforme à l'invariant méthodologique : llm-proposed-human-approved.
 */

import type { ExtractedClause } from '$lib/domain/corpus';
import type { ArchitectRole } from '$lib/types/epistemic';
import { localLlmClient } from './localLlmClient';
import type {
	FactorizedArchitecturalSubject,
	KnowledgeAlignment,
	RfpFactorizationRequest,
	RfpFactorizationResponse
} from './types';

export interface KbItemSummary {
	id: string;
	title: string;
	category: string;
	ruleOrStatement: string;
}

/**
 * Construit le prompt système pour le LLM local
 */
export function buildSystemPrompt(customDirectives?: string): string {
	let prompt = `Tu es un Lead Solutions Architect et Ingénieur des Systèmes Critiques expérimenté.
Ta mission est de procéder à la FACTORISATION SÉMANTIQUE d'un ensemble d'exigences (RFP / CCTP) pour en extraire 8 à 12 SUJETS D'ARCHITECTURE structurants.

RÈGLES D'OR DE FACTORISATION ARCHITECTURALE :
1. NE PAS CRÉER UN SUJET PAR EXIGENCE ! Il est formellement interdit de dupliquer chaque clause. Chaque sujet d'architecture doit regrouper et synthétiser 2 à 10 clauses connexes.
2. Organiser les sujets par grands domaines d'ingénierie (Lots : LOT-01-SOUV, LOT-02-INFRA, LOT-03-TELCO, LOT-04-SECOPS, LOT-05-RESIL, LOT-06-OBS, etc.).
3. Ancrer chaque sujet par rapport au PATRIMOINE COMMUN (les standards d'architecture en lecture seule de l'entreprise) :
   - Si le besoin est standard et déjà résolu par notre base de connaissance : status = "standard_established", initialLevel = "L2_decomposed" ou "L3_retained".
   - Si le besoin entre en contradiction ou pose un dilemme technique avec nos standards : status = "conflict_detected", initialLevel = "L1_dilemma".
   - Si le besoin est inédit : status = "novel_requirement", initialLevel = "L1_dilemma".
4. Assigner le rôle responsable adéquat parmi :
   - "lead_architect" (gouvernance, souveraineté, arbitrages globaux)
   - "infra_expert_architect" (bare-metal, serveurs, stockage, virtualisation, k8s)
   - "telco_expert_architect" (cœurs de réseau, radio, synchronisation, SR-IOV, slicing)
   - "secops_expert_architect" (chiffrement, IAM, NIS2, ANSSI, firewalling)
   - "data_ai_expert_architect" (flux de données, modèles, persistance)
   - "qa_governance_architect" (conformité, tests de charge, SLAs)
5. Pour chaque sujet, rédiger une graine télégraphique percutante :
   - initialQuestion : La question clé que l'architecte doit trancher.
   - initialHypothesis : L'hypothèse de conception retenue.
   - initialConflict : Si conflit avec la KB, expliquer la divergence.`;

	if (customDirectives && customDirectives.trim()) {
		prompt += `\n\nDIRECTIVES PARTICULIÈRES DONNÉES PAR L'ARCHITECTE POUR CE DOSSIER :\n${customDirectives.trim()}`;
	}

	prompt += `\n\nFORMAT DE SORTIE : Réponds STRICTEMENT et UNIQUEMENT avec un objet JSON valide ayant la structure suivante :
{
  "summary": "Synthèse exécutive du CCTP en 2 phrases",
  "subjects": [
    {
      "id": "SUBJ-01",
      "lotId": "LOT-01-SOUV",
      "name": "Nom clair et technique du Sujet d'Architecture",
      "sectionRef": "§1.0",
      "coveredClauseRefs": ["§1.1", "§4.2"],
      "matchedKbItemIds": ["STD-SOUV-01"],
      "knowledgeAlignment": "standard_established" | "conflict_detected" | "novel_requirement",
      "alignmentRationale": "Explication courte du rapprochement avec les règles existantes",
      "initialLevel": "L1_dilemma" | "L2_decomposed" | "L3_retained",
      "waitingForRole": "lead_architect" | "infra_expert_architect" | "telco_expert_architect" | "secops_expert_architect",
      "effort": "S" | "M" | "L" | "XL",
      "seed": {
        "initialRetenu": ["Acquis ou standard applicable"],
        "initialHypothesis": "Hypothèse de solution",
        "initialConflict": "Conflit éventuel",
        "initialQuestion": "Question d'amorce pour la délibération"
      }
    }
  ]
}`;

	return prompt;
}

/**
 * Construit le message utilisateur contenant les clauses et le catalogue KB
 */
export function buildUserMessage(
	clauses: ExtractedClause[],
	kbStandards: KbItemSummary[] = []
): string {
	const kbText = kbStandards
		.map((k) => `[${k.id}] (${k.category}) ${k.title} : ${k.ruleOrStatement}`)
		.join('\n');

	const clausesText = clauses
		.map((c) => `[${c.clauseRef}] ${c.title}\n${c.text}`)
		.join('\n\n');

	return `RÉFÉRENTIEL DU PATRIMOINE COMMUN (STANDARDS EXISTANTS EN LECTURE SEULE) :
${kbText}

---

EXIGENCES BRUTES DU CAHIER DES CHARGES (À FACTORISER) :
${clausesText}

Procède à la factorisation en 8 à 12 sujets d'architecture majeurs en veillant à couvrir l'ensemble des clauses ci-dessus.`;
}

/**
 * Exécute la factorisation par LLM local souverain
 */
export async function factorizeRfpWithLocalLlm(
	request: RfpFactorizationRequest,
	kbStandards: KbItemSummary[] = []
): Promise<RfpFactorizationResponse> {
	const clauses = request.clauses || [];
	const model = request.model || 'ministral:latest';
	const totalClauses = clauses.length;

	if (totalClauses === 0) {
		return {
			status: 'ok',
			engine: 'local-llm',
			modelUsed: model,
			summary: 'Aucune clause à factoriser.',
			totalClauses: 0,
			coveredClausesCount: 0,
			coverageRate: 100,
			subjects: [],
			unassignedClauses: []
		};
	}

	try {
		const systemPrompt = buildSystemPrompt(request.customPromptDirectives);
		const userMessage = buildUserMessage(clauses, kbStandards);

		const rawContent = await localLlmClient.chat({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			format: 'json',
			temperature: 0.15
		});

		// Nettoyage et parsing JSON résilient
		const cleaned = cleanJsonString(rawContent);
		const parsed = JSON.parse(cleaned);

		if (!parsed || !Array.isArray(parsed.subjects)) {
			throw new Error('Réponse LLM invalide : propriété "subjects" manquante ou non-tableau');
		}

		const subjects: FactorizedArchitecturalSubject[] = parsed.subjects.map(
			(s: any, idx: number) => ({
				id: s.id || `SUBJ-${String(idx + 1).padStart(2, '0')}`,
				lotId: s.lotId || inferLotFromRef(s.sectionRef || s.name),
				name: s.name || `Sujet d'Architecture ${idx + 1}`,
				sectionRef: s.sectionRef || `§${idx + 1}.0`,
				coveredClauseRefs: Array.isArray(s.coveredClauseRefs) ? s.coveredClauseRefs : [],
				matchedKbItemIds: Array.isArray(s.matchedKbItemIds) ? s.matchedKbItemIds : [],
				knowledgeAlignment: normalizeAlignment(s.knowledgeAlignment),
				alignmentRationale: s.alignmentRationale || 'Synthèse issue de la décomposition architecturale',
				initialLevel: normalizeLevel(s.initialLevel),
				waitingForRole: normalizeRole(s.waitingForRole),
				effort: s.effort === 'XL' || s.effort === 'L' || s.effort === 'S' ? s.effort : 'M',
				seed: {
					initialRetenu: Array.isArray(s.seed?.initialRetenu) ? s.seed.initialRetenu : [],
					initialHypothesis: s.seed?.initialHypothesis || `Conception architecturale pour ${s.name}`,
					initialConflict: s.seed?.initialConflict || undefined,
					initialQuestion: s.seed?.initialQuestion || `Comment concilier les exigences pour ${s.name} ?`
				}
			})
		);

		// Calcul de la couverture et identification des clauses orphelines
		const coveredSet = new Set<string>();
		for (const s of subjects) {
			for (const ref of s.coveredClauseRefs) {
				coveredSet.add(ref);
			}
		}

		const unassignedClauses = clauses.filter((c) => !coveredSet.has(c.clauseRef));
		const coveredClausesCount = totalClauses - unassignedClauses.length;
		const coverageRate = Math.round((coveredClausesCount / totalClauses) * 100);

		return {
			status: 'ok',
			engine: 'local-llm',
			modelUsed: model,
			summary: parsed.summary || `Factorisation sémantique réalisée avec succès via ${model}`,
			totalClauses,
			coveredClausesCount,
			coverageRate,
			subjects,
			unassignedClauses
		};
	} catch (err: unknown) {
		console.warn('⚠️ Échec de factorisation par LLM local souverain, bascule vers moteur heuristique déterministe :', err);
		return fallbackDeterministicFactorization(clauses, kbStandards, err instanceof Error ? err.message : String(err));
	}
}

/**
 * Moteur de factorisation de repli (Déterministe & Instantané)
 * S'exécute si le serveur LLM est temporairement inaccessible.
 */
export function fallbackDeterministicFactorization(
	clauses: ExtractedClause[],
	kbStandards: KbItemSummary[] = [],
	warningMessage?: string
): RfpFactorizationResponse {
	const totalClauses = clauses.length;
	const subjects: FactorizedArchitecturalSubject[] = [];

	// Regroupement thématique par mots-clés
	const clusters: Record<
		string,
		{
			name: string;
			lotId: string;
			role: ArchitectRole;
			kbIds: string[];
			clauses: ExtractedClause[];
			keywords: string[];
		}
	> = {
		souv: {
			name: 'Hébergement Souverain & Qualification SecNumCloud',
			lotId: 'LOT-01-SOUV',
			role: 'lead_architect',
			kbIds: ['STD-SOUV-01'],
			clauses: [],
			keywords: ['souverain', 'secnumcloud', 'territoire', 'extraterritorial', 'cloud act', 'juridique']
		},
		infra: {
			name: 'Socle Matériel Bare-Metal & Orchestration Kubernetes',
			lotId: 'LOT-02-INFRA',
			role: 'infra_expert_architect',
			kbIds: ['STD-INFRA-01'],
			clauses: [],
			keywords: ['bare-metal', 'matériel', 'kubernetes', 'cis', 'conteneur', 'cpu', 'mémoire', 'serveur']
		},
		telco: {
			name: 'Synchronisation Temporelle & Accélération Réseau UPF',
			lotId: 'LOT-03-TELCO',
			role: 'domain_architect',
			kbIds: ['STD-TELCO-01', 'STD-TELCO-02'],
			clauses: [],
			keywords: ['synchronisation', '1588v2', 'upf', 'sr-iov', 'multus', 'latence', '5g', 'gnss', 'holdover', 'frmcs', 'etcs']
		},
		secops: {
			name: 'Sécurité Réseau, Chiffrement TLS 1.3 & Conformité NIS2',
			lotId: 'LOT-04-SECOPS',
			role: 'security_architect',
			kbIds: ['STD-SECOPS-01', 'STD-SECOPS-02'],
			clauses: [],
			keywords: ['chiffrement', 'tls', 'anssi', 'ipsec', 'nis2', 'cert', 'mfa', 'fips', 'intrusion', 'sécurité']
		},
		resil: {
			name: 'Résilience en Mode Déconnecté & Continuité Opérationnelle',
			lotId: 'LOT-05-RESIL',
			role: 'infra_expert_architect',
			kbIds: ['STD-RESIL-01'],
			clauses: [],
			keywords: ['déconnecté', 'autonome', 'isolement', 'sauvegarde', 'continuité', 'wan', 'reprise']
		}
	};

	const unassignedClauses: ExtractedClause[] = [];

	for (const clause of clauses) {
		const fullText = `${clause.title} ${clause.text}`.toLowerCase();
		let matchedKey: string | null = null;

		for (const [key, cluster] of Object.entries(clusters)) {
			if (cluster.keywords.some((kw) => fullText.includes(kw))) {
				matchedKey = key;
				break;
			}
		}

		if (matchedKey) {
			clusters[matchedKey].clauses.push(clause);
		} else {
			unassignedClauses.push(clause);
		}
	}

	let subjectCounter = 1;
	for (const [key, cluster] of Object.entries(clusters)) {
		if (cluster.clauses.length > 0) {
			const hasCritical = cluster.clauses.some((c) => c.criticality === 'bloquant');
			subjects.push({
				id: `SUBJ-${String(subjectCounter).padStart(2, '0')}`,
				lotId: cluster.lotId,
				name: cluster.name,
				sectionRef: `§${subjectCounter}.0`,
				coveredClauseRefs: cluster.clauses.map((c) => c.clauseRef),
				matchedKbItemIds: cluster.kbIds,
				knowledgeAlignment: hasCritical ? 'conflict_detected' : 'standard_established',
				alignmentRationale: `Regroupement heuristique de ${cluster.clauses.length} exigences autour du socle ${cluster.name}`,
				initialLevel: hasCritical ? 'L1_dilemma' : 'L2_decomposed',
				waitingForRole: cluster.role,
				effort: cluster.clauses.length > 3 ? 'L' : 'M',
				seed: {
					initialRetenu: [`Prise en compte des standards d'architecture ${cluster.kbIds.join(', ')}`],
					initialHypothesis: `Conception d'une architecture répondant aux clauses ${cluster.clauses.map((c) => c.clauseRef).join(', ')}`,
					initialConflict: hasCritical
						? 'Exigences à forte criticité nécessitant un arbitrage approfondi.'
						: undefined,
					initialQuestion: `Quelles sont les options de mise en œuvre pour satisfaire ${cluster.clauses.map((c) => c.clauseRef).join(', ')} ?`
				}
			});
			subjectCounter++;
		}
	}

	// Si des clauses restent orphelines, on crée un sujet de rattrapage
	if (unassignedClauses.length > 0) {
		subjects.push({
			id: `SUBJ-${String(subjectCounter).padStart(2, '0')}`,
			lotId: 'LOT-99-DIVERS',
			name: 'Exigences Complémentaires & Clauses Spécifiques',
			sectionRef: `§${subjectCounter}.0`,
			coveredClauseRefs: unassignedClauses.map((c) => c.clauseRef),
			matchedKbItemIds: [],
			knowledgeAlignment: 'novel_requirement',
			alignmentRationale: 'Exigences non classées dans les grands socles récurrents',
			initialLevel: 'L1_dilemma',
			waitingForRole: 'lead_architect',
			effort: 'M',
			seed: {
				initialRetenu: [],
				initialHypothesis: 'Instruction détaillée des exigences particulières du client',
				initialQuestion: 'Quels arbitrages spécifiques appliquer à ces exigences complémentaires ?'
			}
		});
	}

	return {
		status: 'fallback',
		engine: 'deterministic-heuristic',
		modelUsed: 'heuristic-rules-engine',
		summary: 'Factorisation réalisée via le moteur heuristique de secours.',
		totalClauses,
		coveredClausesCount: totalClauses,
		coverageRate: 100,
		subjects,
		unassignedClauses: [],
		warning: warningMessage || 'Serveur LLM local non disponible, factorisation déterministe appliquée.'
	};
}

/**
 * Permet à un humain de promouvoir directement une clause individuelle en un nouveau Sujet d'Architecture
 * (Essentiel dans la phase d'appropriation en lien avec "La suite" de Padawan Coder).
 */
export function promoteClauseToSubject(
	clause: ExtractedClause,
	existingSubjectsCount: number = 0,
	suggestedRole: ArchitectRole = 'infra_expert_architect'
): FactorizedArchitecturalSubject {
	const nextIdx = existingSubjectsCount + 1;
	return {
		id: `SUBJ-PROMOTED-${clause.id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		lotId: inferLotFromRef(clause.clauseRef),
		name: `Sujet Dédié : ${clause.title}`,
		sectionRef: clause.clauseRef,
		coveredClauseRefs: [clause.clauseRef],
		matchedKbItemIds: [],
		knowledgeAlignment: 'novel_requirement',
		alignmentRationale: `Sujet créé manuellement par l'architecte lors de la revue d'appropriation à partir de l'exigence ${clause.clauseRef}`,
		initialLevel: 'L1_dilemma',
		waitingForRole: suggestedRole,
		effort: clause.criticality === 'bloquant' ? 'L' : 'M',
		seed: {
			initialRetenu: [`Exigence client : ${clause.title}`],
			initialHypothesis: clause.text,
			initialQuestion: `Comment concevoir la réponse technique spécifique à ${clause.clauseRef} ?`
		}
	};
}

// Helpers internes
function cleanJsonString(str: string): string {
	let cleaned = str.trim();
	// Supprime les balises markdown ```json ... ```
	const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	if (jsonBlockMatch && jsonBlockMatch[1]) {
		cleaned = jsonBlockMatch[1].trim();
	}
	return cleaned;
}

function inferLotFromRef(str: string): string {
	const s = (str || '').toLowerCase();
	if (s.includes('souv') || s.includes('secnum') || s.includes('juridique')) return 'LOT-01-SOUV';
	if (s.includes('infra') || s.includes('bare') || s.includes('k8s')) return 'LOT-02-INFRA';
	if (s.includes('telco') || s.includes('synchro') || s.includes('upf') || s.includes('radio')) return 'LOT-03-TELCO';
	if (s.includes('sec') || s.includes('chiffr') || s.includes('nis2')) return 'LOT-04-SECOPS';
	return 'LOT-02-INFRA';
}

function normalizeAlignment(val: any): KnowledgeAlignment {
	if (val === 'conflict_detected' || val === 'novel_requirement' || val === 'standard_established') {
		return val;
	}
	return 'standard_established';
}

function normalizeLevel(val: any): 'L0_unassessed' | 'L1_dilemma' | 'L2_decomposed' | 'L3_retained' {
	if (val === 'L1_dilemma' || val === 'L2_decomposed' || val === 'L3_retained' || val === 'L0_unassessed') {
		return val;
	}
	return 'L2_decomposed';
}

function normalizeRole(val: any): ArchitectRole {
	const allowed: ArchitectRole[] = [
		'lead_architect',
		'infra_expert_architect',
		'security_architect',
		'domain_architect',
		'data_architect',
		'domain_expert'
	];
	if (allowed.includes(val)) {
		return val;
	}
	return 'infra_expert_architect';
}
