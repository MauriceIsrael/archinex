import { z } from 'zod';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';

export const QuickAskHistoryTurnSchema = z.object({
	role: z.enum(['user', 'assistant']),
	content: z.string().trim().min(1).max(4000)
});

export const QuickAskRequestSchema = z.object({
	question: z.string().trim().min(2, 'La question doit contenir au moins 2 caractères.').max(2000),
	history: z.array(QuickAskHistoryTurnSchema).max(10).optional().default([]),
	model: z.string().trim().min(1).optional(),
	includeEvacuated: z.boolean().optional().default(true)
});

export type QuickAskRequest = z.infer<typeof QuickAskRequestSchema>;

export const QuickAskVerdictSchema = z.enum([
	'imposed',
	'partial_or_implicit',
	'not_found',
	'contradictory'
]);

export type QuickAskVerdict = z.infer<typeof QuickAskVerdictSchema>;

export const QuickAskLlmCitationSchema = z.object({
	clauseRef: z.string().trim().min(1),
	excerpt: z.string().trim().max(500).optional().default('')
});

export const QuickAskLlmRawResponseSchema = z.object({
	verdict: QuickAskVerdictSchema,
	answer: z.string().trim().min(1),
	caveats: z.array(z.string().trim().min(1)).optional().default([]),
	citations: z.array(QuickAskLlmCitationSchema).optional().default([])
});

export type QuickAskLlmRawResponse = z.infer<typeof QuickAskLlmRawResponseSchema>;

export interface QuickAskRequirementItem {
	clauseRef: string;
	bundleId: string;
	sourceTitle: string;
	sourceSha256: string;
	position: number;
	title: string;
	text: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	category: string | null;
	effectiveDisposition: string;
	clarificationQuestion: string | null;
	linkedSubjectIds: string[];
}

export interface QuickAskCitation {
	clauseRef: string;
	bundleId: string;
	sourceTitle: string;
	title: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	effectiveDisposition: string;
	excerpt: string;
	linkedSubjectIds: string[];
}

export interface QuickAskResponsePayload {
	status: 'ok';
	verdict: QuickAskVerdict;
	answer: string;
	caveats: string[];
	citations: QuickAskCitation[];
	meta: {
		mode: 'full_context' | 'filtered';
		totalRequirements: number;
		evaluatedRequirements: number;
		model: string;
		cacheHint: string;
	};
}

/**
 * Trie de façon strictement déterministe les exigences afin que le préfixe système soit identique
 * octet pour octet entre tous les utilisateurs d'un même projet (maximise le Prompt Caching).
 */
export function sortRequirementsDeterministically(
	items: readonly QuickAskRequirementItem[]
): QuickAskRequirementItem[] {
	return [...items].sort((a, b) => {
		const shaCmp = a.sourceSha256.localeCompare(b.sourceSha256);
		if (shaCmp !== 0) return shaCmp;
		if (a.position !== b.position) return a.position - b.position;
		return a.clauseRef.localeCompare(b.clauseRef);
	});
}

/**
 * Formate de façon compacte et canonique la liste des exigences pour le contexte LLM.
 * Aucune donnée variable (horodatage, nom d'utilisateur) n'est incluse dans ce préfixe.
 */
export function buildCanonicalRequirementsContext(items: readonly QuickAskRequirementItem[]): {
	corpusText: string;
	cacheHint: string;
	sortedItems: QuickAskRequirementItem[];
} {
	const sortedItems = sortRequirementsDeterministically(items);
	const blocks = sortedItems.map((it) => {
		const metaParts = [
			it.clauseRef,
			it.criticality,
			`statut=${it.effectiveDisposition}`,
			it.category ? `cat=${it.category}` : null,
			it.linkedSubjectIds.length > 0 ? `sujets=${it.linkedSubjectIds.join(',')}` : null,
			`source=${it.sourceTitle}`
		].filter(Boolean);

		const lines = [`[${metaParts.join(' | ')}] ${it.title}`, it.text.trim()];
		if (it.clarificationQuestion) {
			lines.push(`Question ouverte associée : ${it.clarificationQuestion.trim()}`);
		}
		return lines.join('\n');
	});

	const corpusText = blocks.join('\n---\n');
	const cacheHint = universalSha256(corpusText).slice(0, 12);
	return { corpusText, cacheHint, sortedItems };
}

