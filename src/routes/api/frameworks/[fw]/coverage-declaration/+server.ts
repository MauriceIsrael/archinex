import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  const result = await llmopsClient.declareFrameworkCoverage(params.fw, actorEmail);

  if (result.status === 'conflict') {
    return json(
      {
        status: 'conflict',
        error: result.error || 'Des exigences non couvertes subsistent dans le référentiel',
        missing_requirements: result.missing_requirements || []
      },
      { status: 409 }
    );
  }

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de la déclaration de couverture' }, { status: 400 });
  }

  return json({
    status: 'ok',
    data: result.data
  });
};
