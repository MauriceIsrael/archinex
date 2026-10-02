import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals, url }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  const engagement = url.searchParams.get('engagement') || undefined;
  const source = url.searchParams.get('source') || undefined;

  try {
    const list = await llmopsClient.listCandidates({ engagement, source }, actorEmail);
    return json({ status: 'ok', data: list });
  } catch (err: any) {
    return json({ status: 'error', error: err.message || 'Erreur lors de la récupération des candidats' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Format JSON invalide' }, { status: 400 });
  }

  try {
    const res = await llmopsClient.submitCandidate(body, actorEmail);
    return json({ status: 'ok', data: res }, { status: 201 });
  } catch (err: any) {
    return json({ status: 'error', error: err.message || 'Erreur lors de la soumission du candidat' }, { status: 500 });
  }
};
