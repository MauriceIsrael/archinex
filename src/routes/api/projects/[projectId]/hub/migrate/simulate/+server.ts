import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { simulateProjectMigration } from '$lib/server/projects/hubMigrationService';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const POST: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;

	try {
		const report = await simulateProjectMigration(event.params.projectId);
		return json({
			status: 'ok',
			data: report
		});
	} catch (err: unknown) {
		return json(
			{
				status: 'error',
				error: (err as Error).message
			},
			{ status: 400 }
		);
	}
};
