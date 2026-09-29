import type { ProductionMode } from '$lib/types/epistemic';

export type CriterionKind = 'functional' | 'nfr' | 'cost' | 'risk' | 'compliance';
export type OptionOrigin = 'human' | 'llm-proposed' | 'kb-pattern';
export type OptionStatus = 'proposed' | 'debated' | 'retained' | 'rejected';
export type DecisionReversibility = 'reversible' | 'costly' | 'irreversible';

export interface Criterion {
	id: string;
	subjectId: string;
	name: string;
	description: string;
	kind: CriterionKind;
	weight: number; // 1 à 5
	kbRef?: string | null;
	author: string;
	role: string;
	productionMode: ProductionMode;
	version: number;
}

export interface Option {
	id: string;
	subjectId: string;
	title: string;
	summary: string;
	origin: OptionOrigin;
	kbRefs: string[];
	status: OptionStatus;
	author: string;
	role: string;
	productionMode: ProductionMode;
	version: number;
}

export interface OptionEvaluation {
	id?: string;
	optionId: string;
	criterionId: string;
	score: number; // -2 à +2
	justification: string; // Obligatoire et non vide
	evidenceRefs: string[];
	author: string;
	role: string;
	productionMode: ProductionMode;
	version?: number;
}

export interface TradeOff {
	id: string;
	subjectId: string;
	optionId: string;
	gains: string;
	sacrifices: string;
	criterionIds: string[];
	version?: number;
}

export interface DecisionRejectedOption {
	optionId: string;
	reason: string;
}

export interface AcceptedViolation {
	typedId: string;
	justification: string;
}

export interface Decision {
	id: string;
	subjectId: string;
	retainedOptionId: string;
	rejected: DecisionRejectedOption[];
	rationale: string;
	reversibility: DecisionReversibility;
	arbiterId: string;
	arbiterRole: string;
	decidedAt: string; // ISO date
	acceptedViolations: AcceptedViolation[];
	kbCandidateIds: string[];
	version?: number;
}

/**
 * Valide une évaluation d'option.
 * RÈGLE D'OR : Toute évaluation doit impérativement comporter une justification argumentée.
 */
export function validateEvaluation(
	evaluation: Partial<OptionEvaluation>
): { valid: boolean; reason?: string } {
	if (!evaluation.optionId) {
		return { valid: false, reason: 'Identifiant d\'option manquant' };
	}
	if (!evaluation.criterionId) {
		return { valid: false, reason: 'Identifiant de critère manquant' };
	}
	if (evaluation.score === undefined || evaluation.score === null) {
		return { valid: false, reason: 'Note d\'évaluation requise (-2 à +2)' };
	}
	if (evaluation.score < -2 || evaluation.score > 2) {
		return { valid: false, reason: 'La note doit être comprise entre -2 et +2' };
	}
	if (!evaluation.justification || evaluation.justification.trim().length === 0) {
		return {
			valid: false,
			reason: 'Une justification argumentée est obligatoire pour attribuer une note à une option'
		};
	}
	return { valid: true };
}

/**
 * Calcule le score pondéré indicatif d'une option.
 * ATTENTION : Ce calcul est purement indicatif et d'aide à la décision.
 * Il ne se substitue JAMAIS au jugement souverain du Lead Architect (Invariant V & VII).
 */
export function weightedScore(
	optionId: string,
	criteria: Criterion[],
	evaluations: OptionEvaluation[]
): number {
	const optionEvals = evaluations.filter((e) => e.optionId === optionId);
	if (optionEvals.length === 0) return 0;

	let totalWeightedScore = 0;
	let totalWeight = 0;

	for (const ev of optionEvals) {
		const criterion = criteria.find((c) => c.id === ev.criterionId);
		const weight = criterion ? Math.max(1, Math.min(5, criterion.weight)) : 1;
		totalWeightedScore += ev.score * weight;
		totalWeight += weight;
	}

	if (totalWeight === 0) return 0;
	const normalized = totalWeightedScore / totalWeight;
	return Math.round(normalized * 100) / 100;
}

/**
 * Convertit une ancienne « variante B » (texte brut hérité) en Option structurée du domaine.
 * Assure la transition sans rupture des engagements créés sous les versions antérieures.
 */
export function convertVarianteBToOption(
	subjectId: string,
	varianteBText: string,
	author: string = 'AI Assistant'
): Option {
	return {
		id: `opt-${subjectId}-var-b`,
		subjectId,
		title: 'Option B (héritée)',
		summary: varianteBText.trim(),
		origin: 'llm-proposed',
		kbRefs: [],
		status: 'proposed',
		author,
		role: 'ai_assistant',
		productionMode: 'llm-derived',
		version: 1
	};
}
