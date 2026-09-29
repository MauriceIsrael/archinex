import { prisma } from '../prisma';
import { executeRetractionCascade, type RetractionCascadeResult } from './retractionCascade';
import type { Prisma } from '@prisma/client';

export class ConcurrencyConflictError extends Error {
	statusCode = 409;
	entityType: string;
	entityId: string;
	currentVersion: number;
	expectedVersion: number;
	currentData: any;

	constructor(
		entityType: string,
		entityId: string,
		currentVersion: number,
		expectedVersion: number,
		currentData: any
	) {
		super(
			`Conflict on ${entityType} ${entityId}: current version is ${currentVersion}, but expected ${expectedVersion}`
		);
		this.name = 'ConcurrencyConflictError';
		this.entityType = entityType;
		this.entityId = entityId;
		this.currentVersion = currentVersion;
		this.expectedVersion = expectedVersion;
		this.currentData = currentData;
	}
}

export interface ActorInfo {
	userId: string;
	role: string;
	productionMode?: string;
	domains?: string[];
}

// -------------------------------------------------------------
// PROJECTS
// -------------------------------------------------------------

export async function getProject(id: string) {
	const project = await prisma.project.findUnique({
		where: { id },
		include: {
			members: true,
			frameworks: true,
			_count: {
				select: {
					subjects: true,
					statements: true,
					events: true
				}
			}
		}
	});

	if (!project) return null;

	return {
		...project,
		strategy: JSON.parse(project.strategy || '{}')
	};
}

export async function listProjects() {
	const projects = await prisma.project.findMany({
		where: { status: { not: 'archived' } },
		orderBy: { updatedAt: 'desc' },
		include: {
			members: true,
			_count: {
				select: {
					subjects: true,
					statements: true
				}
			}
		}
	});

	return projects.map((p) => ({
		...p,
		strategy: JSON.parse(p.strategy || '{}')
	}));
}

export async function createProject(
	data: {
		id: string;
		title: string;
		shortName: string;
		type?: string;
		badge: string;
		description?: string;
		strategy?: Record<string, any>;
		members?: Array<{ userId: string; role: string; domains?: string[] }>;
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const created = await tx.project.create({
			data: {
				id: data.id,
				title: data.title,
				shortName: data.shortName,
				type: data.type || 'project_rfp',
				badge: data.badge,
				description: data.description || '',
				strategy: JSON.stringify(data.strategy || {}),
				version: 1,
				members: data.members
					? {
							create: data.members.map((m) => ({
								userId: m.userId,
								role: m.role,
								domains: JSON.stringify(m.domains || [])
							}))
						}
					: undefined
			},
			include: { members: true }
		});

		await tx.domainEvent.create({
			data: {
				projectId: created.id,
				entityType: 'project',
				entityId: created.id,
				type: 'PROJECT_CREATED',
				payload: JSON.stringify({
					title: created.title,
					shortName: created.shortName,
					badge: created.badge
				}),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...created,
			strategy: JSON.parse(created.strategy || '{}')
		};
	});
}

export async function updateProject(
	id: string,
	data: {
		expectedVersion: number;
		title?: string;
		shortName?: string;
		type?: string;
		badge?: string;
		description?: string;
		status?: string;
		strategy?: Record<string, any>;
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.project.findUnique({ where: { id } });
		if (!current) throw new Error(`Project ${id} non trouvé`);

		if (current.version !== data.expectedVersion) {
			throw new ConcurrencyConflictError(
				'project',
				id,
				current.version,
				data.expectedVersion,
				current
			);
		}

		const updatePayload: Prisma.ProjectUpdateInput = {
			version: current.version + 1
		};
		if (data.title !== undefined) updatePayload.title = data.title;
		if (data.shortName !== undefined) updatePayload.shortName = data.shortName;
		if (data.type !== undefined) updatePayload.type = data.type;
		if (data.badge !== undefined) updatePayload.badge = data.badge;
		if (data.description !== undefined) updatePayload.description = data.description;
		if (data.status !== undefined) updatePayload.status = data.status;
		if (data.strategy !== undefined) updatePayload.strategy = JSON.stringify(data.strategy);

		const updated = await tx.project.update({
			where: { id },
			data: updatePayload
		});

		await tx.domainEvent.create({
			data: {
				projectId: id,
				entityType: 'project',
				entityId: id,
				type: 'PROJECT_UPDATED',
				payload: JSON.stringify(data),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...updated,
			strategy: JSON.parse(updated.strategy || '{}')
		};
	});
}

// -------------------------------------------------------------
// SUBJECTS
// -------------------------------------------------------------

export async function listSubjects(projectId: string) {
	const subjects = await prisma.subject.findMany({
		where: { projectId },
		include: { questions: true },
		orderBy: { unlocksCount: 'desc' }
	});
	return subjects;
}

export async function getSubject(projectId: string, subjectId: string) {
	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: { questions: true }
	});
	if (!subject || subject.projectId !== projectId) return null;
	return subject;
}

