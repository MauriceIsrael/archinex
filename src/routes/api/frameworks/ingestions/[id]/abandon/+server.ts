import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals.session?.user?.email ||
    request.headers.get('x-actor-email') ||
    undefined;

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return json(
      { status: 'error', error: 'Un motif d’abandon (reason) est obligatoire.' },
      { status: 400 }
    );
  }

  const result = await llmopsClient.abandonFrameworkIngestion(params.id, reason, actorEmail);

  if (result.status === 'bad_request') {
    return json({ status: 'error', error: result.error }, { status: 400 });
  }

  if (result.status === 'forbidden') {
    return json({ status: 'forbidden', error: result.error }, { status: 403 });
  }

  if (result.status === 'conflict') {
    return json({ status: 'conflict', error: result.error }, { status: 409 });
  }

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json(
      { status: 'error', error: result.error || 'Erreur lors de l’abandon de l’ingestion' },
      { status: 400 }
    );
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
