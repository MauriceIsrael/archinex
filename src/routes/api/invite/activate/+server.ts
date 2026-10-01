import { json, error } from '@sveltejs/kit';
import { activateKbExpert, getKbExpertByInvitationToken } from '$lib/server/kbProfilesDb';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const ActivateSchema = z.object({
  token: z.string().min(10, 'Jeton d’invitation invalide'),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères')
});

/**
 * GET /api/invite/activate?token=xxx — Vérifier la validité d'un jeton
 */
export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) {
    throw error(400, { message: 'Jeton manquant' });
  }

  const expert = await getKbExpertByInvitationToken(token);
  if (!expert) {
    throw error(404, { message: 'Invitation introuvable' });
  }

  if (expert.invitationStatus === 'expired_invitation') {
    throw error(410, { message: 'Cette invitation a expiré' });
  }

  if (expert.invitationStatus === 'active') {
    return json({
      status: 'ok',
      data: {
        alreadyActive: true,
        expert: {
          name: expert.name,
          email: expert.email,
          kbHandle: expert.kbHandle
        }
      }
    });
  }

  return json({
    status: 'ok',
    data: {
      valid: true,
      expert: {
        name: expert.name,
        email: expert.email,
        kbHandle: expert.kbHandle,
        kbRoles: expert.kbRoles,
        ownedDomains: expert.ownedDomains
      }
    }
  });
};

/**
 * POST /api/invite/activate — Activer son compte expert avec son mot de passe
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw error(400, { message: msg });
  }

  try {
    const result = await activateKbExpert(parsed.data.token, parsed.data.password);
    return json({
      status: 'ok',
      message: 'Compte expert activé avec succès',
      data: result.expert
    });
  } catch (err: any) {
    throw error(400, { message: err.message || 'Activation impossible' });
  }
};
