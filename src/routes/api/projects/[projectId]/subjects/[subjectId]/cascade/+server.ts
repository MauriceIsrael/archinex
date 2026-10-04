import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getOrCreateCascadeForDecision,
	checkFoundationContested
} from '$lib/server/cascade/cascadeService';
import { buildDiscoveryTreeData } from '$lib/domain/cascade';

export const GET: RequestHandler = async ({ params }) => {
	const { projectId, subjectId } = params;

	try {
		const cascade = await getOrCreateCascadeForDecision({ projectId, subjectId });
		const contestation = await checkFoundationContested(subjectId);
		const { getProjectRules } = await import('$lib/server/rules/projectRulesService');
		const projectRulesState = await getProjectRules(projectId);

		const treeSeries = buildDiscoveryTreeData({
			parentSubject: {
				id: subjectId,
				name: cascade.parentSubjectName,
				sectionRef: '§'
			},
			decision: {
				id: cascade.decisionId,
				retainedOptionTitle: 'Décision Affirmée'
			},
			childSubjects: cascade.questions.map((q) => ({
				id: q.childSubjectId || q.id,
				name: q.subjectName,
				sectionRef: q.subjectSectionRef,
				level: q.initialLevel,
				foundationContested: contestation.foundationContested && (q.childSubjectId?.includes('split') ?? false)
			})),
			disabledRules: projectRulesState.disabledOverrides.map((o) => {
				const ref = projectRulesState.referenceRules.find((r) => r.id === o.ruleId);
				return {
					ruleId: o.ruleId,
					ruleName: ref?.title || o.ruleId,
					justification: o.justification,
					disabledBy: o.disabledBy,
					mandatory: ref?.mandatory ?? false
				};
			})
		});

		return json({
			status: 'ok',
			cascade,
			treeSeries,
			foundationContested: contestation.foundationContested,
			contestationReason: contestation.contestationReason
		});
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
