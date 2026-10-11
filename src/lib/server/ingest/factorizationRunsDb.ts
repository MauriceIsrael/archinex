/**
 * Persistance des factorisations de RFP.
 *
 * - Chaque exécution est enregistrée dès son lancement, puis son résultat complet à la fin du calcul :
 *   si le navigateur se déconnecte pendant un audit de plusieurs dizaines de minutes, le résultat reste
 *   consultable et rechargeable.
 * - Les résultats intermédiaires des étapes LLM sont mis en cache par empreinte de leurs entrées : une relance
 *   après un échec partiel ne refait que les lots ou sujets manquants.
 */

import { createHash } from 'node:crypto';
import { prisma } from '../prisma';
import type { RfpFactorizationResponse } from '$lib/domain/factorization';
import type { StageCache } from './arckitRequirementsPipeline';

export type FactorizationRunStatus = 'running' | 'ok' | 'partial' | 'unavailable' | 'error' | 'interrupted';

/** Avancement publié par une exécution en cours. */
export interface FactorizationProgress {
	stage: string;
	label: string;
	done: number;
	total: number;
	updatedAt: string;
}

export interface FactorizationRunSummary {
	id: string;
	documentTitle: string | null;
	model: string;
	engine: string | null;
	status: FactorizationRunStatus;
	clauseCount: number;
	subjectCount: number | null;
	error: string | null;
	progress: FactorizationProgress | null;
	startedAt: Date;
	finishedAt: Date | null;
}

export function sha256(value: unknown): string {
	return createHash('sha256')
		.update(typeof value === 'string' ? value : JSON.stringify(value))
		.digest('hex');
}

const summarySelect = {
	id: true,
	documentTitle: true,
	model: true,
	engine: true,
	status: true,
	clauseCount: true,
	subjectCount: true,
	error: true,
	progress: true,
	startedAt: true,
	finishedAt: true
} as const;

export async function startFactorizationRun(input: {
	inputSha256: string;
	documentTitle?: string;
	model: string;
	clauseCount: number;
	sourceText?: string;
	/** Requête d'origine, conservée pour pouvoir reprendre une exécution interrompue. */
	request?: unknown;
}): Promise<string> {
	const run = await prisma.factorizationRun.create({
		data: {
			inputSha256: input.inputSha256,
			documentTitle: input.documentTitle || null,
			model: input.model,
			clauseCount: input.clauseCount,
			sourceText: input.sourceText || null,
			request: input.request === undefined ? null : JSON.stringify(input.request)
		},
		select: { id: true }
	});
	return run.id;
}

export async function finishFactorizationRun(
	id: string,
	outcome: { status: Exclude<FactorizationRunStatus, 'running'>; engine?: string; result?: RfpFactorizationResponse; error?: string }
): Promise<void> {
	await prisma.factorizationRun.update({
		where: { id },
		data: {
			status: outcome.status,
			engine: outcome.engine ?? null,
			result: outcome.result ? JSON.stringify(outcome.result) : null,
			subjectCount: outcome.result?.subjects.length ?? null,
			error: outcome.error ?? null,
			finishedAt: new Date()
		}
	});
}

/**
 * Publie l'avancement d'une exécution en cours, et l'état partiel exploitable s'il y en a un
 * (`subjectCount` non nul signale qu'un résultat, même partiel, est consultable).
 */
export async function updateFactorizationProgress(
	id: string,
	progress: FactorizationProgress,
	partial?: RfpFactorizationResponse
): Promise<void> {
	await prisma.factorizationRun.update({
		where: { id },
		data: {
			progress: JSON.stringify(progress),
			...(partial ? { result: JSON.stringify(partial), subjectCount: partial.subjects.length } : {})
		}
	});
}

/** Passe en « interrompue » les exécutions « en cours » dont le calcul n'existe plus (redémarrage du serveur). */
export async function markInterruptedRuns(activeIds: string[]): Promise<number> {
	const res = await prisma.factorizationRun.updateMany({
		where: { status: 'running', id: { notIn: activeIds } },
		data: { status: 'interrupted', error: 'Exécution interrompue par un redémarrage du serveur : reprenable.' }
	});
	return res.count;
}

/** Requête d'origine d'une exécution reprenable (interrompue ou en échec), ou null. */
export async function getFactorizationRunRequest(id: string): Promise<unknown | null> {
	const row = await prisma.factorizationRun.findUnique({ where: { id }, select: { request: true, status: true, sourceText: true } });
	if (!row?.request || !['interrupted', 'error', 'unavailable', 'partial'].includes(row.status)) return null;
	return { ...JSON.parse(row.request), sourceText: row.sourceText ?? undefined };
}

export async function restartFactorizationRun(id: string): Promise<void> {
	await prisma.factorizationRun.update({
		where: { id },
		data: { status: 'running', error: null, finishedAt: null, startedAt: new Date() }
	});
}

function toSummary<T extends { status: string; progress: string | null }>(row: T) {
	return {
		...row,
		status: row.status as FactorizationRunStatus,
		progress: row.progress ? (JSON.parse(row.progress) as FactorizationProgress) : null
	};
}

export async function listFactorizationRuns(limit = 20): Promise<FactorizationRunSummary[]> {
	const rows = await prisma.factorizationRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit, select: summarySelect });
	return rows.map(toSummary);
}

export async function getFactorizationRun(
	id: string
): Promise<(FactorizationRunSummary & { result: RfpFactorizationResponse | null; sourceText: string | null }) | null> {
	const row = await prisma.factorizationRun.findUnique({ where: { id }, select: { ...summarySelect, result: true, sourceText: true } });
	if (!row) return null;
	return {
		...toSummary(row),
		sourceText: row.sourceText,
		result: row.result ? (JSON.parse(row.result) as RfpFactorizationResponse) : null
	};
}

/** Dernière exécution aboutie (statut ok) pour exactement les mêmes entrées. */
export async function findCompletedRun(inputSha256: string): Promise<{ id: string; result: RfpFactorizationResponse } | null> {
	const row = await prisma.factorizationRun.findFirst({
		where: { inputSha256, status: 'ok', result: { not: null } },
		orderBy: { startedAt: 'desc' },
		select: { id: true, result: true }
	});
	return row?.result ? { id: row.id, result: JSON.parse(row.result) as RfpFactorizationResponse } : null;
}

export const prismaStageCache: StageCache = {
	async get(key) {
		const row = await prisma.factorizationStageCache.findUnique({ where: { key }, select: { value: true } });
		return row ? JSON.parse(row.value) : undefined;
	},
	async set(key, stage, value) {
		const serialized = JSON.stringify(value);
		await prisma.factorizationStageCache.upsert({
			where: { key },
			create: { key, stage, value: serialized },
			update: { value: serialized }
		});
	}
};
