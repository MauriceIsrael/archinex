import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { createProject, createSubject, type ActorInfo } from '$lib/server/projects/projectsDb';
import { createCriterion, createOption, upsertEvaluation, recordDecision } from '$lib/server/projects/optionsDb';
import {
	computeTopFrugalityOpportunities,
	type SubjectMatrixInput
} from '$lib/domain/frugalityScoring';

describe('Integration: Frugality Opportunities Top 5', () => {
	const testProjectId = `test-frugality-${Date.now()}`;
	const testSubjectId = `subj-frugality-${Date.now()}`;
	const leadArchitect: ActorInfo = { userId: 'alice-architect', role: 'lead_architect' };

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('1. Crée un projet et un sujet avec des critères et options contrastées', async () => {
		await createProject(
			{
				id: testProjectId,
				title: 'Projet Test Frugalité',
				shortName: 'PTF',
				badge: 'TEST',
				description: 'Validation du top 5 de frugalité'
			},
			leadArchitect
		);

		await createSubject(
			testProjectId,
			{
				id: testSubjectId,
				sectionRef: '§3.4',
				name: 'Stockage & Archivage',
				domain: 'infrastructure',
				maturityLevel: 'L1_framed'
			},
			leadArchitect
		);

		const cCost = await createCriterion(
			testSubjectId,
			{
				id: `crit-cost-${Date.now()}`,
				name: 'Coût mensuel estimé',
				description: 'Budget d exploitation mensuel',
				kind: 'cost',
				weight: 4
			},
			leadArchitect
		);

		const cPerf = await createCriterion(
			testSubjectId,
			{
				id: `crit-perf-${Date.now()}`,
				name: 'Latence d accès',
				description: 'Temps d accès aux données',
				kind: 'nfr',
				weight: 3
			},
			leadArchitect
		);

		const optFrugal = await createOption(
			testSubjectId,
			{
				title: 'S3 Standard + Glacier',
				summary: 'Stockage étagé avec règles de cycle de vie',
				origin: 'llm-proposed'
			},
			leadArchitect
		);

		const optRef = await createOption(
			testSubjectId,
			{
				title: 'Multi-Cloud Actif-Actif',
				summary: 'Double réplication synchrone en temps réel',
				origin: 'human'
			},
			leadArchitect
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: optFrugal.id,
				criterionId: cCost.id,
				score: 2,
				justification: 'Stockage froid 80% moins cher sur Glacier'
			},
			leadArchitect
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: optFrugal.id,
				criterionId: cPerf.id,
				score: 1,
				justification: 'Latence acceptable pour les archives froides'
			},
			leadArchitect
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: optRef.id,
				criterionId: cCost.id,
				score: -1,
				justification: 'Surcoût bande passante et stockage doublé'
			},
			leadArchitect
		);

		await upsertEvaluation(
			testSubjectId,
			{
				optionId: optRef.id,
				criterionId: cPerf.id,
				score: 2,
				justification: 'Accès instantané multi-région'
			},
			leadArchitect
		);

		// Extraction depuis la base Prisma
		const subjects = await prisma.subject.findMany({
			where: { projectId: testProjectId },
			include: {
				criteria: true,
				options: {
					include: { evaluations: true }
				},
				decision: true
			}
		});

		const matrixInputs: SubjectMatrixInput[] = subjects.map((s) => ({
			id: s.id,
			name: s.name,
			sectionRef: s.sectionRef,
			criteria: s.criteria.map((c) => ({
				id: c.id,
				name: c.name,
				kind: c.kind,
				weight: c.weight,
				description: c.description
			})),
			options: s.options.map((o) => ({
				id: o.id,
				title: o.title,
				summary: o.summary,
				evaluations: o.evaluations.map((e) => ({
					criterionId: e.criterionId,
					score: e.score,
					justification: e.justification
				}))
			})),
			decision: s.decision ? { retainedOptionId: s.decision.retainedOptionId } : null
		}));

		const opportunities = computeTopFrugalityOpportunities(matrixInputs, 5);
		expect(opportunities.length).toBe(1);
		expect(opportunities[0].subjectId).toBe(testSubjectId);
		expect(opportunities[0].frugalOption.id).toBe(optFrugal.id);
		expect(opportunities[0].referenceOption.id).toBe(optRef.id);
		expect(opportunities[0].costDelta).toBe(3); // 2 - (-1)
		expect(opportunities[0].techDelta).toBe(1); // 2 - 1 = 1
		expect(opportunities[0].verdict).toBe('acceptable-tradeoff');
		expect(opportunities[0].decisionStatus).toBe('open');
		expect(opportunities[0].keyAdvantage).toContain('Glacier');
	});

	it('2. Reflète la décision lorsque le Lead Architect retient l option frugale', async () => {
		const subjects = await prisma.subject.findMany({
			where: { projectId: testProjectId },
			include: { options: true }
		});
		const optFrugal = subjects[0].options.find((o) => o.title.includes('Glacier'))!;

		await recordDecision(
			testSubjectId,
			{
				retainedOptionId: optFrugal.id,
				rejected: [],
				rationale: 'Frugalité validée pour maîtriser l enveloppe budgétaire',
				reversibility: 'reversible'
			},
			leadArchitect
		);

		const updatedSubjects = await prisma.subject.findMany({
			where: { projectId: testProjectId },
			include: {
				criteria: true,
				options: {
					include: { evaluations: true }
				},
				decision: true
			}
		});

		const matrixInputs: SubjectMatrixInput[] = updatedSubjects.map((s) => ({
			id: s.id,
			name: s.name,
			sectionRef: s.sectionRef,
			criteria: s.criteria.map((c) => ({
				id: c.id,
				name: c.name,
				kind: c.kind,
				weight: c.weight,
				description: c.description
			})),
			options: s.options.map((o) => ({
				id: o.id,
				title: o.title,
				summary: o.summary,
				evaluations: o.evaluations.map((e) => ({
					criterionId: e.criterionId,
					score: e.score,
					justification: e.justification
				}))
			})),
			decision: s.decision ? { retainedOptionId: s.decision.retainedOptionId } : null
		}));

		const opportunities = computeTopFrugalityOpportunities(matrixInputs, 5);
		expect(opportunities.length).toBe(1);
		expect(opportunities[0].decisionStatus).toBe('retained_frugal');
	});
});
