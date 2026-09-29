import { prisma } from '../prisma';
import { ConcurrencyConflictError, type ActorInfo } from './projectsDb';
import {
	validateArgument,
	canCloseObjection,
	type Stance,
	type ArgumentResolution,
	type Argument,
	type DebateRun
} from '$lib/domain/debate';
import type { EpistemicConfidence, ProductionMode } from '$lib/types/epistemic';

export interface CreateArgumentData {
	id?: string;
	optionId?: string | null;
	targetArgumentId?: string | null;
	stance: Stance;
	claim: string;
	grounds: string;
	kbRefs?: string[];
	confidence?: EpistemicConfidence;
	authorKind?: string;
	round?: number;
}

export async function listArguments(
	subjectId: string,
	optionId?: string | null
): Promise<Argument[]> {
	const whereClause: any = { subjectId };
	if (optionId !== undefined) {
		whereClause.optionId = optionId;
	}

	const args = await prisma.argument.findMany({
		where: whereClause,
		orderBy: { createdAt: 'asc' }
	});

	return args.map((a) => ({
		...a,
		stance: a.stance as Stance,
		confidence: a.confidence as EpistemicConfidence,
		productionMode: a.productionMode as ProductionMode,
		resolution: a.resolution as ArgumentResolution,
		kbRefs: JSON.parse(a.kbRefs || '[]'),
		resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
		createdAt: a.createdAt.toISOString(),
		updatedAt: a.updatedAt.toISOString()
	}));
}

export async function getArgument(argumentId: string): Promise<Argument | null> {
	const a = await prisma.argument.findUnique({
		where: { id: argumentId }
	});
	if (!a) return null;

	return {
		...a,
		stance: a.stance as Stance,
		confidence: a.confidence as EpistemicConfidence,
		productionMode: a.productionMode as ProductionMode,
		resolution: a.resolution as ArgumentResolution,
		kbRefs: JSON.parse(a.kbRefs || '[]'),
		resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
		createdAt: a.createdAt.toISOString(),
		updatedAt: a.updatedAt.toISOString()
	};
}

