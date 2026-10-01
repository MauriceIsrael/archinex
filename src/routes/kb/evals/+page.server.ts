import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const [datasetRes, feedbacksRes] = await Promise.all([
    llmopsClient.getEvalDataset('check_option_v1', user.email),
    llmopsClient.listVerdictFeedbacks(user.email)
  ]);

  const kbRoles = localExpert?.kbRoles || [];
  const canEvaluate = kbRoles.includes('kb:evaluate') || kbRoles.includes('kb:admin') || user.role === 'admin';

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
      canEvaluate
    },
    dataset: datasetRes.data,
    feedbacks: feedbacksRes.data || [],
    offline: datasetRes.status === 'unavailable',
    error: datasetRes.error
  };
};
