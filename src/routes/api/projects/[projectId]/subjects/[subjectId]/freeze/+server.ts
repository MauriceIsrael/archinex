import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { resolveProjectActor } from '$lib/server/projects/actorHelper';
import { prisma } from '$lib/server/prisma';
import type { SealedSnapshot } from '$lib/domain/freezeExport';

/**
 * Récupère le dernier snapshot scellé d'une section (L5_archived).
 */
export const GET: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	try {
		const frozenEvent = await prisma.domainEvent.findFirst({
			where: {
				projectId,
				entityType: 'section_freeze',
				entityId: subjectId,
				type: 'SECTION_FROZEN'
			},
			orderBy: { createdAt: 'desc' }
		});

		if (!frozenEvent) {
			return json({ status: 'ok', snapshot: null });
		}

		const snapshot: SealedSnapshot = JSON.parse(frozenEvent.payload);
		return json({ status: 'ok', snapshot });
	} catch (err: any) {
		return json({ status: 'error', error: err?.message || 'Erreur lors de la lecture du scellement' }, { status: 500 });
	}
};

/**
 * Scelle officiellement une section d'architecture au niveau L5_archived.
 * Seul le Lead Architect peut sceller une section (contrôle d'habilitation strict).
 */
export const POST: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;

	const actor = await resolveProjectActor(event, projectId);
	const role = actor.role;
	if (role !== 'lead_architect' && role !== 'admin') {
		return json(
			{
				status: 'error',
				error: "Seul l'Architecte Référent (Lead Architect) est habilité à sceller une section.",
				code: 'ROLE_NOT_AUTHORIZED'
			},
			{ status: 403 }
		);
	}

	let body: { snapshot?: SealedSnapshot; authorName?: string } = {};
	try {
		body = await event.request.json();
	} catch {
		// Pas de corps JSON fourni
	}

	const subject = await prisma.subject.findUnique({
		where: { id: subjectId }
	});

	if (!subject || subject.projectId !== projectId) {
		return json({ status: 'error', error: `Sujet '${subjectId}' introuvable dans le projet` }, { status: 404 });
	}

	const snapshot = body.snapshot;
	if (!snapshot || !snapshot.sealSha256) {
		return json({ status: 'error', error: 'Snapshot scellé avec condensat SHA-256 obligatoire.' }, { status: 400 });
	}

	try {
		// 1. Promotion du sujet en L5_archived en base
		await prisma.subject.update({
			where: { id: subjectId },
			data: {
				maturityLevel: 'L5_archived',
				blockingCount: 0
			}
		});

		// 2. Enregistrement immuable du scellement dans la piste d'audit
		await prisma.domainEvent.create({
			data: {
				projectId,
				entityType: 'section_freeze',
				entityId: subjectId,
				type: 'SECTION_FROZEN',
				actorId: session.user.id || session.user.email,
				actorRole: role,
				productionMode: actor.productionMode || 'human-authored',
				payload: JSON.stringify(snapshot)
			}
		});

		return json({ status: 'ok', snapshot });
	} catch (err: any) {
		return json({ status: 'error', error: err?.message || 'Erreur lors du scellement de la section' }, { status: 500 });
	}
};
