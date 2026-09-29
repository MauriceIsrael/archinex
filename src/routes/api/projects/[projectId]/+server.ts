import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProject, updateProject, ConcurrencyConflictError } from '$lib/server/projects/projectsDb';
import { UpdateProjectSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const project = await getProject(params.projectId);
		if (!project) {
			return json({ error: `Projet ${params.projectId} introuvable` }, { status: 404 });
		}
		return json({ project });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	const { params } = event;
	try {
		const body = await event.request.json();
		const parsed = UpdateProjectSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const updated = await updateProject(params.projectId, parsed.data, actor);
		return json({ project: updated });
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
