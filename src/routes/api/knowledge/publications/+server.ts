import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { ensureEmbeddingsSynced } from '$lib/server/similarity/embeddings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  const result = await llmopsClient.listKbPublications(actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors du chargement des publications' }, { status: 500 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  const body = await request.json().catch(() => ({}));
  const result = await llmopsClient.publishKbDoctrine(body, actorEmail);

  if (result.status === 'forbidden') {
    return json({ status: 'forbidden', error: result.error }, { status: 403 });
  }

  if (result.status === 'conflict') {
    return json({ status: 'conflict', error: result.error, blockers: result.blockers }, { status: 409 });
  }

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de la publication' }, { status: 400 });
  }

  // Synchronisation automatique des vecteurs sémantiques après publication scellée
  await ensureEmbeddingsSynced(llmopsClient).catch(() => null);

  return json({
    status: 'ok',
    data: result.data
  }, { status: 201 });
};
