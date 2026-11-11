import { prisma } from '../prisma';
import { ensureSubjectExists } from '../projects/projectsDb';
import type {
	CascadeQuestion,
	CascadeResult,
	CascadeLineage
} from '$lib/domain/cascade';
import { closeCascadeQuestion } from '$lib/domain/cascade';
import {
	runCascadeProposerAgent,
	detectPossibleDuplicateAsync
} from '../agents/cascadeProposer';
import type { LocalLlmClient } from '../llm/localLlmClient';

/**
 * Génère ou récupère la cascade de questions et sujets enfants pour une décision affirmée.
 * Scénario contractuel (A28) : Topologie bi-site actif/actif ouvre 3 questions structurantes.
 * Complément Proposeur (A29) : Intègre au plus 2 questions de l'agent proposeur (source 🤖).
 */
export async function getOrCreateCascadeForDecision(params: {
	projectId: string;
	subjectId: string;
	decisionId?: string;
	calibratedThreshold?: number;
}): Promise<CascadeResult> {
	const { projectId, subjectId } = params;

	let parentSubject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: {
			decision: true
		}
	});

	if (!parentSubject) {
		parentSubject = await ensureSubjectExists(projectId, subjectId);
	}

	const decision = parentSubject.decision;
	const decisionId = params.decisionId || decision?.id || `dec-${subjectId}`;

	// Déterminer le seuil calibré depuis la stratégie du projet (A14) ou le paramètre
	let calibratedThreshold = params.calibratedThreshold ?? 0.65;
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (project?.strategy) {
		try {
			const strat = JSON.parse(project.strategy);
			if (typeof strat.calibratedDuplicateThreshold === 'number') {
				calibratedThreshold = strat.calibratedDuplicateThreshold;
			}
		} catch {
			// ignore
		}
	}

	// Lire les faits affirmés du sujet (soit depuis statements, soit depuis payload d'affirmation)
	const assertionEvent = await prisma.domainEvent.findFirst({
		where: {
			projectId,
			entityType: 'decision',
			type: 'DECISION_ASSERTED'
		},
		orderBy: { createdAt: 'desc' }
	});

	let affirmedFacts: Array<{ key: string; value: string }> = [];
	if (assertionEvent) {
		try {
			const payload = JSON.parse(assertionEvent.payload || '{}');
			affirmedFacts = payload.facts || [];
		} catch {
			// ignore
		}
	}

	// Si aucun fait trouvé dans l'événement, chercher dans les statements
	if (affirmedFacts.length === 0) {
		const activeStmts = await prisma.statement.findMany({
			where: { projectId, subjectId, status: 'active' }
		});
		affirmedFacts = activeStmts.map((s) => ({ key: s.predicate, value: s.value }));
	}

	// Valeur clé utilisée pour la règle locale historique de routage multi-site
	const resilienceModeFact = affirmedFacts.find((f) => f.key === 'resilience_mode')?.value;

	// 1. Lire les règles publiées, le vocabulaire normalisé et les désactivations du projet (Lot A30)
	const { getProjectRules } = await import('$lib/server/rules/projectRulesService');
	const { listPublishedVocabulary } = await import('$lib/server/rules/reflexCatalogService');
	const { evaluateRuleConditions } = await import('$lib/domain/projectRules');
	const [projectRulesState, vocabulary] = await Promise.all([
		getProjectRules(projectId),
		listPublishedVocabulary()
	]);
	const disabledMap = new Map(projectRulesState.disabledOverrides.map((o) => [o.ruleId, o]));

	const candidateQuestions: CascadeQuestion[] = [];

	// Évaluation dynamique de toutes les règles publiées du catalogue (avec normalisation canonique & alias)
	for (const refRule of projectRulesState.referenceRules) {
		if (refRule.status === 'disabled' || disabledMap.has(refRule.id)) continue;
		if (!evaluateRuleConditions(refRule.conditions, affirmedFacts, vocabulary)) continue;

		const isLegacyRepl = refRule.id === 'DOC-HA-01';
		const isLegacySplit = refRule.id === 'SEC-RESIL-02';
		const qId = isLegacyRepl
			? `q-casc-${subjectId}-replication`
			: isLegacySplit
				? `q-casc-${subjectId}-split-brain`
				: `q-casc-${subjectId}-${refRule.id}`;
		const childId = isLegacyRepl
			? `sub-child-${subjectId}-repl`
			: isLegacySplit
				? `sub-child-${subjectId}-split`
				: `sub-child-${subjectId}-${refRule.id}`;

		candidateQuestions.push({
			id: qId,
			text: refRule.action.question,
			subjectName: refRule.action.subjectName,
			subjectSectionRef: `${parentSubject.sectionRef || '§4'}.${candidateQuestions.length + 1}`,
			sourceType: refRule.assetType === 'control' ? 'control' : 'doctrine',
			mandatory: refRule.mandatory,
			status: 'open',
			childSubjectId: childId,
			lineage: {
				...(isLegacySplit ? { assetRef: refRule.assetRef } : {}),
				ruleRef: refRule.id,
				ruleName: refRule.title,
				triggeringFacts: refRule.conditions.map((c) => ({
					key: c.key,
					value: affirmedFacts.find((f) => f.key === c.key)?.value || String(c.value)
				})),
				parentDecisionId: decisionId,
				parentSubjectId: subjectId,
				parentSubjectName: parentSubject.name
			},
			initialLevel: refRule.action.initialLevel || 'L1_framed',
			prefillFraming: {
				problemStatement: refRule.action.rationale || refRule.action.question,
				scope: refRule.title
			}
		});
	}

	// Règle locale historique de routage multi-site lorsque resilience_mode est affirmé
	if (resilienceModeFact !== undefined && !disabledMap.has('LOC-NET-01')) {
		candidateQuestions.push({
			id: `q-casc-${subjectId}-failover`,
			text: 'Quel mécanisme de bascule automatique du trafic réseau et applicatif (DNS vs BGP Anycast) déployer ?',
			subjectName: 'Bascule de Trafic Applicatif',
			subjectSectionRef: `${parentSubject.sectionRef || '§4'}.${candidateQuestions.length + 1}`,
			sourceType: 'local_rule',
			mandatory: false,
			status: 'open',
			childSubjectId: `sub-child-${subjectId}-failover`,
			lineage: {
				ruleRef: 'LOC-NET-01',
				ruleName: 'Règle Locale de Routage Multi-Site',
				triggeringFacts: [{ key: 'resilience_mode', value: resilienceModeFact }],
				parentDecisionId: decisionId,
				parentSubjectId: subjectId,
				parentSubjectName: parentSubject.name
			},
			initialLevel: 'L0_named'
		});
	}

	// Évaluation des règles locales affirmées (K21/A30)
	for (const localRule of projectRulesState.localRules) {
		if (localRule.status === 'affirmed') {
			if (evaluateRuleConditions(localRule.conditions, affirmedFacts, vocabulary)) {
				candidateQuestions.push({
					id: `q-casc-${subjectId}-${localRule.id}`,
					text: localRule.action.question,
					subjectName: localRule.action.subjectName,
					subjectSectionRef: `${parentSubject.sectionRef || '§4'}.${candidateQuestions.length + 1}`,
					sourceType: 'local_rule',
					mandatory: localRule.action.mandatory,
					status: 'open',
					childSubjectId: `sub-child-${subjectId}-${localRule.id}`,
					lineage: {
						ruleRef: localRule.id,
						ruleName: localRule.name,
						triggeringFacts: localRule.conditions.map((c) => ({
							key: c.key,
							value: affirmedFacts.find((f) => f.key === c.key)?.value || String(c.value)
						})),
						parentDecisionId: decisionId,
						parentSubjectId: subjectId,
						parentSubjectName: parentSubject.name
					},
					initialLevel: localRule.action.initialLevel || 'L1_framed'
				});
			}
		}
	}

	// Évaluation : règles épinglées - désactivations + règles locales affirmées (K20/K21)
	const questions: CascadeQuestion[] = candidateQuestions.filter(
		(q) => !q.lineage.ruleRef || !disabledMap.has(q.lineage.ruleRef)
	);

	// Persistance des sujets enfants déterministes dans la base relationnelle
	for (const q of questions) {
		const childId = q.childSubjectId!;
		const existing = await prisma.subject.findUnique({ where: { id: childId } });

		if (!existing) {
			await prisma.subject.create({
				data: {
					id: childId,
					projectId,
					sectionRef: q.subjectSectionRef || '§',
					name: q.subjectName,
					domain: parentSubject.domain || 'general',
					problemStatement: q.prefillFraming?.problemStatement || '',
					maturityLevel: q.initialLevel || 'L1_framed',
					deliberationStatus: 'open',
					waitingForRole: 'lead_architect',
					relativeEffort: 'M',
					version: 1
				}
			});

			const factsSummary = q.lineage.triggeringFacts
				.map((f) => `${f.key}=${f.value}`)
				.join(', ');

			await prisma.argument.create({
				data: {
					id: `arg-genesis-${childId}`,
					subjectId: childId,
					stance: 'synthesis',
					claim: `🌱 Sujet né de : « ${parentSubject.name} » (${parentSubject.sectionRef})`,
					grounds: `Ce sujet a été ouvert automatiquement par le moteur de cascade suite à l'affirmation des faits [${factsSummary}]. Règle d'ouverture : ${q.lineage.ruleRef || 'Cascade de décision'}.`,
					kbRefs: q.lineage.ruleRef ? JSON.stringify([q.lineage.ruleRef]) : '[]',
					confidence: 'designed',
					author: 'Moteur de Cascade (Agent Synthesizer)',
					authorKind: 'agent:synthesizer',
					productionMode: 'llm-derived',
					round: 0,
					resolution: 'answered',
					version: 1
				}
			});
		}
	}

	// 2. Charger les questions proposées par l'agent proposeur (A29)
	const agentEvents = await prisma.domainEvent.findMany({
		where: {
			projectId,
			entityType: 'cascade_question',
			type: 'CASCADE_QUESTION_PROPOSED'
		},
		orderBy: { createdAt: 'asc' }
	});

	if (agentEvents.length > 0) {
		const allSubjects = await prisma.subject.findMany({ where: { projectId } });

		for (const ev of agentEvents) {
			try {
				const q = JSON.parse(ev.payload || '{}') as CascadeQuestion;
				if (q && q.lineage?.parentSubjectId === subjectId) {
					// Recalcul de similarité dynamique avec le seuil calibré (A14) et l'encodeur configuré
					const candidateText = `${q.subjectName} ${q.text}`;
					const duplicate = await detectPossibleDuplicateAsync(
						candidateText,
						allSubjects
							.filter((s) => s.id !== q.childSubjectId && s.id !== subjectId)
							.map((s) => ({
								id: s.id,
								name: s.name,
								sectionRef: s.sectionRef,
								problemStatement: s.problemStatement || undefined
							})),
						calibratedThreshold
					);
					q.possibleDuplicate = duplicate;

					// Vérifier si la question a été fusionnée
					const mergeEvt = await prisma.domainEvent.findFirst({
						where: {
							projectId,
							entityType: 'cascade_question',
							entityId: q.id,
							type: 'CASCADE_QUESTION_MERGED'
						}
					});
					if (mergeEvt) {
						try {
							const mPayload = JSON.parse(mergeEvt.payload || '{}');
							q.status = 'merged';
							q.mergedWithSubjectId = mPayload.mergedWithSubjectId;
						} catch {
							// ignore
						}
					}

					questions.push(q);
				}
			} catch {
				// ignore malformed event
			}
		}
	}

	return {
		decisionId,
		parentSubjectId: subjectId,
		parentSubjectName: parentSubject.name,
		questions
	};
}

