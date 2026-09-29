import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listEvaluations, upsertEvaluation } from '$lib/server/projects/optionsDb';
import { UpsertEvaluationSchema } from '$lib/schemas/optionsApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const evaluations = await listEvaluations(params.subjectId);
		return json({ evaluations });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = UpsertEvaluationSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const evaluation = await upsertEvaluation(params.subjectId, parsed.data, actor);
		return json({ evaluation }, { status: 200 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 400 });
	}
};
