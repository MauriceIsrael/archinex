import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getStatement,
	updateStatement,
	retractStatement,
	ConcurrencyConflictError
} from '$lib/server/projects/projectsDb';
import { UpdateStatementSchema, RetractStatementSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const statement = await getStatement(params.projectId, params.statementId);
		if (!statement) {
			return json({ error: `Statement ${params.statementId} introuvable` }, { status: 404 });
		}
		return json({ statement });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = UpdateStatementSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const updated = await updateStatement(params.projectId, params.statementId, parsed.data, actor);
		return json({ statement: updated });
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

export const DELETE: RequestHandler = async (event) => {
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
