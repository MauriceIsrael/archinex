import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractFactsForDecision, DEFAULT_ARCHINEX_VOCABULARY } from '$lib/server/agents/factExtractor';
import { prisma } from '$lib/server/prisma';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { llmopsClient } from '$lib/server/llmops/client';
import { describeFactKey } from '$lib/domain/hubFactVocabulary';
import { hubErrorResponse } from '$lib/server/projects/hubErrors';

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const { projectId, subjectId } = params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

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
		// Projet basculé : le Hub ne reconnaît que son propre vocabulaire de faits, et en vérifie les types.
		let allowedKeys: string[];
		let keyHints: Record<string, string> | undefined;
		if (auth.project && isProjectCutOverToHub(auth.project)) {
			const vocabulary = await llmopsClient.getFactVocabulary();
			allowedKeys = vocabulary.keys.map((k) => k.key);
			keyHints = Object.fromEntries(vocabulary.keys.map((k) => [k.key, describeFactKey(k)]));
		} else {
			allowedKeys =
				Array.isArray(allowedVocabularyKeys) && allowedVocabularyKeys.length > 0 ? allowedVocabularyKeys : DEFAULT_ARCHINEX_VOCABULARY;
		}

		const facts = await extractFactsForDecision({
			decisionRationale,
			retainedOptionTitle,
			retainedOptionSummary,
			allowedVocabularyKeys: allowedKeys,
			keyHints
		});

		return json({
			status: 'ok',
			facts,
			allowedVocabularyKeys: allowedKeys
		});
	} catch (err: any) {
		console.error('[ExtractFacts API] Erreur :', err);
		if (auth.project && isProjectCutOverToHub(auth.project)) return hubErrorResponse(err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
