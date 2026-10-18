import { prisma } from '../prisma';
import { computeMaturity, type MaturityComputationResult, type MaturityBlocker } from '$lib/domain/maturityRules';
import { getProjectFrameworks } from './frameworksDb';
import { checkSubjectCompliance } from '../compliance/complianceService';
import type { ActorInfo } from './projectsDb';
import { canDecideAlone, type Criterion, type Option, type OptionEvaluation, type Decision } from '$lib/domain/options';
import type { Argument } from '$lib/domain/debate';

export class MaturityUnreadyError extends Error {
	statusCode = 422;
	blockers: MaturityBlocker[];

	constructor(blockers: MaturityBlocker[]) {
		super(
			`Le sujet n'est pas mûr pour l'arbitrage opposable (${blockers.length} blocage(s) actif(s)).`
		);
		this.name = 'MaturityUnreadyError';
		this.blockers = blockers;
	}
}

export class UnauthorizedArbitrationError extends Error {
	statusCode = 403;

	constructor(message: string) {
		super(message);
		this.name = 'UnauthorizedArbitrationError';
	}
}

export interface CreateDecisionInput {
	retainedOptionId: string;
	rejected: Array<{ optionId: string; reason: string }>;
	rationale: string;
	reversibility: 'reversible' | 'costly' | 'irreversible';
	complianceStatus?: 'Compliant' | 'Partially compliant' | 'Non-compliant';
	complianceRationale?: string;
	acceptedViolations?: Array<{ typedId: string; justification: string }>;
}

/**
 * Règle d'autorisation Casbin / RBAC :
 * Seul un domain_expert dont domains contient subject.domain, ou le lead_architect, peut arbitrer.
 */
export function canArbitrateSubject(actor: ActorInfo, subjectDomain?: string | null): boolean {
	const normalizedRole = (actor.role || '').toLowerCase().replace(/\s+/g, '_');
	if (normalizedRole === 'lead_architect' || normalizedRole === 'admin') {
		return true;
	}

	if (
		normalizedRole === 'domain_expert' ||
		normalizedRole === 'domain_architect' ||
		normalizedRole === 'infra_expert_architect' ||
		normalizedRole === 'security_architect' ||
		normalizedRole === 'network_architect' ||
		normalizedRole === 'cloud_architect' ||
		normalizedRole === 'data_architect'
	) {
		if (!subjectDomain || subjectDomain.trim() === '' || subjectDomain === 'general') {
			return true;
		}
		const userDomains = (actor.domains || []).map((d) => d.toLowerCase());
		return userDomains.includes(subjectDomain.toLowerCase());
	}

	return false;
}

/**
 * Récupère le contexte complet et évalue la maturité calculée d'un sujet.
 */
