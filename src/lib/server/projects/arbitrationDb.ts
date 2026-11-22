import { prisma } from '../prisma';
import { computeMaturity, type MaturityComputationResult, type MaturityBlocker } from '$lib/domain/maturityRules';
import { classifyArgumentsForMaturity, type MaturityArgumentSemanticClass } from '../similarity/maturitySemanticClassifier';
import { getProjectFrameworks } from './frameworksDb';
import { checkSubjectCompliance, getApplicableFrameworks } from '../compliance/complianceService';
import type { ActorInfo } from './projectsDb';
import {
	canDecideAlone,
	type Criterion,
	type Option,
	type OptionEvaluation,
	type Decision,
	type DecisionComplianceCheck
} from '$lib/domain/options';
import type { Argument } from '$lib/domain/debate';

export class MaturityUnreadyError extends Error {
	statusCode = 422;
	blockers: MaturityBlocker[];

	constructor(blockers: MaturityBlocker[]) {
		const details =
			blockers.length > 0
				? blockers.map((b) => b.message).join(' | ')
				: 'Le sujet ne remplit pas encore les conditions d’arbitrage (vérifiez son cadrage et son statut de scellement).';
		super(
			blockers.length > 0
				? `Le sujet n'est pas mûr pour l'arbitrage opposable (${blockers.length} blocage(s) actif(s)) : ${details}`
				: details
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
	portability?: 'project_specific' | 'reusable_product_capability' | 'reusable_architecture_doctrine';
	acceptedViolations?: Array<{ typedId: string; justification: string }>;
	/** Dérogation explicite de l'arbitre permettant de trancher malgré une vérification KB incomplète (partial ou not_checked). */
	complianceCheckDerogation?: {
		acknowledged: boolean;
		reason: string;
	};
}

export function parseDecisionComplianceCheck(raw: string | null | undefined): DecisionComplianceCheck | undefined {
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return undefined;
		if (!['checked', 'partial', 'not_checked'].includes(parsed.status)) return undefined;
		return {
			status: parsed.status,
			hubRevision: typeof parsed.hubRevision === 'string' ? parsed.hubRevision : null,
			checkedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : '',
			unassessedRuleIds: Array.isArray(parsed.unassessedRuleIds)
				? parsed.unassessedRuleIds.filter((id: unknown): id is string => typeof id === 'string')
				: [],
			frameworks: Array.isArray(parsed.frameworks)
				? parsed.frameworks.filter((fw: unknown): fw is string => typeof fw === 'string')
				: [],
			...(Array.isArray(parsed.coverageReserves) && parsed.coverageReserves.length > 0
				? {
						coverageReserves: parsed.coverageReserves
							.filter(
								(r: any) =>
									r &&
									typeof r === 'object' &&
									typeof r.frameworkId === 'string' &&
									['partial', 'missing', 'unknown'].includes(r.status)
							)
							.map((r: any) => ({
								frameworkId: r.frameworkId,
								...(typeof r.name === 'string' ? { name: r.name } : {}),
								status: r.status as 'partial' | 'missing' | 'unknown',
								...(typeof r.validatedCount === 'number' ? { validatedCount: r.validatedCount } : {}),
								...(typeof r.expectedCount === 'number' ? { expectedCount: r.expectedCount } : {}),
								hubRevision: typeof r.hubRevision === 'string' ? r.hubRevision : null
							}))
					}
				: {}),
			...(parsed.derogation && typeof parsed.derogation === 'object' && typeof parsed.derogation.reason === 'string'
				? {
						derogation: {
							reason: parsed.derogation.reason,
							acknowledgedAt: typeof parsed.derogation.acknowledgedAt === 'string' ? parsed.derogation.acknowledgedAt : '',
							...(typeof parsed.derogation.acknowledgedBy === 'string'
								? { acknowledgedBy: parsed.derogation.acknowledgedBy }
								: {})
						}
					}
				: {})
		};
	} catch {
		return undefined;
	}
}

/**
 * Règle d'autorisation Casbin / RBAC :
 * Seul un domain_expert dont domains contient subject.domain, ou le lead_architect, peut arbitrer.
 */
export function canArbitrateSubject(actor: ActorInfo, subjectDomain?: string | null): boolean {
	const normalizedRole = (actor.role || '').toLowerCase().replace(/\s+/g, '_');
	if (normalizedRole === 'lead_architect') {
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
 * Normalise une ligne Decision Prisma en objet Decision métier (avec assertion K16 éventuelle).
 */
export async function parseSubjectDecision(
	projectId: string,
	rawDecision: {
		id: string;
		subjectId: string;
		retainedOptionId: string;
		rejected: string;
		rationale: string;
		reversibility: string;
		acceptedViolations: string;
		complianceCheck?: string | null;
		kbCandidateIds: string;
		arbiterId: string;
		arbiterRole: string;
		decidedAt: Date;
		version: number;
	} | null | undefined,
	assertionEventOverride?: { actorId: string } | null
): Promise<{
	parsedDecision: Decision | null;
	acceptedViolationsFromDecision: Array<{ typedId: string; justification: string }>;
}> {
	if (!rawDecision) {
		return { parsedDecision: null, acceptedViolationsFromDecision: [] };
	}

	const acceptedViolationsFromDecision: Array<{ typedId: string; justification: string }> = JSON.parse(
		rawDecision.acceptedViolations || '[]'
	);
	const complianceEntry = acceptedViolationsFromDecision.find((v) =>
		v.typedId.startsWith('COMPLIANCE_STATUS:')
	);
	const portabilityEntry = acceptedViolationsFromDecision.find((v) =>
		v.typedId.startsWith('PORTABILITY:')
	);
	const realViolations = acceptedViolationsFromDecision.filter(
		(v) => !v.typedId.startsWith('COMPLIANCE_STATUS:') && !v.typedId.startsWith('PORTABILITY:')
	);
	const complianceStatus: 'Compliant' | 'Partially compliant' | 'Non-compliant' = complianceEntry
		? (complianceEntry.typedId.replace('COMPLIANCE_STATUS:', '') as any)
		: realViolations.length > 0
			? 'Partially compliant'
			: 'Compliant';
	const complianceRationale = complianceEntry?.justification || undefined;
	const portability: 'project_specific' | 'reusable_product_capability' | 'reusable_architecture_doctrine' =
		portabilityEntry
			? (portabilityEntry.typedId.replace('PORTABILITY:', '') as any)
			: 'project_specific';

	const assertedEvent =
		assertionEventOverride !== undefined
			? assertionEventOverride
			: await prisma.domainEvent.findFirst({
					where: {
						projectId,
						entityType: 'decision',
						entityId: rawDecision.id,
						type: 'DECISION_ASSERTED'
					},
					orderBy: { createdAt: 'desc' }
				});

	const complianceCheck = parseDecisionComplianceCheck(rawDecision.complianceCheck);

	return {
		acceptedViolationsFromDecision,
		parsedDecision: {
			id: rawDecision.id,
			subjectId: rawDecision.subjectId,
			retainedOptionId: rawDecision.retainedOptionId,
			rejected: JSON.parse(rawDecision.rejected || '[]'),
			rationale: rawDecision.rationale,
			reversibility: rawDecision.reversibility as any,
			complianceStatus,
			complianceRationale,
			portability,
			arbiterId: rawDecision.arbiterId,
			arbiterRole: rawDecision.arbiterRole,
			decidedAt: rawDecision.decidedAt.toISOString(),
			acceptedViolations: realViolations,
			...(complianceCheck ? { complianceCheck } : {}),
			kbCandidateIds: JSON.parse(rawDecision.kbCandidateIds || '[]'),
			validatedBy: assertedEvent?.actorId || undefined,
			version: rawDecision.version
		}
	};
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
	semanticClassification?: Record<string, MaturityArgumentSemanticClass>;
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
		verdict: (a.verdict as any) ?? null,
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

	const { parsedDecision, acceptedViolationsFromDecision } = await parseSubjectDecision(
		subject.projectId,
		subject.decision
	);

	const semanticClassification = await classifyArgumentsForMaturity(args);

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
		decision: parsedDecision,
		semanticClassification
	});

	return {
		subject,
		criteria,
		options,
		evaluations: allEvaluations,
		arguments: args,
		maturityResult,
		decision: parsedDecision,
		semanticClassification
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
	const projectFrameworks = (await getProjectFrameworks(subject.projectId)).frameworks;
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
		requiredFrameworks: projectFrameworks,
		allowRevision: true,
		semanticClassification: ctx.semanticClassification
	});

