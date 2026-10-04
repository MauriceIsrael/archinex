import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { llmopsClient } from '$lib/server/llmops/client';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { getActorFromEvent } from '$lib/server/projects/actorHelper';
import { DEFAULT_ARCHINEX_VOCABULARY } from '$lib/server/agents/factExtractor';
import { formatDecisionAffirmedMilestone } from '$lib/domain/debate';

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const { projectId, subjectId } = params;

	const actor = getActorFromEvent(event);
	const sessionUser = event.locals.session?.user;
	const actorEmail = (sessionUser?.email || actor.userId).toLowerCase();
	const actorName = sessionUser?.name || actor.userId;
	const actorRole = (sessionUser?.role || actor.role || '').toLowerCase().replace(/[\s-]/g, '_');

	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: { members: true }
	});

	if (!project) {
		return json({ error: `Projet ${projectId} introuvable` }, { status: 404 });
	}

	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: { decision: true }
	});

	if (!subject || subject.projectId !== projectId) {
		return json({ error: `Sujet ${subjectId} introuvable` }, { status: 404 });
	}

	if (!subject.decision) {
		return json(
			{ error: `Aucune décision d'architecture préparée pour le sujet ${subjectId}` },
			{ status: 404 }
		);
	}

	const decision = subject.decision;

	// RÈGLE K16 / INVARIANT STRICT : Auto-validation formellement interdite
	const isAuthor =
		actor.userId === decision.arbiterId ||
		actorEmail === decision.arbiterId.toLowerCase() ||
		(sessionUser?.id && sessionUser.id === decision.arbiterId);

	if (isAuthor) {
		return json(
			{
				error: 'self_validation',
				message:
					"Auto-validation interdite (K16) : L'affirmation d'une décision requiert impérativement un valideur distinct de son auteur."
			},
			{ status: 409 }
		);
	}

	// RÈGLE RBAC : Seul un decider, domain_expert, lead_architect ou admin peut affirmer
	const isDeciderRole =
		actorRole === 'decider' ||
		actorRole === 'domain_expert' ||
		actorRole === 'lead_architect' ||
		actorRole === 'admin' ||
		actorRole.includes('architect') ||
		actorRole.includes('expert');

	if (!isDeciderRole) {
		return json(
			{
				error: 'forbidden',
				message:
					"Habilitation insuffisante : Seul un décideur ou un architecte qualifié peut affirmer la décision d'architecture."
			},
			{ status: 403 }
		);
	}

	let body: any = {};
	try {
		body = await event.request.json();
	} catch {
		body = {};
	}

	// Filtrage strict des faits :
	// 1. Un fait décoché (selected === false) n'est pas affirmé
	// 2. Un fait dont la clé est hors du vocabulaire autorisé est strictement écarté
	const rawFacts = Array.isArray(body.facts) ? body.facts : [];
	const allowedVocabularySet = new Set(
		Array.isArray(body.allowedVocabularyKeys) && body.allowedVocabularyKeys.length > 0
			? body.allowedVocabularyKeys
			: DEFAULT_ARCHINEX_VOCABULARY
	);

	const affirmedFacts = rawFacts.filter(
		(f: any) => f && f.selected !== false && f.key && allowedVocabularySet.has(f.key)
	);

	const idempotencyKey =
		body.idempotencyKey ||
		event.request.headers.get('idempotency-key') ||
		`dec-assert-${decision.id}-${actorEmail}`;

	// Vérifier idempotence locale
	const existingAssertion = await prisma.domainEvent.findFirst({
		where: {
			projectId,
			entityType: 'decision',
			entityId: decision.id,
			type: 'DECISION_ASSERTED'
		}
	});

	if (existingAssertion) {
		return json({
			status: 'ok',
			alreadyAsserted: true,
			decisionId: decision.id,
			validatedBy: actorEmail,
			message: 'Décision déjà affirmée (idempotent).'
		});
	}

	// Si le projet a basculé vers le Hub (A23 / #34), enregistrement et affirmation dans le Hub
	const isHubCutover = isProjectCutOverToHub(project);
	if (isHubCutover) {
		const strat = typeof project.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project.strategy || {});
		const engagementId = strat.hubEngagementId || project.shortName || project.id;

		try {
			// Ingestion de la décision proposée avec les faits (si pas déjà créée)
			await llmopsClient.addDecision(
				engagementId,
				{
					id: decision.id,
					subject: subject.name,
					retained_option: decision.retainedOptionId,
					rationale: decision.rationale,
					reversibility: decision.reversibility as any,
					facts: affirmedFacts.map((f: any) => ({
						key: f.key,
						value: f.value,
						source_excerpt: f.source_excerpt
					})),
					author: decision.arbiterId
				},
				actorEmail,
				`prop-${idempotencyKey}`
			).catch(() => null);

			// Affirmation formelle dans le Hub
			await llmopsClient.assertDecision(
				engagementId,
				decision.id,
				actorEmail,
				idempotencyKey
			);
		} catch (hubErr: any) {
			if (hubErr.status === 409 || hubErr.code === 'self_validation') {
				return json(
					{
						error: 'self_validation',
						message:
							hubErr.reason ||
							"Auto-validation refusée par le Hub (K16) : L'auteur ne peut pas valider sa propre décision."
					},
					{ status: 409 }
				);
			}
			console.warn('[Hub Decision Assert] Erreur Hub (mode résilient) :', hubErr.message);
		}
	}

	// Persistance locale dans Prisma
	const milestoneText = formatDecisionAffirmedMilestone(actorName, 'L3');

	await prisma.$transaction(async (tx) => {
		// 1. Mise à jour de la maturité du sujet à L3_decided
		await tx.subject.update({
			where: { id: subjectId },
			data: {
				maturityLevel: 'L3_decided',
				deliberationStatus: 'arbitrated',
				version: { increment: 1 }
			}
		});

		// 2. Création des énoncés affirmés à partir des faits validés
		for (const fact of affirmedFacts) {
			const stmtId = `stmt-fact-${decision.id}-${fact.key}`;
			await tx.statement.upsert({
				where: { id: stmtId },
				create: {
					id: stmtId,
					projectId,
					subjectId,
					section: subject.sectionRef || '§',
					subjectRef: subject.name,
					predicate: fact.key,
					value: fact.value,
					author: decision.arbiterId,
					role: decision.arbiterRole,
					productionMode: 'llm-proposed-human-approved',
					confidence: 'designed',
					subjectLevel: 'L3_decided',
					status: 'active',
					version: 1
				},
				update: {
					value: fact.value,
					subjectLevel: 'L3_decided',
					status: 'active',
					version: { increment: 1 }
				}
			});
		}

		// 3. Jalon dans le fil de discussion
		await tx.argument.create({
			data: {
				id: `arg-milestone-${decision.id}-${Date.now()}`,
				subjectId,
				stance: 'synthesis',
				claim: milestoneText,
				grounds: `Décision d’architecture scellée et ${affirmedFacts.length} fait(s) machine-lisible(s) affirmé(s) par ${actorName}.`,
				kbRefs: '[]',
				confidence: 'designed',
				author: actorName,
				authorKind: 'human',
				productionMode: 'human-authored',
				round: 99,
				resolution: 'answered',
				version: 1
			}
		});

		// 4. Enregistrement de l'événement de domaine
		await tx.domainEvent.create({
			data: {
				projectId,
				entityType: 'decision',
				entityId: decision.id,
				type: 'DECISION_ASSERTED',
				actorId: actor.userId,
				actorRole: actorRole,
				productionMode: 'human-authored',
				payload: JSON.stringify({
					validatedBy: actorEmail,
					decisionId: decision.id,
					factsCount: affirmedFacts.length,
					facts: affirmedFacts
				})
			}
		});
	});

	return json({
		status: 'ok',
		decisionId: decision.id,
		validatedBy: actorEmail,
		affirmedFactsCount: affirmedFacts.length,
		milestone: milestoneText
	});
};
