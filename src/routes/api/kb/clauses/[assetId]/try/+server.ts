import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

/** Essai des clauses d'un actif sur une option rédigée par le relecteur (aucune écriture dans LLMOps). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.session?.user) return json({ status: 'error', error: 'Authentification requise' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const option = body?.option;
  if (!Array.isArray(body?.checks) || !option || typeof option.title !== 'string' || !option.title.trim()) {
    return json({ status: 'error', error: "'checks' et 'option.title' sont requis" }, { status: 400 });
  }
  const result = await llmopsClient.tryAssetClauses(params.assetId, body.checks, [
    { title: option.title.trim(), description: typeof option.description === 'string' ? option.description : '' }
  ]);
  if (result.status !== 'ok') {
    return json({ status: result.status, error: result.error }, { status: result.status === 'unavailable' ? 503 : 400 });
  }
  return json({ status: 'ok', data: result.data?.[0]?.after ?? [] });
};
