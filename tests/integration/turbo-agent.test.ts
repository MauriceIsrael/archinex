import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { llmopsClient } from '$lib/server/llmops/client';
import {
	createProject,
	createSubject,
	type ActorInfo
} from '$lib/server/projects/projectsDb';
import {
	createCriterion,
	createOption,
	upsertEvaluation
} from '$lib/server/projects/optionsDb';
import {
	selectRecommendedOption,
	runTurboModeForProject
} from '$lib/server/turbo/turboAgent';
import type { Criterion, Option, OptionEvaluation } from '$lib/domain/options';

describe('Turbo Mode Agent: L3 -> L4 -> EDP automation', () => {
	const testProjectId = `test-turbo-${Date.now()}`;
	const actor: ActorInfo = {
		userId: 'turbo-test-lead',
		role: 'lead_architect',
		productionMode: 'human-authored'
	};

	const makeOption = (id: string, status: Option['status'] = 'proposed'): Option => ({
		id,
		subjectId: 's1',
		title: `Option ${id}`,
		summary: 'Summary',
		origin: 'human',
		kbRefs: [],
		status,
		author: 'u1',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	});

	beforeAll(async () => {
		vi.spyOn(llmopsClient, 'checkOption').mockResolvedValue({ verdicts: [], offline: false } as never);
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	afterAll(async () => {
		vi.restoreAllMocks();
		await prisma.project.deleteMany({ where: { id: testProjectId } });
	});

	it('selectRecommendedOption picks highest weighted score, then retained, then first option', () => {
		const optA = makeOption('opt-a');
		const optB = makeOption('opt-b', 'retained');
		const criteria: Criterion[] = [
			{
				id: 'c1',
				subjectId: 's1',
				name: 'Security',
				description: '',
				kind: 'compliance',
				weight: 5,
				author: 'u1',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			}
		];
		const evaluations: OptionEvaluation[] = [
			{
				id: 'e1',
				optionId: 'opt-a',
				criterionId: 'c1',
				score: 2,
				justification: 'Best',
				evidenceRefs: [],
				author: 'u1',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			},
			{
				id: 'e2',
				optionId: 'opt-b',
				criterionId: 'c1',
				score: 1,
				justification: 'Lower',
				evidenceRefs: [],
				author: 'u1',
				role: 'lead_architect',
				productionMode: 'human-authored',
				version: 1
			}
		];

		const byScore = selectRecommendedOption([optA, optB], criteria, evaluations);
		expect(byScore?.option.id).toBe('opt-a');
		expect(byScore?.method).toBe('weighted_score');

		const byRetained = selectRecommendedOption([optA, optB], criteria, []);
		expect(byRetained?.option.id).toBe('opt-b');
		expect(byRetained?.method).toBe('retained_status');

		const byFirst = selectRecommendedOption([makeOption('opt-x'), makeOption('opt-y')], [], []);
		expect(byFirst?.option.id).toBe('opt-x');
		expect(byFirst?.method).toBe('first_option');

		expect(selectRecommendedOption([], criteria, evaluations)).toBeNull();
	});

	it('transitions L1 subjects to L4_specified with EDP synthesis and preserves dry-run', async () => {
		await createProject(
			{
				id: testProjectId,
				title: 'Projet Test Turbo Mode',
				shortName: 'TRBO',
				badge: 'TEST',
				description: 'Validation automatisée du mode Turbo'
			},
			actor
		);

		const subj1 = await createSubject(
			testProjectId,
			{
				id: `${testProjectId}-s1`,
				sectionRef: 'SEC-1',
				name: 'Passerelle réseau cœur',
				domain: 'network',
				problemStatement: 'Interconnecter les zones sécurisées'
			},
			actor
		);

		const crit = await createCriterion(
			subj1.id,
			{ name: 'Résilience', kind: 'nfr', weight: 5 },
			actor
		);
		const opt1 = await createOption(
			subj1.id,
			{ title: 'Architecture redondée 2N', summary: 'Double adduction active/active' },
			actor
		);
		const opt2 = await createOption(
			subj1.id,
			{ title: 'Architecture simple', summary: 'Lien unique' },
			actor
		);
		await upsertEvaluation(
			subj1.id,
			{ optionId: opt1.id, criterionId: crit.id, score: 2, justification: 'Optimal' },
			actor
		);
		await upsertEvaluation(
			subj1.id,
			{ optionId: opt2.id, criterionId: crit.id, score: -1, justification: 'Risqué' },
			actor
		);

		const subj2 = await createSubject(
			testProjectId,
			{
				id: `${testProjectId}-s2`,
				sectionRef: 'SEC-2',
				name: 'Sujet nu sans option',
				domain: 'security',
				problemStatement: 'Durcissement minimal'
			},
			actor
		);

		// 1. Dry-run ne doit pas modifier la base
		const dryReport = await runTurboModeForProject({
			projectId: testProjectId,
			dryRun: true,
			skipNautobot: true
		});
		expect(dryReport.totalSubjects).toBe(2);
		expect(dryReport.l4SpecifiedCount).toBe(2);
		const afterDry = await prisma.subject.findUnique({ where: { id: subj1.id } });
		expect(afterDry?.maturityLevel).toBe('L0_named');

		// 2. Exécution réelle
		const report = await runTurboModeForProject({
			projectId: testProjectId,
			skipNautobot: true
		});

		expect(report.errorsCount).toBe(0);
		expect(report.l3DecidedCount).toBe(2);
		expect(report.l4SpecifiedCount).toBe(2);
		expect(report.edpSynthesizedCount).toBe(2);

		const s1Report = report.subjects.find((s) => s.subjectId === subj1.id);
		expect(s1Report?.retainedOptionId).toBe(opt1.id);
		expect(s1Report?.selectionMethod).toBe('weighted_score');
		expect(s1Report?.finalLevel).toBe('L4_specified');

		const s2Report = report.subjects.find((s) => s.subjectId === subj2.id);
		expect(s2Report?.selectionMethod).toBe('synthesized_default');
		expect(s2Report?.finalLevel).toBe('L4_specified');

		const dbDecision = await prisma.decision.findUnique({ where: { subjectId: subj1.id } });
		expect(dbDecision?.retainedOptionId).toBe(opt1.id);
		expect(dbDecision?.rationale).toContain('[TURBO-AUTO]');
	});
});
