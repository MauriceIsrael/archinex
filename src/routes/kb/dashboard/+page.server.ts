import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { computeKbClausesHealth } from '$lib/domain/kbClausesHealth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const [healthRes, publicationsRes, campaignsRes, clausesRes, frameworksRes] = await Promise.all([
    llmopsClient.getKbHealth(user.email),
    llmopsClient.listKbPublications(user.email),
    llmopsClient.listKbCampaigns(user.email),
    llmopsClient.listCheckClauses({}, user.email).catch(() => null),
    llmopsClient.getComplianceFrameworks().catch(() => null)
  ]);

  const kbRoles = localExpert?.kbRoles || [];
  const canPublish =
    kbRoles.includes('kb:admin') || kbRoles.includes('kb:maintain') || user.role === 'admin';

  const offline = healthRes.status === 'unavailable';
  const clausesHealth = computeKbClausesHealth(clausesRes?.data ?? null, {
    frameworksOverview: frameworksRes?.data,
    offline: offline || (!clausesRes?.data && !frameworksRes?.data)
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    expert: {
      kbHandle: localExpert?.kbHandle || `@${user.email.split('@')[0]}`,
      kbRoles,
      ownedDomains: localExpert?.ownedDomains || [],
      canPublish
    },
    health: healthRes.data,
    publications: publicationsRes.data || [],
    campaigns: campaignsRes.data || [],
    clausesHealth,
    offline
  };
};

