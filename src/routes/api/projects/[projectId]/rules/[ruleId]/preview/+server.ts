import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { previewRuleAgainstProjectFacts } from '$lib/server/rules/projectRulesService';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const POST: RequestHandler = async (event) => {
	const { projectId, ruleId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	const url = new URL(event.request.url);
	const subjectId = url.searchParams.get('subjectId') || undefined;

	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		// body is optional
	}

	try {
		const result = await previewRuleAgainstProjectFacts({
			projectId,
			ruleId: ruleId !== 'custom' ? ruleId : undefined,
			customRule: body?.customRule,
			subjectId
		});

		return json({ status: 'ok', ...result });
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors de l’évaluation de la règle.' }, { status: 400 });
	}
};
