import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { computeAuditMetrics, type AuditReference, type EvalRequirement } from '$lib/domain/requirementsAuditEval';

const reference = JSON.parse(
	fs.readFileSync(path.resolve(process.cwd(), 'examples/lumicc-noc/reference-analysis.json'), 'utf-8')
) as AuditReference;

const allRefs = [...new Set(reference.hardPoints.flatMap((h) => h.coveredClauseRefs))];
const clarifyRefs = reference.clarifications.flatMap((c) => c.clauseRefs);

function requirementsFor(override: Record<string, EvalRequirement['disposition']> = {}): EvalRequirement[] {
	const refs = [...new Set([...allRefs, ...clarifyRefs, 'REQ-X-1', 'REQ-X-2'])];
	return refs.map((clauseRef) => ({
		clauseRef,
		criticality: 'majeur',
		disposition:
			override[clauseRef] ??
			(clarifyRefs.includes(clauseRef) ? 'clarification_needed' : allRefs.includes(clauseRef) ? 'deliberated' : 'evacuated')
	}));
}

describe('Métriques d\'évaluation de l\'audit des exigences', () => {
	it('analyse de référence : 4 points durs, 32 clauses à délibérer', () => {
		expect(reference.hardPoints).toHaveLength(4);
		expect(allRefs).toHaveLength(32);
	});

	it('un pipeline parfait obtient rappel 100 % et intégrité OK', () => {
		const subjects = reference.hardPoints.map((h, i) => ({ id: `S${i}`, name: h.name, coveredClauseRefs: h.coveredClauseRefs }));
		const m = computeAuditMetrics(requirementsFor(), subjects, reference);
		expect(m.deliberateRecall).toBe(1);
		expect(m.clarificationRecall).toBe(1);
		expect(m.dangerousFalseNegatives).toEqual([]);
		expect(m.integrityOk).toBe(true);
		expect(m.hardPointMatches.every((x) => x.recall === 1 && x.precision === 1)).toBe(true);
	});

	it('une clause à délibérer évacuée est un faux négatif dangereux : l\'intégrité échoue', () => {
		const victim = allRefs[0];
		const m = computeAuditMetrics(requirementsFor({ [victim]: 'evacuated' }), [], reference);
		expect(m.dangerousFalseNegatives).toEqual([victim]);
		expect(m.integrityOk).toBe(false);
		expect(m.deliberateRecall).toBeLessThan(1);
	});

	it('une clause laissée « à qualifier » réduit le rappel mais ne casse pas l\'intégrité', () => {
		const m = computeAuditMetrics(requirementsFor({ [allRefs[0]]: 'to_qualify' }), [], reference);
		expect(m.referenceLeftToQualify).toEqual([allRefs[0]]);
		expect(m.dangerousFalseNegatives).toEqual([]);
		expect(m.integrityOk).toBe(true);
	});

	it('une évacuation de clause bloquante casse l\'intégrité même hors référence', () => {
		const reqs = requirementsFor();
		reqs.find((r) => r.clauseRef === 'REQ-X-1')!.criticality = 'bloquant';
		expect(computeAuditMetrics(reqs, [], reference).integrityOk).toBe(false);
	});

	it('apparie chaque point dur au sujet généré qui en recouvre le plus', () => {
		const hp = reference.hardPoints[0];
		const half = hp.coveredClauseRefs.slice(0, Math.ceil(hp.coveredClauseRefs.length / 2));
		const m = computeAuditMetrics(requirementsFor(), [{ id: 'SUBJ-01', name: 'Moitié', coveredClauseRefs: [...half, 'REQ-X-1'] }], reference);
		const match = m.hardPointMatches.find((x) => x.referenceId === hp.id)!;
		expect(match.bestSubjectId).toBe('SUBJ-01');
		expect(match.recall).toBeCloseTo(half.length / hp.coveredClauseRefs.length);
		expect(match.precision).toBeCloseTo(half.length / (half.length + 1));
	});
});
