import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { resolveEncoder } from '$lib/server/similarity/encoder';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals?.session?.user?.email || undefined;
  const datasetId = params.datasetId;

  const result = await llmopsClient.getSimilarityDataset(datasetId, actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Dataset introuvable' }, { status: 404 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals?.session?.user?.email;
  if (!actorEmail) {
    return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
  }
  const datasetId = params.datasetId;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok
  }

  // Fetch dataset to obtain all cases to encode
  const dsRes = await llmopsClient.getSimilarityDataset(datasetId, actorEmail);
  if (dsRes.status !== 'ok' || !dsRes.data) {
    return json({ status: 'error', error: 'Impossible de charger le dataset pour encodage' }, { status: 400 });
  }

  // Calcul local des vecteurs pour chaque cas
  const vectors: Record<string, number[]> = {};
  let model: string;
  try {
    const encoder = resolveEncoder(typeof body.model === 'string' ? body.model : undefined);
    model = encoder.model;
    for (const c of dsRes.data.cases) {
      vectors[c.id] = await encoder.encode(c.query_text);
    }
  } catch (e: any) {
    return json({ status: 'unavailable', error: e?.message ?? String(e) }, { status: 503 });
  }

  const runRes = await llmopsClient.runSimilarityEvaluation(
    datasetId,
    {
      model,
      vectors,
      validated_only: body.validated_only
    },
    actorEmail
  );

  if (runRes.status === 'unavailable') {
    return json({ status: 'unavailable', error: runRes.error }, { status: 503 });
  }

  if (runRes.status === 'error' || !runRes.data) {
    return json({ status: 'error', error: runRes.error || 'Erreur lors de l’exécution du benchmark' }, { status: 400 });
  }

  return json(
    {
      status: 'ok',
      data: runRes.data
    },
    { status: 201 }
  );
};
