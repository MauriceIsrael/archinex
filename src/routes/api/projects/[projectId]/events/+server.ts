import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDomainEvents } from '$lib/server/projects/projectsDb';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const since = url.searchParams.get('since') || undefined;
		const entityType = url.searchParams.get('entityType') || undefined;
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? parseInt(limitParam, 10) : 100;

		const events = await getDomainEvents(params.projectId, {
			since,
			entityType,
			limit
		});

		return json({
			projectId: params.projectId,
			count: events.length,
			events
		});
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
