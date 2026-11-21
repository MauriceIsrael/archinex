/**
 * Directeur Éditorial déterministe (socle de #427).
 * Évalue les signaux structurés disponibles sur un sujet (blocs TOGAF, exigences, énoncés, conflits,
 * options/décision, dérive) pour recommander les vues éditoriales les plus pertinentes.
 * Conçu pour être enrichi optionnellement par le LLM intégré d'Archinex sans jamais affecter le déterminisme du rendu.
 */

import type { DiagramAudienceDial, DiagramDetailDial } from './dials';

export type RecommendedEditorialViewId =
	| 'traceable-blocks'
	| 'requirement-traceability'
	| 'architecture-delta'
	| 'paired-policy-traces';

export interface SubjectEditorialSignals {
	blockCount: number;
	statementCount: number;
	unsettledCount: number;
	requirementCount: number;
	missingVerificationCount: number;
	optionCount: number;
	hasRetainedDecision: boolean;
	hasDriftSignals?: boolean;
}

export interface EditorialViewRecommendation {
	viewId: RecommendedEditorialViewId;
	label: string;
	score: number;
	implementedInPilot: boolean;
	rationale: string;
	suggestedDetail: DiagramDetailDial;
	suggestedAudience: DiagramAudienceDial;
}

/**
 * Classe de façon déterministe les vues éditoriales les plus pertinentes selon les données présentes.
 */
export function recommendEditorialViews(signals: SubjectEditorialSignals): EditorialViewRecommendation[] {
	const recs: EditorialViewRecommendation[] = [];

	const blockScore =
		(signals.blockCount > 0 ? 55 : 15) +
		Math.min(25, signals.statementCount * 3) +
		(signals.unsettledCount > 0 ? 10 : 0);

	recs.push({
		viewId: 'traceable-blocks',
		label: 'Décomposition en blocs traçables (TOGAF)',
		score: Math.min(100, blockScore),
		implementedInPilot: true,
		rationale:
			signals.blockCount > 0
				? `${signals.blockCount} axe(s) TOGAF et ${signals.statementCount} énoncé(s) structurés prêts pour l'arbre traçable + .registry.json.`
				: 'Vue structurelle de référence dès l’ajout des premiers énoncés.',
		suggestedDetail: signals.statementCount > 12 ? 'balanced' : 'faithful',
		suggestedAudience: 'mixed'
	});

	const traceScore =
		(signals.requirementCount > 0 ? 60 : 10) +
		(signals.missingVerificationCount > 0 ? 25 : 5) +
		Math.min(15, signals.requirementCount * 2);

	recs.push({
		viewId: 'requirement-traceability',
		label: 'Traçabilité Exigences × Conception × Preuve',
		score: Math.min(100, traceScore),
		implementedInPilot: true,
		rationale:
			signals.requirementCount > 0
				? signals.missingVerificationCount > 0
					? `${signals.requirementCount} exigence(s) dont ${signals.missingVerificationCount} maillon(s) sans vérification : met immédiatement les trous en évidence.`
					: `${signals.requirementCount} exigence(s) rattachée(s) à tracer de la source jusqu'à la preuve.`
				: 'Rattachez des exigences RFP au sujet pour activer la chaîne de traçabilité.',
		suggestedDetail: signals.requirementCount > 6 ? 'balanced' : 'faithful',
		suggestedAudience: 'mixed'
	});

	const policyScore =
		(signals.optionCount >= 2 ? 55 : 10) +
		(signals.hasRetainedDecision ? 20 : 10) +
		(signals.unsettledCount > 0 ? 15 : 0);

	recs.push({
		viewId: 'paired-policy-traces',
		label: 'Traces appariées de règles KB (Carte de décision #423)',
		score: Math.min(100, policyScore),
		implementedInPilot: false,
		rationale:
			signals.optionCount >= 2
				? `${signals.optionCount} options évaluables côte à côte pour pointer la première règle KB de divergence.`
				: 'Pertinent dès que deux options concurrentes sont comparées.',
		suggestedDetail: 'balanced',
		suggestedAudience: 'executive'
	});

	const deltaScore = (signals.hasDriftSignals ? 85 : 20) + (signals.hasRetainedDecision ? 15 : 0);

	recs.push({
		viewId: 'architecture-delta',
		label: 'Architecture Delta · Before · Changes · After (#421)',
		score: Math.min(100, deltaScore),
		implementedInPilot: false,
		rationale: signals.hasDriftSignals
			? 'Écarts détectés entre intention et réalité : le triptyque synchronisé met en lumière ADDED/REMOVED/CHANGED.'
			: 'Utile pour comparer V1 vs V2 ou l’intention scellée face à Nautobot.',
		suggestedDetail: 'balanced',
		suggestedAudience: 'mixed'
	});

	return recs.sort((a, b) => b.score - a.score);
}
