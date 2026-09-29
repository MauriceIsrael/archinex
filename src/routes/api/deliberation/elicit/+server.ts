import { json, error, type RequestHandler } from '@sveltejs/kit';
import { elicitSubjectDetails } from '$lib/server/llm/subjectElicitor';
import type { KbItemSummary } from '$lib/server/llm/rfpFactorizer';
import { doctrineService } from '$lib/server/doctrine/doctrineService';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { subjectId, subjectName, sectionRef } = body;

		if (!subjectId || !subjectName) {
			throw error(400, 'subjectId et subjectName sont requis pour l\'élicitation.');
		}

		// Récupération de la doctrine applicable depuis LLMOps
		let kbStandards: KbItemSummary[] = [];
		try {
			const ctx = await doctrineService.getDoctrineContext({ topics: [subjectName] });
			if (ctx && Array.isArray(ctx.items)) {
				kbStandards = ctx.items.map((item) => ({
					id: item.id,
					title: item.title,
					category: (item.domain || item.type || 'ARCHITECTURE').toUpperCase(),
					ruleOrStatement: item.content
				}));
			}
		} catch {
			// En cas d'erreur de doctrine, on continue avec un tableau vide
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
		const message = err instanceof Error ? err.message : 'Erreur interne lors de l\'élicitation.';
		return json({ status: 'error', error: message }, { status: 500 });
	}
};
