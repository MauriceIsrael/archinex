import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listOptions, createOption } from '$lib/server/projects/optionsDb';
import { CreateOptionSchema } from '$lib/schemas/optionsApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const options = await listOptions(params.subjectId);
		return json({ options });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = CreateOptionSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const option = await createOption(params.subjectId, parsed.data, actor);
		return json({ option }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
