import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveProjectActor } from '$lib/server/projects/actorHelper';
import {
	getSubjectArbitrationContext,
	recordArbitrationDecision,
	MaturityUnreadyError,
	UnauthorizedArbitrationError
} from '$lib/server/projects/arbitrationDb';
import { CreateDecisionSchema } from '$lib/schemas/decisionApiSchemas';
import { canDecideAlone } from '$lib/domain/options';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

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
		// Sujet non encore migré en table relationnelle (workspace local ou nouveau projet)
		// On renvoie un contexte neutre vide sans polluer la console avec une 404
		return json({
			maturityResult: null,
			decision: null,
			criteria: [],
			options: [],
			evaluations: [],
			arguments: []
		});
	}
};

export const POST: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	const actor = await resolveProjectActor(event, event.params.projectId!);

	let body: any;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = CreateDecisionSchema.safeParse(body);
	if (!parsed.success) {
		const fieldErrors = Object.entries(parsed.error.flatten().fieldErrors)
			.map(([field, msgs]) => `${field} : ${msgs?.join(', ')}`)
			.join(' ; ');
		const formErrors = parsed.error.flatten().formErrors.join(' ; ');
		const combined = [fieldErrors, formErrors].filter(Boolean).join(' ; ');

		return json(
			{
				error: combined ? `Données de décision invalides (${combined})` : 'Données de décision invalides.',
				details: parsed.error.flatten()
			},
			{ status: 400 }
		);
	}

	try {
		const decision = await recordArbitrationDecision(subjectId, parsed.data, actor);
		// Le Lead Architect décide seul ; la décision d'un autre architecte attend la revue d'un décideur distinct.
		const awaitingReview = !canDecideAlone(actor.role);
		return json({ decision, awaitingReview, subjectLevel: awaitingReview ? 'L2_decomposed' : 'L3_decided' }, { status: 201 });
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
