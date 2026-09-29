import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveArgument } from '$lib/server/projects/debateDb';
import { ResolveArgumentSchema } from '$lib/schemas/debateApiSchemas';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { ConcurrencyConflictError } from '$lib/server/projects/projectsDb';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { argumentId } = params;
	const body = await request.json();
	const parsed = ResolveArgumentSchema.safeParse(body);

	if (!parsed.success) {
		return json({ message: 'Validation invalide', errors: parsed.error.format() }, { status: 400 });
	}

	const actor = getActorInfo(request);

	try {
		const updated = await resolveArgument(
			argumentId,
			parsed.data,
			actor,
			true // Appelé par endpoint HTTP utilisateur (humain)
		);
		return json(updated);
	} catch (err: any) {
		if (err instanceof ConcurrencyConflictError) {
			return json(
				{
					message: 'Conflit de concurrence optimiste',
					entityType: err.entityType,
					entityId: err.entityId,
					currentVersion: err.currentVersion,
					expectedVersion: err.expectedVersion,
					currentData: err.currentData
				},
				{ status: 409 }
			);
		}
		return json({ message: err.message }, { status: 403 });
	}
};
