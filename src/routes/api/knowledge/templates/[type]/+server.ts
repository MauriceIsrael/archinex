import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';
import type { KbAssetType } from '$lib/types/llmops';

export const GET: RequestHandler = async ({ params }) => {
  const assetType = params.type as KbAssetType;
  const result = await llmopsClient.getAssetTemplate(assetType);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Gabarit introuvable' }, { status: 404 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
