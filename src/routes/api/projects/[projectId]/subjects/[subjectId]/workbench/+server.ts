import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSubjectExists } from '$lib/server/projects/projectsDb';
import { listArguments } from '$lib/server/projects/debateDb';
import {
	listCriteria,
	listEvaluations,
	listOptions,
	listTradeOffs
} from '$lib/server/projects/optionsDb';
import { parseSubjectDecision } from '$lib/server/projects/arbitrationDb';
import { computeSubjectMaturityReport } from '$lib/server/projects/maturityCriteriaService';
import { resolveSubjectRequirements } from '$lib/server/projects/requirementsDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

/**
 * Endpoint agrégé pour le chargement rapide de l'espace sujet en phase délibération.
 * Regroupe en une seule requête HTTP les données locales SQLite/Prisma sans bloquer sur LLMOps.
 */
export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;

	const { projectId, subjectId } = event.params;

	try {
		const subject = await ensureSubjectExists(projectId, subjectId);

		const [args, options, criteria, evaluations, tradeOffs, maturityData, subjectRequirements] = await Promise.all([
			listArguments(subjectId),
			listOptions(subjectId),
			listCriteria(subjectId),
			listEvaluations(subjectId),
			listTradeOffs(subjectId),
			computeSubjectMaturityReport({ event, projectId, subjectId, subject }),
			resolveSubjectRequirements(projectId, subject.requirementRefs)
		]);

		const { parsedDecision } = await parseSubjectDecision(
			projectId,
			subject.decision,
			maturityData.assertionEvent
		);

		return json({
			subject: {
				id: subject.id,
				maturityLevel: subject.maturityLevel,
				deliberationStatus: subject.deliberationStatus,
				singleOptionRationale: subject.singleOptionRationale,
				version: subject.version
			},
			arguments: args,
			options,
			criteria,
			evaluations,
			tradeOffs,
			decision: parsedDecision,
			criteriaReport: maturityData.report,
			isHubCutover: maturityData.isHubCutover,
			requirements: subjectRequirements.items,
			requirementsUnresolvedRefs: subjectRequirements.unresolvedRefs,
			requirementsDossierPresent: subjectRequirements.dossierPresent
		});
	} catch (err: any) {
		console.error('[API Workbench] Erreur :', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
