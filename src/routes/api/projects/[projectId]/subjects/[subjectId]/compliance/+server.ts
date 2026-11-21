import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkSubjectCompliance } from '$lib/server/compliance/complianceService';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

/** Conformité réglementaire des options du sujet, jugée par LLMOps contre les référentiels de l'espace. */
export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	const { params } = event;

	try {
		return json({ status: 'ok', ...(await checkSubjectCompliance(params.projectId!, params.subjectId!)) });
	} catch (err: any) {
		const message = err?.message || String(err);
		return json({ status: 'error', error: message }, { status: message.startsWith('NOT_FOUND') ? 404 : 500 });
	}
};
