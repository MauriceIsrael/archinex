import type { LayoutServerLoad } from './$types';
import { requireAuth } from '$lib/auth/guard.server';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	requireAuth(locals, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	return {};
};
