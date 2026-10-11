import { requireAuth } from '$lib/auth/guard.server';
import { error } from '@sveltejs/kit';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  const [res, me] = await Promise.all([
    llmopsClient.getFrameworkIngestion(params.id, user.email),
    // Droits de revue : le registre des responsables de LLMOps fait autorité (même adresse e-mail)
    llmopsClient.getMe(user.email)
  ]);
  const registered = me.status === 'ok' ? me.data : undefined;

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
      kbHandle: registered?.handle || localExpert?.kbHandle || `@${user.email.split('@')[0]}`,
      kbRoles: registered?.kb_roles?.length ? registered.kb_roles : localExpert?.kbRoles || [],
      ownedDomains: registered?.owned_domains?.length ? registered.owned_domains : localExpert?.ownedDomains || [],
      /** Responsable reconnu par LLMOps : sinon ses décisions seront refusées. */
      registered: Boolean(registered)
    },
    ingestion: res.data
  };
};
