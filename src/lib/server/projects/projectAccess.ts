import { json, type RequestEvent } from '@sveltejs/kit';
import { prisma } from '../prisma';

/**
 * Accès d'un utilisateur connecté à un projet : admin, membre (compte rattaché au projet) ou participant de
 * l'engagement retrouvé par son e-mail. Les participants sont saisis à la création de l'espace sans compte :
 * l'e-mail est le seul lien fiable entre les deux (#61).
 */
export async function authorizeProjectAccess(event: RequestEvent, projectId: string) {
	const session = event.locals?.session;
	if (!session?.user) {
		return { error: json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 }) };
	}
	const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true } });
	const engagement = await prisma.engagement.findUnique({ where: { id: projectId }, select: { participants: true } });
	if (!project && !engagement) {
		return { error: json({ status: 'error', error: `Projet ${projectId} introuvable` }, { status: 404 }) };
	}
	if (session.user.role === 'admin' || project?.members.some((m) => m.userId === session.user.id)) {
		return { session, project };
	}

	const email = session.user.email?.toLowerCase();
	if (email && engagement?.participants) {
		try {
			const participants = JSON.parse(engagement.participants || '[]') as Array<{ email?: string }>;
			if (participants.some((p) => p.email?.toLowerCase() === email)) {
				return { session, project };
			}
		} catch {
			// participants illisibles : accès refusé ci-dessous
		}
	}
	return { error: json({ status: 'error', error: 'forbidden', reason: 'Réservé aux membres du projet' }, { status: 403 }) };
}

/** Le créateur d'un espace en devient membre (Lead Architect) : sans cela il ne peut pas y enregistrer ses données. */
export async function addCreatorAsMember(projectId: string, userId: string) {
	await prisma.projectMember.upsert({
		where: { projectId_userId: { projectId, userId } },
		create: { projectId, userId, role: 'lead_architect', domains: '[]' },
		update: {}
	});
}
