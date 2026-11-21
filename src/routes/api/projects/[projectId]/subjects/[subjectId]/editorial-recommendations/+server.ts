import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { adviseEditorialViewsWithLlm } from '$lib/server/agents/editorialRecommenderAgent';

const RequestBodySchema = z.object({
	subjectName: z.string().min(1).max(200),
	sectionRef: z.string().max(60).optional(),
	signals: z.object({
		blockCount: z.number().int().min(0),
		statementCount: z.number().int().min(0),
		unsettledCount: z.number().int().min(0),
		requirementCount: z.number().int().min(0),
		missingVerificationCount: z.number().int().min(0),
		optionCount: z.number().int().min(0),
		criteriaCount: z.number().int().min(0).optional(),
		hasRetainedDecision: z.boolean(),
		hasAcceptedViolations: z.boolean().optional(),
		hasDriftSignals: z.boolean().optional()
	}),
	validEntityIds: z.array(z.string()).max(100).default([])
});

/**
 * POST /api/projects/[projectId]/subjects/[subjectId]/editorial-recommendations
 * Recommande les vues SVG éditoriales les plus pertinentes via le Directeur Éditorial (LLM avec repli déterministe).
 * Protégé par `authorizeProjectAccess` (conforme à #391).
 */
export const POST: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
	}

	const parsed = RequestBodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ status: 'error', error: 'Paramètres de signaux éditoriaux invalides' }, { status: 400 });
	}

	const result = await adviseEditorialViewsWithLlm(parsed.data);
	return json({ status: 'ok', ...result });
};
