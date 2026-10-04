import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLatestDebateRun } from '$lib/server/projects/debateDb';
import { orchestrateDebate, invokeSpecificAgent } from '$lib/server/agents/debateOrchestrator';
import { StartDebateSchema } from '$lib/schemas/debateApiSchemas';
import { getActorInfo } from '$lib/server/projects/actorHelper';

export const GET: RequestHandler = async ({ params }) => {
	const { subjectId } = params;

	try {
		const latest = await getLatestDebateRun(subjectId);
		return json(latest || { status: 'idle' });
	} catch (err: any) {
		return json({ message: err.message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { subjectId } = params;
	let body: any = {};

	try {
		body = await request.json().catch(() => ({}));
	} catch {
		// Pas bloquant
	}

	const actor = getActorInfo(request);

	// Invocaton ciblée à la demande d'un seul agent (@challenger, @proposer, @verifier, @synthesizer)
	if (body.agentRole && typeof body.agentRole === 'string') {
		const validRoles = ['challenger', 'proposer', 'verifier', 'synthesizer'];
		if (!validRoles.includes(body.agentRole)) {
			return json(
				{ message: `Rôle d’agent invalide. Rôles autorisés : ${validRoles.join(', ')}` },
				{ status: 400 }
			);
		}

		try {
			const agentArgs = await invokeSpecificAgent(
				subjectId,
				body.agentRole as any,
				body.prompt || '',
				actor
			);
			return json({ status: 'ok', arguments: agentArgs }, { status: 201 });
		} catch (err: any) {
			return json({ message: err.message }, { status: 400 });
		}
	}

	// Débat complet borné multi-agents (Proposer + Challenger + Synthesizer)
	let maxRounds = 3;
	const parsed = StartDebateSchema.safeParse(body);
	if (parsed.success) {
		maxRounds = parsed.data.maxRounds;
	}

	try {
		const result = await orchestrateDebate(subjectId, {
			maxRounds,
			actor
		});
		return json(result, { status: 201 });
	} catch (err: any) {
		return json({ message: err.message }, { status: 400 });
	}
};