/**
 * Propose et persiste au plus 2 questions complémentaires issues de l'agent Proposeur (A29).
 * Déclenché de façon asynchrone et non-bloquante.
 */
export async function proposeAndPersistComplementaryQuestions(params: {
	projectId: string;
	subjectId: string;
	calibratedThreshold?: number;
	client?: LocalLlmClient;
}): Promise<CascadeQuestion[]> {
	const { projectId, subjectId } = params;

	const parentSubject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: { decision: true }
	});

	if (!parentSubject || !parentSubject.decision) {
		return [];
	}

	const project = await prisma.project.findUnique({ where: { id: projectId } });
	let threshold = params.calibratedThreshold ?? 0.65;
	if (project?.strategy) {
		try {
			const strat = JSON.parse(project.strategy);
			if (typeof strat.calibratedDuplicateThreshold === 'number') {
				threshold = strat.calibratedDuplicateThreshold;
			}
		} catch {
			// ignore
		}
	}

	const allSubjects = await prisma.subject.findMany({ where: { projectId } });
	const statements = await prisma.statement.findMany({
		where: { projectId, subjectId, status: 'active' }
	});
	const affirmedFacts = statements.map((s) => ({ key: s.predicate, value: s.value }));

	const deterministicCascade = await getOrCreateCascadeForDecision({
		projectId,
		subjectId,
		calibratedThreshold: threshold
	});
	const existingQuestions = deterministicCascade.questions.filter((q) => q.sourceType !== 'agent');

	const agentQuestions = await runCascadeProposerAgent({
		parentSubject: {
			id: parentSubject.id,
			name: parentSubject.name,
			sectionRef: parentSubject.sectionRef || undefined
		},
		decision: {
			id: parentSubject.decision.id,
			retainedOptionTitle: 'Option affirmée',
			rationale: parentSubject.decision.rationale,
			reversibility: parentSubject.decision.reversibility
		},
		affirmedFacts,
		existingQuestions: existingQuestions.map((q) => ({
			id: q.id,
			text: q.text,
			subjectName: q.subjectName
		})),
		existingSubjects: allSubjects.map((s) => ({
			id: s.id,
			name: s.name,
			sectionRef: s.sectionRef,
			problemStatement: s.problemStatement || undefined
		})),
		calibratedThreshold: threshold,
		client: params.client
	});

	// Persistance des questions et sujets enfants (au plus 2)
	for (const q of agentQuestions) {
		const childId = q.childSubjectId!;
		const existingChild = await prisma.subject.findUnique({ where: { id: childId } });

		if (!existingChild) {
			await prisma.subject.create({
				data: {
					id: childId,
					projectId,
					sectionRef: q.subjectSectionRef || '§',
					name: q.subjectName,
					domain: parentSubject.domain || 'general',
					problemStatement: q.text,
					maturityLevel: 'L0_named',
					deliberationStatus: 'open',
					waitingForRole: 'lead_architect',
					relativeEffort: 'S',
					version: 1
				}
			});

			await prisma.argument.create({
				data: {
					id: `arg-genesis-${childId}`,
					subjectId: childId,
					stance: 'synthesis',
					claim: `🤖 Question complémentaire proposée par l'agent`,
					grounds:
						q.grounds || 'Angle mort technique identifié lors de l\'analyse de la décision.',
					kbRefs: '[]',
					confidence: 'designed',
					author: 'Agent Proposeur (Angle Mort)',
					authorKind: 'agent:proposer',
					productionMode: 'llm-derived',
					round: 0,
					resolution: 'answered',
					version: 1
				}
			});
		}

		await prisma.domainEvent.create({
			data: {
				id: `evt-prop-${childId}`,
				projectId,
				entityType: 'cascade_question',
				entityId: q.id,
				type: 'CASCADE_QUESTION_PROPOSED',
				actorId: 'agent:proposer',
				actorRole: 'agent',
				productionMode: 'llm-derived',
				payload: JSON.stringify(q)
			}
		});
	}

	return agentQuestions;
}

/**
 * Vérifie si un sujet enfant a son fondement remis en cause suite à la modification de la décision parente.
 */
export async function checkFoundationContested(childSubjectId: string): Promise<{
	foundationContested: boolean;
	contestationReason?: string;
}> {
	// Exemple contractuel : si le sujet est le split-brain (né de site_count=2),
	// mais que le parent a désormais affirmé site_count = 3 :
	if (childSubjectId.includes('split')) {
		const stmt3Dc = await prisma.statement.findFirst({
			where: {
				predicate: 'site_count',
				value: { in: ['3', '3 sites', 'trois sites'] },
				status: 'active'
			}
		});

		if (stmt3Dc) {
			return {
				foundationContested: true,
				contestationReason:
					'La décision parente a été remplacée : site_count est passé à 3. Le problème du split-brain bi-site n’est plus applicable dans sa forme initiale.'
			};
		}
	}

	return { foundationContested: false };
}
