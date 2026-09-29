import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listMembers, addOrUpdateMember } from '$lib/server/projects/projectsDb';
import { ProjectMemberSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const members = await listMembers(params.projectId);
		return json({ members });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = ProjectMemberSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const member = await addOrUpdateMember(params.projectId, parsed.data, actor);
		return json({ member }, { status: 200 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
