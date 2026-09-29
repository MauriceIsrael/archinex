import { json, error, type RequestHandler } from '@sveltejs/kit';
import { elicitSubjectDetails } from '$lib/server/llm/subjectElicitor';
import { DEFAULT_KB_STANDARDS, type KbItemSummary } from '$lib/server/llm/rfpFactorizer';
import { llmopsClient } from '$lib/server/llmops';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { subjectId, subjectName, sectionRef } = body;

		if (!subjectId || !subjectName) {
			throw error(400, 'subjectId et subjectName sont requis pour l\'élicitation.');
		}

		// Récupération du patrimoine commun depuis LLMOps (ou standards par défaut)
		let kbStandards: KbItemSummary[] = DEFAULT_KB_STANDARDS;
		try {
			const engagement = body.engagementId || 'nordwave-mcx-2027';
			const sync = await llmopsClient.syncEngagement(engagement);
			if (sync && Array.isArray(sync.statements) && sync.statements.length > 0) {
				const fromSync = sync.statements.map((st: any) => ({
					id: st.id,
					title: `${st.subject} - ${st.predicate}`,
					category: st.role.toUpperCase(),
					ruleOrStatement: st.value
				}));
				kbStandards = [...DEFAULT_KB_STANDARDS, ...fromSync];
			}
		} catch {
			// On garde les standards par défaut
		}

		const result = await elicitSubjectDetails(
			{
				subjectId,
				subjectName,
				sectionRef: sectionRef || '§0.0',
				currentLevel: body.currentLevel,
				existingRetenu: body.existingRetenu,
				existingHypotheses: body.existingHypotheses,
				existingConflicts: body.existingConflicts,
				clausesText: body.clausesText,
				model: body.model || 'ministral:latest'
			},
			kbStandards
		);

		return json(result);
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const msg = err instanceof Error ? err.message : 'Erreur interne lors de l\'élicitation';
		throw error(500, `Échec de l'élicitation architecturale : ${msg}`);
	}
};
