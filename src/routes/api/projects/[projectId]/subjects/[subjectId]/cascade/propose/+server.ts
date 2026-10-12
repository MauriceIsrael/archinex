import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proposeAndPersistComplementaryQuestions } from '$lib/server/cascade/cascadeService';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const POST: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		// body optional
	}

	try {
		const questions = await proposeAndPersistComplementaryQuestions({
			projectId,
			subjectId,
			calibratedThreshold: body.calibratedThreshold
		});

		return json({
			status: 'ok',
			questionsCount: questions.length,
			questions
		});
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
