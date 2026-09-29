import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import {
	getSubjectArbitrationContext,
	recordArbitrationDecision,
	MaturityUnreadyError,
	UnauthorizedArbitrationError
} from '$lib/server/projects/arbitrationDb';
import { CreateDecisionSchema } from '$lib/schemas/decisionApiSchemas';

export const GET: RequestHandler = async ({ params }) => {
	const { subjectId } = params;
	try {
		const ctx = await getSubjectArbitrationContext(subjectId);
		return json({
			maturityResult: ctx.maturityResult,
			decision: ctx.decision,
			criteria: ctx.criteria,
			options: ctx.options,
			evaluations: ctx.evaluations,
			arguments: ctx.arguments
		});
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors de la récupération du contexte d’arbitrage.' }, { status: 404 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { subjectId } = event.params;
	const actor = getActorInfo(event);

	let body: any;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = CreateDecisionSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				error: 'Données de décision invalides.',
				details: parsed.error.flatten()
			},
			{ status: 400 }
		);
	}

	try {
		const decision = await recordArbitrationDecision(subjectId, parsed.data, actor);
		return json({ decision }, { status: 201 });
	} catch (err: any) {
		if (err instanceof MaturityUnreadyError) {
			return json(
				{
					error: err.message,
					blockers: err.blockers
				},
				{ status: 422 }
			);
		}

		if (err instanceof UnauthorizedArbitrationError) {
			return json(
				{
					error: err.message
				},
				{ status: 403 }
			);
		}

		return json(
			{
				error: err.message || "Erreur interne lors de l'enregistrement de l'arbitrage."
			},
			{ status: 500 }
		);
	}
};
