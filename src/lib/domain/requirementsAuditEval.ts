/**
 * Métriques d'évaluation de l'audit des exigences contre une analyse de référence rédigée par un architecte.
 * Fonctions pures : aucune dépendance au LLM, testables hors ligne.
 *
 * L'indicateur critique est le « faux négatif dangereux » : une clause que l'expert juge à délibérer
 * et que le pipeline a évacuée comme commodité. Il doit rester à zéro.
 */

import type { FactorizedArchitecturalSubject } from './factorization';

export interface AuditReferenceHardPoint {
	id: string;
	name: string;
	coveredClauseRefs: string[];
}

export interface AuditReference {
	hardPoints: AuditReferenceHardPoint[];
	clarifications: Array<{ clauseRefs: string[]; question: string }>;
}

export interface EvalRequirement {
	clauseRef: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	disposition: 'deliberated' | 'evacuated' | 'clarification_needed' | 'to_qualify';
}

export interface HardPointMatch {
	referenceId: string;
	referenceName: string;
	referenceClauseCount: number;
	bestSubjectId: string | null;
	bestSubjectName: string | null;
	/** Part des clauses de référence retrouvées dans le meilleur sujet généré. */
	recall: number;
	/** Part des clauses du meilleur sujet qui appartiennent bien au point dur de référence. */
	precision: number;
}

export interface AuditMetrics {
	totalClauses: number;
	counts: Record<EvalRequirement['disposition'], number>;
	evacuationRate: number;
	toQualifyRate: number;
	/** Clauses de référence à délibérer, classées « à délibérer » par le pipeline. */
	deliberateRecall: number;
	/** Clauses de référence à délibérer mais ÉVACUÉES : doit être vide. */
	dangerousFalseNegatives: string[];
	/** Clauses de référence à délibérer laissées « à qualifier » (prudent mais coûteux en temps humain). */
	referenceLeftToQualify: string[];
	clarificationRecall: number;
	hardPointMatches: HardPointMatch[];
	/** Verdict d'intégrité : aucun faux négatif dangereux et aucune évacuation de clause bloquante. */
	integrityOk: boolean;
}

const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

export function computeAuditMetrics(
	requirements: EvalRequirement[],
	subjects: Pick<FactorizedArchitecturalSubject, 'id' | 'name' | 'coveredClauseRefs'>[],
	reference: AuditReference
): AuditMetrics {
	const byRef = new Map(requirements.map((r) => [r.clauseRef, r]));
	const counts = { deliberated: 0, evacuated: 0, clarification_needed: 0, to_qualify: 0 } as AuditMetrics['counts'];
	for (const r of requirements) counts[r.disposition]++;

	const refDeliberate = [...new Set(reference.hardPoints.flatMap((h) => h.coveredClauseRefs))].filter((ref) => byRef.has(ref));
	const refClarify = [...new Set(reference.clarifications.flatMap((c) => c.clauseRefs))].filter((ref) => byRef.has(ref));

	const dangerousFalseNegatives = refDeliberate.filter((ref) => byRef.get(ref)!.disposition === 'evacuated');
	const referenceLeftToQualify = refDeliberate.filter((ref) => byRef.get(ref)!.disposition === 'to_qualify');
	const deliberatedHits = refDeliberate.filter((ref) => byRef.get(ref)!.disposition === 'deliberated').length;
	const clarifyHits = refClarify.filter((ref) => byRef.get(ref)!.disposition === 'clarification_needed').length;

	const hardPointMatches = reference.hardPoints.map((hp): HardPointMatch => {
		const refSet = new Set(hp.coveredClauseRefs.filter((ref) => byRef.has(ref)));
		let best: { s: (typeof subjects)[number]; overlap: number } | null = null;
		for (const s of subjects) {
			const overlap = s.coveredClauseRefs.filter((ref) => refSet.has(ref)).length;
			if (overlap > 0 && (!best || overlap > best.overlap)) best = { s, overlap };
		}
		return {
			referenceId: hp.id,
			referenceName: hp.name,
			referenceClauseCount: refSet.size,
			bestSubjectId: best?.s.id ?? null,
			bestSubjectName: best?.s.name ?? null,
			recall: best ? best.overlap / (refSet.size || 1) : 0,
			precision: best ? best.overlap / (best.s.coveredClauseRefs.length || 1) : 0
		};
	});

	const evacuatedBlocking = requirements.filter((r) => r.disposition === 'evacuated' && r.criticality === 'bloquant').length;

	return {
		totalClauses: requirements.length,
		counts,
		evacuationRate: ratio(counts.evacuated, requirements.length),
		toQualifyRate: ratio(counts.to_qualify, requirements.length),
		deliberateRecall: ratio(deliberatedHits, refDeliberate.length),
		dangerousFalseNegatives,
		referenceLeftToQualify,
		clarificationRecall: ratio(clarifyHits, refClarify.length),
		hardPointMatches,
		integrityOk: dangerousFalseNegatives.length === 0 && evacuatedBlocking === 0
	};
}
