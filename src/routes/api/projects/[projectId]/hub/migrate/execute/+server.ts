import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeProjectMigration } from '$lib/server/projects/hubMigrationService';
import type { HubConfidentiality } from '$lib/types/llmops';

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session || !session.user) {
		return json(
			{ status: 'error', error: 'Non authentifié : session requise' },
			{ status: 401 }
		);
	}

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
