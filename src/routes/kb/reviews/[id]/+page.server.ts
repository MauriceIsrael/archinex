import { error } from '@sveltejs/kit';
import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const [candRes, commentsRes] = await Promise.all([
    llmopsClient.getCandidate(params.id, user.email),
    llmopsClient.getComments(params.id, user.email)
  ]);

  if (candRes.status === 'error' || !candRes.data) {
    throw error(404, candRes.error || `Candidat ${params.id} introuvable`);
  }

  const ownedDomains = localExpert?.ownedDomains || [];
  const candidateDomain = candRes.data.domain || 'security';
  const isAuthorizedForDomain = ownedDomains.some(
    (d) => d.toLowerCase() === candidateDomain.toLowerCase()
  );

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
      ownedDomains
    },
    candidate: candRes.data,
    comments: commentsRes.data || [],
    isAuthorizedForDomain,
    offline: candRes.status === 'unavailable'
  };
};
