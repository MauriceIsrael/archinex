import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import {
	computeTopFrugalityOpportunities,
	type SubjectMatrixInput
} from '$lib/domain/frugalityScoring';

export const GET: RequestHandler = async ({ url, locals }) => {
	const projectId = url.searchParams.get('projectId');

	try {
		const whereClause = projectId ? { projectId } : {};

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
