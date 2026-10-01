import { requireAuth } from '$lib/auth/guard.server';
import { error } from '@sveltejs/kit';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const res = await llmopsClient.getFrameworkIngestion(params.id, user.email);

  if (res.status === 'unavailable') {
    throw error(503, 'Mode hors-ligne : service de référentiels indisponible');
  }

  if (res.status === 'error' || !res.data) {
    throw error(404, `Référentiel '${params.id}' introuvable`);
  }

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
    ingestion: res.data
  };
};
