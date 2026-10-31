import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { suggestRequirementLinksLocal } from '$lib/server/frameworks/frameworkEnricher';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  // 1. Tenter via le Hub (supporte fakeLlmops dans les tests de contrat)
  const result = await llmopsClient.suggestFrameworkRequirementLinks(
    params.id,
    params.reqId,
    actorEmail
  );

  if (result.status === 'ok' && result.data && Array.isArray(result.data.suggested_assets) && result.data.suggested_assets.length > 0) {
    return json({
      status: 'ok',
      data: result.data
    });
  }

  // 2. Si le Hub ne sert pas la route unitaire (ex: HTTP 404 en environnement réel),
  // Archinex prend le relais directement via son modèle d'assistance local (LocalLlmClient)
  try {
    const localResult = await suggestRequirementLinksLocal(
      params.id,
      params.reqId,
      actorEmail
    );

    return json({
      status: 'ok',
      data: localResult
    });
  } catch (err: any) {
    console.error(`[suggest-links] Échec de la suggestion locale pour ${params.reqId}:`, err?.message || err);
    return json(
      { status: 'error', error: err?.message || 'Erreur lors de la suggestion' },
      { status: 500 }
    );
  }
};
