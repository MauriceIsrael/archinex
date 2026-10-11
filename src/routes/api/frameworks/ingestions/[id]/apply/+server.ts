import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

/** Publie les exigences acceptées ou amendées d'une ingestion dans la base LLMOps (rôle kb:maintain). */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.session?.user) return json({ status: 'error', error: 'Non authentifié' }, { status: 401 });
	const actor = locals.session.user.email;
	const result = await llmopsClient.applyFrameworkIngestion(params.id!, actor);
	const code = { ok: 200, forbidden: 403, conflict: 409, unavailable: 503, error: 400 }[result.status] ?? 500;
	if (result.status !== 'ok') return json({ status: result.status, data: result.data, error: result.error }, { status: code });

	// Sans publication, la base servie (contexte de doctrine, juge d'options) ignore les contrôles promus.
	const publication = await llmopsClient.publishKbDoctrine({ changelog: `Référentiel : ingestion ${params.id} appliquée` }, actor);
	return json({
		status: 'ok',
		data: result.data,
		publication: { status: publication.status, error: publication.error, blockers: publication.blockers }
	});
};
