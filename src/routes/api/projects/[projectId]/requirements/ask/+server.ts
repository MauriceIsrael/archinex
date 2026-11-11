import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { QuickAskRequestSchema } from '$lib/domain/requirementsQa';
import { askProjectRequirements } from '$lib/server/projects/requirementsQaService';

function isLlmUnavailableError(message: string): boolean {
	return (
		/Aucun modèle LLM/i.test(message) ||
		/Air-Gap Security/i.test(message) ||
		/Délai d'inférence/i.test(message) ||
		/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(message) ||
		/Erreur LLM local|Erreur Anthropic Claude/i.test(message)
	);
}

/** Interroge le dossier d'exigences du projet en langage naturel avec réponses sourcées par `clauseRef`. */
export const POST: RequestHandler = async (event) => {
	const projectId = event.params.projectId;
	if (!projectId) {
		return json({ status: 'error', error: 'projectId requis' }, { status: 400 });
	}

	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ status: 'error', error: 'Corps JSON invalide' }, { status: 400 });
	}

	const parsed = QuickAskRequestSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ status: 'error', error: 'INVALID_REQUEST', issues: parsed.error.issues.slice(0, 10) },
			{ status: 400 }
		);
	}

	try {
		const result = await askProjectRequirements(projectId, parsed.data);
		return json(result);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.startsWith('NO_REQUIREMENTS:')) {
			return json(
				{
					status: 'error',
					code: 'NO_REQUIREMENTS',
					error: message.replace(/^NO_REQUIREMENTS:\s*/, '')
				},
				{ status: 422 }
			);
		}
		if (isLlmUnavailableError(message)) {
			return json(
				{
					status: 'error',
					code: 'LLM_UNAVAILABLE',
					error: message
				},
				{ status: 503 }
			);
		}
		return json({ status: 'error', error: message }, { status: 500 });
	}
};
