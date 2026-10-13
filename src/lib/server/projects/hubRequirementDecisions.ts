/**
 * Décisions sur les exigences d'un projet basculé sur le Hub (contrat 1.27).
 *
 * Une exigence évacuée par une personne, avec son motif, est un fait engagé : elle est enregistrée dans le Hub, qui est le
 * système d'enregistrement du projet. Ici rien n'est écrit en local (pas de double écriture). La proposition brute du modèle
 * reste dans Archinex. Les règles sont celles du Hub : on propose, une autre personne ayant le rôle décideur affirme.
 */

import { prisma } from '../prisma';
import { llmopsClient, type LLMOpsClient } from '../llmops/client';
import { listRequirementSources } from './requirementsDb';
import { hubRequirementId, hubRequirementIdMap } from '$lib/domain/hubRequirementId';
import { requirementBundleId, sourceBundleId } from '$lib/domain/requirementAudit';
import { HUB_MAX_REQUIREMENT_TEXT, EMAIL_REGEX } from './hubMigrationService';
import { HubApiError } from '$lib/types/llmops';
import type {
	HubRequirementDecisionResult,
	HubRequirementDispositionInput
} from '$lib/types/llmops';

export interface HubProject {
	id: string;
	shortName: string;
	strategy: unknown;
}

export function hubEngagementIdOf(project: HubProject): string {
	const strategy = typeof project.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project.strategy || {});
	return strategy.hubEngagementId || project.shortName || project.id;
}

