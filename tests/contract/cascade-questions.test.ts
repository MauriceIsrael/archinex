import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	closeCascadeQuestion,
	buildDiscoveryTreeData,
	type CascadeQuestion
} from '$lib/domain/cascade';
import {
	getOrCreateCascadeForDecision,
	checkFoundationContested
} from '$lib/server/cascade/cascadeService';
import { GET as getCascadeEndpoint } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/cascade/+server';
import { POST as cascadeActionEndpoint } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/cascade/actions/+server';
import type { RequestEvent } from '@sveltejs/kit';

describe('Lot A28 Contract Tests: Cascade de questions, sujets enfants & détection de contestation (#39)', () => {
	const testProjectId = 'test-proj-cascade-39';
	const testSubjectId = 'sub-parent-ha-39';

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });

		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Projet Test Cascade Architecture',
				shortName: 'proj-casc-39',
				type: 'project_rfp',
				badge: 'A28',
				description: 'Vérification du moteur de cascade A28'
			}
		});

		await prisma.subject.create({
			data: {
				id: testSubjectId,
				projectId: testProjectId,
				sectionRef: '§4',
				name: 'Topologie Haute Disponibilité et Continuité',
				problemStatement: 'Quelle architecture pour le PCA/PRA ?',
				maturityLevel: 'L3_decided',
				deliberationStatus: 'decided',
				waitingForRole: 'lead_architect',
				relativeEffort: 'L',
				version: 1
			}
		});

		await prisma.decision.create({
			data: {
				id: `dec-${testSubjectId}`,
				subjectId: testSubjectId,
				retainedOptionId: 'opt-bi-site',
				rationale: 'Bi-site actif/actif retenu pour garantir RPO=0.',
				reversibility: 'costly',
				arbiterId: 'user-architect-39',
				arbiterRole: 'lead_architect',
				version: 1
			}
		});

		await prisma.statement.create({
			data: {
				id: `stmt-${testSubjectId}-sitecount`,
				projectId: testProjectId,
				subjectId: testSubjectId,
				section: '§4',
				subjectRef: 'Infrastructure',
				predicate: 'site_count',
				value: '2',
				author: 'alice.architect',
				role: 'lead_architect',
				productionMode: 'human-authored',
				confidence: 'verified',
				subjectLevel: 'L3_decided',
				status: 'active'
			}
		});

		await prisma.statement.create({
			data: {
				id: `stmt-${testSubjectId}-resilience`,
				projectId: testProjectId,
				subjectId: testSubjectId,
				section: '§4',
				subjectRef: 'Infrastructure',
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

	it('Scenario 1: Pure function closeCascadeQuestion enforces mandatory justification >= 5 chars', () => {
		const mandatoryQ: CascadeQuestion = {
			id: 'q-mand',
			text: 'Comment prévenir le split-brain ?',
			subjectName: 'Split-Brain',
			sourceType: 'control',
			mandatory: true,
			status: 'open',
			lineage: {
				parentDecisionId: 'dec-1',
				parentSubjectId: 'sub-1',
				parentSubjectName: 'Parent',
				triggeringFacts: []
			}
		};

		// 1. Without justification -> fails
		const fail1 = closeCascadeQuestion(mandatoryQ, '');
		expect(fail1.success).toBe(false);
		expect(fail1.error).toContain('strictement obligatoire');

		// 2. Short justification (< 5 chars) -> fails
		const fail2 = closeCascadeQuestion(mandatoryQ, 'non');
		expect(fail2.success).toBe(false);

		// 3. Justification >= 5 chars -> succeeds
		const passMand = closeCascadeQuestion(mandatoryQ, 'Géré par témoin externe');
		expect(passMand.success).toBe(true);
		expect(passMand.question.status).toBe('closed');
		expect(passMand.question.closedReason).toBe('Géré par témoin externe');

		// 4. Non-mandatory question closes without justification
		const optionalQ: CascadeQuestion = { ...mandatoryQ, id: 'q-opt', mandatory: false };
		const passOpt = closeCascadeQuestion(optionalQ, null);
		expect(passOpt.success).toBe(true);
		expect(passOpt.question.status).toBe('closed');
	});

	it('Scenario 2: buildDiscoveryTreeData builds ECharts hierarchy with parent, decision, and children', () => {
		const treeSeries = buildDiscoveryTreeData({
			parentSubject: { id: 'p1', name: 'Haute Dispo', sectionRef: '§4', level: 'L3_decided' },
			decision: { id: 'd1', retainedOptionTitle: 'Bi-site actif/actif' },
			childSubjects: [
				{ id: 'c1', name: 'Réplication', sectionRef: '§4.1', level: 'L1_framed' },
				{ id: 'c2', name: 'Split-Brain', sectionRef: '§4.2', level: 'L1_framed', foundationContested: true }
			]
		});

		expect(treeSeries).toHaveLength(1);
		expect(treeSeries[0].type).toBe('tree');
		const root = treeSeries[0].data[0];
		expect(root.name).toContain('§4 Haute Dispo');
		expect(root.children).toHaveLength(1);

		const decisionNode = root.children[0];
		expect(decisionNode.name).toContain('Bi-site actif/actif');
		expect(decisionNode.children).toHaveLength(2);

		const splitBrainChild = decisionNode.children.find((c: any) => c.name.includes('Split-Brain'));
		expect(splitBrainChild.category).toBe('Contesté ⚠️');
		expect(splitBrainChild.match.score).toBe(40);
	});

	it('Scenario 3: getOrCreateCascadeForDecision generates questions and creates child subjects with genesis synthesis argument', async () => {
		const cascade = await getOrCreateCascadeForDecision({
			projectId: testProjectId,
			subjectId: testSubjectId
		});

		expect(cascade.questions.length).toBeGreaterThanOrEqual(3);

		const replQ = cascade.questions.find((q) => q.subjectName === 'Réplication et RPO');
		expect(replQ).toBeDefined();
		expect(replQ?.mandatory).toBe(true);
		expect(replQ?.sourceType).toBe('doctrine');
		expect(replQ?.lineage.ruleRef).toBe('DOC-HA-01');

		const splitQ = cascade.questions.find((q) => q.subjectName === 'Split-Brain et Quorum');
		expect(splitQ).toBeDefined();
		expect(splitQ?.mandatory).toBe(true);
		expect(splitQ?.sourceType).toBe('control');
		expect(splitQ?.lineage.triggeringFacts).toEqual([{ key: 'site_count', value: '2' }]);

		// Child subjects must exist in DB
		const childInDb = await prisma.subject.findUnique({
			where: { id: splitQ!.childSubjectId }
		});
		expect(childInDb).not.toBeNull();
		expect(childInDb?.name).toBe('Split-Brain et Quorum');
		expect(childInDb?.maturityLevel).toBe('L1_framed');

		// Genesis argument in the child's feed
		const genesisArg = await prisma.argument.findFirst({
			where: { subjectId: splitQ!.childSubjectId, stance: 'synthesis' }
		});
		expect(genesisArg).not.toBeNull();
		expect(genesisArg?.claim).toContain('Sujet né de :');
		expect(genesisArg?.grounds).toContain('site_count=2');
	});

	it('Scenario 4: Cascade action endpoint enforces closing justification on mandatory questions', async () => {
		const targetQuestion: CascadeQuestion = {
			id: `q-casc-${testSubjectId}-split-brain`,
			text: 'Comment prévenir le split-brain et assurer le quorum ?',
			subjectName: 'Split-Brain et Quorum',
			sourceType: 'control',
			mandatory: true,
			status: 'open',
			lineage: {
				parentDecisionId: `dec-${testSubjectId}`,
				parentSubjectId: testSubjectId,
				parentSubjectName: 'Parent HA',
				triggeringFacts: [{ key: 'site_count', value: '2' }]
			}
		};

		// 1. Attempt to close mandatory question without justification -> 400
		const badRequestEvent = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'close',
					question: targetQuestion,
					justification: ''
				})
			})
		} as unknown as RequestEvent;

		const badRes = await cascadeActionEndpoint(badRequestEvent as any);
		expect(badRes.status).toBe(400);
		const badBody = await badRes.json();
		expect(badBody.message).toContain('strictement obligatoire');

		// 2. Close with valid justification -> 200
		const goodRequestEvent = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'close',
					question: targetQuestion,
					justification: 'Arbitrage externalisé vers cloud witness tiers'
				})
			})
		} as unknown as RequestEvent;

		const goodRes = await cascadeActionEndpoint(goodRequestEvent as any);
		expect(goodRes.status).toBe(200);
		const goodBody = await goodRes.json();
		expect(goodBody.status).toBe('ok');
		expect(goodBody.question.status).toBe('closed');
		expect(goodBody.question.closedReason).toBe('Arbitrage externalisé vers cloud witness tiers');
	});

	it('Scenario 5: Changing parent facts detects foundation_contested on split-brain child without deleting it', async () => {
		const splitChildId = `sub-child-${testSubjectId}-split`;

		// Initial state: 2 sites -> not contested
		const initialContest = await checkFoundationContested(splitChildId);
		expect(initialContest.foundationContested).toBe(false);

		// Now parent decision changes to 3 sites
		await prisma.statement.create({
			data: {
				id: `stmt-${testSubjectId}-sitecount-3`,
				projectId: testProjectId,
				subjectId: testSubjectId,
				section: '§4',
				subjectRef: 'Infrastructure',
				predicate: 'site_count',
				value: '3 sites',
				author: 'alice.architect',
				role: 'lead_architect',
				productionMode: 'human-authored',
				confidence: 'verified',
				subjectLevel: 'L3_decided',
				status: 'active'
			}
		});

		// Check contestation: now detected!
		const contestedResult = await checkFoundationContested(splitChildId);
		expect(contestedResult.foundationContested).toBe(true);
		expect(contestedResult.contestationReason).toContain('site_count est passé à 3');

		// Verify child still exists in DB (not destroyed)
		const childStillInDb = await prisma.subject.findUnique({
			where: { id: splitChildId }
		});
		expect(childStillInDb).not.toBeNull();

		// GET cascade endpoint returns treeSeries and contestation
		const getEvent = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: new Request('http://localhost')
		} as unknown as RequestEvent;

		const getRes = await getCascadeEndpoint(getEvent as any);
		expect(getRes.status).toBe(200);
		const getBody = await getRes.json();
		expect(getBody.cascade).toBeDefined();
		expect(getBody.treeSeries).toBeDefined();
	});
});
