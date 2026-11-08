import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { ensureArchinexUserRegisteredInLlmops } from '$lib/server/accountsAdmin';
import { kbNotificationService } from '$lib/server/kbNotifications';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  let localExpert = await getKbExpertByUserId(user.id);

  let ownedDomains = localExpert?.ownedDomains || [];
  let kbRoles = localExpert?.kbRoles || [];
  let kbHandle = localExpert?.kbHandle || `@${user.email.split('@')[0]}`;

  // Appel souverain de la boîte de revue avec X-Actor-Email et handle d'expert
  let inboxRes = await llmopsClient.getReviewInbox(user.email, { actorHandle: kbHandle });

  // Auto-inscription Just-In-Time (SSoT) si le registre LLMOps ne connaît pas encore ce compte
  if (inboxRes.status === 'not_registered') {
    const syncRes = await ensureArchinexUserRegisteredInLlmops(user.email);
    if (syncRes.success) {
      localExpert = await getKbExpertByUserId(user.id);
      ownedDomains = localExpert?.ownedDomains || [];
      kbRoles = localExpert?.kbRoles || [];
      kbHandle = localExpert?.kbHandle || `@${user.email.split('@')[0]}`;
      inboxRes = await llmopsClient.getReviewInbox(user.email, { actorHandle: kbHandle });
    }
  }

  const notifications = await kbNotificationService.getUserNotifications(user.id);

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
    inbox: {
      items: inboxRes.data || [],
      status: inboxRes.status,
      offline: inboxRes.status === 'unavailable',
      error: inboxRes.error
    },
    notifications
  };
};