function parseRefs(raw: string | null | undefined): string[] {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** Exigence auditée du projet par son identifiant du dossier (`SRC-xxxx:clause`), ou null. */
async function findRequirement(projectId: string, bundleId: string) {
	const sources = await listRequirementSources(projectId);
	for (const src of sources) {
		if (!bundleId.startsWith(`${sourceBundleId(src.sha256)}:`)) continue;
		const r = src.requirements.find((x) => requirementBundleId(src.sha256, x.clauseRef) === bundleId);
		if (r) return { source: src, requirement: r };
	}
	return null;
}

function hubItem(bundleId: string, hubId: string, r: { clauseRef: string; text: string; title: string; category: string | null; criticality: string }) {
	if (r.text.length > HUB_MAX_REQUIREMENT_TEXT) {
		throw new Error(`TEXT_TOO_LONG: la clause ${r.clauseRef} dépasse ${HUB_MAX_REQUIREMENT_TEXT} caractères, le Hub ne la tronque pas.`);
	}
	if (EMAIL_REGEX.test(r.text) || EMAIL_REGEX.test(r.title)) {
		throw new Error(`EMAIL: la clause ${r.clauseRef} contient une adresse e-mail, que le Hub refuse.`);
	}
	return { id: hubId, text: r.text, section: r.clauseRef, category: r.category ?? 'general', criticality: r.criticality, bundleId };
}

/**
 * Met le Hub au niveau de l'état local avant de sceller ou de décider : exigences auditées (500 par appel) et sujets qui les
 * portent. Idempotent. N'AJOUTE que : retirer une exigence d'un sujet se fait au moment où une décision la sort du débat.
 */
export async function reconcileRequirementsToHub(
	project: HubProject,
	actorEmail: string,
	client: LLMOpsClient = llmopsClient
): Promise<{ requirements: number; subjects: number }> {
	const engagementId = hubEngagementIdOf(project);
	const sources = await listRequirementSources(project.id);
	const bundleIds = sources.flatMap((s) => s.requirements.map((r) => requirementBundleId(s.sha256, r.clauseRef)));
	if (bundleIds.length === 0) return { requirements: 0, subjects: 0 };
	const ids = hubRequirementIdMap(bundleIds);

	const items = sources.flatMap((s) =>
		s.requirements.map((r) => {
			const bundleId = requirementBundleId(s.sha256, r.clauseRef);
			return hubItem(bundleId, ids.get(bundleId)!, r);
		})
	);
	for (let i = 0; i < items.length; i += 500) {
		await client.addRequirements(
			engagementId,
			{ requirements: items.slice(i, i + 500).map(({ bundleId: _b, ...rest }) => rest) },
			actorEmail
		);
	}

	const subjects = await prisma.subject.findMany({ where: { projectId: project.id } });
	let carried = 0;
	for (const s of subjects) {
		const refs = parseRefs(s.requirementRefs).map((r) => ids.get(r)).filter((x): x is string => Boolean(x));
		if (refs.length === 0) continue;
		await client.addSubject(engagementId, { name: s.name.trim(), definition: s.problemStatement || undefined, requirement_ids: refs }, actorEmail);
		carried++;
	}
	return { requirements: items.length, subjects: carried };
}

/** Propose, dans le Hub, ce que la délibération fait d'une exigence. Une autre personne ayant le rôle décideur l'affirmera. */
export async function proposeRequirementDecision(
	project: HubProject,
	bundleId: string,
	decision: HubRequirementDispositionInput,
	actorEmail: string,
	client: LLMOpsClient = llmopsClient
): Promise<HubRequirementDecisionResult> {
	const found = await findRequirement(project.id, bundleId);
	if (!found) throw new Error(`NOT_FOUND: Exigence '${bundleId}' introuvable dans le projet.`);
	const engagementId = hubEngagementIdOf(project);
	const hubId = hubRequirementId(bundleId);
	// L'exigence peut avoir été auditée après la bascule : on s'assure d'abord qu'elle existe dans le Hub (idempotent).
	const { bundleId: _b, ...item } = hubItem(bundleId, hubId, found.requirement);
	await client.addRequirements(engagementId, { requirements: [item] }, actorEmail);
	return client.proposeRequirementDisposition(engagementId, hubId, decision, actorEmail);
}

/**
 * Affirme la décision. Si le Hub refuse parce qu'un sujet porte encore l'exigence (`carried_by_subject`), on la retire de ces
 * sujets, dans le Hub puis en local, et on réessaie UNE fois : l'affirmation d'une évacuation vaut sortie du débat.
 */
export async function assertRequirementDecision(
	project: HubProject,
	bundleId: string,
	actorEmail: string,
	client: LLMOpsClient = llmopsClient
): Promise<HubRequirementDecisionResult> {
	const engagementId = hubEngagementIdOf(project);
	const hubId = hubRequirementId(bundleId);
	try {
		return await client.assertRequirementDisposition(engagementId, hubId, actorEmail);
	} catch (err) {
		if (!(err instanceof HubApiError) || err.code !== 'carried_by_subject') throw err;
		const names = Array.isArray(err.details?.subjects) ? (err.details!.subjects as string[]) : [];
		for (const name of names) {
			await client.carrySubjectRequirements(engagementId, name, { remove: [hubId] }, actorEmail);
		}
		await releaseLocally(project.id, bundleId, names);
		return client.assertRequirementDisposition(engagementId, hubId, actorEmail);
	}
}

export async function withdrawRequirementDecision(
	project: HubProject,
	bundleId: string,
	actorEmail: string,
	client: LLMOpsClient = llmopsClient
): Promise<HubRequirementDecisionResult> {
	return client.withdrawRequirementDisposition(hubEngagementIdOf(project), hubRequirementId(bundleId), actorEmail);
}

async function releaseLocally(projectId: string, bundleId: string, subjectNames: string[]) {
	const subjects = await prisma.subject.findMany({ where: { projectId } });
	for (const s of subjects) {
		if (!subjectNames.includes(s.name.trim())) continue;
		const refs = parseRefs(s.requirementRefs);
		if (!refs.includes(bundleId)) continue;
		await prisma.subject.update({ where: { id: s.id }, data: { requirementRefs: JSON.stringify(refs.filter((r) => r !== bundleId)) } });
	}
}
