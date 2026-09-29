import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	createProject,
	createSubject,
	type ActorInfo
} from '$lib/server/projects/projectsDb';
import {
	createCriterion,
	createOption
} from '$lib/server/projects/optionsDb';
import {
	createArgument,
	listArguments,
	resolveArgument,
	getLatestDebateRun
} from '$lib/server/projects/debateDb';
import { orchestrateDebate } from '$lib/server/agents/debateOrchestrator';
import { setupFakeLlm } from '../helpers/fakeLlm';

describe('Lot A3 Integration: Multi-Agent Bounded Debate & Structured Arguments', () => {
	const testProjectId = `test-a3-debate-${Date.now()}`;
	const testSubjectId = `subj-a3-${Date.now()}`;
	const leadArchitect: ActorInfo = { userId: 'alice-lead', role: 'lead_architect' };
	const domainExpert: ActorInfo = { userId: 'bob-expert', role: 'domain_expert' };
	const viewerActor: ActorInfo = { userId: 'charlie-viewer', role: 'viewer' };

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('1. Initialise le projet, le sujet, les critères et les options d\'architecture', async () => {
		await createProject(
			{
				id: testProjectId,
				title: 'Projet Test Débat Dialectique',
				shortName: 'PTD3',
				badge: 'TEST',
				description: 'Vérification du débat multi-agents borné'
			},
			leadArchitect
		);

		await createSubject(
			testProjectId,
			{
				id: testSubjectId,
				sectionRef: '§4.1',
				name: 'Chiffrement Post-Quantique & KMS',
				domain: 'security',
				maturityLevel: 'L1_framed'
			},
			leadArchitect
		);

		await createCriterion(
			testSubjectId,
			{
				id: `crit-resil-${Date.now()}`,
				name: 'Résilience cryptographique',
				kind: 'compliance',
				weight: 5
			},
			leadArchitect
		);

		await createCriterion(
			testSubjectId,
			{
				id: `crit-perf-${Date.now()}`,
				name: 'Débit de négociation TLS',
				kind: 'nfr',
				weight: 4
			},
			leadArchitect
		);

		await createOption(
			testSubjectId,
			{
				id: `opt-hsm-${Date.now()}`,
				title: 'Option A (HSM Dédié sur site)',
				summary: 'Modules matériels certifiés FIPS 140-3',
				origin: 'human'
			},
			leadArchitect
		);

		await createOption(
			testSubjectId,
			{
				id: `opt-kms-cloud-${Date.now()}`,
				title: 'Option B (KMS Managé Hybride)',
				summary: 'Enclave sécurisée dans un cloud souverain qualifié',
				origin: 'llm-proposed'
			},
			domainExpert
		);
	});

	it('2. Exécute l\'orchestrateur de débat borné (Proposer, Challenger, Synthesizer)', async () => {
		const result = await orchestrateDebate(testSubjectId, {
			maxRounds: 1,
			actor: leadArchitect
		});

		expect(result.roundsExecuted).toBe(1);
		expect(result.newArgumentsCount).toBeGreaterThanOrEqual(3);
		expect(result.run.status).toBe('completed');

		const latestRun = await getLatestDebateRun(testSubjectId);
		expect(latestRun?.status).toBe('completed');

		const args = await listArguments(testSubjectId);
		expect(args.length).toBeGreaterThanOrEqual(3);

		// Vérifie présence d'au moins 1 argument 'support'
		const supportArgs = args.filter((a) => a.stance === 'support');
		expect(supportArgs.length).toBeGreaterThanOrEqual(1);
		expect(supportArgs[0].grounds.length).toBeGreaterThan(5);

		// Vérifie présence d'au moins 1 argument 'objection' par option
		const objections = args.filter((a) => a.stance === 'objection');
		expect(objections.length).toBeGreaterThanOrEqual(2);

		// Vérifie présence de la synthèse contradictoire
		const syntheses = args.filter((a) => a.stance === 'synthesis');
		expect(syntheses.length).toBeGreaterThanOrEqual(1);

		// Vérifie la génération de questions bloquantes pour l'humain
		const questions = await prisma.question.findMany({ where: { subjectId: testSubjectId } });
		expect(questions.length).toBeGreaterThanOrEqual(1);
		expect(questions[0].blocking).toBe(true);

		// Vérifie mise à jour du sujet
		const subject = await prisma.subject.findUnique({ where: { id: testSubjectId } });
		expect(subject?.deliberationStatus).toBe('debating');
	});

	it('3. Permet à un humain de verser un argument avec validation de grounds et productionMode', async () => {
		const options = await prisma.option.findMany({ where: { subjectId: testSubjectId } });

		const humanArg = await createArgument(
			testSubjectId,
			{
				id: `arg-human-${Date.now()}`,
				optionId: options[0].id,
				stance: 'objection',
				claim: 'Délai d approvisionnement de 9 mois inacceptable',
				grounds: 'Le constructeur notifie une pénurie de composants cryptographiques spécifiques.',
				confidence: 'verified',
				authorKind: 'human',
				round: 2
			},
			domainExpert
		);

		expect(humanArg.productionMode).toBe('human-authored');
		expect(humanArg.author).toBe(domainExpert.userId);
		expect(humanArg.resolution).toBe('open');
	});

	it('4. Rejette la levée d\'une objection par un rôle non habilité (Viewer)', async () => {
		const args = await listArguments(testSubjectId);
		const targetObjection = args.find((a) => a.stance === 'objection' && a.resolution === 'open');
		expect(targetObjection).toBeDefined();

		await expect(
			resolveArgument(
				targetObjection!.id,
				{
					resolution: 'accepted_risk',
					expectedVersion: targetObjection!.version
				},
				viewerActor,
				true
			)
		).rejects.toThrow(/non habilité/i);
	});

	it('5. Autorise le Lead Architect à accepter le risque ou lever l\'objection (Invariant III)', async () => {
		const args = await listArguments(testSubjectId);
		const targetObjection = args.find((a) => a.stance === 'objection' && a.resolution === 'open');
		expect(targetObjection).toBeDefined();

		const resolved = await resolveArgument(
			targetObjection!.id,
			{
				resolution: 'accepted_risk',
				expectedVersion: targetObjection!.version
			},
			leadArchitect,
			true
		);

		expect(resolved.resolution).toBe('accepted_risk');
		expect(resolved.resolvedBy).toBe(leadArchitect.userId);
		expect(resolved.version).toBe(targetObjection!.version + 1);
	});

	it('6. Vérifie la traçabilité complète des événements de domaine du débat', async () => {
		const events = await prisma.domainEvent.findMany({
			where: { projectId: testProjectId },
			orderBy: { createdAt: 'asc' }
		});

		const types = events.map((e) => e.type);
		expect(types).toContain('ARGUMENT_CREATED');
		expect(types).toContain('ARGUMENT_RESOLVED');
		expect(types).toContain('DEBATE_ROUND_COMPLETED');
	});

	it('7. Exécute un tour avec fakeLlm déterministe', async () => {
		const options = await prisma.option.findMany({ where: { subjectId: testSubjectId } });
		const spy = setupFakeLlm({
			challengerObjections: [
				{
					optionId: options[0].id,
					claim: 'Objection déterministe via fakeLlm',
					grounds: 'Preuve par simulation que le dimensionnement est sous-estimé.',
					kbRefs: []
				}
			]
		});

		try {
			const res = await orchestrateDebate(testSubjectId, { maxRounds: 1, actor: leadArchitect });
			expect(res.roundsExecuted).toBe(1);

			const args = await listArguments(testSubjectId);
			const customObj = args.find((a) => a.claim === 'Objection déterministe via fakeLlm');
			expect(customObj).toBeDefined();
			expect(customObj?.grounds).toContain('Preuve par simulation');
		} finally {
			spy.mockRestore();
		}
	});
});

