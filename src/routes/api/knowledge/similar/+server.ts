import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import {
  anonymizeSubjectText,
  computeSubjectFingerprint
} from '$lib/server/similarity/embeddings';
import { resolveEncoder } from '$lib/server/similarity/encoder';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    locals?.session?.user?.email;
  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
  }

  const { query_text, types, domains, top_k } = body;
  if (!query_text || typeof query_text !== 'string' || query_text.trim().length === 0) {
    return json({ status: 'error', error: 'Le champ query_text est obligatoire' }, { status: 400 });
  }

  // Anonymisation stricte avant traitement sémantique
  const cleanText = anonymizeSubjectText(query_text.trim());
  let encoder;
  let vector: number[];
  try {
    encoder = resolveEncoder(typeof body.model === 'string' ? body.model : undefined);
    vector = await encoder.encode(cleanText);
  } catch (e: any) {
    // Jamais de repli sur un autre modèle : une recherche sur un espace de vecteurs différent n'aurait aucun sens.
    return json({ status: 'unavailable', error: e?.message ?? String(e) }, { status: 503 });
  }
  const model = encoder.model;
  const fp = computeSubjectFingerprint(cleanText);

  const searchRes = await llmopsClient.searchSimilarKnowledge(
    {
      model,
      vector,
      query_text: cleanText,
      subject_fingerprint: fp,
      types,
      domains,
      top_k: typeof top_k === 'number' ? top_k : 10
    },
    actorEmail
  );

  if (searchRes.status === 'unavailable') {
    return json({ status: 'unavailable', error: searchRes.error }, { status: 503 });
  }

  if (searchRes.status === 'error' || !searchRes.data) {
    return json({ status: 'error', error: searchRes.error || 'Erreur lors de la recherche sémantique' }, { status: 500 });
  }

  return json({
    status: 'ok',
    subject_fingerprint: fp,
    data: searchRes.data
  });
};
