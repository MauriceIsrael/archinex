import { json } from '@sveltejs/kit';
import { HubApiError } from '$lib/types/llmops';

/** Réponse HTTP d'une erreur du Hub : le code et la raison du Hub, jamais masqués ni reformulés. */
export function hubErrorResponse(err: unknown) {
	if (err instanceof HubApiError) {
		return json(
			{ status: 'error', error: err.code, reason: err.reason, problems: err.problems, ...(err.details?.subjects ? { subjects: err.details.subjects } : {}) },
			{ status: err.status }
		);
	}
	const message = err instanceof Error ? err.message : String(err);
	const status = message.startsWith('NOT_FOUND') ? 404 : /^(TEXT_TOO_LONG|EMAIL|INVALID_DECISION|HUB_ID_COLLISION)/.test(message) ? 400 : 500;
	return json({ status: 'error', error: message }, { status });
}
