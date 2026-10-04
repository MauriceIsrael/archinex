import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	runCascadeProposerAgent,
	detectPossibleDuplicate,
	cosineSimilarity
} from '$lib/server/agents/cascadeProposer';
import {
	getOrCreateCascadeForDecision,
	proposeAndPersistComplementaryQuestions
} from '$lib/server/cascade/cascadeService';
import { POST as cascadeActionEndpoint } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/cascade/actions/+server';
import { POST as cascadeProposeEndpoint } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/cascade/propose/+server';
import type { RequestEvent } from '@sveltejs/kit';
import type { LocalLlmClient } from '$lib/server/llm/localLlmClient';

describe('Lot A29 Contract Tests: Agent proposeur, questions complémentaires (max 2), détection des doublons & signal de capitalisation (#40)', () => {
	const testProjectId = 'test-proj-proposer-40';
	const testSubjectId = 'sub-parent-core-40';

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });

		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Projet Test Agent Proposeur 5G',
				shortName: 'proj-prop-40',
				type: 'project_rfp',
				badge: 'A29',
				description: 'Vérification du moteur de proposition complémentaire A29',
				strategy: JSON.stringify({
					calibratedDuplicateThreshold: 0.60
				})
			}
		});

		await prisma.subject.create({
			data: {
				id: testSubjectId,
				projectId: testProjectId,
				sectionRef: '§4',
				name: 'Cœur de Réseau et Continuité',
				problemStatement: 'Quelle résilience pour le cœur de réseau 5G ?',
				maturityLevel: 'L3_decided',
				deliberationStatus: 'decided',
				waitingForRole: 'lead_architect',
				relativeEffort: 'L',
				version: 1
			}
		});

		// Sujet existant pour tester la détection de doublon sémantique
		await prisma.subject.create({
			data: {
				id: `sub-existing-latency-${testProjectId}`,
				projectId: testProjectId,
				sectionRef: '§2.4',
				name: 'Latence du Cœur 5G et Transport',
				problemStatement: 'Évaluation des temps de transit et de latence sur le cœur de réseau mobile.',
				maturityLevel: 'L1_framed',
				deliberationStatus: 'open',
				waitingForRole: 'lead_architect',
				relativeEffort: 'M',
				version: 1
			}
		});

		await prisma.decision.create({
			data: {
				id: `dec-${testSubjectId}`,
				subjectId: testSubjectId,
				retainedOptionId: 'opt-cloud-native-5g',
				rationale: 'Déploiement bi-site actif/actif avec réplication des sessions utilisateurs.',
				reversibility: 'costly',
				arbiterId: 'user-architect-40',
				arbiterRole: 'lead_architect',
				version: 1
			}
		});

		await prisma.statement.create({
			data: {
				id: `stmt-${testSubjectId}-5g`,
				projectId: testProjectId,
				subjectId: testSubjectId,
				section: '§4',
				subjectRef: '5G_Core',
				predicate: 'resilience_mode',
				value: 'actif/actif',
				author: 'alice.architect',
				role: 'lead_architect',
				productionMode: 'human-authored',
				confidence: 'verified',
				subjectLevel: 'L3_decided',
				status: 'active'
			}
		});
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('Scenario 1: runCascadeProposerAgent limits strictly to at most 2 questions, each with grounds, sourceType: agent, and no ruleRef', async () => {
		// Mock LLM returning 3 questions
		const mockClient: LocalLlmClient = {
			chat: async () => {
				return JSON.stringify({
					questions: [
						{
							text: "Avez-vous évalué l'impact sur la latence du cœur 5G ?",
							subjectName: 'Latence Cœur 5G',
							grounds: 'La réplication synchrone inter-sites peut dégrader le budget temps de transit sous 5ms.'
						},
						{
							text: 'Comment sont isolés les flux du plan de contrôle et du plan utilisateur ?',
							subjectName: 'Isolation Control Plane',
							grounds: 'Norme 3GPP TS 23.501 imposant une segmentation réseau stricte.'
						},
						{
							text: 'Question en trop : quel est le coût de la licence cloud ?',
							subjectName: 'Coût licence',
							grounds: 'FinOps et coût récurrent.'
						}
					]
				});
			}
		} as unknown as LocalLlmClient;

		const result = await runCascadeProposerAgent({
			parentSubject: { id: testSubjectId, name: 'Cœur de Réseau', sectionRef: '§4' },
			decision: { id: `dec-${testSubjectId}`, retainedOptionTitle: 'Bi-site 5G' },
			affirmedFacts: [{ key: 'resilience_mode', value: 'actif/actif' }],
			existingQuestions: [],
			existingSubjects: [],
			client: mockClient
		});

		// CRITÈRE 1 : Au plus 2 questions
		expect(result).toHaveLength(2);

		for (const q of result) {
			// CRITÈRE 1 : Source 'agent', non obligatoire, llm-derived, avec grounds
			expect(q.sourceType).toBe('agent');
			expect(q.mandatory).toBe(false);
			expect(q.productionMode).toBe('llm-derived');
			expect(q.grounds).toBeDefined();
			expect(q.grounds!.length).toBeGreaterThanOrEqual(5);

			// CRITÈRE 1 : Jamais dérivée d'une règle (lineage.ruleRef absent)
			expect(q.lineage.ruleRef).toBeUndefined();
			expect(q.lineage.ruleName).toBeUndefined();
		}
	});

	it('Scenario 2: Graceful error handling - LLM failure produces empty array, never fake/simulated questions', async () => {
		const failingClient: LocalLlmClient = {
			chat: async () => {
				throw new Error("Délai d'inférence LLM local dépassé (180s)");
			}
		} as unknown as LocalLlmClient;

		const result = await runCascadeProposerAgent({
			parentSubject: { id: testSubjectId, name: 'Cœur de Réseau' },
			decision: { id: `dec-${testSubjectId}` },
			affirmedFacts: [],
			existingQuestions: [],
			existingSubjects: [],
			client: failingClient
		});

		// CRITÈRE 2 : L'erreur ne bloque rien et aucune question fictive n'est inventée
		expect(result).toEqual([]);
	});

	it('Scenario 3: Semantic duplicate detection with calibrated threshold (A14) flags suspect duplicates without blocking creation', async () => {
		const existingSubjects = [
			{
				id: 'sub-existing-latency',
				name: 'Latence du Cœur 5G et Transport',
				sectionRef: '§2.4',
				problemStatement: 'Évaluation des temps de transit et de latence sur le cœur de réseau mobile.'
			}
		];

		const calibratedThreshold = 0.40;

		// 1. Proposed question similar to existing latency subject
		const candidateText = "Latence Cœur 5G Avez-vous évalué l'impact sur la latence du cœur 5G ?";
		const duplicateCheck = detectPossibleDuplicate(
			candidateText,
			existingSubjects,
			calibratedThreshold
		);

		expect(duplicateCheck).not.toBeNull();
		expect(duplicateCheck?.subjectId).toBe('sub-existing-latency');
		expect(duplicateCheck?.threshold).toBe(calibratedThreshold);
		expect(duplicateCheck?.score).toBeGreaterThanOrEqual(calibratedThreshold);

		// 2. Unrelated question -> null
		const nonDuplicateCheck = detectPossibleDuplicate(
			'Politique de sauvegarde des bases de données de logs froids',
			existingSubjects,
			calibratedThreshold
		);
		expect(nonDuplicateCheck).toBeNull();
	});

	it('Scenario 4: Propose endpoint creates child subjects (L0_named) and cascade result exposes them with 🤖 icon', async () => {
		// Mock client for proposeAndPersistComplementaryQuestions
		const mockClient: LocalLlmClient = {
			chat: async () => {
				return JSON.stringify({
					questions: [
						{
							text: "Avez-vous évalué l'impact sur la latence du cœur 5G ?",
							subjectName: 'Latence Cœur 5G',
							grounds: 'La réplication inter-sites peut dépasser le budget de 5ms.'
						}
					]
				});
			}
		} as unknown as LocalLlmClient;

		const proposed = await proposeAndPersistComplementaryQuestions({
			projectId: testProjectId,
			subjectId: testSubjectId,
			calibratedThreshold: 0.50,
			client: mockClient
		});

		expect(proposed.length).toBeGreaterThanOrEqual(1);
		const agentQ = proposed[0];
		expect(agentQ.sourceType).toBe('agent');

		// Child subject exists in DB with L0_named maturity
		const childInDb = await prisma.subject.findUnique({
			where: { id: agentQ.childSubjectId }
		});
		expect(childInDb).not.toBeNull();
		expect(childInDb?.name).toBe('Latence Cœur 5G');
		expect(childInDb?.maturityLevel).toBe('L0_named');

		// Genesis argument has authorKind: 'agent:proposer' and productionMode: 'llm-derived'
		const genesisArg = await prisma.argument.findFirst({
			where: { subjectId: agentQ.childSubjectId }
		});
		expect(genesisArg).not.toBeNull();
		expect(genesisArg?.authorKind).toBe('agent:proposer');
		expect(genesisArg?.productionMode).toBe('llm-derived');

		// Calling getOrCreateCascadeForDecision now returns deterministic + agent questions
		const fullCascade = await getOrCreateCascadeForDecision({
			projectId: testProjectId,
			subjectId: testSubjectId
		});

		const foundAgentQ = fullCascade.questions.find((q) => q.sourceType === 'agent');
		expect(foundAgentQ).toBeDefined();
		expect(foundAgentQ?.subjectName).toBe('Latence Cœur 5G');
	});

	it('Scenario 5: Merge and Capitalization actions via cascade actions endpoint', async () => {
		const targetQ = {
			id: `q-agent-${testSubjectId}-1`,
			text: "Avez-vous évalué l'impact sur la latence du cœur 5G ?",
			subjectName: 'Latence Cœur 5G',
			sourceType: 'agent' as const,
			mandatory: false,
			status: 'open' as const,
			lineage: {
				parentDecisionId: `dec-${testSubjectId}`,
				parentSubjectId: testSubjectId,
				parentSubjectName: 'Cœur de Réseau',
				triggeringFacts: []
			}
		};

		// 1. Merge action
		const mergeEvent = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'merge',
					question: targetQ,
					mergedWithSubjectId: `sub-existing-latency-${testProjectId}`
				})
			})
		} as unknown as RequestEvent;

		const mergeRes = await cascadeActionEndpoint(mergeEvent as any);
		expect(mergeRes.status).toBe(200);
		const mergeBody = await mergeRes.json();
		expect(mergeBody.question.status).toBe('merged');
		expect(mergeBody.question.mergedWithSubjectId).toBe(`sub-existing-latency-${testProjectId}`);

		// 2. Capitalization action (Signal vers K22 / K7)
		const capitalizeEvent = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'capitalize',
					question: targetQ,
					candidateTitle: 'Règle candidate : Évaluation de la latence inter-sites cœur 5G',
					candidateSummary: targetQ.text,
					candidateRationale: 'Question récurrente sur les architectures 5G critiques.'
				})
			})
		} as unknown as RequestEvent;

		const capRes = await cascadeActionEndpoint(capitalizeEvent as any);
		expect(capRes.status).toBe(200);
		const capBody = await capRes.json();
		expect(capBody.status).toBe('ok');
		expect(capBody.candidateId).toBeDefined();
	});
});
