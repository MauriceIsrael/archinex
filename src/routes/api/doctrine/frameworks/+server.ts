import { json, error, type RequestHandler } from '@sveltejs/kit';
import { doctrineService } from '$lib/server/doctrine/doctrineService';

export const GET: RequestHandler = async ({ url }) => {
	const project = url.searchParams.get('project') || undefined;
	const coverage = await doctrineService.getFrameworkCoverage(project);
	return json(coverage);
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { project, frameworks } = body;
		if (!project || !Array.isArray(frameworks)) {
			throw error(400, 'project (string) et frameworks (string[]) sont requis.');
		}

		const success = await doctrineService.setApplicableFrameworks(project, frameworks);
		return json({ success, project, frameworks });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour des cadres';
		return json({ success: false, error: message }, { status: 500 });
	}
};
