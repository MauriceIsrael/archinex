import { json } from '@sveltejs/kit';
import { HubApiError } from '$lib/types/llmops';
import { HubDecisionError } from './hubDecisions';

/** Réponse HTTP d'une erreur du Hub : le code et la raison du Hub, jamais masqués ni reformulés. */
export function hubErrorResponse(err: unknown) {
	if (err instanceof HubDecisionError) {
		return json({ status: 'error', error: err.code, message: err.message, reason: err.message, ...err.detail }, { status: err.code === 'ARBITER_UNKNOWN' ? 409 : 422 });
	}
	if (err instanceof HubApiError) {
		return json(
			// `message` : les clients d'Archinex lisent ce champ pour une refus du Hub (ex. self_validation).
			{ status: 'error', error: err.code, message: err.reason, reason: err.reason, problems: err.problems, ...(err.details?.subjects ? { subjects: err.details.subjects } : {}) },
			{ status: err.status }
		);
	}
	const message = err instanceof Error ? err.message : String(err);
	if (message.startsWith('VOCABULARY_UNAVAILABLE')) return json({ status: 'error', error: 'VOCABULARY_UNAVAILABLE', message, reason: message }, { status: 502 });
	const status = message.startsWith('NOT_FOUND') ? 404 : /^(TEXT_TOO_LONG|EMAIL|INVALID_DECISION|HUB_ID_COLLISION)/.test(message) ? 400 : 500;
	return json({ status: 'error', error: message }, { status });
}
