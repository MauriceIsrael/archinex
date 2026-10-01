import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllEngagementsFromDb, saveEngagementToDb } from '$lib/server/engagementsDb';

export const GET: RequestHandler = async () => {
	try {
		const engagements = await getAllEngagementsFromDb();
		return json(engagements);
	} catch (err: any) {
		return json({ error: err.message || 'Failed to fetch engagements' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		if (!body?.engagement) {
			return json({ error: 'Missing engagement payload' }, { status: 400 });
		}
		const saved = await saveEngagementToDb(body.engagement);
		return json({ success: true, engagement: saved });
	} catch (err: any) {
		return json({ error: err.message || 'Failed to persist engagement' }, { status: 500 });
	}
};
