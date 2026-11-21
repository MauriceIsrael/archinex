import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listProjects, createProject } from '$lib/server/projects/projectsDb';
import { CreateProjectSchema } from '$lib/schemas/projectApiSchemas';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import { addCreatorAsMember, getAccessibleProjectIds } from '$lib/server/projects/projectAccess';

export const GET: RequestHandler = async ({ locals }) => {
	const session = locals.session;
	if (!session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}
	try {
		const [projects, allowedIds] = await Promise.all([
			listProjects(),
			getAccessibleProjectIds(session)
		]);
		const visible = allowedIds ? projects.filter((p) => allowedIds.has(p.id)) : projects;
		return json({ projects: visible });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}
	try {
		const body = await event.request.json();
		const parsed = CreateProjectSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
		}

		const actor = getActorFromEvent(event);
		const project = await createProject(parsed.data, actor);
		if (session.user.id) {
			await addCreatorAsMember(project.id, session.user.id).catch(() => {});
		}
		return json({ project }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
