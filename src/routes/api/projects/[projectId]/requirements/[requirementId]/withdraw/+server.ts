import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { withdrawRequirementDecision } from '$lib/server/projects/hubRequirementDecisions';
import { hubErrorResponse } from '$lib/server/projects/hubErrors';

/**
 * Retire la décision proposée ou affirmée sur une exigence (projet basculé sur le Hub).
 * Le Hub applique ses règles : l'auteur ou un décideur retire.
 * Un projet non basculé décide en une étape (PATCH) : il n'y a rien à retirer ici.
 */
export const POST: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	if (!auth.project || !isProjectCutOverToHub(auth.project)) {
		return json(
			{ status: 'error', error: 'not_cut_over', reason: 'Ce projet n\'est pas basculé sur le Hub : la décision sur une exigence y est directe (PATCH).' },
			{ status: 409 }
		);
	}
	try {
		const result = await withdrawRequirementDecision(auth.project, decodeURIComponent(event.params.requirementId), auth.session!.user.email);
		return json({ status: 'ok', systemOfRecord: 'hub', ...result });
	} catch (e) {
		return hubErrorResponse(e);
	}
};
