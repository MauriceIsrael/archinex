import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { affirmLocalRule } from '$lib/server/rules/projectRulesService';
import { UnauthorizedArbitrationError } from '$lib/server/projects/arbitrationDb';

export const POST: RequestHandler = async (event) => {
	const { projectId, ruleId } = event.params;
	const actor = getActorInfo(event);

	try {
		const affirmed = await affirmLocalRule({
			projectId,
			ruleId,
			actor
		});

		return json({ status: 'ok', rule: affirmed }, { status: 200 });
	} catch (err: any) {
		if (err.message && err.message.includes('Invariant K16 violé')) {
			return json({ error: err.message }, { status: 409 });
		}
		if (err instanceof UnauthorizedArbitrationError) {
			return json({ error: err.message }, { status: 403 });
		}
		return json({ error: err.message || 'Erreur lors de l’affirmation de la règle locale.' }, { status: 400 });
	}
};
