import { requireAuth } from '$lib/auth/guard.server';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAuth(locals);
  const email = locals.session!.user.email;
  const framework = url.searchParams.get('framework') || undefined;

  const [list, me] = await Promise.all([llmopsClient.listCheckClauses({ framework }, email), llmopsClient.getMe(email)]);
  const registered = me.status === 'ok' ? me.data : undefined;

  return {
    framework: framework ?? null,
    clauses: list.status === 'ok' ? list.data! : null,
    error: list.status === 'ok' ? null : list.error,
    expert: {
      handle: registered?.handle ?? null,
      /** Publier la doctrine est réservé au rôle kb:maintain (ou kb:admin) dans LLMOps. */
      canPublish: Boolean(registered?.kb_roles?.some((r: string) => r === 'kb:maintain' || r === 'kb:admin'))
    }
  };
};