	if (!readinessWithViolations.readyForArbitration) {
		throw new MaturityUnreadyError(readinessWithViolations.blockers);
	}

	// Vérification que l'option retenue existe avant le contrôle réglementaire
	const retained = ctx.options.find((o) => o.id === data.retainedOptionId);
	if (!retained) {
		throw new Error(`L'option retenue ${data.retainedOptionId} est inconnue sur ce sujet.`);
	}

	// Conformité réglementaire de l'option retenue (LLMOps) — ÉCHEC FERMÉ (fail-closed) :
	// - Une clause validée par l'expert déclarant l'option non conforme bloque, sauf écart accepté et justifié.
	// - Si le Hub KB est injoignable (not_checked) ou laisse des règles non évaluées (partial), la décision est
	//   refusée sauf dérogation explicite motivée de l'arbitre (« décision sans vérification KB complète »).
	let compliance: Awaited<ReturnType<typeof checkSubjectCompliance>>;
	try {
		compliance = await checkSubjectCompliance(subject.projectId, subjectId, [data.retainedOptionId]);
	} catch {
		const fallbackFrameworks = await getApplicableFrameworks(subject.projectId).catch(() => []);
		compliance = {
			frameworks: fallbackFrameworks,
			offline: true,
			violations: [],
			unassessedCount: 0,
			unassessedRuleIds: [],
			hubRevision: null,
			checkedAt: new Date().toISOString(),
			checkStatus: 'not_checked',
			coverageWarnings: []
		};
	}

