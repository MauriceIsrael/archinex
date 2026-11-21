import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import {
  configureProjectReconciliation,
  reconcileProject
} from '$lib/server/edp/reconciliationJob';
import { getProjectDriftOverview } from '$lib/server/edp/driftOverviewService';

/**
 * POST /api/projects/[projectId]/drift/reconcile
 * - Par défaut : lance une passe de réconciliation Nautobot immédiate (`trigger: 'manual'`).
 * - Si `action === 'configure'` : met à jour l'intervalle, le seuil de fraîcheur ou l'activation du job périodique.
 *
 * En cas d'indisponibilité de Nautobot, retourne HTTP 200 avec `run.status = 'unverified'`
 * et `overview.posture = 'unverified'` (jamais « conforme »).
 */
export const POST: RequestHandler = async (event) => {
  const { projectId } = event.params;
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;

  let body: Record<string, any> = {};
  try {
    const text = await event.request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
  }

  try {
    if (body.action === 'configure') {
      await configureProjectReconciliation(projectId, {
        ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
        ...(typeof body.intervalSeconds === 'number'
          ? { intervalSeconds: body.intervalSeconds }
          : {}),
        ...(typeof body.staleThresholdSeconds === 'number'
          ? { staleThresholdSeconds: body.staleThresholdSeconds }
          : {}),
        ...(typeof body.connectorSilentDays === 'number'
          ? { connectorSilentDays: body.connectorSilentDays }
          : {})
      });
      const overview = await getProjectDriftOverview(projectId);
      return json({ status: 'ok', configured: true, overview });
    }

    const run = await reconcileProject(projectId, { trigger: 'manual' });
    const overview = await getProjectDriftOverview(projectId);
    return json({ status: 'ok', run, overview });
  } catch (err: any) {
    console.error('[API /drift/reconcile] Erreur:', { projectId, error: err });
    return json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Erreur lors de la réconciliation'
      },
      { status: 500 }
    );
  }
};
