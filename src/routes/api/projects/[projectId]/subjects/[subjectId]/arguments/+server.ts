import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listArguments, createArgument } from '$lib/server/projects/debateDb';
import { CreateArgumentSchema } from '$lib/schemas/debateApiSchemas';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { doctrineService } from '$lib/server/doctrine/doctrineService';

export const GET: RequestHandler = async ({ params, url }) => {
	const { subjectId } = params;
	const optionId = url.searchParams.get('optionId');

	try {
		const args = await listArguments(subjectId, optionId);
		return json(args);
	} catch (err: any) {
		return json({ message: err.message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { subjectId } = params;
	const body = await request.json();
	const parsed = CreateArgumentSchema.safeParse(body);

	if (!parsed.success) {
		return json({ message: 'Validation invalide', errors: parsed.error.format() }, { status: 400 });
	}

	const actor = getActorInfo(request);

	// Récupérer doctrine context pour vérifier les kbRefs
	let allowedKbRefs: string[] = [];
	try {
		const docCtx = await doctrineService.getDoctrineContext();
		if (docCtx && Array.isArray(docCtx.items)) {
			allowedKbRefs = docCtx.items.map((i: any) => i.id);
		}
	} catch (err) {
		// Pas bloquant si doctrine inaccessible
	}

	try {
		const argId = `arg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
		const created = await createArgument(
			subjectId,
			{
				id: argId,
				...parsed.data,
				authorKind: 'human'
			},
			actor,
			allowedKbRefs
		);
		return json(created, { status: 201 });
	} catch (err: any) {
		return json({ message: err.message }, { status: 400 });
	}
};
