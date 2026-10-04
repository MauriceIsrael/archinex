import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { disableReferenceRule } from '$lib/server/rules/projectRulesService';
import { UnauthorizedArbitrationError } from '$lib/server/projects/arbitrationDb';

export const POST: RequestHandler = async (event) => {
	const { projectId, ruleId } = event.params;
	const actor = getActorInfo(event);

	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		// body might be empty or invalid
	}

	const justification = body.justification;

	if (!justification || typeof justification !== 'string' || justification.trim().length < 5) {
		return json(
			{
				error: 'Une justification explicite (au moins 5 caractères) est strictement obligatoire pour désactiver une règle.'
			},
			{ status: 400 }
		);
	}

	try {
		const override = await disableReferenceRule({
			projectId,
			ruleId,
			justification: justification.trim(),
			actor
		});

		return json({ status: 'ok', override }, { status: 200 });
	} catch (err: any) {
		if (err instanceof UnauthorizedArbitrationError) {
			return json({ error: err.message }, { status: 403 });
		}
		return json({ error: err.message || 'Erreur lors de la désactivation de la règle.' }, { status: 400 });
	}
};