/** Normalise un texte pour la recherche lexicale (minuscules, sans accents). */
export function normalizeForSearch(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

const DOMAIN_EXPANSIONS: Record<string, string[]> = {
	'3': ['trois', 'tri', 'tri-site', 'trisite', 'n+2'],
	trois: ['3', 'tri', 'tri-site', 'trisite'],
	'2': ['deux', 'bi-site', 'bisite', 'dual', 'actif/actif', 'actif-actif'],
	deux: ['2', 'bi-site', 'bisite', 'dual'],
	dc: ['datacenter', 'data center', 'centre de donnees', 'site', 'salle', 'az', 'zone de disponibilite'],
	datacenter: ['dc', 'data center', 'centre de donnees', 'site', 'zone de disponibilite'],
	site: ['dc', 'datacenter', 'zone', 'geographique', 'implantation'],
	chiffrement: ['cryptographie', 'tls', 'aes', 'chiffre', 'cles', 'hsm', 'ipsec'],
	sauvegarde: ['backup', 'rpo', 'rto', 'restauration', 'retention', 'pra', 'pca'],
	haute: ['disponibilite', 'sla', 'ha', 'resilience', 'redondance', 'pra']
};

/** Extrait les jetons de recherche enrichis des variantes courantes. */
export function expandQueryTerms(question: string): string[] {
	const norm = normalizeForSearch(question);
	const baseTokens = norm.match(/[a-z0-9]+/g) ?? [];
	const terms = new Set<string>();
	for (const t of baseTokens) {
		if (t.length >= 2 || /^\d+$/.test(t)) {
			terms.add(t);
			const extra = DOMAIN_EXPANSIONS[t];
			if (extra) {
				for (const e of extra) terms.add(normalizeForSearch(e));
			}
		}
	}
	return [...terms];
}

/**
 * Sélectionne un sous-ensemble pertinent d'exigences lorsque le corpus dépasse le budget du modèle.
 * Combine correspondance lexicale enrichie, similarité cosinus optionnelle et priorité aux clauses bloquantes.
 */
export function selectRelevantRequirements(
	items: readonly QuickAskRequirementItem[],
	question: string,
	maxChars: number,
	semanticScores?: Map<string, number>
): QuickAskRequirementItem[] {
	const sorted = sortRequirementsDeterministically(items);
	const terms = expandQueryTerms(question);

	const scored = sorted.map((item) => {
		const haystack = normalizeForSearch(`${item.clauseRef} ${item.title} ${item.text} ${item.category ?? ''}`);
		let lexicalScore = 0;
		for (const term of terms) {
			if (haystack.includes(term)) {
				lexicalScore += term.length <= 2 ? 1.5 : 3;
			}
		}
		const semanticScore = semanticScores?.get(item.bundleId) ?? 0;
		const criticalityBoost = item.criticality === 'bloquant' ? 0.5 : 0;
		return {
			item,
			score: lexicalScore + semanticScore * 10 + criticalityBoost
		};
	});

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.item.position - b.item.position;
	});

	const selected: QuickAskRequirementItem[] = [];
	let usedChars = 0;
	for (const entry of scored) {
		const estSize = entry.item.title.length + entry.item.text.length + 140;
		if (selected.length > 0 && usedChars + estSize > maxChars) {
			break;
		}
		selected.push(entry.item);
		usedChars += estSize;
	}

	return sortRequirementsDeterministically(selected);
}

/**
 * Reconstruit et vérifie les citations retournées par le modèle contre les exigences réelles du projet.
 * Toute référence inventée (hallucination) est ignorée afin de garantir l'intégrité documentaire.
 */
export function reconcileQuickAskCitations(
	rawCitations: readonly { clauseRef: string; excerpt?: string }[],
	items: readonly QuickAskRequirementItem[]
): { citations: QuickAskCitation[]; droppedRefs: string[] } {
	const byClause = new Map<string, QuickAskRequirementItem>();
	const byBundle = new Map<string, QuickAskRequirementItem>();
	for (const it of items) {
		byClause.set(it.clauseRef.trim().toLowerCase(), it);
		byBundle.set(it.bundleId.trim().toLowerCase(), it);
	}

	const seen = new Set<string>();
	const citations: QuickAskCitation[] = [];
	const droppedRefs: string[] = [];

	for (const c of rawCitations) {
		const key = c.clauseRef.trim().toLowerCase();
		const match = byClause.get(key) ?? byBundle.get(key);
		if (!match) {
			droppedRefs.push(c.clauseRef);
			continue;
		}
		if (seen.has(match.bundleId)) continue;
		seen.add(match.bundleId);

		const fallbackExcerpt = match.text.trim().slice(0, 220);
		citations.push({
			clauseRef: match.clauseRef,
			bundleId: match.bundleId,
			sourceTitle: match.sourceTitle,
			title: match.title,
			criticality: match.criticality,
			effectiveDisposition: match.effectiveDisposition,
			excerpt: (c.excerpt ?? '').trim() || fallbackExcerpt,
			linkedSubjectIds: match.linkedSubjectIds
		});
	}

	return { citations, droppedRefs };
}
