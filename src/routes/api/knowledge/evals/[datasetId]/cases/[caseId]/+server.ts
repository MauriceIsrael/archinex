import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    request.headers.get('x-actor-email') || locals.session?.user?.email || undefined;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Format JSON invalide' }, { status: 400 });
  }

  const { expected_status, notes } = body || {};

  if (expected_status && !['supports', 'violates'].includes(expected_status)) {
    return json(
      { status: 'error', error: "Statut attendu invalide : doit être 'supports' ou 'violates'" },
      { status: 400 }
    );
  }

  const result = await llmopsClient.annotateEvalTestCase(
    params.datasetId,
    params.caseId,
    { expected_status, notes },
    actorEmail
  );

  if (result.status === 'forbidden') {
    return json({ status: 'forbidden', error: result.error }, { status: 403 });
  }

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Cas de test introuvable' }, { status: 404 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
