import { getKbExpertByInvitationToken } from '$lib/server/kbProfilesDb';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const token = url.searchParams.get('token');

  if (!token) {
    return {
      valid: false,
      error: "Jeton d'invitation manquant dans l'adresse URL."
    };
  }

  const expert = await getKbExpertByInvitationToken(token);
  if (!expert) {
    return {
      valid: false,
      error: "Ce jeton d'invitation est invalide ou n'existe pas."
    };
  }

  if (expert.invitationStatus === 'expired_invitation') {
    return {
      valid: false,
      error: "Ce lien d'invitation a expiré (la durée de validité souveraine de 7 jours est dépassée)."
    };
  }

  if (expert.invitationStatus === 'active') {
    return {
      valid: false,
      alreadyActive: true,
      expert: {
        name: expert.name,
        email: expert.email,
        kbHandle: expert.kbHandle
      }
    };
  }

  return {
    valid: true,
    token,
    expert: {
      name: expert.name,
      email: expert.email,
      kbHandle: expert.kbHandle,
      kbRoles: expert.kbRoles,
      ownedDomains: expert.ownedDomains
    }
  };
};
