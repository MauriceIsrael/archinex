/**
 * Persistance des exigences d'un RFP et de leur audit.
 *
 * Règle de fond : la proposition du modèle (`proposed*`) et la décision humaine (`decided*`) sont deux choses
 * distinctes. Réimporter ou relancer un audit rafraîchit les propositions, jamais les décisions.
 */

import { prisma } from '../prisma';
import {
	requirementBundleId,
	sourceBundleId,
	validateRequirementDecision,
	type RequirementAuditInput
} from '$lib/domain/requirementAudit';
import type { AssemblySource } from '$lib/domain/bundleAssembly';

export interface SaveAuditResult {
	sourceId: string;
	bundleSourceId: string;
	requirements: number;
	confirmedDeliberated: number;
}

/**
 * Enregistre un audit. Idempotent : même source (même empreinte) = mêmes lignes, jamais de doublon.
 * `confirmedDeliberated` : l'humain qui a confirmé l'import devient l'auteur de la décision « à délibérer »,
 * sauf si une décision existe déjà pour la clause.
 */
export async function saveRequirementAudit(
	projectId: string,
	audit: RequirementAuditInput,
	actorHandle: string,
	now: Date = new Date()
): Promise<SaveAuditResult> {
	const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
	if (!project) throw new Error(`NOT_FOUND: Projet '${projectId}' introuvable.`);

	const bundleId = sourceBundleId(audit.source.sha256);
	const sourceId = `${projectId}:${bundleId}`;

	// Deux sources distinctes ne doivent jamais partager le même identifiant court dans un même projet.
	const clash = await prisma.requirementSource.findFirst({
		where: { projectId, id: sourceId, NOT: { sha256: audit.source.sha256 } },
		select: { sha256: true }
	});
	if (clash) throw new Error(`SOURCE_ID_COLLISION: ${bundleId} est déjà utilisé par une autre source (${clash.sha256}).`);

	const seen = new Set<string>();
	for (const it of audit.items) {
		if (seen.has(it.clauseRef)) throw new Error(`DUPLICATE_CLAUSE: la clause '${it.clauseRef}' figure deux fois dans l'audit.`);
		seen.add(it.clauseRef);
	}

	const auditedAt = new Date(audit.auditedAt);
	const proposedBy = `model:${audit.model}`;
	const confirmed = new Set(audit.confirmedDeliberated);

	await prisma.requirementSource.upsert({
		where: { id: sourceId },
		create: {
			id: sourceId,
			projectId,
			kind: audit.source.kind,
			title: audit.source.title,
			language: audit.source.language,
			version: audit.source.version ?? 'v1.0',
			sha256: audit.source.sha256,
			auditModel: audit.model,
			auditedAt
		},
		update: { title: audit.source.title, version: audit.source.version ?? 'v1.0', auditModel: audit.model, auditedAt }
	});

	const existing = await prisma.requirement.findMany({ where: { sourceId }, select: { clauseRef: true, decidedDisposition: true } });
	const alreadyDecided = new Set(existing.filter((e) => e.decidedDisposition).map((e) => e.clauseRef));

	const ops = audit.items.map((it) => {
		const proposal = {
			position: it.position,
			title: it.title,
			text: it.text,
			criticality: it.criticality,
			category: it.category ?? null,
			proposedDisposition: it.disposition,
			proposedReason: it.reason ?? null,
			clarificationQuestion: it.clarificationQuestion ?? null,
			proposedBy,
			proposedAt: auditedAt
		};
		const decide = confirmed.has(it.clauseRef) && !alreadyDecided.has(it.clauseRef);
		return prisma.requirement.upsert({
			where: { sourceId_clauseRef: { sourceId, clauseRef: it.clauseRef } },
			create: {
				sourceId,
				clauseRef: it.clauseRef,
				...proposal,
				...(decide ? { decidedDisposition: 'deliberated', decidedBy: actorHandle, decidedAt: now } : {})
			},
			// Une décision déjà prise n'est jamais touchée ; seule une première confirmation est écrite.
			update: { ...proposal, ...(decide ? { decidedDisposition: 'deliberated', decidedBy: actorHandle, decidedAt: now } : {}) }
		});
	});
	await prisma.$transaction(ops);

	return {
		sourceId,
		bundleSourceId: bundleId,
		requirements: audit.items.length,
		confirmedDeliberated: audit.items.filter((it) => confirmed.has(it.clauseRef) && !alreadyDecided.has(it.clauseRef)).length
	};
}

