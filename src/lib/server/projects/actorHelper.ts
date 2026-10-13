import type { RequestEvent } from '@sveltejs/kit';
import type { ActorInfo } from './projectsDb';
import { prisma } from '../prisma';

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

/**
 * Acteur d'une requête dans le contexte d'un projet : le rôle d'architecte d'une personne connectée vient de sa
 * fiche participant dans l'espace (retrouvée par son e-mail), pas de son rôle applicatif (`user`).
 * Un administrateur garde ses droits ; un rôle fourni explicitement par en-tête (scripts, tests) prime.
 */
export async function resolveProjectActor(event: RequestEvent, projectId: string): Promise<ActorInfo> {
	const actor = getActorFromEvent(event);
	const sessionUser = event.locals?.session?.user;
	const email = sessionUser?.email?.toLowerCase();
	const userId = sessionUser?.id;
	if (event.request.headers.get('x-user-role') || actor.role === 'admin') return actor;
	try {
		const engagement = await prisma.engagement.findUnique({ where: { id: projectId }, select: { participants: true } });
		const participants = JSON.parse(engagement?.participants || '[]') as Array<{ id?: string; email?: string; role?: string }>;
		const me = participants.find((p) => (email && p.email?.toLowerCase() === email) || (userId && p.id === userId));
		if (me?.role) return { ...actor, role: me.role };

		if (userId) {
			const member = await prisma.projectMember.findUnique({
				where: { projectId_userId: { projectId, userId } }
			});
			if (member?.role) return { ...actor, role: member.role };
		}
	} catch {
		// participants illisibles : on garde le rôle de session
	}
	return actor;
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