export async function getSubjectArbitrationContext(subjectId: string): Promise<{
	subject: any;
	criteria: Criterion[];
	options: Option[];
	evaluations: OptionEvaluation[];
	arguments: Argument[];
	maturityResult: MaturityComputationResult;
	decision: Decision | null;
}> {
	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: {
			criteria: true,
			options: {
				include: {
					evaluations: true
				}
			},
			arguments: true,
			decision: true
		}
	});

	if (!subject) {
		throw new Error(`Sujet introuvable : ${subjectId}`);
	}

	const criteria: Criterion[] = subject.criteria.map((c) => ({
		id: c.id,
		subjectId: c.subjectId,
		name: c.name,
		description: c.description,
		kind: c.kind as any,
		weight: c.weight,
		kbRef: c.kbRef || undefined,
		author: c.author,
		role: c.role || 'lead_architect',
		productionMode: c.productionMode as any,
		version: c.version
	}));

	const options: Option[] = subject.options.map((o) => ({
		id: o.id,
		subjectId: o.subjectId,
		title: o.title,
		summary: o.summary,
		origin: o.origin as any,
		kbRefs: JSON.parse(o.kbRefs || '[]'),
		status: o.status as any,
		author: o.author,
		role: o.role || 'lead_architect',
		productionMode: o.productionMode as any,
		version: o.version
	}));

	const allEvaluations: OptionEvaluation[] = [];
	for (const opt of subject.options) {
		for (const ev of opt.evaluations) {
			allEvaluations.push({
				optionId: ev.optionId,
				criterionId: ev.criterionId,
				score: ev.score,
				justification: ev.justification,
				evidenceRefs: JSON.parse(ev.evidenceRefs || '[]'),
				author: ev.author,
				role: ev.role || 'lead_architect',
				productionMode: ev.productionMode as any,
				version: ev.version
			});
		}
	}

	const args: Argument[] = subject.arguments.map((a) => ({
		id: a.id,
		subjectId: a.subjectId,
		optionId: a.optionId,
		targetArgumentId: a.targetArgumentId,
		stance: a.stance as any,
		claim: a.claim,
		grounds: a.grounds,
		kbRefs: JSON.parse(a.kbRefs || '[]'),
		confidence: a.confidence as any,
		author: a.author,
		authorKind: a.authorKind,
		productionMode: a.productionMode as any,
		round: a.round,
		resolution: a.resolution as any,
		resolvedBy: a.resolvedBy,
		resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
		version: a.version,
		createdAt: a.createdAt.toISOString()
	}));

	const frameworksData = await getProjectFrameworks(subject.projectId);

	let parsedDecision: Decision | null = null;
	let acceptedViolationsFromDecision: Array<{ typedId: string; justification: string }> = [];

	if (subject.decision) {
		acceptedViolationsFromDecision = JSON.parse(subject.decision.acceptedViolations || '[]');
		const complianceEntry = acceptedViolationsFromDecision.find((v) =>
			v.typedId.startsWith('COMPLIANCE_STATUS:')
		);
		const realViolations = acceptedViolationsFromDecision.filter(
			(v) => !v.typedId.startsWith('COMPLIANCE_STATUS:')
		);
		const complianceStatus: 'Compliant' | 'Partially compliant' | 'Non-compliant' = complianceEntry
			? (complianceEntry.typedId.replace('COMPLIANCE_STATUS:', '') as any)
			: realViolations.length > 0
				? 'Partially compliant'
				: 'Compliant';
		const complianceRationale = complianceEntry?.justification || undefined;

		parsedDecision = {
			id: subject.decision.id,
			subjectId: subject.decision.subjectId,
			retainedOptionId: subject.decision.retainedOptionId,
			rejected: JSON.parse(subject.decision.rejected || '[]'),
			rationale: subject.decision.rationale,
			reversibility: subject.decision.reversibility as any,
			complianceStatus,
			complianceRationale,
			arbiterId: subject.decision.arbiterId,
			arbiterRole: subject.decision.arbiterRole,
			decidedAt: subject.decision.decidedAt.toISOString(),
			acceptedViolations: realViolations,
			kbCandidateIds: JSON.parse(subject.decision.kbCandidateIds || '[]'),
			version: subject.decision.version
		};
	}

	const maturityResult = computeMaturity({
		subject: {
			id: subject.id,
			name: subject.name,
			problemStatement: subject.problemStatement,
			maturityLevel: subject.maturityLevel as any,
			singleOptionRationale: subject.singleOptionRationale
		},
		criteria,
		options,
		evaluations: allEvaluations,
		arguments: args,
		requiredFrameworks: frameworksData.frameworks,
		acceptedViolations: acceptedViolationsFromDecision,
		decision: parsedDecision
	});

	return {
		subject,
		criteria,
		options,
		evaluations: allEvaluations,
		arguments: args,
		maturityResult,
		decision: parsedDecision
	};
}

/**
 * Arbitre formellement un sujet d'architecture (Porte G3).
 */
