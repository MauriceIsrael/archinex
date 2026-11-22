import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import {
	HydrateEdpInputSchema,
	handleHydrateEdp,
	runEdpActionRoute
} from '$lib/server/edp/actions';

export const POST: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	return runEdpActionRoute(event, HydrateEdpInputSchema, handleHydrateEdp, auth);
};
