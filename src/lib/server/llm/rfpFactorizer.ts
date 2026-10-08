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
 * Détermine le nombre cible de sujets d'architecture recommandé selon la complexité
 * et le volume d'exigences du document
 */
export function inferTargetSubjectsCount(clauseCount: number): string {
	if (clauseCount <= 10) return '3 à 6';
	if (clauseCount <= 30) return '6 à 10';
	if (clauseCount <= 80) return '8 à 12';
	if (clauseCount <= 200) return '12 à 18';
	return '15 à 25';
}

export const MAX_CLAUSES_BUDGET_CHARS = 24000;

/**
 * Détecte si le volume de texte brut des clauses risque de saturer la fenêtre de contexte du LLM local
 */
export function shouldCondenseClauses(clauses: ExtractedClause[], maxChars: number = MAX_CLAUSES_BUDGET_CHARS): boolean {
	const totalChars = clauses.reduce((acc, c) => acc + (c.text?.length || 0) + (c.title?.length || 0), 0);
	return totalChars > maxChars || clauses.length > 80;
}

/**
 * Regroupe les clauses volumineuses par macro-section (§1, §2, etc.)
 * lorsque le nombre d'exigences dépasse ce qu'une liste exhaustive peut contenir sans saturer le contexte.
 */
export function clusterClausesBySection(clauses: ExtractedClause[], maxTotalChars: number = MAX_CLAUSES_BUDGET_CHARS): string {
	const sections: Record<string, { title: string; clauses: ExtractedClause[]; criticalCount: number }> = {};

	for (const c of clauses) {
		const prefixMatch = c.clauseRef.match(/^(?:§|art(?:icle)?\.?\s*)(\d+)/i);
		const secKey = prefixMatch ? `Section §${prefixMatch[1]}` : 'Exigences Générales';

		if (!sections[secKey]) {
			sections[secKey] = {
				title: c.title.slice(0, 70),
				clauses: [],
				criticalCount: 0
			};
		}
		sections[secKey].clauses.push(c);
		if (c.criticality === 'bloquant' || c.criticality === 'majeur') {
			sections[secKey].criticalCount++;
		}
	}

	const secEntries = Object.entries(sections);
	return secEntries
		.map(([secName, sec]) => {
			const count = sec.clauses.length;
			const firstRef = sec.clauses[0].clauseRef;
			const lastRef = sec.clauses[sec.clauses.length - 1].clauseRef;
			const critNotice = sec.criticalCount > 0 ? ` [dont ${sec.criticalCount} critiques/bloquantes]` : '';

			const criticalClauses = sec.clauses.filter((c) => c.criticality === 'bloquant' || c.criticality === 'majeur');
			const rep = Array.from(new Set([...criticalClauses.slice(0, 3), ...sec.clauses.slice(0, 3)])).slice(0, 4);
			const repList = rep.map((c) => `  - [${c.clauseRef}] ${c.title.slice(0, 80)}`).join('\n');

			return `[${secName}] ${sec.title} (${count} exigences de ${firstRef} à ${lastRef})${critNotice} :\n${repList}`;
		})
		.join('\n\n');
}

/**
 * Construit le prompt système pour le LLM local
 */
export function buildSystemPrompt(customDirectives?: string, targetCountDesc: string = '8 à 12'): string {
	let prompt = `Tu es un Lead Solutions Architect et Ingénieur des Systèmes Critiques expérimenté.
Ta mission est de procéder à la FACTORISATION SÉMANTIQUE d'un ensemble d'exigences (RFP / CCTP) pour en extraire ${targetCountDesc} SUJETS D'ARCHITECTURE structurants.

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
        "initialRetenu": ["Exigences ou clauses concrètes imposées par le client (ex: [§4.2] Latence critique < 50ms)"],
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
	kbStandards: KbItemSummary[] = [],
	options: { condense?: boolean; targetCountDesc?: string; maxTotalChars?: number } = {}
): string {
	const maxBudget = options.maxTotalChars ?? MAX_CLAUSES_BUDGET_CHARS;
	const kbText = kbStandards
		.slice(0, 20)
		.map((k) => `[${k.id}] (${k.category}) ${k.title} : ${k.ruleOrStatement}`)
		.join('\n');

	const targetDesc = options.targetCountDesc || inferTargetSubjectsCount(clauses.length);
	const shouldCondense = options.condense ?? shouldCondenseClauses(clauses, maxBudget);

	let clausesText = '';
	let condensationNotice = '';

	if (clauses.length > 200 || (shouldCondense && clauses.length > 120)) {
		// Document massif (des centaines à des milliers d'exigences) : Synthèse hiérarchique par section
		clausesText = clusterClausesBySection(clauses, maxBudget);
		condensationNotice = `\n(NOTE : Synthèse hiérarchique par macro-sections couvrant l'ensemble des ${clauses.length} exigences pour respecter la fenêtre de contexte maximale)\n`;
	} else if (shouldCondense) {
		// Document moyen-grand : calcul d'un budget individuel par clause
		const budgetPerClause = Math.max(60, Math.floor(maxBudget / Math.max(1, clauses.length)));
		clausesText = clauses
			.map((c) => {
				const cleanText = (c.text || '').replace(/\s+/g, ' ').trim();
				const snippetLen = Math.min(250, Math.max(30, budgetPerClause - 60));
				const snippet = cleanText.length > snippetLen ? cleanText.slice(0, snippetLen).trim() + '...' : cleanText;
				const crit = c.criticality && c.criticality !== 'info' ? ` (criticité: ${c.criticality})` : '';
				return `[${c.clauseRef}] ${c.title}${crit}${snippet && snippet !== c.title ? `\nExtrait : ${snippet}` : ''}`;
			})
			.join('\n\n');
		condensationNotice = '\n(NOTE : Synthèse structurée des clauses pour respecter la fenêtre de contexte maximale du modèle local)\n';
	} else {
		// Petit document : texte brut intégral
		clausesText = clauses.map((c) => `[${c.clauseRef}] ${c.title}\n${c.text}`).join('\n\n');
	}

	return `RÉFÉRENTIEL DU PATRIMOINE COMMUN (STANDARDS EXISTANTS EN LECTURE SEULE) :
${kbText}

---

EXIGENCES BRUTES DU CAHIER DES CHARGES (À FACTORISER)${condensationNotice} :
${clausesText}

Procède à la factorisation en ${targetDesc} sujets d'architecture majeurs en veillant à couvrir l'ensemble des clauses ci-dessus.`;
}

