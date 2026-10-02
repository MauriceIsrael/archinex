import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { syncEmbeddingsWithLLMOps } from '$lib/server/similarity/embeddings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    locals?.session?.user?.email;
  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const model = body.model || 'toy-bow';
  const result = await syncEmbeddingsWithLLMOps(llmopsClient, { model, actorEmail });

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error || 'Erreur lors de la synchronisation des embeddings' }, { status: 500 });
  }

  return json({
    status: 'ok',
    count: result.count
  });
};
