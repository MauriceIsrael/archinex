import { json, error, type RequestHandler } from '@sveltejs/kit';
import { resumeFactorization } from '$lib/server/ingest/factorizationJobs';

/**
 * POST /api/rfp/factorize/runs/[runId]/resume
 * Reprend une factorisation interrompue (redémarrage du serveur) ou en échec, sur sa requête d'origine.
 * Les étapes déjà calculées sont relues dans le cache : seule la suite est recalculée.
 */
export const POST: RequestHandler = async ({ params }) => {
	const resumed = await resumeFactorization(params.runId!);
	if (!resumed) throw error(409, `La factorisation '${params.runId}' n'est pas reprenable (introuvable, aboutie, ou enregistrée sans sa requête d'origine).`);
	return json({ runId: resumed.runId, status: 'running' }, { status: 202 });
};
