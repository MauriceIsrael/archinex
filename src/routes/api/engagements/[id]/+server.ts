import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getEngagementByIdFromDb,
	updateEngagementInDb,
	deleteEngagementFromDb
} from '$lib/server/engagementsDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const GET: RequestHandler = async (event) => {
	const id = event.params.id;
	if (!id) {
		return json({ error: 'Missing engagement ID' }, { status: 400 });
	}
	const auth = await authorizeProjectAccess(event, id);
	if (auth.error) return auth.error;

	const engagement = await getEngagementByIdFromDb(id);
	if (!engagement) {
		return json({ error: `Engagement '${id}' not found` }, { status: 404 });
	}

	return json(engagement);
};

export const PATCH: RequestHandler = async (event) => {
	const id = event.params.id;
	if (!id) {
		return json({ error: 'Missing engagement ID' }, { status: 400 });
	}
	const auth = await authorizeProjectAccess(event, id);
	if (auth.error) return auth.error;

	try {
		const body = await event.request.json();
		const updated = await updateEngagementInDb(id, body);
		if (!updated) {
			return json({ error: `Engagement '${id}' not found` }, { status: 404 });
		}
		return json({ success: true, engagement: updated });
	} catch (err: any) {
		return json({ error: err.message || 'Failed to update engagement' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const id = event.params.id;
	if (!id) {
		return json({ error: 'Missing engagement ID' }, { status: 400 });
	}
	const auth = await authorizeProjectAccess(event, id);
	if (auth.error) return auth.error;

	try {
		const success = await deleteEngagementFromDb(id);
		if (!success) {
			return json({ error: `Failed to delete engagement '${id}'` }, { status: 500 });
		}
		return json({ success: true, id });
	} catch (err: any) {
		return json({ error: err.message || 'Failed to delete engagement' }, { status: 500 });
	}
};