/** Sources et exigences d'un projet, dans l'ordre du document (lecture seule). */
export async function listRequirementSources(projectId: string) {
	return prisma.requirementSource.findMany({
		where: { projectId },
		orderBy: { sha256: 'asc' },
		include: { requirements: { orderBy: [{ position: 'asc' }, { clauseRef: 'asc' }] } }
	});
}

/** Données d'assemblage du dossier scellé, à partir des lignes stockées. */
export function toAssemblySources(
	sources: Awaited<ReturnType<typeof listRequirementSources>>
): AssemblySource[] {
	return sources.map((s) => ({
		sha256: s.sha256,
		title: s.title,
		kind: s.kind,
		language: s.language,
		requirements: s.requirements.map((r) => ({
			position: r.position,
			clauseRef: r.clauseRef,
			title: r.title,
			text: r.text,
			criticality: r.criticality,
			category: r.category,
			proposedDisposition: r.proposedDisposition,
			proposedReason: r.proposedReason,
			clarificationQuestion: r.clarificationQuestion,
			proposedBy: r.proposedBy,
			proposedAt: r.proposedAt,
			decidedDisposition: r.decidedDisposition,
			decidedReason: r.decidedReason,
			decidedBy: r.decidedBy,
			decidedAt: r.decidedAt
		}))
	}));
}

export interface DecideResult {
	id: string;
	disposition: string;
	/** La clause est à délibérer mais aucun sujet ne la porte : l'export sera refusé tant qu'elle n'est pas rattachée. */
	needsSubject: boolean;
}

/**
 * Décision humaine sur une exigence. `requirementId` est l'identifiant du dossier scellé (`SRC-xxxx:clause`).
 * Une clause qui cesse d'être « à délibérer » est retirée des sujets qui la citaient, pour que le dossier reste cohérent.
 */
export async function decideRequirement(
	projectId: string,
	requirementId: string,
	decision: { disposition: string; reason?: string },
	actorHandle: string,
	now: Date = new Date()
): Promise<DecideResult> {
	const invalid = validateRequirementDecision(decision);
	if (invalid) throw new Error(`INVALID_DECISION: ${invalid}`);

	const sep = requirementId.indexOf(':');
	if (sep < 1) throw new Error(`NOT_FOUND: Identifiant d'exigence invalide '${requirementId}'.`);
	const srcKey = requirementId.slice(0, sep);
	const clauseRef = requirementId.slice(sep + 1);

	const sources = await prisma.requirementSource.findMany({ where: { projectId } });
	const source = sources.find((s) => sourceBundleId(s.sha256) === srcKey);
	if (!source) throw new Error(`NOT_FOUND: Source '${srcKey}' introuvable dans le projet.`);

	const req = await prisma.requirement.findUnique({ where: { sourceId_clauseRef: { sourceId: source.id, clauseRef } } });
	if (!req) throw new Error(`NOT_FOUND: Exigence '${requirementId}' introuvable.`);

	await prisma.requirement.update({
		where: { id: req.id },
		data: {
			decidedDisposition: decision.disposition,
			decidedReason: (decision.reason ?? '').trim() || null,
			decidedBy: actorHandle,
			decidedAt: now
		}
	});

	const canonicalId = requirementBundleId(source.sha256, clauseRef);
	const subjects = await prisma.subject.findMany({ where: { projectId }, select: { id: true, requirementRefs: true } });
	let carriedBySubject = false;

	for (const s of subjects) {
		const refs: string[] = safeJsonArray(s.requirementRefs);
		if (!refs.includes(canonicalId)) continue;
		if (decision.disposition === 'deliberated') {
			carriedBySubject = true;
		} else {
			await prisma.subject.update({ where: { id: s.id }, data: { requirementRefs: JSON.stringify(refs.filter((r) => r !== canonicalId)) } });
		}
	}

	return {
		id: canonicalId,
		disposition: decision.disposition,
		needsSubject: decision.disposition === 'deliberated' && !carriedBySubject
	};
}

function safeJsonArray(raw: string | null | undefined): string[] {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}
