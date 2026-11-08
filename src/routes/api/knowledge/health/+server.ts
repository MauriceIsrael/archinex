import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { configuredModel } from '$lib/server/similarity/encoder';
import { ensureEmbeddingsSynced, needsEmbeddingSync } from '$lib/server/similarity/embeddings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  let result = await llmopsClient.getKbHealth(actorEmail);
  const targetModel = configuredModel();

  if (result.status === 'ok' && result.data && needsEmbeddingSync(result.data, targetModel)) {
    const syncRes = await ensureEmbeddingsSynced(llmopsClient, { model: targetModel });
    if (syncRes.status === 'ok' && syncRes.count > 0) {
      result = await llmopsClient.getKbHealth(actorEmail);
    }
  }

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de la récupération de la santé KB' }, { status: 500 });
  }

  return json({
    status: 'ok',
    data: result.data,
    configured_embedding_model: targetModel
  });
};
