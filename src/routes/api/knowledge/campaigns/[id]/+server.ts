import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    request.headers.get('x-actor-email') || locals.session?.user?.email || undefined;

  const body = await request.json().catch(() => ({}));
  const result = await llmopsClient.updateKbCampaign(params.id, body, actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    const status = result.error?.includes('introuvable') ? 404 : 400;
    return json({ status: 'error', error: result.error || 'Erreur lors de la mise à jour de la campagne' }, { status });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
