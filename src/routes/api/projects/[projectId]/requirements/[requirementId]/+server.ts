import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { sanitizeHandle } from '$lib/domain/bundleAssembly';
import { decideRequirement } from '$lib/server/projects/requirementsDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { proposeRequirementDecision } from '$lib/server/projects/hubRequirementDecisions';
import { hubErrorResponse } from '$lib/server/projects/hubErrors';
import { validateRequirementDecision } from '$lib/domain/requirementAudit';

const DecisionSchema = z.object({
	disposition: z.enum(['deliberated', 'evacuated', 'clarification_needed']),
	reason: z.string().optional()
});

/**
 * Décision humaine sur une exigence. L'auteur est celui de la session, jamais celui du corps de requête.
 * Réponse : `needsSubject` = la clause est à délibérer mais aucun sujet ne la porte encore.
 * Projet basculé sur le Hub : la décision est proposée dans le Hub (`needsAssertion: true`) ; voir `…/assert`.
 */
export const PATCH: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
	}
	const parsed = DecisionSchema.safeParse(body);
	if (!parsed.success) return json({ status: 'error', error: 'INVALID_DECISION', issues: parsed.error.issues }, { status: 400 });

	// Projet basculé sur le Hub : la décision est un fait engagé, elle s'enregistre dans le Hub (proposée, puis affirmée par
	// une autre personne ayant le rôle décideur). Rien n'est écrit en local : une seule source de vérité par projet.
	if (auth.project && isProjectCutOverToHub(auth.project)) {
		const invalid = validateRequirementDecision(parsed.data);
		if (invalid) return json({ status: 'error', error: `INVALID_DECISION: ${invalid}` }, { status: 400 });
		try {
			const result = await proposeRequirementDecision(
				auth.project,
				decodeURIComponent(event.params.requirementId),
				{ disposition: parsed.data.disposition, reason: (parsed.data.reason ?? '').trim() || undefined },
				session.user.email
			);
			return json({ status: 'ok', systemOfRecord: 'hub', needsAssertion: true, ...result });
		} catch (e) {
			return hubErrorResponse(e);
		}
	}

	try {
		const result = await decideRequirement(
			event.params.projectId,
			decodeURIComponent(event.params.requirementId),
			parsed.data,
			sanitizeHandle(session.user.email)
		);
		return json({ status: 'ok', ...result });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const status = message.startsWith('NOT_FOUND') ? 404 : message.startsWith('INVALID_DECISION') ? 400 : 500;
		return json({ status: 'error', error: message }, { status });
	}
};
