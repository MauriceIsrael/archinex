import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLatestDebateRun } from '$lib/server/projects/debateDb';
import { orchestrateDebate } from '$lib/server/agents/debateOrchestrator';
import { StartDebateSchema } from '$lib/schemas/debateApiSchemas';
import { getActorInfo } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	const { subjectId } = params;

	try {
		const latest = await getLatestDebateRun(subjectId);
		return json(latest || { status: 'idle' });
	} catch (err: any) {
		return json({ message: err.message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { subjectId } = params;
	let maxRounds = 3;

	try {
		const body = await request.json().catch(() => ({}));
		const parsed = StartDebateSchema.safeParse(body);
		if (parsed.success) {
			maxRounds = parsed.data.maxRounds;
		}
	} catch (err) {
		// Pas bloquant, défaut 3
	}

	const actor = getActorInfo(request);

	try {
		const result = await orchestrateDebate(subjectId, {
			maxRounds,
			actor
		});
		return json(result, { status: 201 });
	} catch (err: any) {
		return json({ message: err.message }, { status: 400 });
	}
};
