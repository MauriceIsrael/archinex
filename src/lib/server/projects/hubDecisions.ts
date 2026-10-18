/**
 * Enregistrement d'une décision d'architecture dans le Hub, pour un projet basculé (K16, #103).
 *
 * Règles du Hub, appliquées telles quelles :
 *  - une décision est PROPOSÉE par son auteur, puis AFFIRMÉE par une personne distincte ayant le rôle décideur ;
 *  - elle porte le TEXTE de l'option retenue et des options écartées (pas des identifiants d'Archinex) ;
 *  - les faits sont typés selon le vocabulaire du Hub ;
 *  - le sujet doit exister dans l'engagement ; une décision affirmée est la condition de L3.
 *
 * Aucune erreur du Hub n'est avalée : si le Hub refuse, l'appelant refuse, avec le code et la raison du Hub. Rien n'est écrit
 * en local avant que le Hub ait accepté.
 */

import { prisma } from '../prisma';
import { llmopsClient, type LLMOpsClient } from '../llmops/client';
import { reconcileRequirementsToHub, hubEngagementIdOf, type HubProject } from './hubRequirementDecisions';
import { coerceFactValue, type HubFactVocabulary } from '$lib/domain/hubFactVocabulary';
import type { HubDecisionFactInput } from '$lib/types/llmops';

export interface SelectedFact {
	key: string;
	value: string;
	source_excerpt?: string;
}

export interface DecisionRow {
	id: string;
	retainedOptionId: string;
	rejected: string;
	rationale: string;
	reversibility: string;
	arbiterId: string;
	acceptedViolations: string;
	portability?: 'project_specific' | 'reusable_product_capability' | 'reusable_architecture_doctrine';
}

export interface SubjectRow {
	id: string;
	name: string;
	problemStatement: string | null;
}

export class HubDecisionError extends Error {
	constructor(
		readonly code: 'ARBITER_UNKNOWN' | 'OPTION_UNKNOWN' | 'FACT_VALUE',
		message: string,
		readonly detail?: Record<string, unknown>
	) {
		super(`${code}: ${message}`);
		this.name = 'HubDecisionError';
	}
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	try {
		return JSON.parse(raw || '') as T;
	} catch {
		return fallback;
	}
}

/** E-mail de l'auteur de la décision : `arbiterId` est un identifiant de compte ou déjà une adresse. */
async function arbiterEmail(arbiterId: string): Promise<string> {
	if (arbiterId.includes('@')) return arbiterId.toLowerCase();
	const user = await prisma.user.findUnique({ where: { id: arbiterId }, select: { email: true } });
	if (!user?.email) {
		throw new HubDecisionError('ARBITER_UNKNOWN', `l'auteur de la décision (${arbiterId}) n'a pas d'adresse connue : le Hub ne peut pas l'identifier.`);
	}
	return user.email.toLowerCase();
}

/**
 * Éléments de la base de connaissances que l'option retenue cite : la décision s'en réclame. Le Hub les résout dans son instantané
 * épinglé et en tire les contrôles qu'ils mettent en œuvre (K17) ; une référence qu'il ne connaît pas est signalée par lui, pas écartée ici.
 */
export function citedKnowledge(raw: string | null | undefined): Array<{ id: string }> {
	const refs = parseJson<unknown[]>(raw, []);
	const ids = refs.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim());
	return [...new Set(ids)].sort().map((id) => ({ id }));
}

/** Faits sélectionnés → faits du Hub : clé du vocabulaire, valeur typée, extrait source. Une valeur qui ne se convertit pas est refusée. */
export function toHubFacts(selected: SelectedFact[], vocabulary: HubFactVocabulary): HubDecisionFactInput[] {
	const byKey = new Map(vocabulary.keys.map((k) => [k.key, k]));
	return selected.map((f) => {
		const def = byKey.get(f.key);
		if (!def) throw new HubDecisionError('FACT_VALUE', `la clé « ${f.key} » n'est pas dans le vocabulaire du Hub.`, { key: f.key });
		const coerced = coerceFactValue(def, f.value);
		if (!coerced.ok) {
			throw new HubDecisionError('FACT_VALUE', `« ${f.key} » : ${coerced.reason} (reçu « ${f.value} »).`, { key: f.key });
		}
		return { key: f.key, value: coerced.value, source_excerpt: (f.source_excerpt ?? '').trim() };
	});
}