export async function createSubject(
	projectId: string,
	data: {
		id: string;
		sectionRef: string;
		name: string;
		domain?: string;
		problemStatement?: string;
		maturityLevel?: string;
		deliberationStatus?: string;
		waitingForRole?: string;
		relativeEffort?: string;
		blockingCount?: number;
		unlocksCount?: number;
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const created = await tx.subject.create({
			data: {
				id: data.id,
				projectId,
				sectionRef: data.sectionRef,
				name: data.name,
				domain: data.domain || 'general',
				problemStatement: data.problemStatement || '',
				maturityLevel: data.maturityLevel || 'L0_named',
				deliberationStatus: data.deliberationStatus || 'open',
				waitingForRole: data.waitingForRole || 'lead_architect',
				relativeEffort: data.relativeEffort || 'M',
				blockingCount: data.blockingCount ?? 0,
				unlocksCount: data.unlocksCount ?? 0,
				version: 1
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'subject',
				entityId: created.id,
				type: 'SUBJECT_CREATED',
				payload: JSON.stringify(created),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return created;
	});
}

export async function updateSubject(
	projectId: string,
	subjectId: string,
	data: {
		expectedVersion: number;
		sectionRef?: string;
		name?: string;
		domain?: string;
		problemStatement?: string;
		maturityLevel?: string;
		deliberationStatus?: string;
		waitingForRole?: string;
		relativeEffort?: string;
		blockingCount?: number;
		unlocksCount?: number;
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.subject.findUnique({
			where: { id: subjectId },
			include: { questions: true }
		});

		if (!current || current.projectId !== projectId) {
			throw new Error(`Subject ${subjectId} non trouvé`);
		}

		if (current.version !== data.expectedVersion) {
			throw new ConcurrencyConflictError(
				'subject',
				subjectId,
				current.version,
				data.expectedVersion,
				current
			);
		}

		const updatePayload: Prisma.SubjectUpdateInput = {
			version: current.version + 1
		};
		if (data.sectionRef !== undefined) updatePayload.sectionRef = data.sectionRef;
		if (data.name !== undefined) updatePayload.name = data.name;
		if (data.domain !== undefined) updatePayload.domain = data.domain;
		if (data.problemStatement !== undefined) updatePayload.problemStatement = data.problemStatement;
		if (data.maturityLevel !== undefined) updatePayload.maturityLevel = data.maturityLevel;
		if (data.deliberationStatus !== undefined)
			updatePayload.deliberationStatus = data.deliberationStatus;
		if (data.waitingForRole !== undefined) updatePayload.waitingForRole = data.waitingForRole;
		if (data.relativeEffort !== undefined) updatePayload.relativeEffort = data.relativeEffort;
		if (data.blockingCount !== undefined) updatePayload.blockingCount = data.blockingCount;
		if (data.unlocksCount !== undefined) updatePayload.unlocksCount = data.unlocksCount;

		const updated = await tx.subject.update({
			where: { id: subjectId },
			data: updatePayload,
			include: { questions: true }
		});

		let eventType = 'SUBJECT_UPDATED';
		if (data.maturityLevel && data.maturityLevel !== current.maturityLevel) {
			eventType = 'MATURITY_CHANGED';
		} else if (data.deliberationStatus && data.deliberationStatus !== current.deliberationStatus) {
			eventType = 'DELIBERATION_STATUS_CHANGED';
		}

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'subject',
				entityId: subjectId,
				type: eventType,
				payload: JSON.stringify(data),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return updated;
	});
}

export async function deleteSubject(
	projectId: string,
	subjectId: string,
	expectedVersion: number,
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.subject.findUnique({ where: { id: subjectId } });
		if (!current || current.projectId !== projectId) {
			throw new Error(`Subject ${subjectId} non trouvé`);
		}

		if (current.version !== expectedVersion) {
			throw new ConcurrencyConflictError(
				'subject',
				subjectId,
				current.version,
				expectedVersion,
				current
			);
		}

		await tx.subject.delete({ where: { id: subjectId } });

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'subject',
				entityId: subjectId,
				type: 'SUBJECT_DELETED',
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
// STATEMENTS (Invariant I & Invariant VI)
// -------------------------------------------------------------

export async function listStatements(
	projectId: string,
	options?: { subjectId?: string; section?: string; status?: string }
) {
	const where: Prisma.StatementWhereInput = { projectId };
	if (options?.subjectId) where.subjectId = options.subjectId;
	if (options?.section) where.section = options.section;
	if (options?.status) where.status = options.status;

	const statements = await prisma.statement.findMany({
		where,
		include: {
			antecedents: {
				select: { antecedentId: true }
			},
			dependents: {
				select: { statementId: true }
			}
		},
		orderBy: { createdAt: 'asc' }
	});

	return statements.map((s) => ({
		...s,
		basedOn: JSON.parse(s.basedOn || '[]'),
		antecedentIds: s.antecedents.map((a) => a.antecedentId),
		dependentIds: s.dependents.map((d) => d.statementId)
	}));
}

export async function getStatement(projectId: string, statementId: string) {
	const statement = await prisma.statement.findUnique({
		where: { id: statementId },
		include: {
			antecedents: {
				select: { antecedentId: true }
			},
			dependents: {
				select: { statementId: true }
			}
		}
	});

	if (!statement || statement.projectId !== projectId) return null;

	return {
		...statement,
		basedOn: JSON.parse(statement.basedOn || '[]'),
		antecedentIds: statement.antecedents.map((a) => a.antecedentId),
		dependentIds: statement.dependents.map((d) => d.statementId)
	};
}

export async function createStatement(
	projectId: string,
	data: {
		id: string;
		subjectId?: string | null;
		section: string;
		subjectRef: string;
		predicate: string;
		value: string;
		unit?: string | null;
		basedOn?: string[];
		appliedRule?: string | null;
		author: string;
		role: string;
		productionMode: string;
		confidence: string;
		subjectLevel?: string;
		consequences?: string | null;
		status?: string;
		antecedentIds?: string[];
	},
	actor: ActorInfo
) {
	// Invariant I : verified × llm-derived strictement interdit
	if (data.confidence === 'verified' && data.productionMode === 'llm-derived') {
		throw new Error(
			'Invariant I Violation: Une affirmation dérivée automatiquement par LLM ne peut avoir le statut de confiance "verified" sans validation humaine préalable.'
		);
	}

	return await prisma.$transaction(async (tx) => {
		const created = await tx.statement.create({
			data: {
				id: data.id,
				projectId,
				subjectId: data.subjectId || null,
				section: data.section,
				subjectRef: data.subjectRef,
				predicate: data.predicate,
				value: data.value,
				unit: data.unit || null,
				basedOn: JSON.stringify(data.basedOn || []),
				appliedRule: data.appliedRule || null,
				author: data.author,
				role: data.role,
				productionMode: data.productionMode,
				confidence: data.confidence,
				subjectLevel: data.subjectLevel || 'L1_framed',
				consequences: data.consequences || null,
				status: data.status || 'active',
				version: 1
			}
		});

		// Enregistrement des antécédents
		if (data.antecedentIds && data.antecedentIds.length > 0) {
			await tx.statementAntecedent.createMany({
				data: data.antecedentIds.map((antId) => ({
					statementId: created.id,
					antecedentId: antId
				}))
			});
		}

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'statement',
				entityId: created.id,
				type: 'STATEMENT_CREATED',
				payload: JSON.stringify({
					subjectRef: created.subjectRef,
					predicate: created.predicate,
					value: created.value,
					confidence: created.confidence
				}),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || data.productionMode
			}
		});

		return {
			...created,
			basedOn: JSON.parse(created.basedOn || '[]'),
			antecedentIds: data.antecedentIds || []
		};
	});
}

