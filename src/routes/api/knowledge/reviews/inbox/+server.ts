import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  const user = locals.session?.user;
  const actorEmail = user?.email;

  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié (email manquant)' }, { status: 401 });
  }

  const domain = url.searchParams.get('domain') || undefined;
  const kind = url.searchParams.get('kind') || undefined;
  const excludeOwn = url.searchParams.get('exclude_own') === 'true';

  let localExpert = null;
  if (user?.id) {
    localExpert = await getKbExpertByUserId(user.id);
  }
  const kbHandle = localExpert?.kbHandle || `@${actorEmail.split('@')[0]}`;

  const result = await llmopsClient.getReviewInbox(actorEmail, {
    domain,
    kind,
    excludeOwn,
    actorHandle: kbHandle
  });

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error, data: [] }, { status: 503 });
  }

  if (result.status === 'not_registered') {
    return json({ status: 'not_registered', error: result.error, reason: result.reason, data: [] }, { status: 403 });
  }

  if (result.status === 'unauthorized') {
    return json({ status: 'unauthorized', error: result.error, data: [] }, { status: 401 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error }, { status: 500 });
  }

  return json({
    status: 'ok',
    data: result.data || []
  });
};
