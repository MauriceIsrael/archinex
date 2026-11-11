import type { RequestEvent } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { computeMaturityCriteria } from '$lib/domain/maturityCriteria';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import { ensureSubjectExists } from '$lib/server/projects/projectsDb';
import type { MaturityLevel } from '$lib/types/epistemic';
import type { Argument } from '$lib/domain/debate';

type EnsureSubjectResult = Awaited<ReturnType<typeof ensureSubjectExists>>;

/**
 * Calcule le rapport de critères de maturité (L0–L5) pour un sujet,
 * en réutilisant optionnellement un sujet déjà chargé pour éviter les requêtes redondantes.
 */
export async function computeSubjectMaturityReport(params: {
	event: RequestEvent;
	projectId: string;
	subjectId: string;
	subject?: EnsureSubjectResult;
	mappedArguments?: Argument[];
}) {
	const { event, projectId, subjectId } = params;
	const subject = params.subject ?? (await ensureSubjectExists(projectId, subjectId));

	const [project, assertionEvent, derivedSubjects] = await Promise.all([
		prisma.project.findUnique({
			where: { id: projectId },
			include: { members: true }
		}),
		subject.decision
			? prisma.domainEvent.findFirst({
					where: {
						projectId,
						entityType: 'decision',
						entityId: subject.decision.id,
						type: 'DECISION_ASSERTED'
					},
					orderBy: { createdAt: 'desc' }
				})
			: Promise.resolve(null),
		prisma.subject.findMany({
			where: {
				projectId,
				sectionRef: { startsWith: subject.sectionRef + '.' }
			},
			select: { id: true, maturityLevel: true }
		})
	]);

	const resolvedProject = project || { id: projectId, members: [], title: projectId, strategy: '{}' };
	const isHubCutover = isProjectCutOverToHub(resolvedProject);
	const actorInfo = getActorFromEvent(event);

	let decisionAffirmed = false;
	let affirmedBy: string | undefined = undefined;

	if (subject.decision) {
		const dec = subject.decision;
		if (assertionEvent) {
			try {
				const payload = JSON.parse(assertionEvent.payload || '{}');
				affirmedBy = payload.validatedBy || assertionEvent.actorId;
			} catch {
				affirmedBy = assertionEvent.actorId;
			}
		}

		if (affirmedBy && affirmedBy !== dec.arbiterId) {
			decisionAffirmed = true;
		}
	}

	const mappedArguments: Argument[] =
		params.mappedArguments ??
		subject.arguments.map((a) => ({
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

	const diffMs = Date.now() - new Date(subject.updatedAt).getTime();
	const actualStallDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
	const isStalled = actualStallDays >= 14 && subject.maturityLevel < 'L3';

	const report = computeMaturityCriteria({
		subject: {
			id: subject.id,
			name: subject.name,
			problemStatement: subject.problemStatement || subject.name,
			sectionRef: subject.sectionRef,
			level: subject.maturityLevel as MaturityLevel,
			hubLevel: subject.maturityLevel as MaturityLevel,
			is_stalled: isStalled,
			stall_days: actualStallDays
		},
		criteria: subject.criteria.map((c) => ({ id: c.id, name: c.name })),
		options: subject.options.map((o) => ({ id: o.id, title: o.title })),
		arguments: mappedArguments,
		doctrineConstraintsCount: Math.max(
			mappedArguments.reduce((acc, a) => acc + (a.kbRefs?.length || 0), 0),
			subject.sectionRef ? 1 : 0
		),
		openQuestionsCount: subject.questions.filter((q) => q.status === 'open').length,
		verifierPassed: mappedArguments.some(
			(a) => a.stance === 'verification' && a.resolution !== 'open'
		),
		decision: subject.decision
			? {
					authorId: subject.decision.arbiterId,
					authorRole: subject.decision.arbiterRole,
					affirmedBy: affirmedBy || undefined,
					status: decisionAffirmed ? 'active' : 'proposed'
				}
			: null,
		derivedSubjects: derivedSubjects.map((d) => ({
			id: d.id,
			level: d.maturityLevel as MaturityLevel
		})),
		specificationPresent: subject.deliberationStatus === 'specified',
		actor: {
			userId: actorInfo.userId,
			role: actorInfo.role,
			isHuman: actorInfo.productionMode !== 'llm-derived'
		},
		isHubCutover
	});

	return { report, isHubCutover, assertionEvent };
}
