/**
 * Service d'interrogation rapide (Quick-Ask) des exigences d'un projet.
 *
 * Stratégie :
 *  - Mode A (Full-Context + Prompt Caching) : sérialise de façon déterministe toutes les exigences
 *    du projet dans un bloc système cacheable (`cacheable: true`) afin que plusieurs architectes
 *    interrogeant le même dossier partagent le préfixe en cache.
 *  - Mode B (Filtré) : lorsque le corpus dépasse le budget de contexte du modèle actif, applique un
 *    pré-filtrage hybride (lexical + sémantique optionnel) et l'indique explicitement dans les `caveats`.
 *  - Garde-fou anti-hallucination : toute référence `clauseRef` citée par le modèle est vérifiée
 *    contre la base réelle avant renvoi au client.
 */

import { prisma } from '$lib/server/prisma';
import { listRequirementSources } from '$lib/server/projects/requirementsDb';
import { effectiveRequirementState, requirementBundleId } from '$lib/domain/requirementAudit';
import {
	buildCanonicalRequirementsContext,
	QuickAskLlmRawResponseSchema,
	reconcileQuickAskCitations,
	selectRelevantRequirements,
	type QuickAskRequest,
	type QuickAskRequirementItem,
	type QuickAskResponsePayload
} from '$lib/domain/requirementsQa';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { cleanJsonString, isGrandContextModel } from '$lib/server/llm/rfpFactorizer';
import type { ChatMessage, ChatOptions } from '$lib/server/llm/types';
import { configuredModel, resolveEncoder } from '$lib/server/similarity/encoder';
import { DEFAULT_SIMILARITY_MODEL } from '$lib/server/similarity/embeddings';

export interface RequirementsQaLlmPort {
	getDefaultModel(): string;
	chat(options: ChatOptions): Promise<string>;
}

export interface AskProjectRequirementsOptions extends QuickAskRequest {
	llm?: RequirementsQaLlmPort;
	maxCharsOverride?: number;
}

const DEFAULT_LOCAL_MAX_CHARS = 48_000;
const DEFAULT_LARGE_MAX_CHARS = 450_000;

const SYSTEM_INSTRUCTIONS = `Tu es l'assistant d'analyse documentaire d'Archinex. Tu aides les architectes à vérifier ce qu'imposent ou non les exigences d'un appel d'offres (RFP/CCTP).

Règles strictes :
1. Base ta réponse EXCLUSIVEMENT sur les exigences listées dans le dossier ci-dessous. N'invente jamais une contrainte ni une référence de clause.
2. Pour chaque affirmation, cite précisément le \`clauseRef\` exact entre crochets (ex. [REQ-12]) et place-le dans \`citations\`.
3. Cherche aussi les formulations implicites ou synonymes techniques (ex. pour "3 DC" : "tri-site", "3 zones de disponibilité", "N+2", "3 sites distants").
4. Distingue les statuts dans \`verdict\` :
   - "imposed" : explicitement exigé par au moins une clause non ambiguë.
   - "partial_or_implicit" : suggéré, conditionnel, formulé indirectement ou dépendant d'une clause \`clarification_needed\` / \`to_qualify\`.
   - "not_found" : aucune clause du dossier fourni ne mentionne cette contrainte.
   - "contradictory" : des clauses se contredisent ou une clause est évacuée alors qu'une autre l'exige.
5. Signale dans \`caveats\` toute clause pertinente qui est encore \`clarification_needed\`, \`to_qualify\` ou \`evacuated\`.
6. Sois concis, factuel, en français, sans formule de politesse.

Réponds EXCLUSIVEMENT avec un objet JSON conforme à ce schéma :
{
  "verdict": "imposed" | "partial_or_implicit" | "not_found" | "contradictory",
  "answer": "Réponse synthétique citant les [clauseRef] pertinents.",
  "caveats": ["Point d'attention ou ambiguïté éventuelle"],
  "citations": [{ "clauseRef": "REQ-12", "excerpt": "Court extrait verbatim" }]
}`;

function safeParseStringArray(raw: string | null | undefined): string[] {
	try {
		const parsed = JSON.parse(raw || '[]');
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

function resolveContextBudgetChars(model: string, override?: number): number {
	if (override && override > 0) return override;
	const fromEnv = Number(process.env.REQUIREMENTS_QA_MAX_CHARS);
	if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
	return isGrandContextModel(model) ? DEFAULT_LARGE_MAX_CHARS : DEFAULT_LOCAL_MAX_CHARS;
}

function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length === 0 || a.length !== b.length) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb);
	return denom > 0 ? dot / denom : 0;
}

async function tryComputeSemanticScores(
	items: readonly QuickAskRequirementItem[],
	question: string
): Promise<Map<string, number> | undefined> {
	const modelName = configuredModel();
	if (!modelName || modelName === DEFAULT_SIMILARITY_MODEL) return undefined;

	try {
		const encoder = resolveEncoder(modelName);
		const qVec = await encoder.encode(question);
		const scores = new Map<string, number>();
		for (const item of items) {
			const iVec = await encoder.encode(`${item.title}\n${item.text}`);
			scores.set(item.bundleId, cosineSimilarity(qVec, iVec));
		}
		return scores;
	} catch {
		return undefined;
	}
}

