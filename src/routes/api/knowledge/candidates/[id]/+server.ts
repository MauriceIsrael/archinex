import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals.session?.user?.email;

  const result = await llmopsClient.getCandidate(params.id, actorEmail || undefined);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Candidat introuvable' }, { status: 404 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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

  const { action, reason, amended_content } = body || {};

  if (!action || !['accept', 'amend', 'reject'].includes(action)) {
    return json({ status: 'error', error: 'Action invalide : doit être accept, amend ou reject' }, { status: 400 });
  }

  if (action === 'reject' && (!reason || reason.trim() === '')) {
    return json({ status: 'error', error: 'Un motif d’explication est obligatoire pour rejeter un candidat' }, { status: 400 });
  }

  const result = await llmopsClient.reviewCandidate(
    params.id,
    action,
    { reason, amended_content },
    actorEmail
  );

  if (result.status === 'forbidden') {
    return json(
      {
        status: 'forbidden',
        error:
          result.error ||
          'Action refusée (403) : vous ne possédez pas les droits de domaine requis pour statuer sur ce candidat.'
      },
      { status: 403 }
    );
  }

  if (result.status === 'conflict') {
    return json(
      {
        status: 'conflict',
        error:
          result.error ||
          'Conflit d’état (409) : ce candidat a déjà fait l’objet d’une décision terminale.'
      },
      { status: 409 }
    );
  }

  if (result.status === 'unavailable') {
    return json(
      {
        status: 'unavailable',
        error: result.error || 'Service de gouvernance KB indisponible (503)'
      },
      { status: 503 }
    );
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de l’examen du candidat' }, { status: 400 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
