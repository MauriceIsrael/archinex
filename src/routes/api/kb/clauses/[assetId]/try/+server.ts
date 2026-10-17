import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'et', 'ou', 'en', 'dans', 'sur', 'pour', 'par',
  'avec', 'sans', 'sous', 'ce', 'cet', 'cette', 'ces', 'mon', 'ton', 'son', 'notre', 'votre', 'leur', 'qui',
  'que', 'quoi', 'dont', 'où', 'est', 'sont', 'a', 'ont', 'au', 'aux', 'ne', 'pas', 'plus', 'moins', 'tres',
  'très', 'aussi', 'bien', 'comme', 'mais', 'donc', 'or', 'ni', 'car', 'the', 'a', 'an', 'and', 'or', 'in',
  'on', 'for', 'with', 'without', 'under', 'this', 'that', 'these', 'those', 'to', 'of', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'but', 'if', 'then', 'else'
]);

function extractSuggestedTerms(title: string, description: string, checks: any[]): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const existingTerms = new Set<string>();
  for (const c of checks) {
    for (const t of c?.when?.terms_any || []) existingTerms.add(String(t).toLowerCase().trim());
    for (const t of c?.when?.terms_all || []) existingTerms.add(String(t).toLowerCase().trim());
  }

  const rawTokens = text.replace(/[^a-z0-9àâäéèêëîïôöùûüç\-_]/gi, ' ').split(/\s+/);
  const candidates = new Set<string>();
  for (const token of rawTokens) {
    const clean = token.replace(/^[-_]+|[-_]+$/g, '').trim();
    if (clean.length >= 3 && !STOPWORDS.has(clean) && !existingTerms.has(clean)) {
      candidates.add(clean);
    }
  }
  return Array.from(candidates).slice(0, 8);
}

/** Essai des clauses d'un actif sur une option rédigée par le relecteur (avec assistance sémantique Option A). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.session?.user) return json({ status: 'error', error: 'Authentification requise' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const option = body?.option;
  if (!Array.isArray(body?.checks) || !option || typeof option.title !== 'string' || !option.title.trim()) {
    return json({ status: 'error', error: "'checks' et 'option.title' sont requis" }, { status: 400 });
  }

  const optTitle = option.title.trim();
  const optDesc = typeof option.description === 'string' ? option.description : '';
  const queryText = `${optTitle} ${optDesc}`.trim();

  // Exécution parallèle : verdict déterministe + recherche de similarité cosinus (Option A)
  const [trialResult, similarResult] = await Promise.all([
    llmopsClient.tryAssetClauses(params.assetId, body.checks, [{ title: optTitle, description: optDesc }]),
    llmopsClient.searchSimilarKnowledge({ query_text: queryText, top_k: 25 }, locals.session.user.email).catch(() => ({ status: 'unavailable' as const, data: undefined }))
  ]);

  if (trialResult.status !== 'ok') {
    return json({ status: trialResult.status, error: trialResult.error }, { status: trialResult.status === 'unavailable' ? 503 : 400 });
  }

  let semantic: {
    cosine: number | null;
    zone: string | null;
    assetRef: string;
    suggestedTerms: string[];
    topMatch?: { ref: string; title: string; cosine: number };
  } | null = null;

  if (similarResult.status === 'ok' && similarResult.data?.results) {
    const results = similarResult.data.results;
    const target = results.find((r) => r.ref === params.assetId);
    const targetCosine = target?.scores?.cosine ?? (target ? target.score : null);
    const top = results[0];

    semantic = {
      cosine: typeof targetCosine === 'number' ? targetCosine : null,
      zone: target?.zone ?? null,
      assetRef: params.assetId,
      suggestedTerms: extractSuggestedTerms(optTitle, optDesc, body.checks),
      topMatch: top ? { ref: top.ref, title: top.title, cosine: top.scores?.cosine ?? top.score } : undefined
    };
  }

  return json({
    status: 'ok',
    data: trialResult.data?.[0]?.after ?? [],
    semantic
  });
};
