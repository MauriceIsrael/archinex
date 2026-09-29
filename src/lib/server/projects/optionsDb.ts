import { prisma } from '../prisma';
import { ConcurrencyConflictError, type ActorInfo } from './projectsDb';
import { validateEvaluation, type Criterion, type Option, type OptionEvaluation, type TradeOff, type Decision, type CriterionKind, type OptionOrigin, type OptionStatus, type DecisionReversibility } from '$lib/domain/options';
import type { Prisma } from '@prisma/client';

// -------------------------------------------------------------
// CRITERIA
// -------------------------------------------------------------

export async function listCriteria(subjectId: string): Promise<Criterion[]> {
	const criteria = await prisma.criterion.findMany({
		where: { subjectId },
		orderBy: { createdAt: 'asc' }
	});
	return criteria.map((c) => ({
		...c,
		kind: c.kind as CriterionKind,
		productionMode: c.productionMode as any,
		kbRef: c.kbRef || undefined
	}));
}

export async function createCriterion(
	subjectId: string,
	data: {
		id?: string;
		name: string;
		description?: string;
		kind: CriterionKind;
		weight?: number;
		kbRef?: string | null;
	},
	actor: ActorInfo
) {
	const criterionId = data.id || `crit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
	return await prisma.$transaction(async (tx) => {
		const subject = await tx.subject.findUnique({ where: { id: subjectId } });
		if (!subject) throw new Error(`Subject ${subjectId} introuvable`);

		const created = await tx.criterion.create({
			data: {
				id: criterionId,
				subjectId,
				name: data.name,
				description: data.description || '',
				kind: data.kind,
				weight: Math.max(1, Math.min(5, data.weight ?? 3)),
				kbRef: data.kbRef || null,
				author: actor.userId,
				role: actor.role,
				productionMode: actor.productionMode || 'human-authored',
				version: 1
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'criterion',
				entityId: created.id,
				type: 'CRITERION_CREATED',
				payload: JSON.stringify(created),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return created;
	});
}

export async function updateCriterion(
	criterionId: string,
	data: {
		expectedVersion: number;
		name?: string;
		description?: string;
		kind?: CriterionKind;
		weight?: number;
		kbRef?: string | null;
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.criterion.findUnique({
			where: { id: criterionId },
			include: { subject: true }
		});
		if (!current) throw new Error(`Criterion ${criterionId} introuvable`);

		if (current.version !== data.expectedVersion) {
			throw new ConcurrencyConflictError(
				'criterion',
				criterionId,
				current.version,
				data.expectedVersion,
				current
			);
		}

		const updatePayload: Prisma.CriterionUpdateInput = {
			version: current.version + 1
		};
		if (data.name !== undefined) updatePayload.name = data.name;
		if (data.description !== undefined) updatePayload.description = data.description;
		if (data.kind !== undefined) updatePayload.kind = data.kind;
		if (data.weight !== undefined) updatePayload.weight = Math.max(1, Math.min(5, data.weight));
		if (data.kbRef !== undefined) updatePayload.kbRef = data.kbRef;

		const updated = await tx.criterion.update({
			where: { id: criterionId },
			data: updatePayload
		});

		await tx.domainEvent.create({
			data: {
				projectId: current.subject.projectId,
				entityType: 'criterion',
				entityId: criterionId,
				type: 'CRITERION_UPDATED',
				payload: JSON.stringify(data),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return updated;
	});
}

export async function deleteCriterion(
	criterionId: string,
	expectedVersion: number,
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.criterion.findUnique({
			where: { id: criterionId },
			include: { subject: true }
		});
		if (!current) throw new Error(`Criterion ${criterionId} introuvable`);

		if (current.version !== expectedVersion) {
			throw new ConcurrencyConflictError(
				'criterion',
				criterionId,
				current.version,
				expectedVersion,
				current
			);
		}

		await tx.criterion.delete({ where: { id: criterionId } });

		await tx.domainEvent.create({
			data: {
				projectId: current.subject.projectId,
				entityType: 'criterion',
				entityId: criterionId,
				type: 'CRITERION_DELETED',
				payload: JSON.stringify({ name: current.name }),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return { success: true };
	});
}

// -------------------------------------------------------------
// OPTIONS
// -------------------------------------------------------------

export async function listOptions(subjectId: string): Promise<Option[]> {
	const options = await prisma.option.findMany({
		where: { subjectId },
		orderBy: { createdAt: 'asc' }
	});

	return options.map((opt) => ({
		...opt,
		origin: opt.origin as OptionOrigin,
		status: opt.status as OptionStatus,
		productionMode: opt.productionMode as any,
		kbRefs: JSON.parse(opt.kbRefs || '[]')
	}));
}

export async function getOption(optionId: string) {
	const opt = await prisma.option.findUnique({
		where: { id: optionId },
		include: {
			evaluations: true,
			tradeOffs: true,
			subject: true
		}
	});
	if (!opt) return null;

	return {
		...opt,
		kbRefs: JSON.parse(opt.kbRefs || '[]'),
		evaluations: opt.evaluations.map((ev) => ({
			...ev,
			evidenceRefs: JSON.parse(ev.evidenceRefs || '[]')
		})),
		tradeOffs: opt.tradeOffs.map((t) => ({
			...t,
			criterionIds: JSON.parse(t.criterionIds || '[]')
		}))
	};
}

export async function createOption(
	subjectId: string,
	data: {
		id?: string;
		title: string;
		summary: string;
		origin?: OptionOrigin;
		kbRefs?: string[];
		status?: OptionStatus;
	},
	actor: ActorInfo
) {
	const optionId = data.id || `opt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
	return await prisma.$transaction(async (tx) => {
		const subject = await tx.subject.findUnique({ where: { id: subjectId } });
		if (!subject) throw new Error(`Subject ${subjectId} introuvable`);

		const created = await tx.option.create({
			data: {
				id: optionId,
				subjectId,
				title: data.title,
				summary: data.summary,
				origin: data.origin || 'human',
				kbRefs: JSON.stringify(data.kbRefs || []),
				status: data.status || 'proposed',
				author: actor.userId,
				role: actor.role,
				productionMode: actor.productionMode || 'human-authored',
				version: 1
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'option',
				entityId: created.id,
				type: 'OPTION_CREATED',
				payload: JSON.stringify(created),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...created,
			kbRefs: data.kbRefs || []
		};
	});
}

export async function updateOption(
	optionId: string,
	data: {
		expectedVersion: number;
		title?: string;
		summary?: string;
		status?: OptionStatus;
		kbRefs?: string[];
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.option.findUnique({
			where: { id: optionId },
			include: { subject: true }
		});
		if (!current) throw new Error(`Option ${optionId} introuvable`);

		if (current.version !== data.expectedVersion) {
			throw new ConcurrencyConflictError(
				'option',
				optionId,
				current.version,
				data.expectedVersion,
				current
			);
		}

		const updatePayload: Prisma.OptionUpdateInput = {
			version: current.version + 1
		};
		if (data.title !== undefined) updatePayload.title = data.title;
		if (data.summary !== undefined) updatePayload.summary = data.summary;
		if (data.status !== undefined) updatePayload.status = data.status;
		if (data.kbRefs !== undefined) updatePayload.kbRefs = JSON.stringify(data.kbRefs);

		const updated = await tx.option.update({
			where: { id: optionId },
			data: updatePayload
		});

		await tx.domainEvent.create({
			data: {
				projectId: current.subject.projectId,
				entityType: 'option',
				entityId: optionId,
				type: 'OPTION_UPDATED',
				payload: JSON.stringify(data),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...updated,
			kbRefs: JSON.parse(updated.kbRefs || '[]')
		};
	});
}

export async function deleteOption(
	optionId: string,
	expectedVersion: number,
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.option.findUnique({
			where: { id: optionId },
			include: { subject: true }
		});
		if (!current) throw new Error(`Option ${optionId} introuvable`);

		if (current.version !== expectedVersion) {
			throw new ConcurrencyConflictError(
				'option',
				optionId,
				current.version,
				expectedVersion,
				current
			);
		}

		await tx.option.delete({ where: { id: optionId } });

		await tx.domainEvent.create({
			data: {
				projectId: current.subject.projectId,
				entityType: 'option',
				entityId: optionId,
				type: 'OPTION_DELETED',
				payload: JSON.stringify({ title: current.title }),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return { success: true };
	});
}

// -------------------------------------------------------------
// OPTION EVALUATIONS (avec validation stricte de justification)
// -------------------------------------------------------------

export async function listEvaluations(subjectId: string): Promise<OptionEvaluation[]> {
	const evaluations = await prisma.optionEvaluation.findMany({
		where: {
			option: { subjectId }
		},
		include: {
			criterion: true,
			option: true
		}
	});

	return evaluations.map((ev) => ({
		...ev,
		evidenceRefs: JSON.parse(ev.evidenceRefs || '[]'),
		productionMode: ev.productionMode as any
	}));
}

export async function upsertEvaluation(
	subjectId: string,
	data: {
		optionId: string;
		criterionId: string;
		score: number;
		justification: string;
		evidenceRefs?: string[];
	},
	actor: ActorInfo
) {
	const validation = validateEvaluation(data);
	if (!validation.valid) {
		throw new Error(validation.reason);
	}

	return await prisma.$transaction(async (tx) => {
		const [option, criterion] = await Promise.all([
			tx.option.findUnique({ where: { id: data.optionId }, include: { subject: true } }),
			tx.criterion.findUnique({ where: { id: data.criterionId } })
		]);

		if (!option || option.subjectId !== subjectId) {
			throw new Error(`Option ${data.optionId} invalide pour le sujet ${subjectId}`);
		}
		if (!criterion || criterion.subjectId !== subjectId) {
			throw new Error(`Criterion ${data.criterionId} invalide pour le sujet ${subjectId}`);
		}

		const existing = await tx.optionEvaluation.findUnique({
			where: {
				optionId_criterionId: {
					optionId: data.optionId,
					criterionId: data.criterionId
				}
			}
		});

		const currentVersion = existing?.version ?? 0;

		const upserted = await tx.optionEvaluation.upsert({
			where: {
				optionId_criterionId: {
					optionId: data.optionId,
					criterionId: data.criterionId
				}
			},
			create: {
				optionId: data.optionId,
				criterionId: data.criterionId,
				score: data.score,
				justification: data.justification.trim(),
				evidenceRefs: JSON.stringify(data.evidenceRefs || []),
				author: actor.userId,
				role: actor.role,
				productionMode: actor.productionMode || 'human-authored',
				version: 1
			},
			update: {
				score: data.score,
				justification: data.justification.trim(),
				evidenceRefs: JSON.stringify(data.evidenceRefs || []),
				author: actor.userId,
				role: actor.role,
				productionMode: actor.productionMode || 'human-authored',
				version: currentVersion + 1
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId: option.subject.projectId,
				entityType: 'option_evaluation',
				entityId: upserted.id,
				type: 'EVALUATION_RECORDED',
				payload: JSON.stringify({
					optionId: data.optionId,
					criterionId: data.criterionId,
					score: data.score,
					justification: data.justification
				}),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...upserted,
			evidenceRefs: data.evidenceRefs || []
		};
	});
}

// -------------------------------------------------------------
// TRADEOFFS
// -------------------------------------------------------------

export async function listTradeOffs(subjectId: string) {
	const tradeOffs = await prisma.tradeOff.findMany({
		where: { subjectId },
		orderBy: { createdAt: 'asc' }
	});

	return tradeOffs.map((t) => ({
		...t,
		criterionIds: JSON.parse(t.criterionIds || '[]')
	}));
}

export async function createTradeOff(
	subjectId: string,
	data: {
		id: string;
		optionId: string;
		gains: string;
		sacrifices: string;
		criterionIds?: string[];
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const subject = await tx.subject.findUnique({ where: { id: subjectId } });
		if (!subject) throw new Error(`Subject ${subjectId} introuvable`);

		const created = await tx.tradeOff.create({
			data: {
				id: data.id,
				subjectId,
				optionId: data.optionId,
				gains: data.gains,
				sacrifices: data.sacrifices,
				criterionIds: JSON.stringify(data.criterionIds || []),
				version: 1
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'trade_off',
				entityId: created.id,
				type: 'TRADEOFF_CREATED',
				payload: JSON.stringify(created),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...created,
			criterionIds: data.criterionIds || []
		};
	});
}

// -------------------------------------------------------------
// DECISION (Arbitrage final - Invariant V & VII)
// -------------------------------------------------------------

export async function getDecision(subjectId: string) {
	const dec = await prisma.decision.findUnique({
		where: { subjectId }
	});
	if (!dec) return null;

	return {
		...dec,
		rejected: JSON.parse(dec.rejected || '[]'),
		acceptedViolations: JSON.parse(dec.acceptedViolations || '[]'),
		kbCandidateIds: JSON.parse(dec.kbCandidateIds || '[]')
	};
}

export async function recordDecision(
	subjectId: string,
	data: {
		id: string;
		retainedOptionId: string;
		rejected?: Array<{ optionId: string; reason: string }>;
		rationale: string;
		reversibility: DecisionReversibility;
		acceptedViolations?: Array<{ typedId: string; justification: string }>;
		kbCandidateIds?: string[];
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const subject = await tx.subject.findUnique({ where: { id: subjectId } });
		if (!subject) throw new Error(`Subject ${subjectId} introuvable`);

		// Enregistrement de la décision
		const decision = await tx.decision.upsert({
			where: { subjectId },
			create: {
				id: data.id,
				subjectId,
				retainedOptionId: data.retainedOptionId,
				rejected: JSON.stringify(data.rejected || []),
				rationale: data.rationale,
				reversibility: data.reversibility,
				arbiterId: actor.userId,
				arbiterRole: actor.role,
				decidedAt: new Date(),
				acceptedViolations: JSON.stringify(data.acceptedViolations || []),
				kbCandidateIds: JSON.stringify(data.kbCandidateIds || []),
				version: 1
			},
			update: {
				retainedOptionId: data.retainedOptionId,
				rejected: JSON.stringify(data.rejected || []),
				rationale: data.rationale,
				reversibility: data.reversibility,
				arbiterId: actor.userId,
				arbiterRole: actor.role,
				decidedAt: new Date(),
				acceptedViolations: JSON.stringify(data.acceptedViolations || []),
				kbCandidateIds: JSON.stringify(data.kbCandidateIds || [])
			}
		});

		// Mise à jour de l'option retenue
		await tx.option.update({
			where: { id: data.retainedOptionId },
			data: { status: 'retained' }
		});

		// Mise à jour des options rejetées
		if (data.rejected && data.rejected.length > 0) {
			for (const rej of data.rejected) {
				await tx.option.update({
					where: { id: rej.optionId },
					data: { status: 'rejected' }
				});
			}
		}

		// Promotion du sujet au statut arbitrated et niveau L3_decided
		await tx.subject.update({
			where: { id: subjectId },
			data: {
				deliberationStatus: 'arbitrated',
				maturityLevel: 'L3_decided',
				version: subject.version + 1
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'decision',
				entityId: decision.id,
				type: 'DECISION_RECORDED',
				payload: JSON.stringify({
					subjectId,
					retainedOptionId: data.retainedOptionId,
					rationale: data.rationale,
					reversibility: data.reversibility
				}),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...decision,
			rejected: data.rejected || [],
			acceptedViolations: data.acceptedViolations || [],
			kbCandidateIds: data.kbCandidateIds || []
		};
	});
}
