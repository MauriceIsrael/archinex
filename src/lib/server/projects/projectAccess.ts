import { json, type RequestEvent } from '@sveltejs/kit';
import { prisma } from '../prisma';
import type { Session } from '../../../app.d.ts';

/**
 * Retourne l'ensemble des identifiants de projets/engagements accessibles par l'utilisateur connecté,
 * ou `null` si l'utilisateur est administrateur (accès complet à tous les projets).
 * Même règle que `authorizeProjectAccess` : admin, membre `ProjectMember` ou participant par e-mail.
 */
export async function getAccessibleProjectIds(session: Session): Promise<Set<string> | null> {
	if (session.user.role === 'admin') {
		return null;
	}

	const [memberships, engagements] = await Promise.all([
		prisma.projectMember.findMany({
			where: { userId: session.user.id },
			select: { projectId: true }
		}),
		prisma.engagement.findMany({
			select: { id: true, participants: true }
		})
	]);

	const allowed = new Set<string>(memberships.map((m) => m.projectId));
	const email = session.user.email?.toLowerCase();

	if (email) {
		for (const eng of engagements) {
			if (!eng.participants) continue;
			try {
				const participants = JSON.parse(eng.participants) as Array<{ email?: string }>;
				if (Array.isArray(participants) && participants.some((p) => p.email?.toLowerCase() === email)) {
					allowed.add(eng.id);
				}
			} catch {
				// participants illisibles : ignoré
			}
		}
	}

	return allowed;
}

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
