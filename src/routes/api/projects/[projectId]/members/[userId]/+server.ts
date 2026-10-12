import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeMember } from '$lib/server/projects/projectsDb';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const DELETE: RequestHandler = async (event) => {
	const { params } = event;
	const auth = await authorizeProjectAccess(event, params.projectId);
	if (auth.error) return auth.error;
	try {
		const actor = getActorFromEvent(event);
		const result = await removeMember(params.projectId, params.userId, actor);
		return json(result);
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
