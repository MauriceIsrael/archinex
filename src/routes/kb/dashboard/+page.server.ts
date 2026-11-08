import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { computeKbClausesHealth } from '$lib/domain/kbClausesHealth';
import { configuredModel } from '$lib/server/similarity/encoder';
import { ensureEmbeddingsSynced, needsEmbeddingSync } from '$lib/server/similarity/embeddings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);
  const configuredEmbeddingModel = configuredModel();

  let [healthRes, publicationsRes, campaignsRes, clausesRes, frameworksRes] = await Promise.all([
    llmopsClient.getKbHealth(user.email),
    llmopsClient.listKbPublications(user.email),
    llmopsClient.listKbCampaigns(user.email),
    llmopsClient.listCheckClauses({}, user.email).catch(() => null),
    llmopsClient.getComplianceFrameworks().catch(() => null)
  ]);

  if (healthRes.status === 'ok' && healthRes.data && needsEmbeddingSync(healthRes.data, configuredEmbeddingModel)) {
    const syncRes = await ensureEmbeddingsSynced(llmopsClient, { model: configuredEmbeddingModel });
    if (syncRes.status === 'ok' && syncRes.count > 0) {
      healthRes = await llmopsClient.getKbHealth(user.email);
    }
  }

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
    configuredEmbeddingModel,
    publications: publicationsRes.data || [],
    campaigns: campaignsRes.data || [],
    clausesHealth,
    offline
  };
};

