import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    request.headers.get('x-actor-email') || locals.session?.user?.email;

  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié (en-tête X-Actor-Email manquant)' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Format JSON invalide' }, { status: 400 });
  }

  const { assignee, reason } = body || {};
  if (!assignee) {
    return json({ status: 'error', error: 'Le champ assignee est obligatoire' }, { status: 400 });
  }

  const result = await llmopsClient.assignCandidate(params.id, assignee, reason || '', actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de l’assignation' }, { status: 400 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