export interface MicroArchitecturalSubject {
	id: string;
	title: string;
	lotId: string;
	coveredClauseRefs: string[];
	criticalPoints: string[];
	keyDilemmaOrHypothesis: string;
}

export const MAX_MAP_CHUNK_CHARS = 13500; // ~3 200 tokens max par bloc pour respecter rigoureusement 8192 context

/**
 * Découpe les clauses en blocs pour la passe MAP
 * Garantit de façon stricte qu'aucun bloc ne dépasse MAX_MAP_CHUNK_CHARS (13 500 caractères)
 * ni maxChunkSize (35 clauses par défaut).
 */
export function partitionClausesIntoMapChunks(clauses: ExtractedClause[], maxChunkSize: number = 35): ExtractedClause[][] {
	if (!clauses || clauses.length === 0) return [];
	if (clauses.length <= 15) {
		const totalChars = clauses.reduce((acc, c) => acc + (c.text?.length || 0) + (c.title?.length || 0), 0);
		if (totalChars <= MAX_MAP_CHUNK_CHARS) return [clauses];
	}

	const maxClauses = maxChunkSize > 0 ? maxChunkSize : 35;
	const chunks: ExtractedClause[][] = [];
	let currentChunk: ExtractedClause[] = [];
	let currentChars = 0;

	for (const clause of clauses) {
		const clauseLength = (clause.title?.length || 0) + (clause.text?.length || 0) + 50;

		// Si l'ajout de cette clause dépasse le plafond strict de caractères (13 500) OU de nombre (35 clauses)
		if (
			currentChunk.length > 0 &&
			(currentChars + clauseLength > MAX_MAP_CHUNK_CHARS || currentChunk.length >= maxClauses)
		) {
			chunks.push(currentChunk);
			currentChunk = [];
			currentChars = 0;
		}

		currentChunk.push(clause);
		currentChars += clauseLength;
	}

	if (currentChunk.length > 0) {
		chunks.push(currentChunk);
	}

	return chunks;
}

/**
 * Résout les vraies exigences du client à partir des clauses du RFP et sépare les ADRs / standards
 */
export function resolveClientClausesForSubject(
	coveredRefs: string[],
	allClauses: ExtractedClause[],
	llmRetenu: string[] = []
): { clientClauses: string[]; adrDecisions: string[] } {
	const adrDecisions: string[] = [];
	const rawClientClauses: string[] = [];

	for (const item of llmRetenu) {
		if (/ADR-\d+/i.test(item) || /STD-/i.test(item)) {
			adrDecisions.push(item);
		} else if (item && !item.toLowerCase().includes('acquis ou standard') && !item.toLowerCase().includes('consolidation de')) {
			rawClientClauses.push(item);
		}
	}

	const resolvedFromRfp = (coveredRefs || [])
		.map((ref) => {
			const found = allClauses.find((c) => c.clauseRef === ref);
			if (!found) return null;
			const cleanText = (found.text || '').replace(/\s+/g, ' ').trim();
			const snippet = cleanText.length > 140 ? cleanText.slice(0, 137) + '...' : cleanText;
			return `[${found.clauseRef}] ${found.title}${snippet ? ` : ${snippet}` : ''}`;
		})
		.filter(Boolean) as string[];

	const clientClauses = resolvedFromRfp.length > 0
		? Array.from(new Set([...resolvedFromRfp.slice(0, 6), ...rawClientClauses]))
		: rawClientClauses;

	return { clientClauses, adrDecisions };
}

/**
 * Construit le prompt pour la passe MAP (Bloc individuel à analyser verbatim)
 */
export function buildMapPrompt(chunk: ExtractedClause[], chunkIndex: number, totalChunks: number): { system: string; user: string } {
	const system = `Tu es un Expert Architecte Système.
Ta mission est d'analyser ce lot d'exigences (Bloc ${chunkIndex + 1}/${totalChunks}) et d'en extraire les micro-sujets d'architecture distincts sans en oublier aucun.

CONSIGNES STRICTES :
1. Rapproche les exigences connexes en 3 à 5 micro-sujets majeurs pour ce bloc.
2. Pour "coveredClauseRefs", indique les 3 à 5 exigences clés ou la plage représentative (ex: ["§1.1", "§1.2", "§1.10"]). Ne répète pas mécaniquement des centaines de références.
3. Consigne chaque contrainte bloquante ou spécifique (ex: synchro GNSS, chiffrement, SecNumCloud, autonomie, latence...).
4. Sois concis et télégraphique dans l'hypothèse et les points critiques pour accélérer la génération.

FORMAT DE SORTIE JSON STRICT :
{
  "microSubjects": [
    {
      "id": "MICRO-01",
      "title": "Nom technique précis du micro-sujet",
      "lotId": "LOT-01-SOUV" | "LOT-02-INFRA" | "LOT-03-TELCO" | "LOT-04-SECOPS" | "LOT-05-RESIL" | "LOT-06-OBS",
      "coveredClauseRefs": ["§1.1", "§1.2"],
      "criticalPoints": ["Exigence bloquante sur le holdover"],
      "keyDilemmaOrHypothesis": "Hypothèse de solution architecturale"
    }
  ]
}`;

	const clausesVerbatim = chunk
		.map((c) => {
			const crit = c.criticality && c.criticality !== 'info' ? ` [CRITICITÉ: ${c.criticality}]` : '';
			return `[${c.clauseRef}] ${c.title}${crit}\n${c.text || ''}`;
		})
		.join('\n\n');

	const user = `EXIGENCES DU BLOC ${chunkIndex + 1}/${totalChunks} (À ANALYSER EXHAUSTIVEMENT) :
${clausesVerbatim}

Extrais tous les micro-sujets d'architecture pour ce bloc au format JSON spécifié.`;

	return { system, user };
}

export const MAX_REDUCE_BATCH_MICRO_SUBJECTS = 20;
export const MAX_REDUCE_BATCH_CHARS = 8000;

/**
 * Découpe les micro-sujets extraits par grand domaine technique (lotId)
 * et en sous-tranches bornées en volume (< 8 000 caractères, <= 20 micro-sujets)
 * pour garantir que chaque prompt de réduction respecte rigoureusement la fenêtre de contexte (8192 tokens).
 */
