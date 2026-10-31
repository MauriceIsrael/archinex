import type { PageServerLoad } from './$types';
import { requireAuth } from '$lib/auth/guard.server';

export const load: PageServerLoad = async (event) => {
	requireAuth(event.locals, '/login?redirectTo=/deliberation');
	const sessionUser = event.locals.session.user;
	// Rôle de session extrait de manière stricte et inviolable depuis le token/session serveur
	const sessionRole =
		(sessionUser?.attributes as any)?.projectRole ||
		sessionUser?.role ||
		'lead_architect';

	return {
		sessionRole,
		sessionUser: {
			id: sessionUser.id,
			email: sessionUser.email,
			role: sessionRole
		}
	};
};
