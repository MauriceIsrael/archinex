import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
	computeMaturity,
	coverageWarnings,
	type FrameworkCoverageStatus,
	type MaturityComputationInput
} from '$lib/domain/maturityRules';
import type { Criterion, Option, OptionEvaluation } from '$lib/domain/options';
import type { Argument, ArgumentResolution, Stance } from '$lib/domain/debate';

function makeCriterion(idx: number): Criterion {
	return {
		id: `crit-${idx}`,
		subjectId: 'subj-1',
		name: `Critère ${idx}`,
		description: `Description ${idx}`,
		kind: 'nfr',
		weight: 3,
		author: 'architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};
}

function makeOption(idx: number): Option {
	return {
		id: `opt-${idx}`,
		subjectId: 'subj-1',
		title: `Option ${idx}`,
		summary: `Résumé ${idx}`,
		origin: 'human',
		kbRefs: [],
		status: 'proposed',
		author: 'architect',
		role: 'lead_architect',
		productionMode: 'human-authored',
		version: 1
	};
}

function makeEval(optionId: string, criterionId: string, justification: string): OptionEvaluation {
	return {
		optionId,
		criterionId,
		score: 1,
		justification,
		evidenceRefs: [],
		author: 'architect',
		role: 'lead_architect',
		productionMode: 'human-authored'
	};
}

function makeArgument(
	id: string,
	stance: Stance,
	resolution: ArgumentResolution,
	claim: string,
	kbRefs: string[] = []
): Argument {
	return {
		id,
		subjectId: 'subj-1',
		stance,
		claim,
		grounds: 'Fondement factuel',
		kbRefs,
		confidence: 'designed',
		author: 'expert',
		authorKind: 'human',
		productionMode: 'human-authored',
		round: 1,
		resolution,
		version: 1
	};
}

const frameworkStatusArb: fc.Arbitrary<FrameworkCoverageStatus> = fc.record({
	frameworkId: fc.stringMatching(/^FW-[0-9]{1,3}$/),
	name: fc.string({ minLength: 1, maxLength: 20 }),
	status: fc.constantFrom('covered', 'partial', 'missing', 'unknown') as fc.Arbitrary<
		FrameworkCoverageStatus['status']
	>,
	validatedCount: fc.integer({ min: 0, max: 10 }),
	expectedCount: fc.integer({ min: 1, max: 10 })
});

describe('Propriétés — computeMaturity (fast-check)', () => {
	it('invariant fondamental : readyForArbitration === true implique level === L2_decomposed et blockers vide', () => {
		const inputArb = fc
			.record({
				hasProblem: fc.boolean(),
				criteriaCount: fc.integer({ min: 0, max: 4 }),
				optionsCount: fc.integer({ min: 0, max: 4 }),
				singleRationale: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
				allEvaluated: fc.boolean(),
				openObjections: fc.integer({ min: 0, max: 2 }),
				frameworks: fc.array(frameworkStatusArb, { maxLength: 5 })
			})
			.map((cfg): MaturityComputationInput => {
				const criteria = Array.from({ length: cfg.criteriaCount }, (_, i) => makeCriterion(i));
				const options = Array.from({ length: cfg.optionsCount }, (_, i) => makeOption(i));
				const evaluations: OptionEvaluation[] = [];
				if (cfg.allEvaluated) {
					for (const o of options) {
						for (const c of criteria) {
							evaluations.push(makeEval(o.id, c.id, 'Justification complète'));
						}
					}
				}
				const args: Argument[] = Array.from({ length: cfg.openObjections }, (_, i) =>
					makeArgument(`obj-${i}`, 'objection', 'open', `Objection ${i}`)
				);
				return {
					subject: {
						id: 'subj-1',
						name: 'Sujet générique',
						problemStatement: cfg.hasProblem ? 'Problème formalisé' : '',
						singleOptionRationale: cfg.singleRationale
					},
					criteria,
					options,
					evaluations,
					arguments: args,
					requiredFrameworks: cfg.frameworks
				};
			});

		fc.assert(
			fc.property(inputArb, (input) => {
				const res = computeMaturity(input);

				if (res.readyForArbitration) {
					expect(res.level).toBe('L2_decomposed');
					expect(res.blockers).toHaveLength(0);
				}

				if (res.level === 'L2_decomposed' && res.blockers.length === 0) {
					expect(res.readyForArbitration).toBe(true);
				}

				// Sans énoncé de problème, jamais au-dessus de L0_named
				if (!input.subject.problemStatement?.trim()) {
					expect(res.level).toBe('L0_named');
					expect(res.blockers.some((b) => b.code === 'MISSING_PROBLEM_STATEMENT')).toBe(true);
				}

				// Les warnings de couverture ne bloquent jamais l'arbitrage
				const expectedWarnings = (input.requiredFrameworks ?? []).filter(
					(fw) => fw.status !== 'covered'
				).length;
				expect(res.warnings).toHaveLength(expectedWarnings);
			}),
			{ numRuns: 150 }
		);
	});

	it('un sujet scellé (L5_archived) reste toujours L5_archived et jamais readyForArbitration', () => {
		fc.assert(
			fc.property(fc.boolean(), fc.array(frameworkStatusArb, { maxLength: 4 }), (allowRevision, frameworks) => {
				const res = computeMaturity({
					subject: {
						id: 'subj-sealed',
						name: 'Sujet scellé',
						problemStatement: 'Problème',
						maturityLevel: 'L5_archived'
					},
					criteria: [makeCriterion(0), makeCriterion(1)],
					options: [makeOption(0), makeOption(1)],
					evaluations: [
						makeEval('opt-0', 'crit-0', 'ok'),
						makeEval('opt-0', 'crit-1', 'ok'),
						makeEval('opt-1', 'crit-0', 'ok'),
						makeEval('opt-1', 'crit-1', 'ok')
					],
					arguments: [],
					requiredFrameworks: frameworks,
					allowRevision
				});

				expect(res.level).toBe('L5_archived');
				expect(res.readyForArbitration).toBe(false);
				if (allowRevision) {
					expect(res.blockers.some((b) => b.code === 'SEALED_SUBJECT')).toBe(true);
				} else {
					expect(res.blockers).toHaveLength(0);
				}
			}),
			{ numRuns: 60 }
		);
	});

	it('monotonie : ajouter une objection ouverte à un sujet prêt empêche toujours readyForArbitration', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2, max: 4 }),
				fc.integer({ min: 2, max: 4 }),
				fc.string({ minLength: 1, maxLength: 40 }),
				(criteriaCount, optionsCount, claim) => {
					const criteria = Array.from({ length: criteriaCount }, (_, i) => makeCriterion(i));
					const options = Array.from({ length: optionsCount }, (_, i) => makeOption(i));
					const evaluations = options.flatMap((o) =>
						criteria.map((c) => makeEval(o.id, c.id, 'Évaluation justifiée'))
					);

					const ready = computeMaturity({
						subject: { id: 's', name: 'S', problemStatement: 'Énoncé clair' },
						criteria,
						options,
						evaluations,
						arguments: []
					});
					expect(ready.readyForArbitration).toBe(true);

					const blocked = computeMaturity({
						subject: { id: 's', name: 'S', problemStatement: 'Énoncé clair' },
						criteria,
						options,
						evaluations,
						arguments: [makeArgument('arg-obj', 'objection', 'open', claim)]
					});
					expect(blocked.readyForArbitration).toBe(false);
					expect(blocked.blockers.some((b) => b.code === 'OPEN_OBJECTION')).toBe(true);
				}
			),
			{ numRuns: 80 }
		);
	});

	it('coverageWarnings retourne exactement une alerte par référentiel non couvert', () => {
		fc.assert(
			fc.property(fc.array(frameworkStatusArb, { maxLength: 12 }), (frameworks) => {
				const warnings = coverageWarnings(frameworks);
				const nonCovered = frameworks.filter((f) => f.status !== 'covered');
				expect(warnings).toHaveLength(nonCovered.length);
				expect(warnings.every((w) => w.code === 'COVERAGE_INCOMPLETE')).toBe(true);
			}),
			{ numRuns: 100 }
		);
	});
});