export async function updateStatement(
	projectId: string,
	statementId: string,
	data: {
		expectedVersion: number;
		subjectId?: string | null;
		section?: string;
		subjectRef?: string;
		predicate?: string;
		value?: string;
		unit?: string | null;
		basedOn?: string[];
		appliedRule?: string | null;
		confidence?: string;
		subjectLevel?: string;
		consequences?: string | null;
		status?: string;
		antecedentIds?: string[];
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.statement.findUnique({
			where: { id: statementId }
		});

		if (!current || current.projectId !== projectId) {
			throw new Error(`Statement ${statementId} non trouvé`);
		}

		if (current.version !== data.expectedVersion) {
			throw new ConcurrencyConflictError(
				'statement',
				statementId,
				current.version,
				data.expectedVersion,
				current
			);
		}

		const newConfidence = data.confidence ?? current.confidence;
		const productionMode = current.productionMode;
		// Invariant I check
		if (newConfidence === 'verified' && productionMode === 'llm-derived') {
			throw new Error(
				'Invariant I Violation: Une affirmation dérivée automatiquement par LLM ne peut avoir le statut "verified" sans validation humaine.'
			);
		}

		const updatePayload: Prisma.StatementUpdateInput = {
			version: current.version + 1
		};
		if (data.subjectId !== undefined) updatePayload.subjectId = data.subjectId;
		if (data.section !== undefined) updatePayload.section = data.section;
		if (data.subjectRef !== undefined) updatePayload.subjectRef = data.subjectRef;
		if (data.predicate !== undefined) updatePayload.predicate = data.predicate;
		if (data.value !== undefined) updatePayload.value = data.value;
		if (data.unit !== undefined) updatePayload.unit = data.unit;
		if (data.basedOn !== undefined) updatePayload.basedOn = JSON.stringify(data.basedOn);
		if (data.appliedRule !== undefined) updatePayload.appliedRule = data.appliedRule;
		if (data.confidence !== undefined) updatePayload.confidence = data.confidence;
		if (data.subjectLevel !== undefined) updatePayload.subjectLevel = data.subjectLevel;
		if (data.consequences !== undefined) updatePayload.consequences = data.consequences;
		if (data.status !== undefined) updatePayload.status = data.status;

		const updated = await tx.statement.update({
			where: { id: statementId },
			data: updatePayload
		});

		if (data.antecedentIds !== undefined) {
			await tx.statementAntecedent.deleteMany({ where: { statementId } });
			if (data.antecedentIds.length > 0) {
				await tx.statementAntecedent.createMany({
					data: data.antecedentIds.map((antId) => ({
						statementId,
						antecedentId: antId
					}))
				});
			}
		}

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'statement',
				entityId: statementId,
				type: 'STATEMENT_UPDATED',
				payload: JSON.stringify(data),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...updated,
			basedOn: JSON.parse(updated.basedOn || '[]'),
			antecedentIds: data.antecedentIds ?? []
		};
	});
}

