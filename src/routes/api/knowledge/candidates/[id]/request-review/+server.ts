import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals.session?.user?.email;

  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié (en-tête X-Actor-Email manquant)' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Format JSON invalide' }, { status: 400 });
  }

  const { kind, recipient, message, due_at } = body || {};
  if (!recipient || !message) {
    return json(
      { status: 'error', error: 'Les champs recipient et message sont obligatoires' },
      { status: 400 }
    );
  }

  const result = await llmopsClient.requestReview(
    params.id,
    {
      kind: kind || 'advice',
      recipient,
      message,
      due_at
    },
    actorEmail
  );

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error || 'Erreur lors de la sollicitation de revue' }, { status: 400 });
  }

  return json({
    status: 'ok',
    success: true
  });
};
