import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request, locals }) => {
  const actorEmail =
    locals?.session?.user?.email || undefined;

  const subject_fingerprint = url.searchParams.get('subject_fingerprint') || undefined;
  const matched_ref = url.searchParams.get('matched_ref') || undefined;

  const result = await llmopsClient.getReuseConfirmations({ subject_fingerprint, matched_ref }, actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error || 'Erreur lors de la récupération des confirmations' }, { status: 500 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    locals?.session?.user?.email;
  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
  }

  const { subject_fingerprint, subject_label, matched_ref, outcome, assumptions, comment, model, scores } = body;
  if (!subject_fingerprint || !subject_label || !matched_ref || !outcome || !Array.isArray(assumptions)) {
    return json(
      {
        status: 'error',
        error: 'Champs obligatoires manquants : subject_fingerprint, subject_label, matched_ref, outcome, assumptions'
      },
      { status: 400 }
    );
  }

  const result = await llmopsClient.postReuseConfirmation(
    {
      subject_fingerprint,
      subject_label,
      matched_ref,
      outcome,
      assumptions,
      comment,
      model,
      scores
    },
    actorEmail
  );

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de l’enregistrement de la confirmation' }, { status: 400 });
  }

  return json(
    {
      status: 'ok',
      data: result.data
    },
    { status: 201 }
  );
};