export async function retractStatement(
	projectId: string,
	statementId: string,
	actor: ActorInfo,
	reason?: string
): Promise<RetractionCascadeResult> {
	return await prisma.$transaction(async (tx) => {
		return await executeRetractionCascade(tx, {
			projectId,
			statementId,
			actorId: actor.userId,
			actorRole: actor.role,
			productionMode: actor.productionMode || 'human-authored',
			reason
		});
	});
}

// -------------------------------------------------------------
// QUESTIONS
// -------------------------------------------------------------

export async function listQuestions(projectId: string, subjectId?: string) {
	if (subjectId) {
		return await prisma.question.findMany({
			where: { subjectId, subject: { projectId } },
			orderBy: { createdAt: 'asc' }
		});
	}

	return await prisma.question.findMany({
		where: { subject: { projectId } },
		orderBy: { createdAt: 'asc' }
	});
}

export async function createQuestion(
	projectId: string,
	subjectId: string,
	data: {
		id: string;
		text: string;
		assignedRole?: string;
		blocking?: boolean;
		status?: string;
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const subject = await tx.subject.findUnique({ where: { id: subjectId } });
		if (!subject || subject.projectId !== projectId) {
			throw new Error(`Subject ${subjectId} introuvable pour ce projet`);
		}

		const created = await tx.question.create({
			data: {
				id: data.id,
				subjectId,
				text: data.text,
				assignedRole: data.assignedRole || 'lead_architect',
				blocking: data.blocking ?? false,
				status: data.status || 'open',
				version: 1
			}
		});

		if (created.blocking) {
			await tx.subject.update({
				where: { id: subjectId },
				data: { blockingCount: subject.blockingCount + 1 }
			});
		}

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'question',
				entityId: created.id,
				type: 'QUESTION_CREATED',
				payload: JSON.stringify(created),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return created;
	});
}

