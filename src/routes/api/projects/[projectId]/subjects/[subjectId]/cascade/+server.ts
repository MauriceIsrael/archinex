import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getOrCreateCascadeForDecision,
	checkFoundationContested,
	getDiscoveryTreeForSubject
} from '$lib/server/cascade/cascadeService';
import { buildDiscoveryTreeData } from '$lib/domain/cascade';

export const GET: RequestHandler = async ({ params }) => {
	const { projectId, subjectId } = params;

	try {
		const cascade = await getOrCreateCascadeForDecision({ projectId, subjectId });
		const contestation = await checkFoundationContested(subjectId);
		const { getProjectRules } = await import('$lib/server/rules/projectRulesService');
		const projectRulesState = await getProjectRules(projectId);

		const disabledRules = projectRulesState.disabledOverrides.map((o) => {
			const ref = projectRulesState.referenceRules.find((r) => r.id === o.ruleId);
			return {
				ruleId: o.ruleId,
				ruleName: ref?.title || o.ruleId,
				justification: o.justification,
				disabledBy: o.disabledBy,
				mandatory: ref?.mandatory ?? false
			};
		});

		const discoveryTree = await getDiscoveryTreeForSubject({
			projectId,
			subjectId,
			cascade,
			disabledRules
		});

		const treeSeries = buildDiscoveryTreeData({
			parentSubject: {
				id: subjectId,
				name: discoveryTree.currentSubject.name,
				sectionRef: discoveryTree.currentSubject.sectionRef || '§',
				level: discoveryTree.currentSubject.maturityLevel
			},
			decision: {
				id: discoveryTree.decision?.id || cascade.decisionId,
				retainedOptionTitle:
					discoveryTree.decision?.retainedOptionTitle || 'Aucune décision arbitrée'
			},
			childSubjects: discoveryTree.children.map((c) => ({
				id: c.subjectId,
				name: c.name,
				sectionRef: c.sectionRef,
				level: c.maturityLevel,
				foundationContested:
					c.foundationContested ||
					(contestation.foundationContested && c.subjectId.includes('split'))
			})),
			disabledRules
		});

		return json({
			status: 'ok',
			cascade,
			treeSeries,
			discoveryTree,
			foundationContested: contestation.foundationContested,
			contestationReason: contestation.contestationReason
		});
	} catch (err: any) {
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
