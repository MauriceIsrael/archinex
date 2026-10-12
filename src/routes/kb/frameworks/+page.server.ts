import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { ComplianceFrameworkOverview } from '$lib/types/llmops';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);
  const statusFilter = url.searchParams.get('status') || undefined;

  const [ingestionsRes, complianceRes] = await Promise.all([
    llmopsClient.listFrameworkIngestions(user.email, statusFilter),
    llmopsClient.getComplianceFrameworks()
  ]);

  const ingestions = ingestionsRes.data || [];
  const complianceFrameworks: ComplianceFrameworkOverview[] = (complianceRes.data || []).map((cf) => {
    const applied = ingestions.find(
      (ing) =>
        ing.framework_id.toLowerCase() === cf.framework.toLowerCase() &&
        (ing.status === 'applied' || ing.status === 'partially_applied')
    );
    return {
      ...cf,
      applied_ingestion_id: applied ? applied.id : null
    };
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
      kbRoles: localExpert?.kbRoles || [],
      ownedDomains: localExpert?.ownedDomains || []
    },
    frameworks: ingestions,
    complianceFrameworks,
    statusFilter: statusFilter || 'all',
    offline:
      (ingestionsRes.status === 'unavailable' || ingestionsRes.status === 'error') &&
      (complianceRes.status === 'unavailable' || complianceRes.status === 'error'),
    error: ingestionsRes.error || complianceRes.error
  };
};
