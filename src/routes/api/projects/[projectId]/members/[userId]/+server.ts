import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeMember } from '$lib/server/projects/projectsDb';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const DELETE: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const actor = getActorFromEvent(event);
		const result = await removeMember(params.projectId, params.userId, actor);
		return json(result);
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
