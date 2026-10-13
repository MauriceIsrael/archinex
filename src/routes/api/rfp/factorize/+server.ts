import { json, error, type RequestHandler } from '@sveltejs/kit';
import { buildSystemPrompt } from '$lib/server/llm/rfpFactorizer';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { launchFactorization, type FactorizeRequest } from '$lib/server/ingest/factorizationJobs';

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
			defaultModel: localLlmClient.getDefaultModel(),
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
			defaultModel: localLlmClient.getDefaultModel(),
			models: [],
			defaultSystemPrompt: buildSystemPrompt(),
			error: msg
		});
	}
};

/**
 * POST /api/rfp/factorize
 * Lance la factorisation sémantique des clauses en sujets d'architecture, en tâche de fond.
 *
 * - Réponse 202 `{ runId, status: 'running' }` : le calcul continue côté serveur ; son avancement et ses états
 *   partiels se suivent via GET /api/rfp/factorize/runs/[runId]. Fermer ou recharger la page ne perd rien.
 * - Mêmes entrées déjà factorisées : le résultat persisté est renvoyé aussitôt (200, `reusedRun: true`),
 *   sauf `recompute: true`.
 * - `wait: true` : attend la fin du calcul et renvoie le résultat (scripts, tests).
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		if (!Array.isArray(body.clauses) || body.clauses.length === 0) {
			throw error(400, 'Un tableau de clauses non vide est requis dans "clauses".');
		}

		const req: FactorizeRequest = {
			clauses: body.clauses,
			model: body.model,
			customPromptDirectives: body.customPromptDirectives,
			documentTitle: body.documentTitle,
			engagementId: body.engagementId,
			projectType: body.projectType,
			forceAudit: Boolean(body.forceAudit),
			recompute: Boolean(body.recompute),
			sourceText: typeof body.sourceText === 'string' ? body.sourceText : undefined
		};

		const launch = await launchFactorization(req);
		if (launch.kind === 'reused') {
			return json({ ...launch.result, runId: launch.runId, reusedRun: true });
		}

		// Sans identifiant (persistance indisponible), le suivi est impossible : on attend le résultat.
		if (body.wait === true || !launch.runId) {
			const outcome = await launch.done;
			if (!outcome) return json({ status: 'error', error: 'Factorisation interrompue.', runId: launch.runId || null }, { status: 500 });
			return json({ ...outcome.body, runId: launch.runId || null }, { status: outcome.httpStatus });
		}

		return json({ runId: launch.runId, status: 'running' }, { status: 202 });
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 400) throw err;
		const message = err instanceof Error ? err.message : 'Erreur interne lors de la factorisation.';
		console.error(`❌ [API /api/rfp/factorize] Erreur critique :`, err);
		return json({ status: 'error', error: message }, { status: 500 });
	}
};