export async function createArgument(
	subjectId: string,
	data: CreateArgumentData,
	actor: ActorInfo,
	allowedKbRefs?: string[]
): Promise<Argument> {
	const isAgent = Boolean(data.authorKind?.startsWith('agent:'));
	const productionMode: ProductionMode = isAgent ? 'llm-derived' : 'human-authored';
	const authorKind = data.authorKind || (isAgent ? 'agent:proposer' : 'human');

	const validation = validateArgument(
		{
			claim: data.claim,
			grounds: data.grounds,
			kbRefs: data.kbRefs || [],
			authorKind,
			productionMode
		},
		allowedKbRefs
	);

	if (!validation.valid) {
		throw new Error(validation.reason);
	}

	return await prisma.$transaction(async (tx) => {
		const subject = await tx.subject.findUnique({ where: { id: subjectId } });
		if (!subject) throw new Error(`Subject ${subjectId} introuvable`);

		if (data.optionId) {
			const option = await tx.option.findUnique({ where: { id: data.optionId } });
			if (!option || option.subjectId !== subjectId) {
				throw new Error(`Option ${data.optionId} invalide pour le sujet ${subjectId}`);
			}
		}

		if (data.targetArgumentId) {
			const target = await tx.argument.findUnique({ where: { id: data.targetArgumentId } });
			if (!target || target.subjectId !== subjectId) {
				throw new Error(`Argument cible ${data.targetArgumentId} invalide pour le sujet ${subjectId}`);
			}
		}

		const argId = data.id || `arg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
		const created = await tx.argument.create({
			data: {
				id: argId,
				subjectId,
				optionId: data.optionId || null,
				targetArgumentId: data.targetArgumentId || null,
				stance: data.stance,
				claim: data.claim.trim(),
				grounds: data.grounds.trim(),
				kbRefs: JSON.stringify(data.kbRefs || []),
				confidence: data.confidence || 'assumed',
				author: actor.userId,
				authorKind,
				productionMode,
				round: data.round || 1,
				resolution: 'open',
				version: 1
			}
		});

		// Événement de domaine
		await tx.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'argument',
				entityId: created.id,
				type: 'ARGUMENT_CREATED',
				payload: JSON.stringify({
					subjectId,
					optionId: created.optionId,
					stance: created.stance,
					claim: created.claim,
					author: created.author
				}),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode
			}
		});

		return {
			...created,
			stance: created.stance as Stance,
			confidence: created.confidence as EpistemicConfidence,
			productionMode: created.productionMode as ProductionMode,
			resolution: created.resolution as ArgumentResolution,
			kbRefs: data.kbRefs || [],
			resolvedAt: null,
			createdAt: created.createdAt.toISOString(),
			updatedAt: created.updatedAt.toISOString()
		};
	});
}

export async function resolveArgument(
	argumentId: string,
	data: {
		resolution: ArgumentResolution;
		expectedVersion: number;
	},
	actor: ActorInfo,
	isHuman: boolean
): Promise<Argument> {
	if (!canCloseObjection(actor.role, isHuman)) {
		throw new Error(
			`Rôle '${actor.role}' non habilité à clore ou lever une objection. Action réservée à un architecte ou expert humain.`
		);
	}

	return await prisma.$transaction(async (tx) => {
		const current = await tx.argument.findUnique({
			where: { id: argumentId },
			include: { subject: true }
		});
		if (!current) throw new Error(`Argument ${argumentId} introuvable`);

		if (current.version !== data.expectedVersion) {
			throw new ConcurrencyConflictError(
				'argument',
				argumentId,
				current.version,
				data.expectedVersion,
				current
			);
		}

		const resolvedAt = new Date();
		const updated = await tx.argument.update({
			where: { id: argumentId },
			data: {
				resolution: data.resolution,
				resolvedBy: actor.userId,
				resolvedAt,
				version: current.version + 1
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId: current.subject.projectId,
				entityType: 'argument',
				entityId: argumentId,
				type: 'ARGUMENT_RESOLVED',
				payload: JSON.stringify({
					previousResolution: current.resolution,
					newResolution: data.resolution,
					resolvedBy: actor.userId
				}),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: 'human-authored'
			}
		});

		return {
			...updated,
			stance: updated.stance as Stance,
			confidence: updated.confidence as EpistemicConfidence,
			productionMode: updated.productionMode as ProductionMode,
			resolution: updated.resolution as ArgumentResolution,
			kbRefs: JSON.parse(updated.kbRefs || '[]'),
			resolvedAt: resolvedAt.toISOString(),
			createdAt: updated.createdAt.toISOString(),
			updatedAt: updated.updatedAt.toISOString()
		};
	});
}

// -------------------------------------------------------------
// DEBATE RUNS (Orchestration Asynchrone Bornée)
// -------------------------------------------------------------

export async function createDebateRun(
	subjectId: string,
	maxRounds: number = 3
): Promise<DebateRun> {
	const run = await prisma.debateRun.create({
		data: {
			id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
			subjectId,
			status: 'running',
			round: 1,
			maxRounds
		}
	});

	return {
		...run,
		status: run.status as 'running' | 'completed' | 'failed',
		startedAt: run.startedAt.toISOString(),
		finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null
	};
}

export async function updateDebateRun(
	runId: string,
	data: {
		status?: 'running' | 'completed' | 'failed';
		round?: number;
		error?: string | null;
	}
): Promise<DebateRun> {
	const isEnding = data.status === 'completed' || data.status === 'failed';
	const updated = await prisma.debateRun.update({
		where: { id: runId },
		data: {
			...(data.status ? { status: data.status } : {}),
			...(data.round ? { round: data.round } : {}),
			...(data.error !== undefined ? { error: data.error } : {}),
			...(isEnding ? { finishedAt: new Date() } : {})
		}
	});

	return {
		...updated,
		status: updated.status as 'running' | 'completed' | 'failed',
		startedAt: updated.startedAt.toISOString(),
		finishedAt: updated.finishedAt ? updated.finishedAt.toISOString() : null
	};
}

export async function getLatestDebateRun(subjectId: string): Promise<DebateRun | null> {
	const run = await prisma.debateRun.findFirst({
		where: { subjectId },
		orderBy: { createdAt: 'desc' }
	});
	if (!run) return null;

	return {
		...run,
		status: run.status as 'running' | 'completed' | 'failed',
		startedAt: run.startedAt.toISOString(),
		finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null
	};
}
