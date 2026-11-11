import { requireRole } from '$lib/auth/guard.server';
import { getAdminReflexStudioState } from '$lib/server/rules/reflexCatalogService';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireRole(locals, 'admin');
	const studio = await getAdminReflexStudioState();
	return {
		...studio
	};
};
