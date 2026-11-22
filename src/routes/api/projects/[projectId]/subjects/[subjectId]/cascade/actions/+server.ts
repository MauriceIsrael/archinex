import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { closeCascadeQuestion, type CascadeQuestion } from '$lib/domain/cascade';
import { llmopsClient } from '$lib/server/llmops/client';
import { prisma } from '$lib/server/prisma';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

type CascadeActionCtx = {
	projectId: string;
	subjectId: string;
	userId: string;
	userEmail: string;
	body: any;
};

const CASCADE_ACTION_HANDLERS: Record<string, (ctx: CascadeActionCtx) => Promise<Response> | Response> = {
	close: ({ body }) => {
		const result = closeCascadeQuestion(body.question as CascadeQuestion, body.justification);
		if (!result.success) {
			return json(
				{
					error: 'validation_error',
					message: result.error || 'Clôture refusée : justification manquante'
				},
				{ status: 400 }
			);
		}
		return json({ status: 'ok', question: result.question });
	},
	assign: ({ body }) => {
		const updated: CascadeQuestion = {
			...(body.question as CascadeQuestion),
			status: 'assigned',
			assignedTo: body.assignedTo || 'Non assigné'
		};
		return json({ status: 'ok', question: updated });
	},
	merge: async ({ projectId, userId, body }) => {
		const { question, mergedWithSubjectId } = body;
		const updated: CascadeQuestion = {
			...(question as CascadeQuestion),
			status: 'merged',
			mergedWithSubjectId: mergedWithSubjectId || null
		};
		await prisma.domainEvent
			.create({
				data: {
					projectId,
					entityType: 'cascade_question',
					entityId: question.id,
					type: 'CASCADE_QUESTION_MERGED',
					actorId: userId,
					actorRole: 'lead_architect',
					productionMode: 'human-authored',
					payload: JSON.stringify({ questionId: question.id, mergedWithSubjectId })
				}
			})
			.catch(() => null);
		return json({ status: 'ok', question: updated });
	},
	capitalize: async ({ projectId, subjectId, userId, userEmail, body }) => {
		const { question, candidateTitle, candidateSummary, candidateRationale } = body;
		try {
			const candidate = {
				kind: 'new_asset' as const,
				title: candidateTitle || `Règle candidate issue de la question : ${question.subjectName}`,
				summary: candidateSummary || question.text,
				rationale:
					candidateRationale ||
					question.grounds ||
					'Suggestion récurrente issue du moteur de cascade.',
				author: userEmail,
				production_mode: 'llm-derived' as const,
				source: {
					system: 'archinex' as const,
					engagement: projectId,
					subject_id: subjectId,
					decision_id: question.lineage?.parentDecisionId
				}
			};
			const candidateRes = await llmopsClient.submitCandidate(candidate);
			await prisma.domainEvent
				.create({
					data: {
						projectId,
						entityType: 'cascade_question',
						entityId: question.id,
						type: 'CASCADE_QUESTION_CAPITALIZED',
						actorId: userId,
						actorRole: 'lead_architect',
						productionMode: 'human-authored',
						payload: JSON.stringify({
							candidateId: candidateRes.candidate_id,
							questionId: question.id
						})
					}
				})
				.catch(() => null);
			return json({ status: 'ok', candidateId: candidateRes.candidate_id });
		} catch (err: any) {
			return json(
				{
					status: 'error',
					error: err?.message || 'La candidature n’a pas pu être transmise à LLMOps.'
				},
				{ status: 502 }
			);
		}
	}
};

export const POST: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide' }, { status: 400 });
	}

	const { action, question } = body;
	if (!action || !question) {
		return json({ error: 'Action et question sont requises' }, { status: 400 });
	}

	const handler = CASCADE_ACTION_HANDLERS[String(action)];
	if (!handler) {
		return json({ error: `Action inconnue : ${action}` }, { status: 400 });
	}

	return handler({
		projectId,
		subjectId,
		userId: event.locals?.session?.user?.id || 'lead_architect',
		userEmail: event.locals?.session?.user?.email || 'lead_architect',
		body
	});
};
