import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOption, updateOption, deleteOption } from '$lib/server/projects/optionsDb';
import { ConcurrencyConflictError } from '$lib/server/projects/projectsDb';
import { UpdateOptionSchema } from '$lib/schemas/optionsApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import { z } from 'zod';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const option = await getOption(params.optionId);
		if (!option) {
			return json({ error: `Option ${params.optionId} introuvable` }, { status: 404 });
		}
		return json({ option });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = UpdateOptionSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const updated = await updateOption(params.optionId, parsed.data, actor);
		return json({ option: updated });
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

const DeleteOptionSchema = z.object({
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
			const parsed = DeleteOptionSchema.safeParse(body);
			if (parsed.success) {
				expectedVersion = parsed.data.expectedVersion;
			}
		}

		const actor = getActorFromEvent(event);
		const result = await deleteOption(params.optionId, expectedVersion, actor);
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
