import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  const actorEmail =
    request.headers.get('x-actor-email') || locals.session?.user?.email;

  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié (email manquant)' }, { status: 401 });
  }

  const domain = url.searchParams.get('domain') || undefined;
  const kind = url.searchParams.get('kind') || undefined;

  const result = await llmopsClient.getReviewInbox(actorEmail, { domain, kind });

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error, data: [] }, { status: 503 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error }, { status: 500 });
  }

  return json({
    status: 'ok',
    data: result.data || []
  });
};
