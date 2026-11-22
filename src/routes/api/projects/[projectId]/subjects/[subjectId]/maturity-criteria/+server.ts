import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { computeSubjectMaturityReport } from '$lib/server/projects/maturityCriteriaService';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;

	const { projectId, subjectId } = event.params;

	try {
		const { report, isHubCutover } = await computeSubjectMaturityReport({
			event,
			projectId,
			subjectId
		});

		return json({
			report,
			isHubCutover
		});
	} catch (err: any) {
		console.error('[API MaturityCriteria] Erreur :', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