	const acceptedIds = new Set((data.acceptedViolations || []).map((v) => v.typedId));
	const blockingViolations = (compliance.violations ?? []).filter((v) => v.validated && !acceptedIds.has(v.typedId));
	if (blockingViolations.length > 0) {
		throw new MaturityUnreadyError(
			blockingViolations.map((v) => ({
				code: 'UNRESOLVED_VIOLATION' as const,
				message: `Option retenue non conforme à ${v.typedId} : ${v.message} Pour trancher malgré tout, acceptez l'écart en le justifiant.`,
				targetId: v.typedId
			}))
		);
	}

	const decidedAt = new Date();
	const coverageReserves = projectFrameworks
		.filter((fw): fw is typeof fw & { status: 'partial' | 'missing' | 'unknown' } => fw.status !== 'covered')
		.map((fw) => ({
			frameworkId: fw.frameworkId,
			...(fw.name ? { name: fw.name } : {}),
			status: fw.status,
			...(fw.validatedCount !== undefined ? { validatedCount: fw.validatedCount } : {}),
			...(fw.expectedCount !== undefined ? { expectedCount: fw.expectedCount } : {}),
			hubRevision: compliance.hubRevision
		}));

	const complianceCheckRecord: DecisionComplianceCheck = {
		status: compliance.checkStatus,
		hubRevision: compliance.hubRevision,
		checkedAt: compliance.checkedAt,
		unassessedRuleIds: compliance.unassessedRuleIds,
		frameworks: compliance.frameworks,
		...(coverageReserves.length > 0 ? { coverageReserves } : {})
	};

	if (complianceCheckRecord.status === 'not_checked' || complianceCheckRecord.status === 'partial') {
		const derogation = data.complianceCheckDerogation;
		const derogationReason = derogation?.reason?.trim() || '';
		if (!derogation?.acknowledged || derogationReason.length < 5) {
			const detailMessage =
				complianceCheckRecord.status === 'not_checked'
					? 'Vérification réglementaire KB impossible (Hub LLMOps injoignable ou hors ligne). Impossible de trancher sans dérogation explicite motivée (« décision sans vérification KB complète »).'
					: `Vérification réglementaire KB incomplète (${complianceCheckRecord.unassessedRuleIds.length || compliance.unassessedCount} règle(s) non évaluée(s)${complianceCheckRecord.unassessedRuleIds.length > 0 ? ` : ${complianceCheckRecord.unassessedRuleIds.join(', ')}` : ''}). Impossible de trancher sans dérogation explicite motivée (« décision sans vérification KB complète »).`;
			throw new MaturityUnreadyError([
				{
					code: 'COMPLIANCE_CHECK_INCOMPLETE',
					message: detailMessage,
					targetId: complianceCheckRecord.status
				}
			]);
		}
		complianceCheckRecord.derogation = {
			reason: derogationReason,
			acknowledgedAt: decidedAt.toISOString(),
			acknowledgedBy: actor.userId
		};
	}

	const decisionId = `dec-${subjectId}-${Date.now()}`;
	const decidesAlone = canDecideAlone(actor.role);

	const violationsToStore = [...(data.acceptedViolations || [])];
	if (data.complianceStatus) {
		violationsToStore.push({
			typedId: `COMPLIANCE_STATUS:${data.complianceStatus}`,
			justification: data.complianceRationale || ''
		});
	}
	if (data.portability) {
		violationsToStore.push({
			typedId: `PORTABILITY:${data.portability}`,
			justification: ''
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
				complianceCheck: JSON.stringify(complianceCheckRecord),
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
				complianceCheck: JSON.stringify(complianceCheckRecord),
				version: { increment: 1 }
			}
		});

		// 2. Mise à jour des statuts des options (rétrograde toute ancienne option retenue en cas de ré-arbitrage)
		await tx.option.updateMany({
			where: {
				subjectId,
				id: { not: data.retainedOptionId },
				status: 'retained'
			},
			data: { status: 'rejected', version: { increment: 1 } }
		});

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
					complianceCheck: complianceCheckRecord,
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
		portability: data.portability || 'project_specific',
		arbiterId: created.arbiterId,
		arbiterRole: created.arbiterRole,
		decidedAt: created.decidedAt.toISOString(),
		acceptedViolations: data.acceptedViolations || [],
		complianceCheck: complianceCheckRecord,
		kbCandidateIds: JSON.parse(created.kbCandidateIds),
		version: created.version
	};
}
