import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listStatements, createStatement } from '$lib/server/projects/projectsDb';
import { CreateStatementSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const subjectId = url.searchParams.get('subjectId') || undefined;
		const section = url.searchParams.get('section') || undefined;
		const status = url.searchParams.get('status') || undefined;

		const statements = await listStatements(params.projectId, {
			subjectId,
			section,
			status
		});
		return json({ statements });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = CreateStatementSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const statement = await createStatement(params.projectId, parsed.data, actor);
		return json({ statement }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
