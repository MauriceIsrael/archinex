import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    request.headers.get('x-actor-email') || locals.session?.user?.email || undefined;

  const result = await llmopsClient.suggestFrameworkRequirementLinks(
    params.id,
    params.reqId,
    actorEmail
  );

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de la suggestion' }, { status: 400 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
