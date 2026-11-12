import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import {
	computeTopFrugalityOpportunities,
	type SubjectMatrixInput
} from '$lib/domain/frugalityScoring';

export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	if (!projectId) {
		return json({ error: 'Missing projectId' }, { status: 400 });
	}

	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	try {
		const subjects = await prisma.subject.findMany({
			where: { projectId },
			include: {
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
		console.error('[API Frugality Opportunities] Erreur :', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
