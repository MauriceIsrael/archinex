/**
 * Garde-fous et autorisations d'expertise KB (Casbin / ABAC / RBAC)
 * Lot A6 — Comptes Experts, Rôles KB & Propagation d'Identité
 */

import { error } from '@sveltejs/kit';
import { requireAuth } from './guard.server';
import { getEnforcer, checkPermission } from '$lib/server/casbin';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import type { KbRole } from '$lib/types/llmops';

/**
 * Vérifie si un utilisateur possède un rôle KB spécifique
 */
export async function hasKbRole(userId: string, role: KbRole): Promise<boolean> {
  const ef = await getEnforcer();
  const hasGrouping = await ef.hasGroupingPolicy(userId, role);
  if (hasGrouping) return true;

  const expert = await getKbExpertByUserId(userId);
  if (expert && expert.isActive && expert.kbRoles.includes(role)) {
    return true;
  }

  return false;
}

/**
 * Vérifie si un utilisateur a le droit d'effectuer une action KB
 */
export async function canUserPerformKbAction(
  user: { id: string; role?: string; attributes?: Record<string, unknown> },
  resourceType: string,
  action: string
): Promise<boolean> {
  // L'administrateur système a tous les droits
  if (user.role === 'admin') return true;

  const sub = {
    id: user.id,
    role: user.role || 'user',
    ...(user.attributes || {})
  };

  const resource = { type: resourceType };
  return await checkPermission(sub, resource, action);
}

/**
 * Garde SvelteKit : exige un rôle KB spécifique
 */
export async function requireKbRole(locals: App.Locals, requiredRole: KbRole): Promise<void> {
  requireAuth(locals);

  // Admin global hérite de tous les rôles KB
  if (locals.session!.user.role === 'admin') {
    return;
  }

  const allowed = await hasKbRole(locals.session!.user.id, requiredRole);
  if (!allowed) {
    throw error(403, { message: `Accès refusé : rôle ${requiredRole} requis` });
  }
}

/**
 * Garde SvelteKit : exige une permission KB Casbin
 */
export async function requireKbPermission(
  locals: App.Locals,
  resourceType: string,
  action: string
): Promise<void> {
  requireAuth(locals);

  if (locals.session!.user.role === 'admin') {
    return;
  }

  const allowed = await canUserPerformKbAction(locals.session!.user, resourceType, action);
  if (!allowed) {
    throw error(403, {
      message: `Accès refusé : action '${action}' non autorisée sur '${resourceType}'`
    });
  }
}
