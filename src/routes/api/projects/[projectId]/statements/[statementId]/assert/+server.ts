import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { llmopsClient, HubApiError } from '$lib/server/llmops/client';
import { isProjectCutOverToHub, mapArchinexRoleToHubRole } from '$lib/server/projects/hubMigrationService';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const POST: RequestHandler = async (event) => {
	const { projectId, statementId } = event.params;
	// 1. Authentification stricte par session et contrôle d'appartenance au projet
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;
	const project = auth.project!;

	// 2. Détermination du rôle du membre
	const member = project.members.find((m) => m.userId === session.user.id);
	const userRole = member?.role || session.user.role;
	const hubRole = mapArchinexRoleToHubRole(userRole);

	if (hubRole !== 'decider' && hubRole !== 'admin') {
		return json(
			{
				status: 'error',
				error: 'forbidden',
				reason: 'Seul un décideur ou un administrateur distinct de l’auteur peut affirmer un énoncé'
			},
			{ status: 403 }
		);
	}

	// 3. Si le projet est basculé sur le Hub
	if (isProjectCutOverToHub(project)) {
		const strategy = typeof project.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project.strategy || {});
		const engagementId = strategy.hubEngagementId || project.shortName || project.id;

		try {
			const res = await llmopsClient.assertStatement(engagementId, statementId, session.user.email);
			return json({ status: 'ok', data: res });
		} catch (err: unknown) {
			if (err instanceof HubApiError) {
				return json(
					{
						status: 'error',
						error: err.code,
						reason: err.reason,
						problems: err.problems
					},
					{ status: err.status }
				);
			}
			return json({ status: 'error', error: (err as Error).message }, { status: 500 });
		}
	}

	// 4. Mode local : Invariant K15 d'affirmation
	const statement = await prisma.statement.findUnique({
		where: { id: statementId }
	});

	if (!statement || statement.projectId !== projectId) {
		return json({ status: 'error', error: `Énoncé ${statementId} introuvable` }, { status: 404 });
	}

	const authorMatches =
		statement.author === session.user.id ||
		statement.author === session.user.email ||
		statement.author === session.user.name;

	if (authorMatches) {
		return json(
			{
				status: 'error',
				error: 'self_validation',
				reason: `L’auteur ${statement.author} ne peut pas affirmer son propre énoncé (règle K15)`
			},
			{ status: 409 }
		);
	}

	const updated = await prisma.statement.update({
		where: { id: statementId },
		data: {
			status: 'active',
			version: statement.version + 1
		}
	});

	await prisma.domainEvent.create({
		data: {
			projectId,
			entityType: 'statement',
			entityId: statementId,
			type: 'STATEMENT_ASSERTED',
			payload: JSON.stringify({
				validatedBy: session.user.email,
				author: statement.author
			}),
			actorId: session.user.id,
			actorRole: userRole,
			productionMode: 'human-authored'
		}
	});

	return json({
		status: 'ok',
		data: {
			statement: updated,
			conflicts_opened: []
		}
	});
};
