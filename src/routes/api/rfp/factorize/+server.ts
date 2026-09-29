import { json, error, type RequestHandler } from '@sveltejs/kit';
import {
	factorizeRfpWithLocalLlm,
	buildSystemPrompt,
	type KbItemSummary
} from '$lib/server/llm/rfpFactorizer';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { doctrineService } from '$lib/server/doctrine/doctrineService';

/**
 * GET /api/rfp/factorize
 * Renvoie les informations d'environnement : modèles disponibles sur le LLM local,
 * état de santé et prompt système d'orientation modifiable.
 */
export const GET: RequestHandler = async () => {
	try {
		const health = await localLlmClient.checkHealth();
		const defaultPrompt = buildSystemPrompt();

		return json({
			status: 'ok',
			serverEndpoint: health.endpoint,
			available: health.available,
			defaultModel: 'ministral:latest',
			models: health.models,
			defaultSystemPrompt: defaultPrompt,
			kbStandardsCount: 0,
			error: health.error
		});
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : 'Erreur interne';
		return json({
			status: 'error',
			available: false,
			defaultModel: 'ministral:latest',
			models: [
				{ id: 'ministral:latest', name: 'ministral:latest (Raisonnement 14B)' },
				{ id: 'qwen2.5-coder:14b', name: 'qwen2.5-coder:14b (Structure 14B)' }
			],
			defaultSystemPrompt: buildSystemPrompt(),
			error: msg
		});
	}
};

/**
 * POST /api/rfp/factorize
 * Lance la factorisation sémantique des clauses en 8-12 sujets d'architecture majeurs
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const clauses = body.clauses;

		if (!Array.isArray(clauses) || clauses.length === 0) {
			throw error(400, 'Un tableau de clauses non vide est requis dans "clauses".');
		}

		// Récupération de la doctrine applicable depuis LLMOps
		let kbStandards: KbItemSummary[] = [];
		try {
			const ctx = await doctrineService.getDoctrineContext({
				projectType: body.projectType
			});
			if (ctx && Array.isArray(ctx.items)) {
				kbStandards = ctx.items.map((item) => ({
					id: item.id,
					title: item.title,
					category: (item.domain || item.type || 'ARCHITECTURE').toUpperCase(),
					ruleOrStatement: item.content
				}));
			}
		} catch {
			// En cas d'erreur de doctrine, on continue avec un tableau vide
		}

		const result = await factorizeRfpWithLocalLlm(
			{
				clauses,
				model: body.model || 'ministral:latest',
				customPromptDirectives: body.customPromptDirectives,
				engagementId: body.engagementId,
				documentTitle: body.documentTitle
			},
			kbStandards
		);

		return json(result);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Erreur interne lors de la factorisation.';
		return json({ status: 'error', error: message }, { status: 500 });
	}
};
