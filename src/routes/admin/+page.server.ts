import { requireRole } from '$lib/auth/guard.server';
import { listKbExperts } from '$lib/server/kbProfilesDb';
import { loadCentralizedAccountsView } from '$lib/server/accountsAdmin';
import type { PageServerLoad } from './$types';

/**
 * Admin Load — Vue centralisée des comptes (Issue #76) :
 * Compte, rôle applicatif, rôles par espace (engagements), et identité dans le registre LLMOps.
 */
export const load: PageServerLoad = async ({ locals }) => {
  requireRole(locals, 'admin');

  const actorEmail = locals.session?.user?.email;
  const [centralized, experts] = await Promise.all([
    loadCentralizedAccountsView(actorEmail),
    listKbExperts()
  ]);

  return {
    accounts: centralized.accounts,
    workspaces: centralized.workspaces,
    domainsOverview: centralized.domainsOverview,
    unlinkedOwners: centralized.unlinkedOwners,
    ownersRegistry: centralized.ownersRegistry,
    // Compatibilité descendante
    users: centralized.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role
    })),
    experts
  };
};

