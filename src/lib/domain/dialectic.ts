import type { ArchitectRole } from '$lib/types/epistemic';

export interface DialogueMessage {
	id: string;
	channel: 'internal' | 'discord';
	author: string;
	role: ArchitectRole;
	content: string;
	timestamp: string;
	isAi?: boolean;
	subjectId?: string;
}

export interface DoctrineRecallRule {
	id: string; // ex: "DOC-001"
	title: string;
	keywords: RegExp[];
	summary: string;
	referenceDocument: string;
	enforcementLevel: 'mandatory' | 'recommended';
	guidance: string;
}

/**
 * Détecte de manière proactive les doctrines applicables aux termes mentionnés dans un échange.
 * Les règles applicables sont injectées depuis le service de doctrine (LLMOps).
 */
export function detectProactiveDoctrineRecalls(
	content: string,
	rules: DoctrineRecallRule[] = []
): DoctrineRecallRule[] {
	return rules.filter((rule) =>
		rule.keywords.some((kw) => kw.test(content))
	);
}

/**
 * Retourne les règles de la doctrine applicables à un document du corpus.
 */
export function getApplicableDoctrineRules(
	doc: {
		title: string;
		summary: string;
		categoryLabel?: string;
		keyIdeas?: string[];
		keyClauses?: Array<{ title: string; text: string; impactSummary?: string }>;
		relatedSubjectIds?: string[];
	},
	rules: DoctrineRecallRule[] = []
): DoctrineRecallRule[] {
	const textToSearch = [
		doc.title,
		doc.summary,
		doc.categoryLabel || '',
		...(doc.keyIdeas || []),
		...(doc.keyClauses || []).map((c) => `${c.title} ${c.text} ${c.impactSummary || ''}`)
	].join(' ');

	return rules.filter((rule) =>
		rule.keywords.some((kw) => kw.test(textToSearch))
	);
}
