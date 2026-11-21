/**
 * Directeur Éditorial déterministe (socle de #427).
 * Évalue les signaux structurés disponibles sur un sujet (blocs TOGAF, exigences, énoncés, conflits,
 * options/décision, dérive) pour recommander les vues éditoriales les plus pertinentes.
 * Conçu pour être enrichi optionnellement par le LLM intégré d'Archinex sans jamais affecter le déterminisme du rendu.
 */

import type { DiagramAudienceDial, DiagramDetailDial, EditorialDiagramTypeId } from './dials';

export type RecommendedEditorialViewId = EditorialDiagramTypeId;

export interface SubjectEditorialSignals {
	blockCount: number;
	statementCount: number;
	unsettledCount: number;
	requirementCount: number;
	missingVerificationCount: number;
	optionCount: number;
	criteriaCount?: number;
	hasRetainedDecision: boolean;
	hasAcceptedViolations?: boolean;
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
	focalId?: string;
	source?: 'deterministic' | 'llm';
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
		label: 'Blocs Traçables (TOGAF)',
		score: Math.min(100, blockScore),
		implementedInPilot: true,
		rationale:
			signals.blockCount > 0
				? `${signals.blockCount} axe(s) TOGAF et ${signals.statementCount} énoncé(s) structurés prêts pour l'arbre traçable + .registry.json.`
				: 'Vue structurelle de référence dès l’ajout des premiers énoncés.',
		suggestedDetail: signals.statementCount > 12 ? 'balanced' : 'faithful',
		suggestedAudience: 'mixed',
		source: 'deterministic'
	});

	const traceScore =
		(signals.requirementCount > 0 ? 60 : 10) +
		(signals.missingVerificationCount > 0 ? 25 : 5) +
		Math.min(15, signals.requirementCount * 2);

	recs.push({
		viewId: 'requirement-traceability',
		label: 'Traçabilité Exigences',
		score: Math.min(100, traceScore),
		implementedInPilot: true,
		rationale:
			signals.requirementCount > 0
				? signals.missingVerificationCount > 0
					? `${signals.requirementCount} exigence(s) dont ${signals.missingVerificationCount} maillon(s) sans vérification : met immédiatement les trous en évidence.`
					: `${signals.requirementCount} exigence(s) rattachée(s) à tracer de la source jusqu'à la preuve.`
				: 'Rattachez des exigences RFP au sujet pour activer la chaîne de traçabilité.',
		suggestedDetail: signals.requirementCount > 6 ? 'balanced' : 'faithful',
		suggestedAudience: 'mixed',
		source: 'deterministic'
	});

	const policyScore =
		(signals.optionCount >= 2 ? 55 : 10) +
		(signals.hasRetainedDecision ? 20 : 10) +
		(signals.unsettledCount > 0 ? 15 : 0);

	recs.push({
		viewId: 'paired-policy-traces',
		label: 'Traces KB Appariées',
		score: Math.min(100, policyScore),
		implementedInPilot: true,
		rationale:
			signals.optionCount >= 2
				? `${signals.optionCount} options évaluables côte à côte pour pointer la première règle KB de divergence.`
				: 'Pertinent dès que deux options concurrentes sont comparées.',
		suggestedDetail: 'balanced',
		suggestedAudience: 'executive',
		source: 'deterministic'
	});

	const heatmapScore =
		(signals.optionCount >= 2 && (signals.criteriaCount ?? 0) >= 2 ? 70 : 15) +
		(signals.hasRetainedDecision ? 15 : 5);

	recs.push({
		viewId: 'decision-heatmap',
		label: 'Matrice Décision',
		score: Math.min(100, heatmapScore),
		implementedInPilot: true,
		rationale:
			signals.optionCount >= 2
				? `Synthétise ${signals.optionCount} options × ${signals.criteriaCount ?? 0} critère(s) pondéré(s) pour la carte de décision.`
				: 'Ajoutez au moins 2 options et des critères pour activer la matrice thermique.',
		suggestedDetail: 'balanced',
		suggestedAudience: 'executive',
		source: 'deterministic'
	});

	const layersScore = (signals.hasAcceptedViolations ? 80 : 25) + (signals.requirementCount > 0 ? 10 : 0);
	recs.push({
		viewId: 'compensating-layers',
		label: 'Couches Compensatoires',
		score: Math.min(100, layersScore),
		implementedInPilot: true,
		rationale: signals.hasAcceptedViolations
			? 'Des dérogations ou réserves sont présentes : les couches compensatoires rendent le risque résiduel explicite.'
			: 'Visualise les surfaces de contrôle (Conception, CI, Nautobot, Exécution).',
		suggestedDetail: 'balanced',
		suggestedAudience: 'mixed',
		source: 'deterministic'
	});

	const deltaScore = (signals.hasDriftSignals ? 85 : 20) + (signals.hasRetainedDecision ? 15 : 0);
	recs.push({
		viewId: 'architecture-delta',
		label: 'Architecture Delta',
		score: Math.min(100, deltaScore),
		implementedInPilot: true,
		rationale: signals.hasDriftSignals
			? 'Écarts détectés entre intention et réalité : le triptyque synchronisé met en lumière ADDED/REMOVED/CHANGED.'
			: 'Compare V2 nominale vs V1 optimisée ou l’intention scellée face à Nautobot.',
		suggestedDetail: 'balanced',
		suggestedAudience: 'mixed',
		source: 'deterministic'
	});

	return recs.sort((a, b) => b.score - a.score);
}