export async function loadProjectRequirementItems(
	projectId: string,
	includeEvacuated: boolean
): Promise<QuickAskRequirementItem[]> {
	const [sources, subjects] = await Promise.all([
		listRequirementSources(projectId),
		prisma.subject.findMany({ where: { projectId }, select: { id: true, requirementRefs: true } })
	]);

	const subjectsByReq = new Map<string, string[]>();
	for (const s of subjects) {
		for (const ref of safeParseStringArray(s.requirementRefs)) {
			const list = subjectsByReq.get(ref) ?? [];
			list.push(s.id);
			subjectsByReq.set(ref, list);
		}
	}

	const items: QuickAskRequirementItem[] = [];
	for (const source of sources) {
		for (const req of source.requirements) {
			const state = effectiveRequirementState(req);
			if (!includeEvacuated && state.disposition === 'evacuated') continue;

			const bundleId = requirementBundleId(source.sha256, req.clauseRef);
			const criticality =
				req.criticality === 'bloquant' || req.criticality === 'majeur' ? req.criticality : 'info';

			items.push({
				clauseRef: req.clauseRef,
				bundleId,
				sourceTitle: source.title,
				sourceSha256: source.sha256,
				position: req.position,
				title: req.title,
				text: req.text,
				criticality,
				category: req.category,
				effectiveDisposition: state.disposition,
				clarificationQuestion: state.clarificationQuestion ?? null,
				linkedSubjectIds: subjectsByReq.get(bundleId) ?? []
			});
		}
	}

	return items;
}

export async function askProjectRequirements(
	projectId: string,
	options: AskProjectRequirementsOptions
): Promise<QuickAskResponsePayload> {
	const items = await loadProjectRequirementItems(projectId, options.includeEvacuated ?? true);
	if (items.length === 0) {
		throw new Error("NO_REQUIREMENTS: Aucune exigence enregistrée pour ce projet. Importez ou réparez le dossier d'exigences en Phase 1.");
	}

	const llm = options.llm ?? localLlmClient;
	const targetModel = options.model || llm.getDefaultModel();
	const maxChars = resolveContextBudgetChars(targetModel, options.maxCharsOverride);

	const fullContext = buildCanonicalRequirementsContext(items);
	let mode: 'full_context' | 'filtered' = 'full_context';
	let evaluatedItems = fullContext.sortedItems;
	let corpusText = fullContext.corpusText;
	let cacheHint = fullContext.cacheHint;
	const extraCaveats: string[] = [];

	if (corpusText.length > maxChars) {
		mode = 'filtered';
		const semanticScores = await tryComputeSemanticScores(fullContext.sortedItems, options.question);
		evaluatedItems = selectRelevantRequirements(
			fullContext.sortedItems,
			options.question,
			maxChars,
			semanticScores
		);
		const filteredContext = buildCanonicalRequirementsContext(evaluatedItems);
		corpusText = filteredContext.corpusText;
		cacheHint = filteredContext.cacheHint;
		extraCaveats.push(
			`Analyse restreinte aux ${evaluatedItems.length} exigences les plus pertinentes sur ${items.length} (budget de contexte du modèle ${targetModel || 'local'} atteint).`
		);
	}

	const messages: ChatMessage[] = [
		{
			role: 'system',
			content: `${SYSTEM_INSTRUCTIONS}\n\n=== DOSSIER D'EXIGENCES DU PROJET (${evaluatedItems.length} clauses) ===\n${corpusText}`,
			cacheable: mode === 'full_context'
		}
	];

	for (const turn of options.history ?? []) {
		messages.push({ role: turn.role, content: turn.content });
	}
	messages.push({ role: 'user', content: options.question });

	const rawText = await llm.chat({
		model: options.model,
		messages,
		format: 'json',
		temperature: 0.1,
		effort: 'low',
		maxTokens: 2048
	});

	let parsed = QuickAskLlmRawResponseSchema.safeParse(tryParseJson(rawText));
	if (!parsed.success) {
		return {
			status: 'ok',
			verdict: 'partial_or_implicit',
			answer: rawText.trim(),
			caveats: [
				...extraCaveats,
				'Réponse brute du modèle (format structuré non respecté) : vérifiez les références dans le dossier.'
			],
			citations: [],
			meta: {
				mode,
				totalRequirements: items.length,
				evaluatedRequirements: evaluatedItems.length,
				model: targetModel || 'local',
				cacheHint
			}
		};
	}

	const { citations, droppedRefs } = reconcileQuickAskCitations(parsed.data.citations, evaluatedItems);
	const caveats = [...extraCaveats, ...parsed.data.caveats];
	if (droppedRefs.length > 0) {
		caveats.push(
			`${droppedRefs.length} référence(s) non vérifiable(s) écartée(s) automatiquement (${droppedRefs.join(', ')}).`
		);
	}

	return {
		status: 'ok',
		verdict: parsed.data.verdict,
		answer: parsed.data.answer,
		caveats,
		citations,
		meta: {
			mode,
			totalRequirements: items.length,
			evaluatedRequirements: evaluatedItems.length,
			model: targetModel || 'local',
			cacheHint
		}
	};
}

function tryParseJson(raw: string): unknown {
	try {
		return JSON.parse(cleanJsonString(raw));
	} catch {
		return null;
	}
}
