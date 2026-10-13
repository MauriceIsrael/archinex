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

  // Récupération des clauses vérifiables pour ce référentiel (contrat 1.26, #93)
  let clausesList: any[] = [];
  try {
    const clausesRes = await llmopsClient.listCheckClauses(
      { framework: res.data.framework_id },
      user.email
    );
    clausesList = clausesRes.status === 'ok' ? (clausesRes.data?.clauses || []) : [];

    if (clausesList.length > 0) {
      const clausesByAsset = new Map<string, any[]>();
      for (const c of clausesList) {
        const list = clausesByAsset.get(c.asset_id) || [];
        list.push(c);
        clausesByAsset.set(c.asset_id, list);
      }

      for (const req of res.data.requirements) {
        if (!req.checks || req.checks.length === 0) {
          const direct = clausesByAsset.get(req.id) || [];
          const fromMapped = req.mapped_assets.flatMap((a) => clausesByAsset.get(a) || []);
          const merged = [...direct, ...fromMapped];
          const seen = new Set<string>();
          req.checks = merged.filter((c) => {
            if (seen.has(c.check_id)) return false;
            seen.add(c.check_id);
            return true;
          });
        }
      }
    }
  } catch {
    // Non bloquant si LLMOps ne supporte pas encore les clauses sur cette instance
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
    ingestion: res.data,
    clauses: clausesList
  };
};
