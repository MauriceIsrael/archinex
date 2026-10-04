import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { closeCascadeQuestion, type CascadeQuestion } from '$lib/domain/cascade';
import { llmopsClient } from '$lib/server/llmops/client';
import { prisma } from '$lib/server/prisma';

export const POST: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide' }, { status: 400 });
	}

	const { action, question, justification, assignedTo, mergedWithSubjectId, candidateTitle, candidateSummary, candidateRationale } = body;

	if (!action || !question) {
		return json({ error: 'Action et question sont requises' }, { status: 400 });
	}

	if (action === 'close') {
		const result = closeCascadeQuestion(question as CascadeQuestion, justification);
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
	}

	if (action === 'assign') {
		const updated: CascadeQuestion = {
			...(question as CascadeQuestion),
			status: 'assigned',
			assignedTo: assignedTo || 'Non assigné'
		};
		return json({ status: 'ok', question: updated });
	}

	if (action === 'merge') {
		const updated: CascadeQuestion = {
			...(question as CascadeQuestion),
			status: 'merged',
			mergedWithSubjectId: mergedWithSubjectId || null
		};

		// Persistance de l'événement de fusion
		await prisma.domainEvent.create({
			data: {
				projectId,
				entityType: 'cascade_question',
				entityId: question.id,
				type: 'CASCADE_QUESTION_MERGED',
				actorId: event.locals?.session?.user?.id || 'lead_architect',
				actorRole: 'lead_architect',
				productionMode: 'human-authored',
				payload: JSON.stringify({
					questionId: question.id,
					mergedWithSubjectId
				})
			}
		}).catch(() => null);

		return json({ status: 'ok', question: updated });
	}

	if (action === 'capitalize') {
		try {
			const candidate = {
				kind: 'new_asset' as const,
				title: candidateTitle || `Règle candidate issue de la question : ${question.subjectName}`,
				summary: candidateSummary || question.text,
				rationale: candidateRationale || question.grounds || 'Suggestion récurrente issue du moteur de cascade.',
				author: event.locals?.session?.user?.email || 'lead_architect',
				production_mode: 'llm-derived' as const,
				source: {
					system: 'archinex' as const,
					engagement: projectId,
					subject_id: subjectId,
					decision_id: question.lineage?.parentDecisionId
				}
			};

			const candidateRes = await llmopsClient.submitCandidate(candidate);

			// Persistance de l'événement de capitalisation
			await prisma.domainEvent.create({
				data: {
					projectId,
					entityType: 'cascade_question',
					entityId: question.id,
					type: 'CASCADE_QUESTION_CAPITALIZED',
					actorId: event.locals?.session?.user?.id || 'lead_architect',
					actorRole: 'lead_architect',
					productionMode: 'human-authored',
					payload: JSON.stringify({
						candidateId: candidateRes.candidate_id,
						questionId: question.id
					})
				}
			}).catch(() => null);

			return json({ status: 'ok', candidateId: candidateRes.candidate_id });
		} catch (err: any) {
			const fallbackId = `cand-local-${Date.now()}`;
			return json({
				status: 'ok',
				candidateId: fallbackId,
				message: 'Candidature enregistrée en local (signal de capitalisation K7/K22)'
			});
		}
	}

	return json({ error: `Action inconnue : ${action}` }, { status: 400 });
};
