import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { enableReferenceRule } from '$lib/server/rules/projectRulesService';
import { UnauthorizedArbitrationError } from '$lib/server/projects/arbitrationDb';

export const POST: RequestHandler = async (event) => {
	const { projectId, ruleId } = event.params;
	const actor = getActorInfo(event);

	try {
		const result = await enableReferenceRule({
			projectId,
			ruleId,
			actor
		});

		return json({ status: 'ok', ...result }, { status: 200 });
	} catch (err: any) {
		if (err instanceof UnauthorizedArbitrationError) {
			return json({ error: err.message }, { status: 403 });
		}
		return json({ error: err.message || 'Erreur lors de la réactivation de la règle.' }, { status: 400 });
	}
};
