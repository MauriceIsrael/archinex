import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';

const HTTP = { forbidden: 403, invalid: 400, not_found: 404, unavailable: 503, error: 502 } as const;

/**
 * Enregistre une clause rédigée sous forme de brouillon dans LLMOps (Issue #99, contrat 1.26).
 * La clause entre avec status: 'draft' et provenance: 'llm-derived'.
 * Elle ne bloque jamais les arbitrages tant qu'elle n'a pas été formellement validée par un expert.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const actorEmail = locals.session?.user?.email;
	if (!actorEmail) {
		return json({ status: 'error', error: 'Authentification requise' }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}));
	const clause = body.clause;
	if (!clause || !clause.kind || !clause.when) {
		return json(
			{ status: 'error', error: "Une clause valide comportant 'kind' et 'when' est requise" },
			{ status: 400 }
		);
	}

	if (!['requires', 'forbids'].includes(clause.kind)) {
		return json(
			{ status: 'error', error: "Le champ 'kind' doit valoir 'requires' ou 'forbids'" },
			{ status: 400 }
		);
	}

	const whenTerms = clause.when.terms_any || [];
	if (!Array.isArray(whenTerms) || whenTerms.length === 0) {
		return json(
			{ status: 'error', error: "La clause doit comporter au moins un terme déclencheur 'when.terms_any'" },
			{ status: 400 }
		);
	}

	if (clause.kind === 'requires') {
		const expectTerms = clause.expect?.terms_any || [];
		if (!Array.isArray(expectTerms) || expectTerms.length === 0) {
			return json(
				{ status: 'error', error: "Une clause de type 'requires' doit comporter au moins un terme attendu 'expect.terms_any'" },
				{ status: 400 }
			);
		}
	}

	const assetId = params.assetId;
	const result = await llmopsClient.submitDraftClause(
		assetId,
		{
			kind: clause.kind,
			when: clause.when,
			expect: clause.kind === 'requires' ? clause.expect : undefined,
			message: String(clause.message || '').trim(),
			provenance: 'llm-derived'
		},
		actorEmail
	);

	if (result.status !== 'ok') {
		return json({ status: result.status, error: result.error }, { status: HTTP[result.status as keyof typeof HTTP] || 500 });
	}

	return json({
		status: 'ok',
		data: result.data
	});
};
