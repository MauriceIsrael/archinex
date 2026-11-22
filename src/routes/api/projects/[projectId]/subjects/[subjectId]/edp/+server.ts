import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { dispatchEdpAction, getEdpState } from '$lib/server/edp/actions';

export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;

	const result = await getEdpState({
		projectId: event.params.projectId,
		subjectId: event.params.subjectId,
		requestedConcept: event.url.searchParams.get('concept') || undefined
	});
	return json(result.body, { status: result.status ?? 200 });
};

/**
 * Compatibilité ascendante : valide la charge utile via Zod et délègue vers
 * la table de dispatch des actions EDP (aucune chaîne de `if`).
 * Les clients récents appellent directement `/edp/<action>` (ex. `/edp/verify`).
 */
export const POST: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	let rawBody: unknown;
	try {
		rawBody = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const result = await dispatchEdpAction(
		{
			projectId,
			subjectId,
			actor: {
				id: auth.session?.user?.email || auth.session?.user?.id || 'architect',
				role: auth.session?.user?.role || 'lead_architect'
			}
		},
		rawBody
	);
	return json(result.body, { status: result.status ?? 200 });
};
