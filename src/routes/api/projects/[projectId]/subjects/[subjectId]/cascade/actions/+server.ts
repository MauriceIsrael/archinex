import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { closeCascadeQuestion, type CascadeQuestion } from '$lib/domain/cascade';

export const POST: RequestHandler = async (event) => {
	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide' }, { status: 400 });
	}

	const { action, question, justification, assignedTo, mergedWithSubjectId } = body;

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
		return json({ status: 'ok', question: updated });
	}

	return json({ error: `Action inconnue : ${action}` }, { status: 400 });
};
