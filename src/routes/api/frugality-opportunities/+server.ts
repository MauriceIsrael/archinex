import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import {
	computeTopFrugalityOpportunities,
	type SubjectMatrixInput
} from '$lib/domain/frugalityScoring';
import {
	authorizeProjectAccess,
	getAccessibleProjectIds
} from '$lib/server/projects/projectAccess';

export const GET: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}

	const projectId = event.url.searchParams.get('projectId');

	try {
		let whereClause: Record<string, unknown> = {};
		if (projectId) {
			const auth = await authorizeProjectAccess(event, projectId);
			if (auth.error) return auth.error;
			whereClause = { projectId };
		} else {
			const allowedIds = await getAccessibleProjectIds(session);
			if (allowedIds) {
				whereClause = { projectId: { in: [...allowedIds] } };
			}
		}

		const subjects = await prisma.subject.findMany({
			where: whereClause,
			include: {
				project: {
					select: {
						id: true,
						title: true,
						badge: true
					}
				},
				criteria: true,
				options: {
					include: {
						evaluations: true
					}
				},
				decision: true
			}
		});

		const matrixInputs: SubjectMatrixInput[] = subjects.map((s) => ({
			id: s.id,
			name: s.name,
			sectionRef: s.sectionRef,
			projectId: s.projectId,
			projectTitle: s.project?.title,
			projectBadge: s.project?.badge,
			criteria: s.criteria.map((c) => ({
				id: c.id,
				name: c.name,
				kind: c.kind,
				weight: c.weight,
				description: c.description
			})),
			options: s.options.map((o) => ({
				id: o.id,
				title: o.title,
				summary: o.summary,
				evaluations: o.evaluations.map((e) => ({
					criterionId: e.criterionId,
					score: e.score,
					justification: e.justification
				}))
			})),
			decision: s.decision ? { retainedOptionId: s.decision.retainedOptionId } : null
		}));

		const opportunities = computeTopFrugalityOpportunities(matrixInputs, 5);

		return json({ opportunities });
	} catch (err: any) {
		console.error('[API Frugality Opportunities Global] Erreur :', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
