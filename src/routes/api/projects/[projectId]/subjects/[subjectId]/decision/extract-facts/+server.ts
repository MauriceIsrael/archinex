import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractFactsForDecision, DEFAULT_ARCHINEX_VOCABULARY } from '$lib/server/agents/factExtractor';
import { prisma } from '$lib/server/prisma';

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const { projectId, subjectId } = params;

	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide' }, { status: 400 });
	}

	const { decisionRationale, retainedOptionTitle, retainedOptionSummary, allowedVocabularyKeys } = body;

	if (!decisionRationale || !retainedOptionTitle) {
		return json({ error: 'decisionRationale et retainedOptionTitle sont requis' }, { status: 400 });
	}

	try {
		// Récupérer les clés de vocabulaire autorisées si non spécifiées
		let allowedKeys: string[] = Array.isArray(allowedVocabularyKeys) && allowedVocabularyKeys.length > 0
			? allowedVocabularyKeys
			: DEFAULT_ARCHINEX_VOCABULARY;

		const facts = await extractFactsForDecision({
			decisionRationale,
			retainedOptionTitle,
			retainedOptionSummary,
			allowedVocabularyKeys: allowedKeys
		});

		return json({
			status: 'ok',
			facts,
			allowedVocabularyKeys: allowedKeys
		});
	} catch (err: any) {
		console.error('[ExtractFacts API] Erreur :', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
