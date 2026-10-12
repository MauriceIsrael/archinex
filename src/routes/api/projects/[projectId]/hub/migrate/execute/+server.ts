import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeProjectMigration } from '$lib/server/projects/hubMigrationService';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import type { HubConfidentiality } from '$lib/types/llmops';

export const POST: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;

	try {
		let body: Record<string, unknown> = {};
		try {
			body = await event.request.json();
		} catch {
			// Body optionnel
		}

		const confidentiality = (body.confidentiality as HubConfidentiality) || 'confidential';

		const result = await executeProjectMigration(event.params.projectId, session.user.email, {
			confidentiality
		});

		return json({
			status: 'ok',
			data: result
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
