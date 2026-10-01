import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    request.headers.get('x-actor-email') || locals.session?.user?.email || undefined;

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
    request.headers.get('x-actor-email') || locals.session?.user?.email || undefined;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ status: 'error', error: 'Format JSON invalide' }, { status: 400 });
  }

  const { subject_id, option_id, rule_id, verdict_status, disagree_rationale, suggested_action } =
    body || {};

  if (!subject_id || !option_id || !disagree_rationale) {
    return json(
      {
        status: 'error',
        error: 'Champs obligatoires manquants : subject_id, option_id et disagree_rationale sont requis'
      },
      { status: 400 }
    );
  }

  const result = await llmopsClient.submitVerdictFeedback(
    {
      subject_id,
      option_id,
      rule_id,
      verdict_status,
      disagree_rationale,
      suggested_action: suggested_action || 'add_test_case',
      author_email: actorEmail
    },
    actorEmail
  );

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
