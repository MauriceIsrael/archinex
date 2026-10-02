import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals.session?.user?.email;

  const result = await llmopsClient.getComments(params.id, actorEmail || undefined);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error, data: [] }, { status: 503 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error || 'Erreur chargement commentaires' }, { status: 400 });
  }

  return json({
    status: 'ok',
    data: result.data || []
  });
};

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

  const { message } = body || {};
  if (!message || message.trim() === '') {
    return json({ status: 'error', error: 'Le commentaire ne peut pas être vide' }, { status: 400 });
  }

  const result = await llmopsClient.addComment(params.id, message, actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de l’ajout du commentaire' }, { status: 400 });
  }

  return json(
    {
      status: 'ok',
      data: result.data
    },
    { status: 201 }
  );
};
