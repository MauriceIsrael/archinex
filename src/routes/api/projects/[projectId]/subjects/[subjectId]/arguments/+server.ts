import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listArguments, createArgument } from '$lib/server/projects/debateDb';
import { CreateArgumentSchema } from '$lib/schemas/debateApiSchemas';
import { getActorInfo } from '$lib/server/projects/actorHelper';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import { extractMentions } from '$lib/domain/debate';
import { invokeSpecificAgent } from '$lib/server/agents/debateOrchestrator';

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

	// Extraire les mentions (#base et @agent)
	const mentions = extractMentions(`${parsed.data.claim} ${parsed.data.grounds}`);
	const combinedKbRefs = Array.from(new Set([...(parsed.data.kbRefs || []), ...mentions.kbRefs]));

	try {
		const argId = `arg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
		const created = await createArgument(
			subjectId,
			{
				id: argId,
				...parsed.data,
				kbRefs: combinedKbRefs,
				authorKind: 'human'
			},
			actor,
			allowedKbRefs
		);

		// Si un ou plusieurs agents sont mentionnés (@challenger, @proposer, @verifier, @synthesizer),
		// déclencher l'agent visé dans le fil du sujet courant
		const triggeredAgentArguments: any[] = [];
		for (const agentRole of mentions.agentMentions) {
			try {
				const agentResults = await invokeSpecificAgent(
					subjectId,
					agentRole,
					`${parsed.data.claim} - ${parsed.data.grounds}`,
					actor
				);
				triggeredAgentArguments.push(...agentResults);
			} catch (agentErr) {
				console.warn(`[Agent Trigger] Échec invocation @${agentRole}:`, agentErr);
			}
		}

		return json({ ...created, triggeredAgentArguments }, { status: 201 });
	} catch (err: any) {
		return json({ message: err.message }, { status: 400 });
	}
};
