import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

/**
 * Charge des propositions (critères d'acceptation, liens, termes) sur les lignes d'une ingestion (rôle kb:maintain).
 * Elles restent des propositions : chaque ligne doit encore être acceptée, amendée ou rejetée par l'expert.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.session?.user) return json({ status: 'error', error: 'Non authentifié' }, { status: 401 });
	const body = await request.json().catch(() => null);
	if (!body || !Array.isArray(body.proposals)) {
		return json({ status: 'error', error: 'Fichier de propositions invalide : liste « proposals » attendue' }, { status: 400 });
	}
	const result = await llmopsClient.addFrameworkLinkProposals(params.id!, body as any, locals.session.user.email);
	return json(result, { status: result.status === 'ok' ? 200 : result.status === 'forbidden' ? 403 : result.status === 'unavailable' ? 503 : 400 });
};
