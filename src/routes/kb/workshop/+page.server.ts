import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const initialTemplateRes = await llmopsClient.getAssetTemplate('principle');

  const ownedDomains = localExpert?.ownedDomains || ['security', 'cloud', 'architecture'];
  const kbRoles = localExpert?.kbRoles || ['kb:maintain', 'kb:review'];
  const kbHandle = localExpert?.kbHandle || `@${user.email.split('@')[0]}`;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    expert: {
      kbHandle,
      kbRoles,
      ownedDomains
    },
    initialTemplate: initialTemplateRes.data,
    offline: initialTemplateRes.status === 'unavailable'
  };
};
