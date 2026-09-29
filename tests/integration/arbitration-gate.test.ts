import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	createProject,
	createSubject,
	createStatement,
	type ActorInfo
} from '$lib/server/projects/projectsDb';
import {
	createCriterion,
	createOption,
	upsertEvaluation
} from '$lib/server/projects/optionsDb';
import {
	createArgument,
	resolveArgument
} from '$lib/server/projects/debateDb';
import {
	recordArbitrationDecision,
	getSubjectArbitrationContext,
	MaturityUnreadyError,
	UnauthorizedArbitrationError
} from '$lib/server/projects/arbitrationDb';

describe('Lot A4 Integration: Calculated Maturity & Human Arbitration Gate (Porte G3)', () => {
	const testProjectId = `test-a4-arb-${Date.now()}`;
	const testSubjectId = `subj-a4-${Date.now()}`;

	const leadArchitect: ActorInfo = {
		userId: 'alice-lead',
		role: 'lead_architect',
		productionMode: 'human-authored'
	};

	const securityExpert: ActorInfo = {
		userId: 'bob-sec',
		role: 'domain_expert',
		domains: ['security'],
		productionMode: 'human-authored'
	};

	const networkExpert: ActorInfo = {
		userId: 'charlie-net',
		role: 'domain_expert',
		domains: ['network'], // Pas dans security
		productionMode: 'human-authored'
	};

	let opt1Id: string;
	let opt2Id: string;
	let crit1Id: string;
	let crit2Id: string;
	let objectionArgId: string;

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('1. Initialise le projet, le sujet (sécurité) et un énoncé dérivé par IA', async () => {
		await createProject(
			{
				id: testProjectId,
				title: 'Projet Test Porte G3 Arbitrage',
				shortName: 'PTG3',
				badge: 'TEST',
				description: 'Vérification de la maturité calculée et de l’arbitrage'
			},
			leadArchitect
		);

		await createSubject(
			testProjectId,
			{
				id: testSubjectId,
				sectionRef: '§5.2',
				name: 'Module HSM & Gestion des Clés Maîtresses',
				domain: 'security',
				problemStatement: 'Choisir la topologie de stockage sécurisé des clés cryptographiques critiques.',
				maturityLevel: 'L0_named'
			},
			leadArchitect
		);

		// Énoncé dérivé par IA à promouvoir lors de l'arbitrage (Invariant II)
		await createStatement(
			testProjectId,
			{
				id: `stmt-test-a4-${Date.now()}`,
				subjectId: testSubjectId,
				section: '§5.2',
				subjectRef: 'HSM',
				predicate: 'is_deployed',
				value: 'true',
				basedOn: [],
				confidence: 'assumed',
				author: 'Verifier Agent',
				role: 'AI Assistant',
				productionMode: 'llm-derived'
			},
			leadArchitect
		);

		const ctx = await getSubjectArbitrationContext(testSubjectId);
		expect(ctx.maturityResult.level).toBe('L0_named');
		expect(ctx.maturityResult.readyForArbitration).toBe(false);
	});

	it('2. Crée les critères et options, mais bloque l’arbitrage si non évaluées (UNEVALUATED_OPTION)', async () => {
		const crit1 = await createCriterion(
			testSubjectId,
			{
				name: 'Niveau d’homologation FIPS 140-3',
				kind: 'compliance',
				weight: 5
			},
			leadArchitect
		);
		crit1Id = crit1.id;

		const crit2 = await createCriterion(
			testSubjectId,
			{
				name: 'Coût total d’acquisition (TCO)',
				kind: 'cost',
				weight: 3
			},
			leadArchitect
		);
		crit2Id = crit2.id;

		const opt1 = await createOption(
			testSubjectId,
			{
				title: 'HSM Dédié On-Premise',
				summary: 'Boîtiers matériels physiques redondés',
				origin: 'human'
			},
			leadArchitect
		);
		opt1Id = opt1.id;

		const opt2 = await createOption(
			testSubjectId,
			{
				title: 'Cloud KMS Managé Souverain',
				summary: 'Service KMS SecNumCloud qualifié',
				origin: 'llm-proposed'
			},
			leadArchitect
		);
		opt2Id = opt2.id;

		// Tentative d'arbitrage immédiat -> Doit échouer avec MaturityUnreadyError (options non évaluées)
		await expect(
			recordArbitrationDecision(
				testSubjectId,
				{
					retainedOptionId: opt1Id,
					rejected: [{ optionId: opt2Id, reason: 'Moins souverain' }],
					rationale: 'Arbitrage pour HSM physique dédié.',
					reversibility: 'costly'
				},
				leadArchitect
			)
		).rejects.toThrow(MaturityUnreadyError);
	});

	it('3. Refuse l’arbitrage (403) si l’expert n’est pas du bon domaine (RBAC / Casbin)', async () => {
		// charlie-net est expert network, or le sujet est security
		await expect(
			recordArbitrationDecision(
				testSubjectId,
				{
					retainedOptionId: opt1Id,
					rejected: [{ optionId: opt2Id, reason: 'Test' }],
					rationale: 'Tentative d’arbitrage par un expert réseau.',
					reversibility: 'costly'
				},
				networkExpert
			)
		).rejects.toThrow(UnauthorizedArbitrationError);
	});

	it('4. Bloque l’arbitrage s’il reste une objection ouverte ou une couverture incomplète', async () => {
		// Évaluations complètes sur tous les critères
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt1Id,
				criterionId: crit1Id,
				score: 2,
				justification: 'Certification FIPS 140-3 Level 4 garantie'
			},
			leadArchitect
		);
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt1Id,
				criterionId: crit2Id,
				score: -1,
				justification: 'CAPEX initial élevé'
			},
			leadArchitect
		);
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt2Id,
				criterionId: crit1Id,
				score: 1,
				justification: 'FIPS 140-3 Level 3'
			},
			leadArchitect
		);
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: opt2Id,
				criterionId: crit2Id,
				score: 2,
				justification: 'OPEX à l’usage compétitif'
			},
			leadArchitect
		);

		// Création d'une objection ouverte
		const objectionArg = await createArgument(
			testSubjectId,
			{
				optionId: opt2Id,
				stance: 'objection',
				claim: 'Dépendance au réseau externe pour les clés maîtresses',
				grounds: 'Risque de rupture de service en cas d’isolation réseau.',
				kbRefs: [],
				confidence: 'assumed',
				authorKind: 'agent:challenger'
			},
			{ userId: 'challenger-bot', role: 'AI Assistant', productionMode: 'llm-derived' }
		);
		objectionArgId = objectionArg.id;

		// Création d'un référentiel manquant dans le projet
		await prisma.projectFramework.create({
			data: {
				projectId: testProjectId,
				framework: 'ANSSI_RGS',
				coverageStatus: 'missing',
				coverageDetail: JSON.stringify({ missingClauses: ['RGS-CRYPTO-01'] })
			}
		});

		const ctx = await getSubjectArbitrationContext(testSubjectId);
		expect(ctx.maturityResult.level).toBe('L2_decomposed');
		expect(ctx.maturityResult.readyForArbitration).toBe(false);
		expect(ctx.maturityResult.blockers.some((b) => b.code === 'OPEN_OBJECTION')).toBe(true);
		expect(ctx.maturityResult.blockers.some((b) => b.code === 'COVERAGE_INCOMPLETE')).toBe(true);
	});

	it('5. Valide l’arbitrage opposable dès que les blocages sont levés par un expert du domaine', async () => {
		// 1. Lever l'objection (accepted_risk par l'expert sécurité)
		await resolveArgument(
			objectionArgId,
			{
				resolution: 'accepted_risk',
				expectedVersion: 1
			},
			securityExpert,
			true
		);

		// 2. Mettre à jour le référentiel en "covered"
		await prisma.projectFramework.update({
			where: {
				projectId_framework: {
					projectId: testProjectId,
					framework: 'ANSSI_RGS'
				}
			},
			data: { coverageStatus: 'covered' }
		});

		// Vérification de la maturité calculée
		const ctxReady = await getSubjectArbitrationContext(testSubjectId);
		expect(ctxReady.maturityResult.readyForArbitration).toBe(true);
		expect(ctxReady.maturityResult.blockers.length).toBe(0);

		// 3. Prononciation de l'arbitrage par l'expert sécurité
		const decision = await recordArbitrationDecision(
			testSubjectId,
			{
				retainedOptionId: opt1Id,
				rejected: [
					{
						optionId: opt2Id,
						reason: 'Risque de dépendance réseau jugé inacceptable pour les clés maîtresses racine.'
					}
				],
				rationale: 'Le HSM physique dédié garantit l’étanchéité absolue et la souveraineté complète des clés.',
				reversibility: 'costly',
				acceptedViolations: []
			},
			securityExpert
		);

		expect(decision).toBeDefined();
		expect(decision.retainedOptionId).toBe(opt1Id);
		expect(decision.arbiterId).toBe(securityExpert.userId);

		// 4. Vérification de la mise à jour du sujet
		const updatedSubject = await prisma.subject.findUnique({ where: { id: testSubjectId } });
		expect(updatedSubject?.maturityLevel).toBe('L3_decided');
		expect(updatedSubject?.deliberationStatus).toBe('arbitrated');

		// 5. Invariant II : Vérification de la promotion de l'énoncé dérivé par IA
		const promotedStatement = await prisma.statement.findFirst({
			where: { subjectId: testSubjectId }
		});
		expect(promotedStatement?.productionMode).toBe('llm-proposed-human-approved');
		expect(promotedStatement?.subjectLevel).toBe('L3_decided');

		// 6. Vérification de l'enregistrement de l'événement de domaine
		const event = await prisma.domainEvent.findFirst({
			where: {
				projectId: testProjectId,
				entityId: testSubjectId,
				type: 'ARBITRATED'
			}
		});
		expect(event).toBeDefined();
		expect(event?.actorId).toBe(securityExpert.userId);
	});
});
