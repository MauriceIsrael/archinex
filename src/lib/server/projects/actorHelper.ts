import type { RequestEvent } from '@sveltejs/kit';
import type { ActorInfo } from './projectsDb';

export function getActorFromEvent(event: RequestEvent): ActorInfo {
	const sessionUser = event.locals?.session?.user;

	const userId =
		event.request.headers.get('x-user-id') ||
		sessionUser?.id ||
		'lead-architect';

	const role =
		event.request.headers.get('x-user-role') ||
		sessionUser?.role ||
		'lead_architect';

	const productionMode =
		event.request.headers.get('x-production-mode') ||
		'human-authored';

	return {
		userId,
		role,
		productionMode
	};
}

export function getActorInfo(input: RequestEvent | Request): ActorInfo {
	if ('request' in input) {
		return getActorFromEvent(input as RequestEvent);
	}
	const req = input as Request;
	return {
		userId: req.headers.get('x-user-id') || 'lead-architect',
		role: req.headers.get('x-user-role') || 'lead_architect',
		productionMode: req.headers.get('x-production-mode') || 'human-authored'
	};
}
