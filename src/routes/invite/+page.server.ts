import { getInvitationByToken } from '$lib/server/invitations';
import { prisma } from '$lib/server/prisma';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');

	if (!token) {
		return {
			error: 'missing_token',
			message: 'Jeton d\'invitation manquant dans le lien.'
		};
	}

	const invitation = getInvitationByToken(token);

	if (!invitation) {
		return {
			error: 'invalid_token',
			message: 'Ce lien d\'invitation est invalide ou n\'existe plus.'
		};
	}

	if (invitation.status === 'expired') {
		return {
			error: 'expired_token',
			message: 'Cette invitation a expiré (délai de 7 jours dépassé).'
		};
	}

	if (invitation.status === 'accepted') {
		return {
			error: 'already_accepted',
			message: 'Cette invitation a déjà été acceptée.'
		};
	}

	// Vérifier si un compte existe déjà
	const existingUser = await prisma.user.findUnique({
		where: { email: invitation.email.toLowerCase() }
	});

	return {
		invitation,
		userExists: !!existingUser
	};
};
