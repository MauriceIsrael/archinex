import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { resolveProjectActor } from '$lib/server/projects/actorHelper';
import { runTurboModeForProject } from '$lib/server/turbo/turboAgent';

const TurboRequestSchema = z
	.object({
		dryRun: z.boolean().optional(),
		skipNautobot: z.boolean().optional(),
		acceptViolations: z.boolean().optional(),
		subjectIds: z.array(z.string().min(1)).optional()
	})
	.default({});

/**
 * Exécute le mode Turbo sur un projet : passage automatisé L3 -> L4 -> EDP -> Nautobot.
 * Réservé aux acteurs authentifiés ayant accès au projet.
 */
export const POST: RequestHandler = async (event) => {
	const projectId = event.params.projectId;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	const rawBody = await event.request.json().catch(() => ({}));
	const parsed = TurboRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{ status: 'error', error: 'Paramètres Turbo invalides', details: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const actor = await resolveProjectActor(event, projectId);
	try {
		const report = await runTurboModeForProject({
			projectId,
			actorId: actor.userId,
			...parsed.data
		});
		return json({ status: 'ok', report });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ status: 'error', error: message }, { status: 500 });
	}
};
