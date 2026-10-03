import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import type { ConfidentialityLevel } from '$lib/domain/engagementBundle';

export const POST: RequestHandler = async (event) => {
	// 1. Authentification stricte par session (jamais par en-tête)
	const session = event.locals.session;
	if (!session || !session.user) {
		return json(
			{ status: 'error', error: 'Non authentifié : session requise' },
			{ status: 401 }
		);
	}

	// Un en-tête X-Actor-Email fourni par le client est explicitement ignoré
	const actorHandle = session.user.name || session.user.email;

	try {
		let body: Record<string, unknown> = {};
		try {
			body = await event.request.json();
		} catch {
			// Body optionnel si passé en query params
		}

		const confidentiality = (body.confidentiality ||
			event.url.searchParams.get('confidentiality')) as ConfidentialityLevel;

		if (!confidentiality) {
			return json(
				{
					status: 'error',
					error:
						'CONFIDENTIALITY_REQUIRED: Le niveau de confidentialité (public, internal, confidential, secret) est obligatoire.'
				},
				{ status: 400 }
			);
		}

		const result = await exportEngagementBundle({
			projectId: event.params.id,
			confidentiality,
			actorHandle
		});

		return json({
			status: 'ok',
			bundle: result.bundle,
			snapshotRef: result.snapshotRef
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		const problems = (err as Record<string, unknown>)?.problems;
		return json(
			{
				status: 'error',
				error: message,
				problems
			},
			{ status: 400 }
		);
	}
};
