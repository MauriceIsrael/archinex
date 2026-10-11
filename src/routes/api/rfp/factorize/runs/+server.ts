import { json, type RequestHandler } from '@sveltejs/kit';
import { listFactorizationRuns } from '$lib/server/ingest/factorizationRunsDb';
import { reconcileInterruptedRuns } from '$lib/server/ingest/factorizationJobs';

/**
 * GET /api/rfp/factorize/runs
 * Dernières factorisations persistées (sans leur résultat), les plus récentes d'abord, avec leur avancement.
 * Une exécution « en cours » dont le serveur a redémarré apparaît « interrompue » (reprenable).
 */
export const GET: RequestHandler = async ({ url }) => {
	await reconcileInterruptedRuns();
	const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100);
	return json({ runs: await listFactorizationRuns(limit) });
};
