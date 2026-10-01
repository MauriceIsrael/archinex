import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/auth/guard.server';
import { getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

/**
 * GET /api/knowledge/me — Récupère le profil KB de l'utilisateur connecté
 * Interroge LLMOps avec le header X-Actor-Email et enrichit avec le profil local
 */
export const GET: RequestHandler = async ({ locals }) => {
  requireAuth(locals);

  const user = locals.session!.user;
  const localExpert = await getKbExpertByUserId(user.id);

  // Appel souverain vers LLMOps avec X-Actor-Email
  const remoteMe = await llmopsClient.getMe(user.email);

  const kbRoles =
    localExpert?.kbRoles ||
    (remoteMe.status === 'ok' && remoteMe.data ? remoteMe.data.kb_roles : []);

  const ownedDomains =
    localExpert?.ownedDomains ||
    (remoteMe.status === 'ok' && remoteMe.data ? remoteMe.data.owned_domains : []);

  const kbHandle =
    localExpert?.kbHandle ||
    (remoteMe.status === 'ok' && remoteMe.data?.handle ? remoteMe.data.handle : `@${user.email.split('@')[0]}`);

  const pendingReviews =
    remoteMe.status === 'ok' && remoteMe.data ? remoteMe.data.pending_reviews : 0;

  const profile = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    kbHandle,
    kbRoles,
    ownedDomains,
    pendingReviews,
    delegated: localExpert?.delegated ?? false,
    isActive: localExpert?.isActive ?? true,
    invitationStatus: localExpert?.invitationStatus ?? 'active',
    llmopsStatus: remoteMe.status,
    offline: remoteMe.status === 'unavailable' || remoteMe.data?.offline === true
  };

  return json({
    status: 'ok',
    data: profile
  });
};