export function partitionMicroSubjectsForReduce(
	microSubjects: MicroArchitecturalSubject[],
	maxBatchSize: number = MAX_REDUCE_BATCH_MICRO_SUBJECTS,
	maxBatchChars: number = MAX_REDUCE_BATCH_CHARS
): { lotId: string; batchIndex: number; totalBatchesForLot: number; subjects: MicroArchitecturalSubject[] }[] {
	if (!microSubjects || microSubjects.length === 0) return [];

	// Regroupement par lotId pour préserver l'affinité architecturale
	const byLot = new Map<string, MicroArchitecturalSubject[]>();
	for (const m of microSubjects) {
		const lot = m.lotId || inferLotFromRef(m.title);
		if (!byLot.has(lot)) {
			byLot.set(lot, []);
		}
		byLot.get(lot)!.push(m);
	}

	const batches: { lotId: string; batchIndex: number; totalBatchesForLot: number; subjects: MicroArchitecturalSubject[] }[] = [];

	for (const [lotId, list] of byLot.entries()) {
		const lotChunks: MicroArchitecturalSubject[][] = [];
		let currentChunk: MicroArchitecturalSubject[] = [];
		let currentChars = 0;

		for (const item of list) {
			const itemChars = (item.title?.length || 0) + (item.keyDilemmaOrHypothesis?.length || 0) + 120;
			if (
				currentChunk.length > 0 &&
				(currentChunk.length >= maxBatchSize || currentChars + itemChars > maxBatchChars)
			) {
				lotChunks.push(currentChunk);
				currentChunk = [];
				currentChars = 0;
			}
			currentChunk.push(item);
			currentChars += itemChars;
		}

		if (currentChunk.length > 0) {
			lotChunks.push(currentChunk);
		}

		for (let i = 0; i < lotChunks.length; i++) {
			batches.push({
				lotId,
				batchIndex: i,
				totalBatchesForLot: lotChunks.length,
				subjects: lotChunks[i]
			});
		}
	}

	return batches;
}

/**
 * Construit un prompt de réduction ciblé pour un lot ou un sous-bloc spécifique de micro-sujets
 */
export function buildBatchReducePrompt(
	microBatch: MicroArchitecturalSubject[],
	kbStandards: KbItemSummary[],
	lotId: string,
	targetDesc: string = '2 à 3',
	customDirectives?: string
): { system: string; user: string } {
	let system = `Tu es un Lead Solutions Architect et Ingénieur des Systèmes Critiques.
Ta mission est de CONSOLIDER ce groupe de ${microBatch.length} micro-sujets du domaine technique "${lotId}" en ${targetDesc} MÉTA-SUJETS D'ARCHITECTURE majeurs structurants.

RÈGLES D'OR DE LA CONSOLIDATION :
1. FUSION SÉMANTIQUE : Regroupe les micro-sujets connexes de ce domaine en méta-sujets structurants cohérents.
2. TRAÇABILITÉ : Renseigne dans "coveredMicroIds" la liste des identifiants des micro-sujets inclus (ex: ["${microBatch[0]?.id || 'MICRO-01'}", "${microBatch[1]?.id || 'MICRO-02'}"]).
3. ANCRAGE SUR LE PATRIMOINE COMMUN (KB) :
   - standard_established si résolu par nos standards existants.
   - conflict_detected ou novel_requirement en cas d'écart ou d'inédit.
4. Rôles responsables : lead_architect, infra_expert_architect, telco_expert_architect, secops_expert_architect, data_ai_expert_architect, qa_governance_architect.
5. Graines d'architecture : initialRetenu, initialHypothesis, initialConflict, initialQuestion.
6. CONCISION ET SYNTHÈSE : Reste télégraphique et synthétique (1 à 2 phrases max par champ) pour garantir une réponse JSON compacte, complète et sans coupure.`;

	if (customDirectives && customDirectives.trim()) {
		system += `\n\nDIRECTIVES DE L'ARCHITECTE :\n${customDirectives.trim()}`;
	}

	system += `\n\nFORMAT DE SORTIE JSON STRICT :
{
  "subjects": [
    {
      "id": "SUBJ-01",
      "lotId": "${lotId}",
      "name": "Nom clair et structurant du Méta-Sujet d'Architecture",
      "sectionRef": "§1.0",
      "coveredMicroIds": ["${microBatch[0]?.id || 'MICRO-01'}"],
      "coveredClauseRefs": ["§1.1"],
      "matchedKbItemIds": ["STD-01"],
      "knowledgeAlignment": "standard_established" | "conflict_detected" | "novel_requirement",
      "alignmentRationale": "Explication courte du rapprochement avec les règles existantes",
      "initialLevel": "L1_dilemma" | "L2_decomposed" | "L3_retained",
      "waitingForRole": "lead_architect" | "infra_expert_architect" | "telco_expert_architect" | "secops_expert_architect",
      "effort": "S" | "M" | "L" | "XL",
      "seed": {
        "initialRetenu": ["Exigences ou clauses concrètes imposées par le client (ex: [§4.2] Latence critique < 50ms)"],
        "initialHypothesis": "Hypothèse de solution",
        "initialConflict": "Conflit éventuel",
        "initialQuestion": "Question d'amorce pour la délibération"
      }
    }
  ]
}`;

	const kbText = kbStandards
		.slice(0, 10)
		.map((k) => `[${k.id}] (${k.category}) ${k.title} : ${k.ruleOrStatement}`)
		.join('\n');

	const microText = microBatch
		.map((m) => {
			const refs = m.coveredClauseRefs.length > 5
				? `${m.coveredClauseRefs.slice(0, 5).join(', ')} (+${m.coveredClauseRefs.length - 5} autres)`
				: m.coveredClauseRefs.join(', ');
			const crit = m.criticalPoints && m.criticalPoints.length
				? `\n  Points critiques : ${m.criticalPoints.slice(0, 2).join(' ; ')}`
				: '';
			return `[${m.id}] (${m.lotId}) ${m.title}\n  Clauses : ${refs}${crit}\n  Hypothèse : ${m.keyDilemmaOrHypothesis.slice(0, 180)}`;
		})
		.join('\n\n');

	const user = `PATRIMOINE COMMUN (STANDARDS APPLICABLES) :
${kbText || '(Aucun standard particulier)'}

---

MICRO-SUJETS DU DOMAINE "${lotId}" (À CONSOLIDER) :
${microText}

Consolide ces ${microBatch.length} micro-sujets en ${targetDesc} méta-sujets structurants au format JSON demandé.`;

	return { system, user };
}

