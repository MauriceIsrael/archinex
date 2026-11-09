import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const [datasetRes, feedbacksRes, remoteMe] = await Promise.all([
    llmopsClient.getEvalDataset('check_option_v1', user.email),
    llmopsClient.listVerdictFeedbacks(user.email),
    llmopsClient.getMe(user.email)
  ]);

  const localRoles = localExpert?.kbRoles || [];
  const remoteRoles = remoteMe.status === 'ok' && remoteMe.data?.kb_roles ? remoteMe.data.kb_roles : [];
  const kbRoles = Array.from(new Set([...localRoles, ...remoteRoles]));

  // Le serveur souverain LLMOps exige impérativement le rôle 'kb:evaluate' ou 'kb:maintain'
  // pour annoter les cas et exécuter le benchmark (principe de séparation des fonctions).
  const canEvaluate = kbRoles.includes('kb:evaluate') || kbRoles.includes('kb:maintain');

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    expert: {
      kbHandle:
        localExpert?.kbHandle ||
        (remoteMe.status === 'ok' && remoteMe.data?.handle ? remoteMe.data.handle : `@${user.email.split('@')[0]}`),
      kbRoles,
      ownedDomains:
        localExpert?.ownedDomains ||
        (remoteMe.status === 'ok' && remoteMe.data?.owned_domains ? remoteMe.data.owned_domains : []),
      canEvaluate
    },
    dataset: datasetRes.data,
    feedbacks: feedbacksRes.data || [],
    offline: datasetRes.status === 'unavailable',
    error: datasetRes.error
  };
};
