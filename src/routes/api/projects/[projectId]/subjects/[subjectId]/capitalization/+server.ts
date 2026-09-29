import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import {
	prepareSubjectKbCandidates,
	submitSubjectKbCandidates,
	getSubjectKbCandidatesStatus
} from '$lib/server/projects/capitalizationDb';
import { SubmitCandidatesSchema } from '$lib/schemas/capitalizationSchemas';
import { UnauthorizedArbitrationError } from '$lib/server/projects/arbitrationDb';

export const GET: RequestHandler = async (event) => {
	const { subjectId } = event.params;
	const actor = getActorInfo(event);
	const url = new URL(event.request.url);
	const mode = url.searchParams.get('mode');

	try {
		if (mode === 'prepare') {
			const res = await prepareSubjectKbCandidates(subjectId, actor);
			return json(res);
		}

		const res = await getSubjectKbCandidatesStatus(subjectId);
		return json(res);
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors de la récupération des candidats KB.' }, { status: 400 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { subjectId } = event.params;
	const actor = getActorInfo(event);

	let body: any;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = SubmitCandidatesSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				error: 'Données de soumission des candidats invalides.',
				details: parsed.error.flatten()
			},
			{ status: 400 }
		);
	}

	try {
		const result = await submitSubjectKbCandidates(subjectId, parsed.data.candidates as any, actor);
		return json(result, { status: 201 });
	} catch (err: any) {
		if (err instanceof UnauthorizedArbitrationError) {
			return json({ error: err.message }, { status: 403 });
		}
		return json(
			{ error: err.message || 'Erreur lors de la soumission des candidats vers LLMOps.' },
			{ status: 400 }
		);
	}
};
