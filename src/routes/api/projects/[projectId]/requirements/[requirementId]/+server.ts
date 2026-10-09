import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { sanitizeHandle } from '$lib/domain/bundleAssembly';
import { decideRequirement } from '$lib/server/projects/requirementsDb';

const DecisionSchema = z.object({
	disposition: z.enum(['deliberated', 'evacuated', 'clarification_needed']),
	reason: z.string().optional()
});

/**
 * Décision humaine sur une exigence. L'auteur est celui de la session, jamais celui du corps de requête.
 * Réponse : `needsSubject` = la clause est à délibérer mais aucun sujet ne la porte encore.
 */
export const PATCH: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session?.user) return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });

	const project = await prisma.project.findUnique({ where: { id: event.params.projectId }, include: { members: true } });
	if (!project) return json({ status: 'error', error: `Projet ${event.params.projectId} introuvable` }, { status: 404 });
	if (!project.members.some((m) => m.userId === session.user.id) && session.user.role !== 'admin') {
		return json({ status: 'error', error: 'forbidden', reason: 'Réservé aux membres du projet' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
	}
	const parsed = DecisionSchema.safeParse(body);
	if (!parsed.success) return json({ status: 'error', error: 'INVALID_DECISION', issues: parsed.error.issues }, { status: 400 });

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
