import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { kbNotificationService } from '$lib/server/kbNotifications';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const ownedDomains = localExpert?.ownedDomains || [];
  const kbRoles = localExpert?.kbRoles || [];
  const kbHandle = localExpert?.kbHandle || `@${user.email.split('@')[0]}`;

  // Appel souverain de la boîte de revue avec X-Actor-Email et handle d'expert
  const inboxRes = await llmopsClient.getReviewInbox(user.email, { actorHandle: kbHandle });
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
