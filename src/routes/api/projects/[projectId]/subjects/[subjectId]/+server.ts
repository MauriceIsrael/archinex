import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getSubject,
	ensureSubjectExists,
	updateSubject,
	deleteSubject,
	ConcurrencyConflictError
} from '$lib/server/projects/projectsDb';
import { UpdateSubjectSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import { z } from 'zod';

export const GET: RequestHandler = async ({ params }) => {
	try {
		let subject = await getSubject(params.projectId, params.subjectId);
		if (!subject) {
			subject = await ensureSubjectExists(params.projectId, params.subjectId);
		}
		return json({ subject });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = UpdateSubjectSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		await ensureSubjectExists(params.projectId, params.subjectId);
		const updated = await updateSubject(params.projectId, params.subjectId, parsed.data, actor);
		return json({ subject: updated });
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

const DeleteSubjectSchema = z.object({
	expectedVersion: z.number().int().positive()
});

export const DELETE: RequestHandler = async (event) => {
	const { params } = event;
	try {
		let expectedVersion = 1;
		const queryVer = event.url.searchParams.get('expectedVersion');
		if (queryVer) {
			expectedVersion = parseInt(queryVer, 10);
		} else {
			const body = await event.request.json().catch(() => ({}));
			const parsed = DeleteSubjectSchema.safeParse(body);
			if (parsed.success) {
				expectedVersion = parsed.data.expectedVersion;
			}
		}

		const actor = getActorFromEvent(event);
		const result = await deleteSubject(params.projectId, params.subjectId, expectedVersion, actor);
		return json(result);
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
