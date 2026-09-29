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

	const domainsHeader = event.request.headers.get('x-user-domains');
	let domains: string[] | undefined = undefined;
	if (domainsHeader) {
		try {
			domains = JSON.parse(domainsHeader);
		} catch {
			domains = domainsHeader.split(',').map((d) => d.trim());
		}
	} else if ((sessionUser as any)?.domains) {
		domains = (sessionUser as any).domains;
	}

	return {
		userId,
		role,
		productionMode,
		domains
	};
}

export function getActorInfo(input: RequestEvent | Request): ActorInfo {
	if ('request' in input) {
		return getActorFromEvent(input as RequestEvent);
	}
	const req = input as Request;
	const domainsHeader = req.headers.get('x-user-domains');
	let domains: string[] | undefined = undefined;
	if (domainsHeader) {
		try {
			domains = JSON.parse(domainsHeader);
		} catch {
			domains = domainsHeader.split(',').map((d) => d.trim());
		}
	}
	return {
		userId: req.headers.get('x-user-id') || 'lead-architect',
		role: req.headers.get('x-user-role') || 'lead_architect',
		productionMode: req.headers.get('x-production-mode') || 'human-authored',
		domains
	};
}
