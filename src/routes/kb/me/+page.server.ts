import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { ensureArchinexUserRegisteredInLlmops } from '$lib/server/accountsAdmin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  let localExpert = await getKbExpertByUserId(user.id);

  // Appel souverain avec propagation d'identité X-Actor-Email
  let remoteMe = await llmopsClient.getMe(user.email);

  // Auto-inscription Just-In-Time (SSoT) si le registre LLMOps ne connaît pas encore ce compte
  if (remoteMe.status === 'not_registered') {
    const syncRes = await ensureArchinexUserRegisteredInLlmops(user.email);
    if (syncRes.success) {
      remoteMe = await llmopsClient.getMe(user.email);
      localExpert = await getKbExpertByUserId(user.id);
    }
  }

  const kbRoles =
    localExpert?.kbRoles ||
    (remoteMe.status === 'ok' && remoteMe.data ? remoteMe.data.kb_roles : []);

  const ownedDomains =
    localExpert?.ownedDomains ||
    (remoteMe.status === 'ok' && remoteMe.data ? remoteMe.data.owned_domains : []);

  const kbHandle =
    localExpert?.kbHandle ||
    (remoteMe.status === 'ok' && remoteMe.data?.handle ? remoteMe.data.handle : `@${user.email.split('@')[0]}`);

  const pendingReviews =
    remoteMe.status === 'ok' && remoteMe.data ? remoteMe.data.pending_reviews : 0;

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
      ownedDomains,
      pendingReviews,
      delegated: localExpert?.delegated ?? false,
      isActive: localExpert?.isActive ?? true,
      invitationStatus: localExpert?.invitationStatus ?? 'active'
    },
    llmops: {
      status: remoteMe.status,
      offline: remoteMe.status === 'unavailable' || remoteMe.data?.offline === true,
      error: remoteMe.error
    }
  };
};
