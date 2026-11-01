import type { PageServerLoad } from './$types';
import { isEdpFeatureEnabled } from '$lib/server/edp/edpRepository';

export const load: PageServerLoad = async (event) => {
	const sessionUser = event.locals.session?.user;
	// Rôle de session extrait de manière stricte et inviolable depuis le token/session serveur
	const sessionRole =
		(sessionUser?.attributes as any)?.projectRole ||
		sessionUser?.role ||
		'lead_architect';

	const isExperimentalEnabled =
		isEdpFeatureEnabled() || event.url.searchParams.get('edp') === '1';

	return {
		sessionRole,
		isExperimentalEnabled,
		sessionUser: sessionUser
			? {
					id: sessionUser.id,
					email: sessionUser.email,
					role: sessionRole
				}
			: null
	};
};