/**
 * Construit le prompt pour la passe REDUCE globale (Consolidation des micro-sujets en méta-sujets structurants)
 */
export function buildReducePrompt(
	allMicroSubjects: MicroArchitecturalSubject[],
	kbStandards: KbItemSummary[],
	targetDesc: string,
	customDirectives?: string
): { system: string; user: string } {
	let system = `Tu es un Lead Solutions Architect et Ingénieur des Systèmes Critiques.
Ta mission est de CONSOLIDER l'ensemble des ${allMicroSubjects.length} micro-sujets d'architecture détectés sur l'intégralité du cahier des charges pour les structurer en ${targetDesc} MÉTA-SUJETS D'ARCHITECTURE majeurs (Lots structurants).

RÈGLES D'OR DE LA CONSOLIDATION :
1. FUSION ET DÉDUPLICATION : Regroupe les micro-sujets connexes par grand domaine d'ingénierie (Lots : LOT-01-SOUV, LOT-02-INFRA, LOT-03-TELCO, LOT-04-SECOPS, LOT-05-RESIL, etc.).
2. TRAÇABILITÉ INTÉGRALE : Chaque méta-sujet doit combiner l'ensemble des "coveredClauseRefs" de ses micro-sujets constitutifs.
3. ANCRAGE SUR LE PATRIMOINE COMMUN (KB) :
   - standard_established (L2_decomposed ou L3_retained) si résolu par nos standards existants.
   - conflict_detected ou novel_requirement (L1_dilemma) en cas d'écart ou d'inédit.
4. Rôles responsables : lead_architect, infra_expert_architect, telco_expert_architect, secops_expert_architect, data_ai_expert_architect, qa_governance_architect.
5. Graines télégraphiques : initialRetenu, initialHypothesis, initialConflict, initialQuestion.`;

	if (customDirectives && customDirectives.trim()) {
		system += `\n\nDIRECTIVES DE L'ARCHITECTE :\n${customDirectives.trim()}`;
	}

	system += `\n\nFORMAT DE SORTIE JSON STRICT :
{
  "summary": "Synthèse exécutive globale du CCTP",
  "subjects": [
    {
      "id": "SUBJ-01",
      "lotId": "LOT-01-SOUV",
      "name": "Nom clair et structurant du Méta-Sujet d'Architecture",
      "sectionRef": "§1.0",
      "coveredClauseRefs": ["§1.1", "§1.2", "§1.3"],
      "matchedKbItemIds": ["STD-SOUV-01"],
      "knowledgeAlignment": "standard_established" | "conflict_detected" | "novel_requirement",
      "alignmentRationale": "Explication courte du rapprochement avec les règles existantes",
      "initialLevel": "L1_dilemma" | "L2_decomposed" | "L3_retained",
      "waitingForRole": "lead_architect" | "infra_expert_architect" | "telco_expert_architect" | "secops_expert_architect",
      "effort": "S" | "M" | "L" | "XL",
      "seed": {
        "initialRetenu": ["Exigences ou clauses concrètes imposées par le client (ex: [§4.2] Latence critique < 50ms)"],
        "initialHypothesis": "Hypothèse de solution",
        "initialConflict": "Conflit éventuel",
        "initialQuestion": "Question d'amorce pour la délibération"
      }
    }
  ]
}`;

	const kbText = kbStandards
		.slice(0, 20)
		.map((k) => `[${k.id}] (${k.category}) ${k.title} : ${k.ruleOrStatement}`)
		.join('\n');

	// Protection de sécurité : si appelé avec plus de 30 micro-sujets, on borne l'échantillon
	const visibleMicros = allMicroSubjects.slice(0, 30);
	const truncationNotice = allMicroSubjects.length > 30
		? `\n\n(NOTE : Échantillon représentatif de 30 micro-sujets sur ${allMicroSubjects.length} pour respecter la fenêtre de contexte maximale)`
		: '';

	const microText = visibleMicros
		.map(
			(m, idx) => {
				const refs = m.coveredClauseRefs.length > 5
					? `${m.coveredClauseRefs.slice(0, 5).join(', ')} (+${m.coveredClauseRefs.length - 5} autres)`
					: m.coveredClauseRefs.join(', ');
				return (
					`[MICRO-${idx + 1}] (${m.lotId || 'LOT-INCONNU'}) ${m.title}\n` +
					`  Clauses : ${refs}\n` +
					(m.criticalPoints && m.criticalPoints.length ? `  Points critiques : ${m.criticalPoints.slice(0, 3).join(' ; ')}\n` : '') +
					`  Hypothèse : ${m.keyDilemmaOrHypothesis.slice(0, 180)}`
				);
			}
		)
		.join('\n\n');

	const user = `PATRIMOINE COMMUN (STANDARDS EN LECTURE SEULE) :
${kbText}

---

INVENTAIRE DES MICRO-SUJETS DÉTECTÉS SUR LE CCTP :
${microText}${truncationNotice}

Consolide ces micro-sujets en ${targetDesc} méta-sujets d'architecture majeurs au format JSON demandé.`;

	return { system, user };
}

/**
 * Exécute la factorisation hiérarchique Map-Reduce en 2 passes (Proposition C)
 */
