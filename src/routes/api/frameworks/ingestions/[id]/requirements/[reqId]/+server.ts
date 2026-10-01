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

  const { status, mapped_assets, amendment_notes, rejection_reason } = body || {};

  if (!status || !['pending', 'accepted', 'amended', 'rejected'].includes(status)) {
    return json(
      { status: 'error', error: 'Statut invalide : doit être pending, accepted, amended ou rejected' },
      { status: 400 }
    );
  }

  if (status === 'rejected' && (!rejection_reason || rejection_reason.trim() === '')) {
    return json(
      { status: 'error', error: 'Le motif de rejet est obligatoire' },
      { status: 400 }
    );
  }

  const result = await llmopsClient.reviewFrameworkRequirement(
    params.id,
    params.reqId,
    { status, mapped_assets, amendment_notes, rejection_reason },
    actorEmail
  );

  if (result.status === 'forbidden') {
    return json({ status: 'forbidden', error: result.error }, { status: 403 });
  }

  if (result.status === 'bad_request') {
    return json({ status: 'error', error: result.error }, { status: 400 });
  }

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Exigence introuvable' }, { status: 404 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
