import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSubjects, createSubject } from '$lib/server/projects/projectsDb';
import { CreateSubjectSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const subjects = await listSubjects(params.projectId);
		return json({ subjects });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = CreateSubjectSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const subject = await createSubject(params.projectId, parsed.data, actor);
		return json({ subject }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
