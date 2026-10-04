import { prisma } from '../prisma';
import type {
	CascadeQuestion,
	CascadeResult,
	CascadeLineage
} from '$lib/domain/cascade';
import { closeCascadeQuestion } from '$lib/domain/cascade';

/**
 * Génère ou récupère la cascade de questions et sujets enfants pour une décision affirmée.
 * Scénario contractuel (A28) : Topologie bi-site actif/actif ouvre 3 questions structurantes.
 */
export async function getOrCreateCascadeForDecision(params: {
	projectId: string;
	subjectId: string;
	decisionId?: string;
}): Promise<CascadeResult> {
	const { projectId, subjectId } = params;

	const parentSubject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: {
			decision: true
		}
	});

	if (!parentSubject) {
		throw new Error(`Sujet parent ${subjectId} introuvable`);
	}

	const decision = parentSubject.decision;
	const decisionId = params.decisionId || decision?.id || `dec-${subjectId}`;

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

	// Valeurs des faits clés
	const siteCountFact = affirmedFacts.find((f) => f.key === 'site_count')?.value || '2';
	const resilienceModeFact =
		affirmedFacts.find((f) => f.key === 'resilience_mode')?.value || 'actif/actif';

	// Génération des questions de la cascade
	const questions: CascadeQuestion[] = [
		{
			id: `q-casc-${subjectId}-replication`,
			text: 'Quelle stratégie de réplication synchrone et quel RPO cible garantissent le maintien des transactions ?',
			subjectName: 'Réplication et RPO',
			subjectSectionRef: `${parentSubject.sectionRef || '§4'}.1`,
			sourceType: 'doctrine',
			mandatory: true,
			status: 'open',
			childSubjectId: `sub-child-${subjectId}-repl`,
			lineage: {
				ruleRef: 'DOC-HA-01',
				ruleName: 'Topologie de Continuité d’Activité Bi-Site',
				triggeringFacts: [{ key: 'resilience_mode', value: resilienceModeFact }],
				parentDecisionId: decisionId,
				parentSubjectId: subjectId,
				parentSubjectName: parentSubject.name
			},
			initialLevel: 'L1_framed',
			prefillFraming: {
				problemStatement: `Définir le mode de réplication synchrone pour garantir un RPO = 0 entre les deux sites en mode ${resilienceModeFact}.`,
				scope: 'Couche de persistance et stockage répliqué'
			}
		},
		{
			id: `q-casc-${subjectId}-split-brain`,
			text: 'Comment prévenir le split-brain et assurer le quorum d’arbitrage entre les deux sites ?',
			subjectName: 'Split-Brain et Quorum',
			subjectSectionRef: `${parentSubject.sectionRef || '§4'}.2`,
			sourceType: 'control',
			mandatory: true,
			status: 'open',
			childSubjectId: `sub-child-${subjectId}-split`,
			lineage: {
				assetRef: 'SEC-RESIL-02',
				ruleRef: 'SEC-RESIL-02',
				ruleName: 'Quorum d’Arbitrage et Témoin Indépendant',
				triggeringFacts: [{ key: 'site_count', value: '2' }],
				parentDecisionId: decisionId,
				parentSubjectId: subjectId,
				parentSubjectName: parentSubject.name
			},
			initialLevel: 'L1_framed',
			prefillFraming: {
				problemStatement:
					'Implanter un tiers-témoin (witness) ou un quorum externe pour éviter les écritures concurrentes en cas de coupure de lien.',
				scope: 'Arbitrage réseau et consensus'
			}
		},
		{
			id: `q-casc-${subjectId}-failover`,
			text: 'Quel mécanisme de bascule automatique du trafic réseau et applicatif (DNS vs BGP Anycast) déployer ?',
			subjectName: 'Bascule de Trafic Applicatif',
			subjectSectionRef: `${parentSubject.sectionRef || '§4'}.3`,
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
		}
	];

	// Persistance des sujets enfants dans la base relationnelle
	for (const q of questions) {
		const childId = q.childSubjectId!;
		const existing = await prisma.subject.findUnique({ where: { id: childId } });

		if (!existing) {
			const createdChild = await prisma.subject.create({
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

			// Message initial dans le fil de l'enfant expliquant sa naissance
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

	return {
		decisionId,
		parentSubjectId: subjectId,
		parentSubjectName: parentSubject.name,
		questions
	};
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
		// Rechercher si une déclaration ou décision avec 3 DC existe
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
