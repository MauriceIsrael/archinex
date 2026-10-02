import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  const result = await llmopsClient.listVerdictFeedbacks(actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error }, { status: 500 });
  }

  return json({
    status: 'ok',
    data: result.data || []
  });
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

  const typed_id =
    body?.typed_id || (body?.rule_id ? (body.rule_id.startsWith('pattern:') || body.rule_id.startsWith('rule:') ? body.rule_id : `pattern:${body.rule_id}`) : 'pattern:RULE-HA-SUPERVISION');
  const feedback = body?.feedback || 'wrong_violation';
  const justification = body?.justification || body?.disagree_rationale || 'Désaccord motivé sur le verdict';
  const option = body?.option || {
    title: body?.option_id || 'Option sous délibération',
    description: body?.disagree_rationale || ''
  };

  const payload = {
    ...body,
    typed_id,
    feedback,
    justification,
    option,
    author_email: actorEmail
  };

  const result = await llmopsClient.submitVerdictFeedback(payload, actorEmail);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de l’enregistrement du retour' }, { status: 400 });
  }

  return json(
    {
      status: 'ok',
      data: result.data
    },
    { status: 201 }
  );
};
