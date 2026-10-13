import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { CheckClauseDecision } from '$lib/types/llmops';
import type { RequestHandler } from './$types';

const DECISIONS: CheckClauseDecision[] = ['validate', 'amend', 'reject'];
const HTTP = { forbidden: 403, invalid: 400, not_found: 404, unavailable: 503, error: 502 } as const;

/** Décision sur une clause vérifiable : le relecteur est la personne connectée, LLMOps vérifie ses droits. */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const actorEmail = locals.session?.user?.email;
  if (!actorEmail) return json({ status: 'error', error: 'Authentification requise' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !DECISIONS.includes(body.decision)) {
    return json({ status: 'error', error: `'decision' doit valoir ${DECISIONS.join(', ')}` }, { status: 400 });
  }
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  if (body.decision !== 'validate' && !comment) {
    return json({ status: 'error', error: 'Un commentaire est obligatoire pour amender ou rejeter une clause.' }, { status: 400 });
  }

  const result = await llmopsClient.decideCheckClause(
    params.assetId,
    params.checkId,
    { decision: body.decision, ...(comment ? { comment } : {}), ...(body.decision === 'amend' ? { clause: body.clause } : {}) },
    actorEmail
  );
  if (result.status !== 'ok') {
    return json({ status: result.status, error: result.error }, { status: HTTP[result.status] });
  }
  return json({ status: 'ok', data: result.data });
};
