import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { retractStatement } from '$lib/server/projects/projectsDb';
import { RetractStatementSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json().catch(() => ({}));
		const parsed = RetractStatementSchema.safeParse(body);
		const reason = parsed.success ? parsed.data.reason : undefined;

		const actor = getActorFromEvent(event);
		const result = await retractStatement(params.projectId, params.statementId, actor, reason);
		return json({ result });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
