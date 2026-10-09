import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listCriteria, createCriterion } from '$lib/server/projects/optionsDb';
import { ensureSubjectExists } from '$lib/server/projects/projectsDb';
import { CreateCriterionSchema } from '$lib/schemas/optionsApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const criteria = await listCriteria(params.subjectId);
		return json({ criteria });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = CreateCriterionSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		await ensureSubjectExists(params.projectId, params.subjectId);
		const criterion = await createCriterion(params.subjectId, parsed.data, actor);
		return json({ criterion }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
