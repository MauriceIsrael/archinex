import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	createProject,
	createSubject,
	updateSubject,
	createStatement,
	retractStatement,
	getStatement,
	getSubject,
	ConcurrencyConflictError,
	type ActorInfo
} from '$lib/server/projects/projectsDb';

describe('Concurrency & Optimistic Locking Integration (Gate G2)', () => {
	const testProjectId = `test-concurrency-${Date.now()}`;
	const actorA: ActorInfo = { userId: 'alice-architect', role: 'lead_architect' };
	const actorB: ActorInfo = { userId: 'bob-expert', role: 'domain_expert' };

	beforeAll(async () => {
		// Nettoyage préalable si nécessaire
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('1. Crée un projet et un sujet avec version initiale 1', async () => {
		const project = await createProject(
			{
				id: testProjectId,
				title: 'Projet Test Concurrence',
				shortName: 'PTC',
				badge: 'TEST',
				description: 'Projet de test pour la concurrence'
			},
			actorA
		);
		expect(project.version).toBe(1);

		const subject = await createSubject(
			testProjectId,
			{
				id: `subj-1-${testProjectId}`,
				sectionRef: '§1.1',
				name: 'Architecture Réseau 5G',
				domain: 'telecom',
				maturityLevel: 'L1_framed'
			},
			actorA
		);

		expect(subject.version).toBe(1);
		expect(subject.name).toBe('Architecture Réseau 5G');
	});

	it('2. Gère deux écritures concurrentes avec la même version attendue : 1 succès, 1 rejet 409 sans corruption', async () => {
		const subjectId = `subj-1-${testProjectId}`;
		const initialSubject = await getSubject(testProjectId, subjectId);
		expect(initialSubject?.version).toBe(1);

		// Client A et Client B ont tous deux lu la version 1
		const clientAUpdate = updateSubject(
			testProjectId,
			subjectId,
			{
				expectedVersion: 1,
				name: 'Architecture Réseau 5G (par Client A)',
				maturityLevel: 'L2_decomposed'
			},
			actorA
		);

		const clientBUpdate = updateSubject(
			testProjectId,
			subjectId,
			{
				expectedVersion: 1,
				name: 'Architecture Réseau 5G (par Client B)',
				maturityLevel: 'L3_decided'
			},
			actorB
		);

		// L'une des deux doit réussir, l'autre doit échouer avec ConcurrencyConflictError (409)
		const results = await Promise.allSettled([clientAUpdate, clientBUpdate]);

		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected');

		expect(fulfilled.length).toBe(1);
		expect(rejected.length).toBe(1);

		const conflictError = (rejected[0] as PromiseRejectedResult).reason;
		expect(conflictError).toBeInstanceOf(ConcurrencyConflictError);
		expect(conflictError.statusCode).toBe(409);
		expect(conflictError.expectedVersion).toBe(1);
		expect(conflictError.currentVersion).toBe(2);

		// Vérifier l'état final en base : le sujet est en version 2 et correspond au client gagnant
		const currentSubject = await getSubject(testProjectId, subjectId);
		expect(currentSubject?.version).toBe(2);
		expect(currentSubject?.name).toBe((fulfilled[0] as PromiseFulfilledResult<any>).value.name);
	});

	it('3. Permet au client en conflit de recharger et soumettre avec la nouvelle version', async () => {
		const subjectId = `subj-1-${testProjectId}`;
		const fresh = await getSubject(testProjectId, subjectId);
		expect(fresh?.version).toBe(2);

		const updated = await updateSubject(
			testProjectId,
			subjectId,
			{
				expectedVersion: fresh!.version,
				deliberationStatus: 'ready_for_arbitration'
			},
			actorB
		);

		expect(updated.version).toBe(3);
		expect(updated.deliberationStatus).toBe('ready_for_arbitration');
	});

	it('4. Respecte strictement l\'Invariant I : verified × llm-derived est rejeté', async () => {
		await expect(
			createStatement(
				testProjectId,
				{
					id: `stmt-inv1-${testProjectId}`,
					section: '§1.1',
					subjectRef: '5G Core',
					predicate: 'requires',
					value: 'UPF hardware acceleration',
					author: 'AI Agent',
					role: 'AI Assistant',
					productionMode: 'llm-derived',
					confidence: 'verified' // INTERDIT par Invariant I
				},
				{ userId: 'ai-agent', role: 'ai_assistant', productionMode: 'llm-derived' }
			)
		).rejects.toThrow(/Invariant I Violation/);
	});

	it('5. Exécute la cascade de rétractation causale serveur (Invariant VI)', async () => {
		const s1Id = `s1-${testProjectId}`;
		const s2Id = `s2-${testProjectId}`;
		const s3Id = `s3-${testProjectId}`;

		// S1 : énoncé racine
		await createStatement(
			testProjectId,
			{
				id: s1Id,
				section: '§1.1',
				subjectRef: 'NTP Server',
				predicate: 'latency',
				value: '< 1ms',
				author: 'Alice',
				role: 'lead_architect',
				productionMode: 'human-authored',
				confidence: 'verified'
			},
			actorA
		);

		// S2 : dépend de S1
		await createStatement(
			testProjectId,
			{
				id: s2Id,
				section: '§1.1',
				subjectRef: 'PTP Boundary Clock',
				predicate: 'accuracy',
				value: 'Class C',
				author: 'Bob',
				role: 'domain_expert',
				productionMode: 'human-authored',
				confidence: 'designed',
				antecedentIds: [s1Id]
			},
			actorB
		);

		// S3 : dépend de S2
		await createStatement(
			testProjectId,
			{
				id: s3Id,
				section: '§1.1',
				subjectRef: 'Radio Unit Sync',
				predicate: 'phase_alignment',
				value: '1.5us',
				author: 'Alice',
				role: 'lead_architect',
				productionMode: 'human-authored',
				confidence: 'designed',
				antecedentIds: [s2Id]
			},
			actorA
		);

		// Rétractation de S1
		const cascadeResult = await retractStatement(
			testProjectId,
			s1Id,
			actorA,
			'NTP local non homologué'
		);

		expect(cascadeResult.retractedId).toBe(s1Id);
		expect(cascadeResult.affectedStatementIds).toContain(s2Id);
		expect(cascadeResult.affectedStatementIds).toContain(s3Id);

		// Vérification de la rétrogradation en base
		const freshS1 = await getStatement(testProjectId, s1Id);
		const freshS2 = await getStatement(testProjectId, s2Id);
		const freshS3 = await getStatement(testProjectId, s3Id);

		expect(freshS1?.status).toBe('retracted');
		expect(freshS2?.confidence).toBe('assumed');
		expect(freshS2?.status).toBe('contested');
		expect(freshS3?.confidence).toBe('assumed');
		expect(freshS3?.status).toBe('contested');
	});
});
