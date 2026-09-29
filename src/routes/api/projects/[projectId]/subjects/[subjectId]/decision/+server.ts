import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDecision, recordDecision } from '$lib/server/projects/optionsDb';
import { RecordDecisionSchema } from '$lib/schemas/optionsApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const decision = await getDecision(params.subjectId);
		if (!decision) {
			return json({ error: 'Aucune décision enregistrée pour ce sujet' }, { status: 404 });
		}
		return json({ decision });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = RecordDecisionSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const decision = await recordDecision(params.subjectId, parsed.data, actor);
		return json({ decision }, { status: 200 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