export async function factorizeRfpMapReduce(
	request: RfpFactorizationRequest,
	kbStandards: KbItemSummary[] = []
): Promise<RfpFactorizationResponse> {
	const clauses = request.clauses || [];
	const model = request.model || 'ministral:latest';
	const totalClauses = clauses.length;
	const chunks = partitionClausesIntoMapChunks(clauses);
	const targetDesc = inferTargetSubjectsCount(totalClauses);

	console.log(`🔄 [Map-Reduce] Début de la passe MAP : ${totalClauses} clauses découpées en ${chunks.length} blocs (chacun <= ${MAX_MAP_CHUNK_CHARS} caractères).`);

	const allMicroSubjects: MicroArchitecturalSubject[] = [];

	// ─── PASSE 1 : MAP (Détection exhaustive des micro-sujets) ─────────────────
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const mapPrompt = buildMapPrompt(chunk, i, chunks.length);

		try {
			const rawContent = await localLlmClient.chat({
				model,
				messages: [
					{ role: 'system', content: mapPrompt.system },
					{ role: 'user', content: mapPrompt.user }
				],
				format: 'json',
				temperature: 0.15,
				timeoutMs: 180000,
				maxTokens: 2048
			});

			const parsed = safeParseJson(rawContent);

			if (parsed && Array.isArray(parsed.microSubjects) && parsed.microSubjects.length > 0) {
				for (const m of parsed.microSubjects) {
					allMicroSubjects.push({
						id: m.id || `MICRO-${allMicroSubjects.length + 1}`,
						title: m.title || `Micro-sujet ${allMicroSubjects.length + 1}`,
						lotId: m.lotId || inferLotFromRef(m.title),
						coveredClauseRefs: Array.isArray(m.coveredClauseRefs) && m.coveredClauseRefs.length > 0
							? m.coveredClauseRefs
							: chunk.map((c) => c.clauseRef),
						criticalPoints: Array.isArray(m.criticalPoints) ? m.criticalPoints : [],
						keyDilemmaOrHypothesis: m.keyDilemmaOrHypothesis || 'Hypothèse technique à instruire'
					});
				}
			} else {
				allMicroSubjects.push({
					id: `MICRO-${allMicroSubjects.length + 1}`,
					title: `Bloc ${i + 1} : ${chunk[0]?.title || 'Exigences'}`,
					lotId: inferLotFromRef(chunk[0]?.clauseRef || ''),
					coveredClauseRefs: chunk.map((c) => c.clauseRef),
					criticalPoints: chunk.filter((c) => c.criticality === 'bloquant').map((c) => c.title),
					keyDilemmaOrHypothesis: 'Analyse préliminaire du lot'
				});
			}
		} catch (chunkErr) {
			const errMsg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
			console.warn(`⚠️ [Map-Reduce] Erreur sur le bloc ${i + 1}, conservation des clauses :`, errMsg);
			allMicroSubjects.push({
				id: `MICRO-${allMicroSubjects.length + 1}`,
				title: `Bloc ${i + 1} (${chunk.length} exigences : ${chunk[0]?.title || 'Architecture'})`,
				lotId: inferLotFromRef(chunk[0]?.clauseRef || chunk[0]?.title || ''),
				coveredClauseRefs: chunk.map((c) => c.clauseRef),
				criticalPoints: chunk.filter((c) => c.criticality === 'bloquant').map((c) => c.title),
				keyDilemmaOrHypothesis: `Instruction spécifique du bloc : ${errMsg.slice(0, 100)}`
			});
		}
	}

	console.log(`🔄 [Map-Reduce] Fin de la passe MAP : ${allMicroSubjects.length} micro-sujets extraits. Démarrage de la passe REDUCE...`);

	// ─── PASSE 2 : REDUCE (Consolidation en Méta-Sujets d'Architecture) ────────
	let subjects: FactorizedArchitecturalSubject[] = [];
	let reduceSummary = '';

	if (allMicroSubjects.length <= MAX_REDUCE_BATCH_MICRO_SUBJECTS) {
		// Petit corpus de micro-sujets (<= 20) : réduction directe en une seule passe
		const reducePrompt = buildReducePrompt(
			allMicroSubjects,
			kbStandards,
			targetDesc,
			request.customPromptDirectives
		);

		const rawReduce = await localLlmClient.chat({
			model,
			messages: [
				{ role: 'system', content: reducePrompt.system },
				{ role: 'user', content: reducePrompt.user }
			],
			format: 'json',
			temperature: 0.15,
			timeoutMs: 180000,
			maxTokens: 2048
		});

		const parsedReduce = safeParseJson(rawReduce);

		if (!parsedReduce || !Array.isArray(parsedReduce.subjects)) {
			throw new Error('Réponse de consolidation Reduce invalide : propriété "subjects" manquante');
		}

		reduceSummary = parsedReduce.summary || '';
		subjects = parsedReduce.subjects.map((s: any, idx: number) => {
			const coveredRefs = Array.isArray(s.coveredClauseRefs) ? s.coveredClauseRefs : [];
			const resolved = resolveClientClausesForSubject(
				coveredRefs,
				clauses,
				Array.isArray(s.seed?.initialRetenu) ? s.seed.initialRetenu : []
			);
			const matchedKb = Array.isArray(s.matchedKbItemIds) ? [...s.matchedKbItemIds] : [];
			for (const adr of resolved.adrDecisions) {
				if (!matchedKb.includes(adr)) matchedKb.push(adr);
			}

			return {
				id: s.id || `SUBJ-${String(idx + 1).padStart(2, '0')}`,
				lotId: s.lotId || inferLotFromRef(s.sectionRef || s.name),
				name: s.name || `Sujet d'Architecture ${idx + 1}`,
				sectionRef: s.sectionRef || `§${idx + 1}.0`,
				coveredClauseRefs: coveredRefs,
				matchedKbItemIds: matchedKb,
				knowledgeAlignment: normalizeAlignment(s.knowledgeAlignment),
				alignmentRationale: s.alignmentRationale || 'Consolidation issue de l’analyse exhaustive Map-Reduce',
				initialLevel: normalizeLevel(s.initialLevel),
				waitingForRole: normalizeRole(s.waitingForRole),
				effort: s.effort === 'XL' || s.effort === 'L' || s.effort === 'S' ? s.effort : 'M',
				seed: {
					initialRetenu: resolved.clientClauses,
					initialHypothesis: s.seed?.initialHypothesis || `Conception architecturale pour ${s.name}`,
					initialConflict: s.seed?.initialConflict || undefined,
					initialQuestion: s.seed?.initialQuestion || `Comment concilier les exigences pour ${s.name} ?`
				}
			};
		});
	} else {
		// Corpus massif (> 20 micro-sujets, typiquement plusieurs centaines) :
		// Réduction hiérarchique partitionnée par lot pour respecter rigoureusement la fenêtre de contexte de 8192 tokens
		console.log(
			`🔄 [Map-Reduce] Consolidation hiérarchique : ${allMicroSubjects.length} micro-sujets découpés par lots techniques et sous-tranches bornées (<= ${MAX_REDUCE_BATCH_MICRO_SUBJECTS} micro-sujets).`
		);

		const reduceBatches = partitionMicroSubjectsForReduce(allMicroSubjects);
		console.log(`🔄 [Map-Reduce] ${reduceBatches.length} sous-lots de réduction à traiter.`);

		for (let bIdx = 0; bIdx < reduceBatches.length; bIdx++) {
			const batchInfo = reduceBatches[bIdx];
			const targetCountForBatch = batchInfo.subjects.length <= 8 ? '1 à 2' : '2 à 3';
			const batchPrompt = buildBatchReducePrompt(
				batchInfo.subjects,
				kbStandards,
				batchInfo.lotId,
				targetCountForBatch,
				request.customPromptDirectives
			);

			// Map des micro-sujets du batch pour héritage automatique des clauses
			const batchMicroMap = new Map<string, MicroArchitecturalSubject>();
			for (const m of batchInfo.subjects) {
				batchMicroMap.set(m.id, m);
			}
			const handledMicroIds = new Set<string>();

			try {
				const rawBatch = await localLlmClient.chat({
					model,
					messages: [
						{ role: 'system', content: batchPrompt.system },
						{ role: 'user', content: batchPrompt.user }
					],
					format: 'json',
					temperature: 0.15,
					timeoutMs: 180000,
					maxTokens: 4096
				});

				const parsedBatch = safeParseJson(rawBatch);
				const batchSubjectsList: any[] = Array.isArray(parsedBatch?.subjects) ? parsedBatch.subjects : [];

				if (batchSubjectsList.length > 0) {
					for (let sIdx = 0; sIdx < batchSubjectsList.length; sIdx++) {
						const s = batchSubjectsList[sIdx];
						const subClauses = new Set<string>(Array.isArray(s.coveredClauseRefs) ? s.coveredClauseRefs : []);

						// Résolution des clauses via coveredMicroIds
						const coveredMicros = Array.isArray(s.coveredMicroIds) ? s.coveredMicroIds : [];
						for (const mid of coveredMicros) {
							const foundMicro = batchMicroMap.get(mid);
							if (foundMicro) {
								handledMicroIds.add(mid);
								for (const cr of foundMicro.coveredClauseRefs) {
									subClauses.add(cr);
								}
							}
						}

						const subjectName = s.name || s.title || `Sujet ${batchInfo.lotId} - ${sIdx + 1}`;
						const coveredRefs = Array.from(subClauses);
						const resolved = resolveClientClausesForSubject(
							coveredRefs,
							clauses,
							Array.isArray(s.seed?.initialRetenu) ? s.seed.initialRetenu : []
						);
						const matchedKb = Array.isArray(s.matchedKbItemIds) ? [...s.matchedKbItemIds] : [];
						for (const adr of resolved.adrDecisions) {
							if (!matchedKb.includes(adr)) matchedKb.push(adr);
						}

						subjects.push({
							id: `SUBJ-${String(subjects.length + 1).padStart(2, '0')}`,
							lotId: s.lotId || batchInfo.lotId,
							name: subjectName,
							sectionRef: s.sectionRef || `§${subjects.length + 1}.0`,
							coveredClauseRefs: coveredRefs,
							matchedKbItemIds: matchedKb,
							knowledgeAlignment: normalizeAlignment(s.knowledgeAlignment),
							alignmentRationale: s.alignmentRationale || `Consolidation issue du lot ${batchInfo.lotId}`,
							initialLevel: normalizeLevel(s.initialLevel),
							waitingForRole: normalizeRole(s.waitingForRole),
							effort: s.effort === 'XL' || s.effort === 'L' || s.effort === 'S' ? s.effort : 'M',
							seed: {
								initialRetenu: resolved.clientClauses,
								initialHypothesis: s.seed?.initialHypothesis || `Conception architecturale pour ${subjectName}`,
								initialConflict: s.seed?.initialConflict || undefined,
								initialQuestion: s.seed?.initialQuestion || `Comment concilier les exigences pour ${batchInfo.lotId} ?`
							}
						});
					}

					// Rattrapage des micro-sujets non cités du batch vers le premier sujet généré du lot
					const unhandledMicros = batchInfo.subjects.filter((m) => !handledMicroIds.has(m.id));
					if (unhandledMicros.length > 0 && subjects.length > 0) {
						const targetSubject = subjects[subjects.length - batchSubjectsList.length];
						if (targetSubject) {
							for (const uh of unhandledMicros) {
								for (const cr of uh.coveredClauseRefs) {
									if (!targetSubject.coveredClauseRefs.includes(cr)) {
										targetSubject.coveredClauseRefs.push(cr);
									}
								}
							}
						}
					}
				} else {
					throw new Error(`Aucun sujet retourné par le LLM pour le sous-lot ${batchInfo.lotId}`);
				}
			} catch (batchErr) {
				const errMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
				console.warn(`⚠️ [Reduce] Erreur sur le sous-lot ${bIdx + 1}/${reduceBatches.length} (${batchInfo.lotId}), repli local :`, errMsg);
				// Synthèse de secours pour ce sous-lot particulier sans faire échouer les autres lots
				const fallbackClauses = Array.from(new Set(batchInfo.subjects.flatMap((m) => m.coveredClauseRefs)));
				subjects.push({
					id: `SUBJ-${String(subjects.length + 1).padStart(2, '0')}`,
					lotId: batchInfo.lotId,
					name: `Socle ${batchInfo.lotId} : ${batchInfo.subjects[0]?.title || 'Exigences consolidées'}`,
					sectionRef: `§${subjects.length + 1}.0`,
					coveredClauseRefs: fallbackClauses,
					matchedKbItemIds: [],
					knowledgeAlignment: 'standard_established',
					alignmentRationale: `Consolidation de repli pour ${batchInfo.subjects.length} micro-sujets (${batchInfo.lotId})`,
					initialLevel: 'L2_decomposed',
					waitingForRole: 'infra_expert_architect',
					effort: 'M',
					seed: {
						initialRetenu: [`Consolidation de ${batchInfo.subjects.length} micro-sujets`],
						initialHypothesis: batchInfo.subjects[0]?.keyDilemmaOrHypothesis || `Hypothèse pour ${batchInfo.lotId}`,
						initialQuestion: `Quels arbitrages pour le lot ${batchInfo.lotId} ?`
					}
				});
			}
		}

		// Réindexation séquentielle propre des sujets finaux
		subjects.forEach((s, idx) => {
			s.id = `SUBJ-${String(idx + 1).padStart(2, '0')}`;
			s.sectionRef = `§${idx + 1}.0`;
		});

		reduceSummary = `Factorisation hiérarchique Map-Reduce : ${totalClauses} exigences analysées en ${chunks.length} blocs, ${allMicroSubjects.length} micro-sujets consolidés en ${subjects.length} méta-sujets structurants.`;
	}

	// Traçabilité et calcul de couverture
	const coveredSet = new Set<string>();
	for (const s of subjects) {
		for (const ref of s.coveredClauseRefs) {
			coveredSet.add(ref);
		}
	}

	// Rattrapage de traçabilité : toute clause issue des micro-sujets non citée est rattachée à son lot
	const unassignedClauses = clauses.filter((c) => !coveredSet.has(c.clauseRef));
	if (unassignedClauses.length > 0 && subjects.length > 0) {
		for (const orphan of unassignedClauses) {
			const orphanLot = inferLotFromRef(orphan.clauseRef || orphan.title);
			const matchingSubject = subjects.find((s) => s.lotId === orphanLot) || subjects[0];
			matchingSubject.coveredClauseRefs.push(orphan.clauseRef);
			coveredSet.add(orphan.clauseRef);
		}
	}

	const finalUnassigned = clauses.filter((c) => !coveredSet.has(c.clauseRef));
	const coveredClausesCount = totalClauses - finalUnassigned.length;
	const coverageRate = Math.round((coveredClausesCount / totalClauses) * 100);

	console.log(`✅ [Map-Reduce] Factorisation terminée : ${subjects.length} méta-sujets générés avec ${coverageRate}% de couverture.`);

	return {
		status: 'ok',
		engine: 'map-reduce-llm',
		modelUsed: model,
		summary: reduceSummary || `Factorisation hiérarchique Map-Reduce (100% Verbatim) : ${totalClauses} exigences analysées en ${chunks.length} blocs, ${allMicroSubjects.length} micro-sujets consolidés en ${subjects.length} méta-sujets structurants.`,
		totalClauses,
		coveredClausesCount,
		coverageRate,
		subjects,
		unassignedClauses: finalUnassigned,
		wasCondensed: false
	};
}

