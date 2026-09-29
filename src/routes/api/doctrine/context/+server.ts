import { json, type RequestHandler } from '@sveltejs/kit';
import { doctrineService } from '$lib/server/doctrine/doctrineService';

export const GET: RequestHandler = async ({ url }) => {
	const topicsParam = url.searchParams.get('topics');
	const projectType = url.searchParams.get('project_type') || undefined;
	const topics = topicsParam ? topicsParam.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

	const ctx = await doctrineService.getDoctrineContext({
		topics,
		projectType
	});

	return json(ctx);
};
