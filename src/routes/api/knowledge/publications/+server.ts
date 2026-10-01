import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    request.headers.get('x-actor-email') || locals.session?.user?.email || undefined;

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
    request.headers.get('x-actor-email') || locals.session?.user?.email || undefined;

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

  return json({
    status: 'ok',
    data: result.data
  }, { status: 201 });
};
