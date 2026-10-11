import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getFactorizationRun } from '$lib/server/ingest/factorizationRunsDb';
import { reconcileInterruptedRuns } from '$lib/server/ingest/factorizationJobs';

/**
 * GET /api/rfp/factorize/runs/[runId]
 * Une factorisation persistée : statut, avancement et résultat (partiel tant qu'elle est en cours,
 * signalé par `result.inProgress`).
 */
export const GET: RequestHandler = async ({ params }) => {
	await reconcileInterruptedRuns();
	const run = await getFactorizationRun(params.runId!);
	if (!run) throw error(404, `Factorisation '${params.runId}' introuvable.`);
	return json(run);
};
