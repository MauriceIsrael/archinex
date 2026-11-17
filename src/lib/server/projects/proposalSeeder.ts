/**
 * Matérialise la proposition du modèle (options, critères, évaluations) issue de la factorisation, à la création
 * d'un sujet. Tout est marqué `llm-derived` / `llm-proposed` : l'équipe valide, corrige ou supprime en délibération.
 */

import type { SubjectProposal } from '$lib/domain/factorization';
import type { ActorInfo } from './projectsDb';
import { createCriterion, createOption, listCriteria, listOptions, upsertEvaluation } from './optionsDb';

export const MODEL_PROPOSAL_ACTOR: ActorInfo = { userId: 'model:factorisation', role: 'lead_architect', productionMode: 'llm-derived' };

export async function seedSubjectProposal(subjectId: string, proposal: SubjectProposal, actor: ActorInfo = MODEL_PROPOSAL_ACTOR) {
	const [existingCriteria, existingOptions] = await Promise.all([listCriteria(subjectId), listOptions(subjectId)]);
	const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

	const criterionIds = new Map<string, string>();
	let createdCriteria = 0;
	for (const c of proposal.criteria) {
		const existing = existingCriteria.find((ec) => sameLabel(ec.name, c.name));
		if (existing) {
			criterionIds.set(c.name, existing.id);
			continue;
		}
		const created = await createCriterion(subjectId, { name: c.name, description: c.description, kind: c.kind, weight: c.weight }, actor);
		criterionIds.set(c.name, created.id);
		createdCriteria++;
	}

	const optionIds = new Map<string, string>();
	let createdOptions = 0;
	for (const o of proposal.options) {
		const existing = existingOptions.find((eo) => sameLabel(eo.title, o.title));
		if (existing) {
			optionIds.set(o.title, existing.id);
			continue;
		}
		const created = await createOption(subjectId, { title: o.title, summary: o.summary || o.title, origin: 'llm-proposed' }, actor);
		optionIds.set(o.title, created.id);
		createdOptions++;
	}

	for (const e of proposal.evaluations) {
		const optionId = optionIds.get(e.option);
		const criterionId = criterionIds.get(e.criterion);
		if (!optionId || !criterionId) continue;
		await upsertEvaluation(subjectId, { optionId, criterionId, score: e.score, justification: e.justification }, actor);
	}
	return { criteria: createdCriteria, options: createdOptions };
}
