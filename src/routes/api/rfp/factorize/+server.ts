import { json, error, type RequestHandler } from '@sveltejs/kit';
import {
	factorizeRfpWithLocalLlm,
	buildSystemPrompt,
	DEFAULT_KB_STANDARDS,
	type KbItemSummary
} from '$lib/server/llm/rfpFactorizer';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { llmopsClient } from '$lib/server/llmops';

/**
 * GET /api/rfp/factorize
 * Renvoie les informations d'environnement : modèles disponibles sur raptor-nino,
 * état de santé du LLM local et prompt système d'orientation modifiable.
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
			kbStandardsCount: DEFAULT_KB_STANDARDS.length,
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

		// Récupération des règles du Patrimoine Commun depuis LLMOps (ou standards par défaut)
		let kbStandards: KbItemSummary[] = DEFAULT_KB_STANDARDS;
		try {
			const engagement = body.engagementId || 'nordwave-mcx-2027';
			const sync = await llmopsClient.syncEngagement(engagement);
			if (sync && Array.isArray(sync.statements) && sync.statements.length > 0) {
				const fromSync = sync.statements.map((st: any) => ({
					id: st.id,
					title: `${st.subject} - ${st.predicate}`,
					category: st.role.toUpperCase(),
					ruleOrStatement: st.value
				}));
				kbStandards = [...DEFAULT_KB_STANDARDS, ...fromSync];
			}
		} catch {
			// On garde DEFAULT_KB_STANDARDS
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
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const msg = err instanceof Error ? err.message : 'Erreur interne de factorisation';
		throw error(500, `Échec de la factorisation sémantique : ${msg}`);
	}
};
