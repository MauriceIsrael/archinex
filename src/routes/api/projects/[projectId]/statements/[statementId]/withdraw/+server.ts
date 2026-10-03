import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { llmopsClient, HubApiError } from '$lib/server/llmops/client';
import { isProjectCutOverToHub, mapArchinexRoleToHubRole } from '$lib/server/projects/hubMigrationService';

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session || !session.user) {
		return json(
			{ status: 'error', error: 'Non authentifié : session requise' },
			{ status: 401 }
		);
	}

	const { projectId, statementId } = event.params;
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: { members: true }
	});

	if (!project) {
		return json({ status: 'error', error: `Projet ${projectId} introuvable` }, { status: 404 });
	}

	if (isProjectCutOverToHub(project)) {
		const strategy = typeof project.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project.strategy || {});
		const engagementId = strategy.hubEngagementId || project.shortName || project.id;

		try {
			const res = await llmopsClient.withdrawStatement(engagementId, statementId, session.user.email);
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

	const statement = await prisma.statement.findUnique({
		where: { id: statementId }
	});

	if (!statement || statement.projectId !== projectId) {
		return json({ status: 'error', error: `Énoncé ${statementId} introuvable` }, { status: 404 });
	}

	const member = project.members.find((m) => m.userId === session.user.id);
	const userRole = member?.role || session.user.role;
	const hubRole = mapArchinexRoleToHubRole(userRole);
	const isAuthor =
		statement.author === session.user.id ||
		statement.author === session.user.email ||
		statement.author === session.user.name;

	if (!isAuthor && hubRole !== 'decider' && hubRole !== 'admin') {
		return json(
			{ status: 'error', error: 'forbidden', reason: 'Seul l’auteur ou un décideur peut retirer un énoncé' },
			{ status: 403 }
		);
	}

	const updated = await prisma.statement.update({
		where: { id: statementId },
		data: {
			status: 'retracted',
			version: statement.version + 1
		}
	});

	return json({
		status: 'ok',
		data: { statement: updated }
	});
};
