import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import {
	createProject,
	createSubject,
	ConcurrencyConflictError,
	type ActorInfo
} from '$lib/server/projects/projectsDb';
import {
	createCriterion,
	updateCriterion,
	listCriteria,
	createOption,
	updateOption,
	listOptions,
	upsertEvaluation,
	listEvaluations,
	createTradeOff,
	recordDecision,
	getDecision
} from '$lib/server/projects/optionsDb';
import { weightedScore } from '$lib/domain/options';

describe('Lot A2 Integration: Options, Criteria, Matrix & Decision', () => {
	const testProjectId = `test-a2-options-${Date.now()}`;
	const testSubjectId = `subj-a2-${Date.now()}`;
	const leadArchitect: ActorInfo = { userId: 'alice-architect', role: 'lead_architect' };
	const domainExpert: ActorInfo = { userId: 'bob-expert', role: 'domain_expert' };

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('1. Crée un projet et un sujet de test', async () => {
		const project = await createProject(
			{
				id: testProjectId,
				title: 'Projet Test Options A2',
				shortName: 'PTO2',
				badge: 'TEST',
				description: 'Validation de la matrice d\'options'
			},
			leadArchitect
		);
		expect(project.id).toBe(testProjectId);

		const subject = await createSubject(
			testProjectId,
			{
				id: testSubjectId,
				sectionRef: '§3.2',
				name: 'Cœur de Réseau & Tranches 5G',
				domain: 'telecom',
				maturityLevel: 'L1_framed'
			},
			leadArchitect
		);
		expect(subject.id).toBe(testSubjectId);
		expect(subject.maturityLevel).toBe('L1_framed');
	});

	it('2. Crée au moins 3 critères avec pondérations et catégories variées', async () => {
		const c1 = await createCriterion(
			testSubjectId,
			{
				id: `crit-latence-${Date.now()}`,
				name: 'Latence au 99e percentile',
				description: '< 10ms bout en bout',
				kind: 'nfr',
				weight: 5
			},
			leadArchitect
		);
		expect(c1.weight).toBe(5);
		expect(c1.version).toBe(1);

		const c2 = await createCriterion(
			testSubjectId,
			{
				id: `crit-cout-${Date.now()}`,
				name: 'Coût CAPEX initial',
				description: 'Budget matériel & licences',
				kind: 'cost',
				weight: 3
			},
			leadArchitect
		);
		expect(c2.kind).toBe('cost');

		const c3 = await createCriterion(
			testSubjectId,
			{
				id: `crit-souv-${Date.now()}`,
				name: 'Souveraineté des composants',
				description: 'Conformité SecNumCloud / ANSSI',
				kind: 'compliance',
				weight: 4
			},
			leadArchitect
		);
		expect(c3.weight).toBe(4);

		const criteria = await listCriteria(testSubjectId);
		expect(criteria.length).toBe(3);
	});

	it('3. Crée 3 options d\'architecture en compétition', async () => {
		const opt1 = await createOption(
			testSubjectId,
			{
				id: `opt-1-${Date.now()}`,
				title: 'Option A (Passerelle Physique Dédiée)',
				summary: 'Boîtiers matériels appliance sécurisés sur site',
				origin: 'human'
			},
			leadArchitect
		);
		expect(opt1.version).toBe(1);

		const opt2 = await createOption(
			testSubjectId,
			{
				id: `opt-2-${Date.now()}`,
				title: 'Option B (Service Mesh eBPF Cilium)',
				summary: 'Routage dynamique en noyau Linux sans appliance physique',
				origin: 'llm-proposed'
			},
			domainExpert
		);
		expect(opt2.origin).toBe('llm-proposed');

		const opt3 = await createOption(
			testSubjectId,
			{
				id: `opt-3-${Date.now()}`,
				title: 'Option C (Solution Hybride Cloud SecNumCloud)',
				summary: 'Plan de contrôle déporté en région souveraine',
				origin: 'kb-pattern'
			},
			leadArchitect
		);
		expect(opt3.status).toBe('proposed');

		const options = await listOptions(testSubjectId);
		expect(options.length).toBe(3);
	});

	it('4. Rejette impérativement toute évaluation sans justification textuelle (Invariant de rigueur)', async () => {
		const criteria = await listCriteria(testSubjectId);
		const options = await listOptions(testSubjectId);

		await expect(
			upsertEvaluation(
				testSubjectId,
				{
					optionId: options[0].id,
					criterionId: criteria[0].id,
					score: 1,
					justification: '   ' // Vide
				},
				leadArchitect
			)
		).rejects.toThrow(/justification/i);
	});

	it('5. Enregistre des évaluations valides et calcule le score pondéré indicatif', async () => {
		const criteria = await listCriteria(testSubjectId);
		const options = await listOptions(testSubjectId);

		// Évaluations pour Option 1 (Appliance) : Forte latence (+2, w=5), Mauvais coût (-1, w=3), Bonne souveraineté (+1, w=4)
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: options[0].id,
				criterionId: criteria[0].id,
				score: 2,
				justification: 'Matériel ASIC haute cadence certifié < 5ms'
			},
			leadArchitect
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: options[0].id,
				criterionId: criteria[1].id,
				score: -1,
				justification: 'Coût d acquisition lourd +120 k€'
			},
			leadArchitect
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: options[0].id,
				criterionId: criteria[2].id,
				score: 1,
				justification: 'Constructeur européen qualifié ANSSI'
			},
			leadArchitect
		);

		// Évaluations pour Option 2 (eBPF) : Latence moyenne (+1, w=5), Excellent coût (+2, w=3), Souveraineté moyenne (0, w=4)
		await upsertEvaluation(
			testSubjectId,
			{
				optionId: options[1].id,
				criterionId: criteria[0].id,
				score: 1,
				justification: 'Overhead logiciel minimal en noyau'
			},
			domainExpert
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: options[1].id,
				criterionId: criteria[1].id,
				score: 2,
				justification: '0 matériel additionnel, pur logiciel open source'
			},
			domainExpert
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: options[1].id,
				criterionId: criteria[2].id,
				score: 0,
				justification: 'Dépendance kernel Linux standard'
			},
			domainExpert
		);

		const allEvaluations = await listEvaluations(testSubjectId);
		expect(allEvaluations.length).toBe(6);

		// Vérification du calcul de score pondéré
		// Opt 1: (2*5 + (-1)*3 + 1*4) / (5 + 3 + 4) = (10 - 3 + 4) / 12 = 11 / 12 = 0.9166...
		const scoreOpt1 = weightedScore(options[0].id, criteria, allEvaluations);
		expect(scoreOpt1).toBeCloseTo(11 / 12, 2);

		// Opt 2: (1*5 + 2*3 + 0*4) / 12 = (5 + 6 + 0) / 12 = 11 / 12 = 0.9166...
		const scoreOpt2 = weightedScore(options[1].id, criteria, allEvaluations);
		expect(scoreOpt2).toBeCloseTo(11 / 12, 2);
	});

	it('6. Documente les compromis (Trade-offs) pour les options', async () => {
		const options = await listOptions(testSubjectId);

		const to1 = await createTradeOff(
			testSubjectId,
			{
				id: `to-1-${Date.now()}`,
				optionId: options[0].id,
				gains: 'Garantie déterministe de latence matérielle',
				sacrifices: 'Surcoût budgétaire initial et rigidité d évolution'
			},
			leadArchitect
		);
		expect(to1.gains).toContain('Garantie déterministe');

		const to2 = await createTradeOff(
			testSubjectId,
			{
				id: `to-2-${Date.now()}`,
				optionId: options[1].id,
				gains: 'Agilité de déploiement et économie CAPEX',
				sacrifices: 'Nécessite montée en compétence sur l ordonnancement eBPF'
			},
			domainExpert
		);
		expect(to2.sacrifices).toContain('eBPF');
	});

	it('7. Protège contre les conflits de concurrence (optimistic locking 409)', async () => {
		const criteria = await listCriteria(testSubjectId);
		const targetCrit = criteria[0];

		// Tentative de modification avec version obsolète
		await expect(
			updateCriterion(
				targetCrit.id,
				{
					expectedVersion: targetCrit.version + 99,
					name: 'Nom frauduleux'
				},
				leadArchitect
			)
		).rejects.toThrow(ConcurrencyConflictError);
	});

	it('8. Enregistre formellement l\'arbitrage humain L3 par le Lead Architect', async () => {
		const options = await listOptions(testSubjectId);
		const retained = options[1]; // Choix d'Option B eBPF

		const dec = await recordDecision(
			testSubjectId,
			{
				id: `dec-${Date.now()}`,
				retainedOptionId: retained.id,
				rationale: 'L option eBPF permet d atteindre les objectifs de coût tout en préservant une latence conforme après benchmark.',
				reversibility: 'reversible',
				rejected: [
					{ optionId: options[0].id, reason: 'Coût CAPEX excessif non budgété' },
					{ optionId: options[2].id, reason: 'Dépendance cloud externe non souhaitée' }
				]
			},
			leadArchitect
		);

		expect(dec.retainedOptionId).toBe(retained.id);
		expect(dec.arbiterRole).toBe('lead_architect');

		// Vérification que le sujet a été promu en L3_decided
		const updatedSubject = await prisma.subject.findUnique({ where: { id: testSubjectId } });
		expect(updatedSubject?.maturityLevel).toBe('L3_decided');

		// Vérification de la lecture de la décision
		const storedDec = await getDecision(testSubjectId);
		expect(storedDec?.retainedOptionId).toBe(retained.id);
		expect(storedDec?.rejected.length).toBe(2);
	});

	it('9. Vérifie la traçabilité des événements de domaine (Audit & Replay)', async () => {
		const events = await prisma.domainEvent.findMany({
			where: { projectId: testProjectId },
			orderBy: { createdAt: 'asc' }
		});

		const types = events.map((e) => e.type);
		expect(types).toContain('CRITERION_CREATED');
		expect(types).toContain('OPTION_CREATED');
		expect(types).toContain('EVALUATION_RECORDED');
		expect(types).toContain('TRADEOFF_CREATED');
		expect(types).toContain('DECISION_RECORDED');
	});
});
