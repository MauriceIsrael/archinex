import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateCriterion, deleteCriterion } from '$lib/server/projects/optionsDb';
import { ConcurrencyConflictError } from '$lib/server/projects/projectsDb';
import { UpdateCriterionSchema } from '$lib/schemas/optionsApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import { z } from 'zod';

export const PATCH: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = UpdateCriterionSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const updated = await updateCriterion(params.criterionId, parsed.data, actor);
		return json({ criterion: updated });
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

const DeleteCriterionSchema = z.object({
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
			const parsed = DeleteCriterionSchema.safeParse(body);
			if (parsed.success) {
				expectedVersion = parsed.data.expectedVersion;
			}
		}

		const actor = getActorFromEvent(event);
		const result = await deleteCriterion(params.criterionId, expectedVersion, actor);
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