/**
 * Exécute la factorisation par LLM local souverain
 */
export async function factorizeRfpWithLocalLlm(
	request: RfpFactorizationRequest,
	kbStandards: KbItemSummary[] = []
): Promise<RfpFactorizationResponse> {
	const clauses = request.clauses || [];
	const model = request.model || localLlmClient.getDefaultModel();
	const totalClauses = clauses.length;
	const engine = model.toLowerCase().startsWith('claude') ? 'anthropic-claude' : 'local-llm';

	if (totalClauses === 0) {
		return {
			status: 'ok',
			engine,
			modelUsed: model,
			summary: 'Aucune clause à factoriser.',
			totalClauses: 0,
			coveredClausesCount: 0,
			coverageRate: 100,
			subjects: [],
			unassignedClauses: []
		};
	}

	// Pour les corpus volumineux (> 40 exigences), exécute la passe Map-Reduce hiérarchique exhaustive
	if (totalClauses > 40) {
		try {
			return await factorizeRfpMapReduce(request, kbStandards);
		} catch (err: unknown) {
			const rawErr = err instanceof Error ? err.message : String(err);
			console.warn('⚠️ Échec de la factorisation Map-Reduce, bascule vers moteur heuristique déterministe :', err);
			const fallback = fallbackDeterministicFactorization(clauses, kbStandards, `Échec Map-Reduce : ${rawErr.slice(0, 160)}`);
			return {
				...fallback,
				errorDetail: rawErr,
				wasCondensed: false
			};
		}
	}

	const isCondensed = shouldCondenseClauses(clauses);
	const targetDesc = inferTargetSubjectsCount(clauses.length);

	try {
		const systemPrompt = buildSystemPrompt(request.customPromptDirectives, targetDesc);
		const userMessage = buildUserMessage(clauses, kbStandards, {
			condense: isCondensed,
			targetCountDesc: targetDesc
		});

		const rawContent = await localLlmClient.chat({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			format: 'json',
			temperature: 0.15
		});

		// Nettoyage et parsing JSON résilient avec réparation de troncature
		const parsed = safeParseJson(rawContent);

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
			engine,
			modelUsed: model,
			summary: parsed.summary || `Factorisation sémantique réalisée avec succès via ${model}`,
			totalClauses,
			coveredClausesCount,
			coverageRate,
			subjects,
			unassignedClauses,
			wasCondensed: isCondensed
		};
	} catch (err: unknown) {
		const rawErr = err instanceof Error ? err.message : String(err);
		let cleanWarning = 'Serveur LLM local non disponible, factorisation déterministe appliquée.';
		if (rawErr.includes('exceeds the available context size') || rawErr.includes('exceed_context_size_error')) {
			cleanWarning = `Le volume du document dépasse la fenêtre de contexte maximale du modèle (${rawErr.slice(0, 180)}).`;
		} else if (rawErr.includes('400 Bad Request')) {
			cleanWarning = `Erreur de requête LLM local (400 Bad Request) : ${rawErr.slice(0, 180)}.`;
		} else if (rawErr.includes('Injoignable') || rawErr.includes('ECONNREFUSED')) {
			cleanWarning = `Serveur LLM local (${model}) injoignable sur ${process.env.LLM_LOCAL_ENDPOINT || 'http://localhost:11434'}.`;
		} else {
			cleanWarning = `Échec LLM : ${rawErr.slice(0, 140)}.`;
		}
		console.warn('⚠️ Échec de factorisation par LLM local souverain, bascule vers moteur heuristique déterministe :', err);
		const fallback = fallbackDeterministicFactorization(clauses, kbStandards, cleanWarning);
		return {
			...fallback,
			errorDetail: rawErr,
			wasCondensed: isCondensed
		};
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
export function cleanJsonString(str: string): string {
	let cleaned = (str || '').trim();

	// Supprime les balises markdown ```json ... ``` complètes ou ouvertes
	const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
	if (fencedMatch && fencedMatch[1]) {
		cleaned = fencedMatch[1].trim();
	} else {
		cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
	}

	// Élimine le texte préfixe éventuel avant le premier '{' ou '['
	const firstBrace = cleaned.indexOf('{');
	const firstBracket = cleaned.indexOf('[');
	const startIdx = firstBrace >= 0 && firstBracket >= 0
		? Math.min(firstBrace, firstBracket)
		: firstBrace >= 0
			? firstBrace
			: firstBracket;

	if (startIdx > 0) {
		cleaned = cleaned.slice(startIdx).trim();
	}

	return cleaned;
}

/**
 * Répare un JSON tronqué en nettoyant chirurgicalement la fin (virgules, clés pendantes)
 * et en fermant les délimiteurs { et [ dans l'ordre inverse
 */
export function repairTruncatedJson(str: string): string {
	let trimmed = str.trim();

	// 1. Détermine si on termine à l'intérieur d'une string non fermée
	let inString = false;
	let isEscaped = false;
	let lastQuoteIdx = -1;
	let lastColonIdx = -1;

	for (let i = 0; i < trimmed.length; i++) {
		const char = trimmed[i];
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (char === '\\') {
			isEscaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			lastQuoteIdx = i;
			continue;
		}
		if (!inString && char === ':') {
			lastColonIdx = i;
		}
	}

	// Si on est resté dans une string non fermée
	if (inString) {
		// Est-ce que cette string était une valeur (après un deux-points ':') ?
		if (lastColonIdx > -1 && lastQuoteIdx > lastColonIdx) {
			trimmed += '"';
		} else {
			// Clé non terminée sans deux-points : couper avant cette clé et la virgule précédente
			const beforeQuote = trimmed.slice(0, lastQuoteIdx).trimEnd();
			if (beforeQuote.endsWith(',')) {
				trimmed = beforeQuote.slice(0, -1).trimEnd();
			} else {
				trimmed = beforeQuote;
			}
		}
	}

	// 2. Nettoyage de la fin de chaîne (enlever virgules traînantes, clés pendantes, deux-points orphelins)
	let cleaned = trimmed;
	let changed = true;
	while (changed) {
		changed = false;
		cleaned = cleaned.trimEnd();

		// Enlève toute virgule traînante
		if (cleaned.endsWith(',')) {
			cleaned = cleaned.slice(0, -1);
			changed = true;
			continue;
		}

		// Enlève une clé pendante "cle":
		const trailingKeyColon = cleaned.match(/,\s*"[^"]*"\s*:\s*$/);
		if (trailingKeyColon) {
			cleaned = cleaned.slice(0, -trailingKeyColon[0].length);
			changed = true;
			continue;
		}

		// Enlève un deux-points seul
		if (cleaned.endsWith(':')) {
			cleaned = cleaned.slice(0, -1).trimEnd();
			changed = true;
			continue;
		}
	}

	// 3. Calcul de la pile des délimiteurs ouverts
	const stack: ('{' | '[')[] = [];
	inString = false;
	isEscaped = false;

	for (let i = 0; i < cleaned.length; i++) {
		const char = cleaned[i];
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (char === '\\') {
			isEscaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (!inString) {
			if (char === '{' || char === '[') {
				stack.push(char);
			} else if (char === '}') {
				if (stack.length > 0 && stack[stack.length - 1] === '{') {
					stack.pop();
				}
			} else if (char === ']') {
				if (stack.length > 0 && stack[stack.length - 1] === '[') {
					stack.pop();
				}
			}
		}
	}

	// 4. Ferme dans l'ordre inverse exact de la pile d'ouverture
	let repaired = cleaned;
	while (stack.length > 0) {
		const expected = stack.pop();
		repaired += expected === '{' ? '}' : ']';
	}

	return repaired;
}

/**
 * Scanne et extrait tous les objets individuels complets et valides (avec id et nom/titre)
 */
export function extractCompleteObjects(str: string): any[] {
	const objects: any[] = [];
	let depth = 0;
	let startIdx = -1;
	let inString = false;
	let isEscaped = false;

	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (char === '\\') {
			isEscaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (!inString) {
			if (char === '{') {
				depth++;
				if (depth === 2 || depth === 1) {
					startIdx = i;
				}
			} else if (char === '}') {
				if (startIdx >= 0 && (depth === 2 || depth === 1)) {
					const candidate = str.slice(startIdx, i + 1);
					try {
						const parsed = JSON.parse(candidate);
						if (parsed && typeof parsed === 'object' && parsed.id && (parsed.name || parsed.title)) {
							objects.push(parsed);
						}
					} catch {
						// Ignorer les blocs invalides
					}
					startIdx = -1;
				}
				depth--;
			}
		}
	}
	return objects;
}

/**
 * Tente un parsing JSON standard, puis applique des réparations heuristiques en cas de troncature
 */
export function safeParseJson(raw: string): any {
	const cleaned = cleanJsonString(raw);
	try {
		return JSON.parse(cleaned);
	} catch {
		// Tentative 1 : réparation via la pile de délimiteurs et nettoyage des fins de chaîne
		try {
			const repaired = repairTruncatedJson(cleaned);
			return JSON.parse(repaired);
		} catch {
			// Tentative 2 : extraction des objets JSON individuels complets
			const extracted = extractCompleteObjects(cleaned);
			if (extracted.length > 0) {
				const hasName = extracted.some((item) => item.name);
				if (hasName) {
					return { subjects: extracted };
				}
				return { microSubjects: extracted };
			}

			// Tentative 3 : extraction par regex des paires { "id": "...", "name"|"title": "..." }
			const idNameMatches = [...cleaned.matchAll(/\{\s*"id"\s*:\s*"([^"]+)"[\s\S]*?(?:"name"|"title")\s*:\s*"([^"]+)"/g)];
			if (idNameMatches.length > 0) {
				const isSubjectPass = cleaned.includes('"subjects"');
				if (isSubjectPass) {
					return {
						subjects: idNameMatches.map((m) => ({
							id: m[1],
							name: m[2],
							lotId: inferLotFromRef(m[2]),
							coveredClauseRefs: [],
							matchedKbItemIds: [],
							knowledgeAlignment: 'standard_established',
							initialLevel: 'L2_decomposed',
							waitingForRole: 'infra_expert_architect',
							effort: 'M',
							seed: {
								initialRetenu: [],
								initialHypothesis: m[2],
								initialQuestion: `Comment concevoir la réponse pour ${m[2]} ?`
							}
						}))
					};
				} else {
					return {
						microSubjects: idNameMatches.map((m) => ({
							id: m[1],
							title: m[2],
							lotId: inferLotFromRef(m[2]),
							coveredClauseRefs: [],
							criticalPoints: [],
							keyDilemmaOrHypothesis: 'Extraction réparée suite à troncature'
						}))
					};
				}
			}

			throw new Error(`Réponse JSON invalide du modèle local : ${raw.slice(0, 160)}`);
		}
	}
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
