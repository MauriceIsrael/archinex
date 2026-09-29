import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listTradeOffs, createTradeOff } from '$lib/server/projects/optionsDb';
import { CreateTradeOffSchema } from '$lib/schemas/optionsApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const tradeOffs = await listTradeOffs(params.subjectId);
		return json({ tradeOffs });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = CreateTradeOffSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const tradeOff = await createTradeOff(params.subjectId, parsed.data, actor);
		return json({ tradeOff }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
