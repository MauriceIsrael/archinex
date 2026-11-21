import { json, type RequestHandler } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

const ALLOWED_LLMOPS_ROLES = new Set(['user', 'admin']);

function requireLlmopsSession(locals: App.Locals) {
  const session = locals.session;
  if (!session?.user) {
    return {
      error: json(
        { status: 'error', error: 'Non authentifié : session requise' },
        { status: 401 }
      )
    };
  }
  if (!ALLOWED_LLMOPS_ROLES.has(session.user.role)) {
    return {
      error: json(
        { status: 'error', error: 'Accès refusé : rôle insuffisant pour accéder au relais LLMOps' },
        { status: 403 }
      )
    };
  }
  return { session };
}

export const GET: RequestHandler = async (event) => {
  const auth = requireLlmopsSession(event.locals);
  if (auth.error) return auth.error;

  const { url } = event;
  const action = url.searchParams.get('action') || 'sync';
  const engagement = url.searchParams.get('engagement') || undefined;
  const subject = url.searchParams.get('subject') || undefined;
  const status = url.searchParams.get('status') || undefined;

  if (engagement) {
    const projectAuth = await authorizeProjectAccess(event, engagement);
    if (projectAuth.error && projectAuth.error.status !== 404) {
      return projectAuth.error;
    }
  }

  try {
    switch (action) {
      case 'health': {
        const result = await llmopsClient.getHealth();
        return json(result);
      }
      case 'snapshot': {
        const result = await llmopsClient.getLatestSnapshot();
        return json(result);
      }
      case 'board': {
        const result = await llmopsClient.getBoard(engagement);
        return json(result);
      }
      case 'statements': {
        const result = await llmopsClient.getStatements(engagement, subject);
        return json(result);
      }
      case 'conflicts': {
        const result = await llmopsClient.getConflicts(engagement, status);
        return json(result);
      }
      case 'sync':
      default: {
        const result = await llmopsClient.syncEngagement(engagement);
        return json(result);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown LLMOps proxy error';
    return json({ status: 'error', error: message }, { status: 500 });
  }
};

export const POST: RequestHandler = async (event) => {
  const auth = requireLlmopsSession(event.locals);
  if (auth.error) return auth.error;

  const { request, url } = event;
  const action = url.searchParams.get('action') || 'shred';

  try {
    const body = await request.json();
    if (action === 'shred') {
      const { rfpText, documentId, documentVersion, engagement } = body;
      if (!rfpText || typeof rfpText !== 'string') {
        return json({ status: 'error', error: 'Missing rfpText' }, { status: 400 });
      }
      if (engagement && typeof engagement === 'string') {
        const projectAuth = await authorizeProjectAccess(event, engagement);
        if (projectAuth.error && projectAuth.error.status !== 404) {
          return projectAuth.error;
        }
      }
      const result = await llmopsClient.shredRfp(rfpText, documentId, documentVersion, engagement);
      return json(result);
    }

    if (action === 'suggest' || action === 'store-rule') {
      const { title, rationale, suggestedChange, sourceEngagement } = body;
      if (!title || !suggestedChange) {
        return json({ status: 'error', error: 'Missing title or suggestedChange' }, { status: 400 });
      }
      if (sourceEngagement && typeof sourceEngagement === 'string') {
        const projectAuth = await authorizeProjectAccess(event, sourceEngagement);
        if (projectAuth.error && projectAuth.error.status !== 404) {
          return projectAuth.error;
        }
      }
      const result = await llmopsClient.submitKnowledgeSuggestion({
        title,
        rationale: rationale || 'Induction et validation humaine depuis Archinex',
        suggestedChange,
        author: auth.session.user.name || auth.session.user.email,
        sourceEngagement,
        contactEmail: auth.session.user.email
      });
      return json(result);
    }

    return json({ status: 'error', error: `Unsupported action '${action}'` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown LLMOps proxy error';
    return json({ status: 'error', error: message }, { status: 500 });
  }
};
