import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { computeMaturityCriteria } from '$lib/domain/maturityCriteria';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import type { MaturityLevel } from '$lib/types/epistemic';

export const GET: RequestHandler = async (event) => {
	const { params } = event;
	const { projectId, subjectId } = params;

	try {
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			include: { members: true }
		});

		if (!project) {
			return json({ error: `Projet ${projectId} introuvable` }, { status: 404 });
		}

		const subject = await prisma.subject.findUnique({
			where: { id: subjectId },
			include: {
				criteria: true,
				options: true,
				arguments: true,
				questions: true,
				decision: true
			}
		});

		if (!subject || subject.projectId !== projectId) {
			return json({ error: `Sujet ${subjectId} introuvable` }, { status: 404 });
		}

		// Vérifier si le projet a basculé vers le Hub (A23 / #34)
		const isHubCutover = isProjectCutOverToHub(project);

		// Acteur courant
		const actorInfo = getActorFromEvent(event);

		// Recherche d'affirmation sur la décision par un décideur distinct (K16)
		const assertionEvent = await prisma.domainEvent.findFirst({
			where: {
				projectId,
				entityType: 'statement',
				type: 'STATEMENT_ASSERTED'
			},
			orderBy: { createdAt: 'desc' }
		});

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

			// Si affirmé par un utilisateur distinct de l'arbitre / auteur
			if (affirmedBy && affirmedBy !== dec.arbiterId) {
				decisionAffirmed = true;
			}
		}

		// Arguments mappés
		const mappedArguments = subject.arguments.map((a) => ({
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

		// Sujets dérivés
		const derivedSubjects = await prisma.subject.findMany({
			where: {
				projectId,
				sectionRef: { startsWith: subject.sectionRef + '.' }
			},
			select: { id: true, maturityLevel: true }
		});

		// Calcul du rapport pur
		const report = computeMaturityCriteria({
			subject: {
				id: subject.id,
				name: subject.name,
				problemStatement: subject.problemStatement || subject.name,
				sectionRef: subject.sectionRef,
				level: subject.maturityLevel as MaturityLevel,
				hubLevel: (subject.maturityLevel as MaturityLevel), // synchronisé si cutover
				is_stalled: subject.blockingCount > 0 && subject.maturityLevel < 'L3',
				stall_days: 15
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

		return json({
			report,
			isHubCutover
		});
	} catch (err: any) {
		console.error('[API MaturityCriteria] Erreur :', err);
		return json({ error: err.message || 'Internal server error' }, { status: 500 });
	}
};
