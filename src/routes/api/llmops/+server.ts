import { json, type RequestHandler } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';

export const GET: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action') || 'sync';
  const engagement = url.searchParams.get('engagement') || undefined;
  const subject = url.searchParams.get('subject') || undefined;
  const status = url.searchParams.get('status') || undefined;

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

export const POST: RequestHandler = async ({ request, url }) => {
  const action = url.searchParams.get('action') || 'shred';

  try {
    const body = await request.json();
    if (action === 'shred') {
      const { rfpText, documentId, documentVersion, engagement } = body;
      if (!rfpText || typeof rfpText !== 'string') {
        return json({ status: 'error', error: 'Missing rfpText' }, { status: 400 });
      }
      const result = await llmopsClient.shredRfp(rfpText, documentId, documentVersion, engagement);
      return json(result);
    }

    if (action === 'suggest' || action === 'store-rule') {
      const { title, rationale, suggestedChange, author, sourceEngagement, contactEmail } = body;
      if (!title || !suggestedChange) {
        return json({ status: 'error', error: 'Missing title or suggestedChange' }, { status: 400 });
      }
      const result = await llmopsClient.submitKnowledgeSuggestion({
        title,
        rationale: rationale || 'Induction et validation humaine depuis Archinex',
        suggestedChange,
        author,
        sourceEngagement,
        contactEmail
      });
      return json(result);
    }

    return json({ status: 'error', error: `Unsupported action '${action}'` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown LLMOps proxy error';
    return json({ status: 'error', error: message }, { status: 500 });
  }
};