export interface RecordedDecision {
	hubDecisionId: string;
	/** Vrai si le Hub avait déjà cette décision affirmée (rejeu). */
	alreadyAsserted: boolean;
}

/**
 * Propose la décision au nom de son auteur, l'affirme au nom de la personne connectée, puis avance le sujet à L3 dans le Hub.
 * Idempotent : la clé dérive de la décision ; un rejeu ne duplique rien et ne remet rien à zéro.
 */
export async function recordDecisionInHub(
	project: HubProject,
	subject: SubjectRow,
	decision: DecisionRow,
	facts: HubDecisionFactInput[],
	asserterEmail: string,
	client: LLMOpsClient = llmopsClient
): Promise<RecordedDecision> {
	const engagementId = hubEngagementIdOf(project);
	const author = await arbiterEmail(decision.arbiterId);

	// Le Hub parle de TEXTES d'options ; Archinex garde des identifiants.
	const rejected = parseJson<Array<{ optionId: string; reason: string }>>(decision.rejected, []);
	const ids = [decision.retainedOptionId, ...rejected.map((r) => r.optionId)];
	const options = await prisma.option.findMany({ where: { id: { in: ids }, subjectId: subject.id }, select: { id: true, title: true, kbRefs: true } });
	const titleOf = new Map(options.map((o) => [o.id, o.title]));
	const missing = ids.filter((id) => !titleOf.has(id));
	if (missing.length > 0) {
		throw new HubDecisionError('OPTION_UNKNOWN', `option(s) introuvable(s) pour ce sujet : ${missing.join(', ')}. Le Hub reçoit le texte des options, pas leurs identifiants.`, { missing });
	}

	// Le Hub doit connaître le sujet (et les exigences qu'il porte) avant d'en recevoir une décision.
	await reconcileRequirementsToHub(project, asserterEmail, client);
	await client.addSubject(engagementId, { name: subject.name.trim(), definition: subject.problemStatement || undefined }, asserterEmail);

	const violations = parseJson<Array<{ typedId?: string; typed_id?: string; justification: string }>>(decision.acceptedViolations, []);
	const portabilityEntry = violations.find((v) => (v.typedId ?? v.typed_id ?? '').startsWith('PORTABILITY:'));
	const portability = decision.portability ?? (portabilityEntry ? ((portabilityEntry.typedId ?? portabilityEntry.typed_id)!.replace('PORTABILITY:', '') as any) : 'project_specific');
	const harvestable = portability !== 'project_specific';

	const realViolations = violations.filter(
		(v) => !(v.typedId ?? v.typed_id ?? '').startsWith('COMPLIANCE_STATUS:') && !(v.typedId ?? v.typed_id ?? '').startsWith('PORTABILITY:')
	);

	const proposed = await client.addDecision(
		engagementId,
		{
			subject: subject.name.trim(),
			decision: titleOf.get(decision.retainedOptionId)!,
			rationale: decision.rationale,
			reversibility: decision.reversibility as 'reversible' | 'costly' | 'irreversible',
			portability,
			harvestable,
			rejected: rejected.map((r) => ({ option: titleOf.get(r.optionId)!, reason: r.reason })),
			accepted_violations: realViolations.map((v) => ({ typed_id: (v.typedId ?? v.typed_id)!, justification: v.justification })),
			based_on: citedKnowledge(options.find((o) => o.id === decision.retainedOptionId)?.kbRefs),
			facts
		},
		author, // la décision est celle de son auteur ; la personne qui l'affirme est une autre
		`dec-${decision.id}`
	);

	const hubDecisionId = proposed.decision.id;
	const alreadyAsserted = proposed.decision.status === 'active';
	if (!alreadyAsserted) {
		await client.assertDecision(engagementId, hubDecisionId, asserterEmail); // 409 self_validation si c'est la même personne
	}
	// Une décision affirmée est la condition de L3 : le Hub est le système d'enregistrement de la maturité du sujet.
	await client.advanceSubjectMaturity(engagementId, subject.name.trim(), 'L3_decided', asserterEmail);
	return { hubDecisionId, alreadyAsserted };
}
