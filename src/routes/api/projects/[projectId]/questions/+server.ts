import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listQuestions, createQuestion } from '$lib/server/projects/projectsDb';
import { CreateQuestionSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const subjectId = url.searchParams.get('subjectId') || undefined;
		const questions = await listQuestions(params.projectId, subjectId);
		return json({ questions });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = CreateQuestionSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const question = await createQuestion(
			params.projectId,
			parsed.data.subjectId,
			parsed.data,
			actor
		);
		return json({ question }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