export async function recordArbitrationDecision(
	subjectId: string,
	data: CreateDecisionInput,
	actor: ActorInfo
): Promise<Decision> {
	// Invariant II : Une décision est toujours rédigée par un humain
	if (actor.productionMode === 'llm-derived') {
		throw new Error(
			"Invariant II violé : Une décision d'arbitrage opposable doit obligatoirement être human-authored."
		);
	}

	const ctx = await getSubjectArbitrationContext(subjectId);
	const subject = ctx.subject;

	// Vérification de l'habilitation
	if (!canArbitrateSubject(actor, subject.domain)) {
		throw new UnauthorizedArbitrationError(
			`L'acteur ${actor.userId} (${actor.role}) n'a pas les droits pour arbitrer le domaine "${subject.domain}". Seul le Lead Architect ou un expert du domaine peut trancher.`
		);
	}

	// Évaluation de l'arbitrabilité avec les dispenses de violations soumises
	const readinessWithViolations = computeMaturity({
		subject: {
			id: subject.id,
			name: subject.name,
			problemStatement: subject.problemStatement,
			maturityLevel: subject.maturityLevel as any,
			singleOptionRationale: subject.singleOptionRationale
		},
		criteria: ctx.criteria,
		options: ctx.options,
		evaluations: ctx.evaluations,
		arguments: ctx.arguments,
		acceptedViolations: data.acceptedViolations || [],
		requiredFrameworks: (await getProjectFrameworks(subject.projectId)).frameworks
	});

	if (!readinessWithViolations.readyForArbitration) {
		throw new MaturityUnreadyError(readinessWithViolations.blockers);
	}

	// Conformité réglementaire de l'option retenue (LLMOps) : une clause validée par l'expert qui la déclare
	// non conforme bloque, sauf écart accepté et justifié par l'arbitre. LLMOps injoignable : on ne bloque pas.
	const compliance = await checkSubjectCompliance(subject.projectId, subjectId, [data.retainedOptionId]).catch(() => null);
	const acceptedIds = new Set((data.acceptedViolations || []).map((v) => v.typedId));
	const blockingViolations = (compliance?.violations ?? []).filter((v) => v.validated && !acceptedIds.has(v.typedId));
	if (blockingViolations.length > 0) {
		throw new MaturityUnreadyError(
			blockingViolations.map((v) => ({
				code: 'UNRESOLVED_VIOLATION' as const,
				message: `Option retenue non conforme à ${v.typedId} : ${v.message} Pour trancher malgré tout, acceptez l'écart en le justifiant.`,
				targetId: v.typedId
			}))
		);
	}

	// Vérification que l'option retenue existe
	const retained = ctx.options.find((o) => o.id === data.retainedOptionId);
	if (!retained) {
		throw new Error(`L'option retenue ${data.retainedOptionId} est inconnue sur ce sujet.`);
	}

	const decisionId = `dec-${subjectId}-${Date.now()}`;
	const decidedAt = new Date();
	const decidesAlone = canDecideAlone(actor.role);

	const violationsToStore = [...(data.acceptedViolations || [])];
	if (data.complianceStatus) {
		violationsToStore.push({
			typedId: `COMPLIANCE_STATUS:${data.complianceStatus}`,
			justification: data.complianceRationale || ''
		});
	}

	const created = await prisma.$transaction(async (tx) => {
		// 1. Enregistrement de la décision
		const decisionRecord = await tx.decision.upsert({
			where: { subjectId },
			create: {
				id: decisionId,
				subjectId,
				retainedOptionId: data.retainedOptionId,
				rejected: JSON.stringify(data.rejected),
				rationale: data.rationale,
				reversibility: data.reversibility,
				arbiterId: actor.userId,
				arbiterRole: actor.role,
				decidedAt,
				acceptedViolations: JSON.stringify(violationsToStore),
				kbCandidateIds: '[]',
				version: 1
			},
			update: {
				retainedOptionId: data.retainedOptionId,
				rejected: JSON.stringify(data.rejected),
				rationale: data.rationale,
				reversibility: data.reversibility,
				arbiterId: actor.userId,
				arbiterRole: actor.role,
				decidedAt,
				acceptedViolations: JSON.stringify(violationsToStore),
				version: { increment: 1 }
			}
		});

		// 2. Mise à jour des statuts des options
		await tx.option.update({
			where: { id: data.retainedOptionId },
			data: { status: 'retained', version: { increment: 1 } }
		});

		for (const rej of data.rejected) {
			await tx.option.updateMany({
				where: { id: rej.optionId, subjectId },
				data: { status: 'rejected', version: { increment: 1 } }
			});
		}

		// 3. Maturité : le Lead Architect décide seul (L3) ; sinon la décision attend la revue d'un décideur distinct.
		await tx.subject.update({
			where: { id: subjectId },
			data: decidesAlone
				? { maturityLevel: 'L3_decided', deliberationStatus: 'arbitrated', version: { increment: 1 } }
				: { maturityLevel: 'L2_decomposed', deliberationStatus: 'awaiting_review', version: { increment: 1 } }
		});

		// 4. Invariant II : un humain a tranché, les énoncés dérivés deviennent llm-proposed-human-approved
		await tx.statement.updateMany({
			where: {
				subjectId,
				productionMode: 'llm-derived'
			},
			data: {
				productionMode: 'llm-proposed-human-approved',
				subjectLevel: decidesAlone ? 'L3_decided' : 'L2_decomposed',
				version: { increment: 1 }
			}
		});

		// 5. Enregistrement de l'événement de domaine
		await tx.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'subject',
				entityId: subjectId,
				type: 'ARBITRATED',
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored',
				payload: JSON.stringify({
					decisionId: decisionRecord.id,
					retainedOptionId: data.retainedOptionId,
					arbiter: { id: actor.userId, role: actor.role },
					reversibility: data.reversibility,
					rationale: data.rationale,
					awaitingReview: !decidesAlone
				})
			}
		});

		return decisionRecord;
	});

	return {
		id: created.id,
		subjectId: created.subjectId,
		retainedOptionId: created.retainedOptionId,
		rejected: JSON.parse(created.rejected),
		rationale: created.rationale,
		reversibility: created.reversibility as any,
		complianceStatus: data.complianceStatus || 'Compliant',
		complianceRationale: data.complianceRationale,
		arbiterId: created.arbiterId,
		arbiterRole: created.arbiterRole,
		decidedAt: created.decidedAt.toISOString(),
		acceptedViolations: data.acceptedViolations || [],
		kbCandidateIds: JSON.parse(created.kbCandidateIds),
		version: created.version
	};
}
