import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateQuestion, ConcurrencyConflictError } from '$lib/server/projects/projectsDb';
import { UpdateQuestionSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const PATCH: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = UpdateQuestionSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const updated = await updateQuestion(params.projectId, params.questionId, parsed.data, actor);
		return json({ question: updated });
	} catch (err: any) {
		if (err instanceof ConcurrencyConflictError) {
			return json(
				{
					error: err.message,
					currentVersion: err.currentVersion,
					expectedVersion: err.expectedVersion,
					currentData: err.currentData
				},
				{ status: 409 }
			);
		}
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
