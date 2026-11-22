import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { getProjectDriftOverview } from '$lib/server/edp/driftOverviewService';

/**
 * GET /api/projects/[projectId]/drift
 * Retourne la synthèse complète de la dérive, de la dernière réconciliation Nautobot
 * et de l'état de réalisation (#379, #399).
 */
export const GET: RequestHandler = async (event) => {
  const { projectId } = event.params;
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;

  const includeResolved = event.url.searchParams.get('includeResolved') === 'true';

  try {
    const overview = await getProjectDriftOverview(projectId, { includeResolved });
    return json({ status: 'ok', ...overview });
  } catch (err: any) {
    console.error('[API /drift] Erreur lors du chargement de la vue Dérive:', {
      projectId,
      error: err
    });
    return json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Erreur lors du chargement de la dérive'
      },
      { status: 500 }
    );
  }
};