export async function updateQuestion(
	projectId: string,
	questionId: string,
	data: {
		expectedVersion: number;
		text?: string;
		assignedRole?: string;
		blocking?: boolean;
		status?: string;
	},
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const current = await tx.question.findUnique({
			where: { id: questionId },
			include: { subject: true }
		});

		if (!current || current.subject.projectId !== projectId) {
			throw new Error(`Question ${questionId} non trouvée`);
		}

		if (current.version !== data.expectedVersion) {
			throw new ConcurrencyConflictError(
				'question',
				questionId,
				current.version,
				data.expectedVersion,
				current
			);
		}

		const updatePayload: Prisma.QuestionUpdateInput = {
			version: current.version + 1
		};
		if (data.text !== undefined) updatePayload.text = data.text;
		if (data.assignedRole !== undefined) updatePayload.assignedRole = data.assignedRole;
		if (data.blocking !== undefined) updatePayload.blocking = data.blocking;
		if (data.status !== undefined) updatePayload.status = data.status;

		const updated = await tx.question.update({
			where: { id: questionId },
			data: updatePayload
		});

		// Recalcul des bloquants si le flag blocking a changé
		if (data.blocking !== undefined && data.blocking !== current.blocking) {
			const delta = data.blocking ? 1 : -1;
			await tx.subject.update({
				where: { id: current.subjectId },
				data: {
					blockingCount: Math.max(0, current.subject.blockingCount + delta)
				}
			});
		}

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'question',
				entityId: questionId,
				type: 'QUESTION_UPDATED',
				payload: JSON.stringify(data),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return updated;
	});
}

// -------------------------------------------------------------
// MEMBERS
// -------------------------------------------------------------

export async function listMembers(projectId: string) {
	const members = await prisma.projectMember.findMany({
		where: { projectId },
		orderBy: { createdAt: 'asc' }
	});
	return members.map((m) => ({
		...m,
		domains: JSON.parse(m.domains || '[]')
	}));
}

export async function addOrUpdateMember(
	projectId: string,
	data: { userId: string; role: string; domains?: string[] },
	actor: ActorInfo
) {
	return await prisma.$transaction(async (tx) => {
		const upserted = await tx.projectMember.upsert({
			where: {
				projectId_userId: {
					projectId,
					userId: data.userId
				}
			},
			create: {
				projectId,
				userId: data.userId,
				role: data.role,
				domains: JSON.stringify(data.domains || [])
			},
			update: {
				role: data.role,
				domains: JSON.stringify(data.domains || [])
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'member',
				entityId: data.userId,
				type: 'MEMBER_UPSERTED',
				payload: JSON.stringify(data),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return {
			...upserted,
			domains: JSON.parse(upserted.domains || '[]')
		};
	});
}

export async function removeMember(projectId: string, userId: string, actor: ActorInfo) {
	return await prisma.$transaction(async (tx) => {
		await tx.projectMember.delete({
			where: {
				projectId_userId: {
					projectId,
					userId
				}
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'member',
				entityId: userId,
				type: 'MEMBER_REMOVED',
				payload: JSON.stringify({ userId }),
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored'
			}
		});

		return { success: true };
	});
}

// -------------------------------------------------------------
// DOMAIN EVENTS (Ledger & Polling)
// -------------------------------------------------------------

export async function getDomainEvents(
	projectId: string,
	options?: {
		since?: string; // ISO date ou ID d'événement
		entityType?: string;
		limit?: number;
	}
) {
	const where: Prisma.DomainEventWhereInput = { projectId };
	if (options?.entityType) where.entityType = options.entityType;

	if (options?.since) {
		const date = new Date(options.since);
		if (!isNaN(date.getTime())) {
			where.createdAt = { gt: date };
		}
	}

	const events = await prisma.domainEvent.findMany({
		where,
		orderBy: { createdAt: 'asc' },
		take: options?.limit || 100
	});

	return events.map((e) => ({
		...e,
		payload: JSON.parse(e.payload || '{}')
	}));
}
