import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { proposeLocalRuleToKnowledgeBase } from '$lib/server/rules/projectRulesService';
import { UnauthorizedArbitrationError } from '$lib/server/projects/arbitrationDb';

export const POST: RequestHandler = async (event) => {
	const { projectId, ruleId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	const actor = getActorInfo(event);

	try {
		const result = await proposeLocalRuleToKnowledgeBase({
			projectId,
			ruleId,
			actor
		});

		return json({ success: true, ...result }, { status: 201 });
	} catch (err: any) {
		if (err instanceof UnauthorizedArbitrationError) {
			return json({ error: err.message }, { status: 403 });
		}
		return json(
			{ error: err.message || 'Erreur lors de la proposition au référentiel.' },
			{ status: 400 }
		);
	}
};
