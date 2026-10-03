import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { simulateProjectMigration } from '$lib/server/projects/hubMigrationService';

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session || !session.user) {
		return json(
			{ status: 'error', error: 'Non authentifié : session requise' },
			{ status: 401 }
		);
	}

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
