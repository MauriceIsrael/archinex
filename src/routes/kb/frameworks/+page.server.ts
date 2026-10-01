import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const ingestionsRes = await llmopsClient.listFrameworkIngestions(user.email);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    expert: {
      kbHandle: localExpert?.kbHandle || `@${user.email.split('@')[0]}`,
      kbRoles: localExpert?.kbRoles || [],
      ownedDomains: localExpert?.ownedDomains || []
    },
    frameworks: ingestionsRes.data || [],
    offline: ingestionsRes.status === 'unavailable' || ingestionsRes.status === 'error',
    error: ingestionsRes.error
  };
};
