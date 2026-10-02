import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  const datasetId = (!params.datasetId || params.datasetId === 'undefined') ? 'check_option_v1' : params.datasetId;
  const result = await llmopsClient.runEvalBenchmark(datasetId, actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors du benchmark' }, { status: 400 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
