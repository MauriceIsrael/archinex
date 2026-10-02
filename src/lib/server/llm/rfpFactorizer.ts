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
				const crit = c.criticality && c.criticality !== 'standard' ? ` (criticité: ${c.criticality})` : '';
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

/**
 * Découpe les clauses en macro-blocs pour la passe MAP
 * Si param <= 12, représente maxChunks (défaut: 6 blocs max pour garantir un temps d'exécution sous les 2-3 minutes).
 * Si param > 12, représente maxChunkSize (compatibilité tests).
 */
export function partitionClausesIntoMapChunks(clauses: ExtractedClause[], maxChunksOrSize: number = 6): ExtractedClause[][] {
	if (clauses.length <= 40) {
		return [clauses];
	}

	const targetChunkSize = maxChunksOrSize <= 12
		? Math.max(40, Math.ceil(clauses.length / maxChunksOrSize))
		: maxChunksOrSize;

	const maxCharsPerChunk = 50000; // ~12 000 tokens maximum par bloc pour ne jamais saturer 32k ctx

	const sections: Record<string, ExtractedClause[]> = {};
	for (const c of clauses) {
		const prefixMatch = c.clauseRef.match(/^(?:§|art(?:icle)?\.?\s*)(\d+)/i);
		const secKey = prefixMatch ? `sec_${prefixMatch[1]}` : 'sec_general';
		if (!sections[secKey]) sections[secKey] = [];
		sections[secKey].push(c);
	}

	const chunks: ExtractedClause[][] = [];
	let currentChunk: ExtractedClause[] = [];
	let currentChars = 0;

	for (const secClauses of Object.values(sections)) {
		const secChars = secClauses.reduce((acc, c) => acc + (c.text?.length || 0) + (c.title?.length || 0), 0);

		if (
			currentChunk.length + secClauses.length <= targetChunkSize &&
			currentChars + secChars <= maxCharsPerChunk
		) {
			currentChunk.push(...secClauses);
			currentChars += secChars;
		} else {
			if (currentChunk.length > 0) {
				chunks.push(currentChunk);
				currentChunk = [];
				currentChars = 0;
			}
			if (secClauses.length > targetChunkSize || secChars > maxCharsPerChunk) {
				for (let i = 0; i < secClauses.length; i += targetChunkSize) {
					chunks.push(secClauses.slice(i, i + targetChunkSize));
				}
			} else {
				currentChunk.push(...secClauses);
				currentChars += secChars;
			}
		}
	}

	if (currentChunk.length > 0) {
		chunks.push(currentChunk);
	}

	return chunks.length > 0 ? chunks : [clauses];
}

/**
 * Construit le prompt pour la passe MAP (Bloc individuel à analyser verbatim)
 */
export function buildMapPrompt(chunk: ExtractedClause[], chunkIndex: number, totalChunks: number): { system: string; user: string } {
	const system = `Tu es un Expert Architecte Système.
Ta mission est d'analyser ce lot d'exigences (Bloc ${chunkIndex + 1}/${totalChunks}) et d'en extraire les micro-sujets d'architecture distincts sans en oublier aucun.

CONSIGNES STRICTES :
1. Rapproche les exigences connexes en 3 à 6 micro-sujets majeurs pour ce bloc.
2. Pour "coveredClauseRefs", indique les 3 à 6 exigences clés ou la plage représentative (ex: ["§1.1", "§1.2", "§1.10"]). Ne répète pas mécaniquement des centaines de références.
3. Consigne chaque contrainte bloquante ou spécifique (ex: synchro GNSS, chiffrement, SecNumCloud, autonomie, latence...).

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
			const crit = c.criticality && c.criticality !== 'standard' ? ` [CRITICITÉ: ${c.criticality}]` : '';
			return `[${c.clauseRef}] ${c.title}${crit}\n${c.text || ''}`;
		})
		.join('\n\n');

	const user = `EXIGENCES DU BLOC ${chunkIndex + 1}/${totalChunks} (À ANALYSER EXHAUSTIVEMENT) :
${clausesVerbatim}

Extrais tous les micro-sujets d'architecture pour ce bloc au format JSON spécifié.`;

	return { system, user };
}

/**
 * Construit le prompt pour la passe REDUCE (Consolidation des micro-sujets en méta-sujets structurants)
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
        "initialRetenu": ["Acquis ou standard applicable"],
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

	const microText = allMicroSubjects
		.map(
			(m, idx) =>
				`[MICRO-${idx + 1}] (${m.lotId || 'LOT-INCONNU'}) ${m.title}\n` +
				`  Clauses couvertes : ${m.coveredClauseRefs.join(', ')}\n` +
				(m.criticalPoints && m.criticalPoints.length ? `  Points critiques : ${m.criticalPoints.join(' ; ')}\n` : '') +
				`  Hypothèse : ${m.keyDilemmaOrHypothesis}`
		)
		.join('\n\n');

	const user = `PATRIMOINE COMMUN (STANDARDS EN LECTURE SEULE) :
${kbText}

---

INVENTAIRE DE TOUS LES MICRO-SUJETS DÉTECTÉS SUR LE CCTP :
${microText}

Consolide l'intégralité de ces micro-sujets en ${targetDesc} méta-sujets d'architecture majeurs au format JSON demandé.`;

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

	console.log(`🔄 [Map-Reduce] Début de la passe MAP : ${totalClauses} clauses découpées en ${chunks.length} macro-blocs structurants.`);

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
				timeoutMs: 180000
			});

			const cleaned = cleanJsonString(rawContent);
			const parsed = JSON.parse(cleaned);

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
		timeoutMs: 180000
	});

	const cleanedReduce = cleanJsonString(rawReduce);
	const parsedReduce = JSON.parse(cleanedReduce);

	if (!parsedReduce || !Array.isArray(parsedReduce.subjects)) {
		throw new Error('Réponse de consolidation Reduce invalide : propriété "subjects" manquante');
	}

	const subjects: FactorizedArchitecturalSubject[] = parsedReduce.subjects.map(
		(s: any, idx: number) => ({
			id: s.id || `SUBJ-${String(idx + 1).padStart(2, '0')}`,
			lotId: s.lotId || inferLotFromRef(s.sectionRef || s.name),
			name: s.name || `Sujet d'Architecture ${idx + 1}`,
			sectionRef: s.sectionRef || `§${idx + 1}.0`,
			coveredClauseRefs: Array.isArray(s.coveredClauseRefs) ? s.coveredClauseRefs : [],
			matchedKbItemIds: Array.isArray(s.matchedKbItemIds) ? s.matchedKbItemIds : [],
			knowledgeAlignment: normalizeAlignment(s.knowledgeAlignment),
			alignmentRationale: s.alignmentRationale || 'Consolidation issue de l’analyse exhaustive Map-Reduce',
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
		summary: parsedReduce.summary || `Factorisation hiérarchique Map-Reduce (100% Verbatim) : ${totalClauses} exigences analysées en ${chunks.length} blocs, ${allMicroSubjects.length} micro-sujets consolidés en ${subjects.length} méta-sujets structurants.`,
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
