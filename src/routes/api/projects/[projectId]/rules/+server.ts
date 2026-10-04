import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import {
	getProjectRules,
	proposeLocalRule
} from '$lib/server/rules/projectRulesService';
import { UnauthorizedArbitrationError } from '$lib/server/projects/arbitrationDb';

export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;

	try {
		const rulesState = await getProjectRules(projectId);
		return json({
			status: 'ok',
			...rulesState
		});
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors de la récupération des règles.' }, { status: 400 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	const actor = getActorInfo(event);

	let body: any;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const { name, conditions, action } = body;

	if (!name || !conditions || !action) {
		return json(
			{ error: 'Champs requis manquants (name, conditions, action).' },
			{ status: 400 }
		);
	}

	try {
		const localRule = await proposeLocalRule({
			projectId,
			name,
			conditions,
			action,
			actor
		});

		return json({ status: 'ok', rule: localRule }, { status: 201 });
	} catch (err: any) {
		if (err instanceof UnauthorizedArbitrationError) {
			return json({ error: err.message }, { status: 403 });
		}
		return json({ error: err.message || 'Erreur lors de la proposition de règle locale.' }, { status: 400 });
	}
};
