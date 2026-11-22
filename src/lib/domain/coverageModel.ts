/**
 * Modèle unique de complétude de la couverture des exigences (Issue #401 / Épique #400).
 *
 * Fonction PURE, déterministe, sans horloge et sans accès à la base de données.
 * Les états de couverture sont toujours CALCULÉS à partir des faits structurés, jamais saisis à la main.
 *
 * Chaîne monotone de couverture :
 *   unqualified (non qualifiée)
 *   → qualified (qualifiée : à délibérer / évacuée motivée / clarification)
 *   → attached (rattachée à un sujet)
 *   → decided (décidée : décision avec justification et vérification KB tracée)
 *   → planned (planifiée : ≥ 1 objet Nautobot marqué)
 *   → realized_proven (réalisée prouvée : write-back / preuve d'exécution)
 *
 * Une étape ne régresse jamais sans événement explicite (rétractation, invalidation de décision,
 * détachement de sujet, déréférencement Nautobot ou dérive constatée).
 */

import type { EngagementBundle } from './engagementBundle';

export const COVERAGE_STAGES = [
	'unqualified',
	'qualified',
	'attached',
	'decided',
	'planned',
	'realized_proven'
] as const;

export type CoverageStage = (typeof COVERAGE_STAGES)[number];

export const COVERAGE_STAGE_RANK: Record<CoverageStage, number> = {
	unqualified: 0,
	qualified: 1,
	attached: 2,
	decided: 3,
	planned: 4,
	realized_proven: 5
};

export const COVERAGE_STAGE_LABEL: Record<CoverageStage, string> = {
	unqualified: 'Non qualifiée',
	qualified: 'Qualifiée',
	attached: 'Rattachée',
	decided: 'Décidée',
	planned: 'Planifiée',
	realized_proven: 'Réalisée prouvée'
};

export type NormalizedCriticality = 'bloquant' | 'majeur' | 'info';

export const CRITICALITY_RANK: Record<NormalizedCriticality, number> = {
	bloquant: 0,
	majeur: 1,
	info: 2
};

export type RequirementDispositionKind =
	| 'deliberated'
	| 'evacuated'
	| 'clarification_needed'
	| 'to_qualify'
	| null
	| undefined;

export type KbCheckTraceStatus = 'checked' | 'partial' | 'not_checked' | 'derogated' | null | undefined;

export interface CoveragePlannedObject {
	id: string;
	kind: string;
	label?: string;
	url?: string;
	/** Preuve d'exécution / write-back confirmé depuis Nautobot ou un connecteur aval. */
	realizedProven?: boolean;
	realizedAt?: string | null;
}

export interface CoverageDecisionFact {
	id: string;
	subjectId: string;
	rationale?: string | null;
	kbCheckStatus?: KbCheckTraceStatus;
	/** Dérogation explicite et motivée si le contrôle KB était incomplet/offline. */
	kbDerogationReason?: string | null;
	/** Statut épistémique ou actif de la décision (une décision rétractée ne couvre plus). */
	retracted?: boolean;
	decidedAt?: string | null;
}

export interface CoverageSubjectFact {
	id: string;
	title: string;
	sectionRef?: string | null;
	domain?: string | null;
	owner?: string | null;
}

export interface CoverageRequirementInput {
	id: string;
	clauseRef?: string | null;
	title: string;
	section?: string | null;
	domain?: string | null;
	criticality?: string | null;
	owner?: string | null;
	disposition?: RequirementDispositionKind;
	dispositionReason?: string | null;
	clarificationQuestion?: string | null;
	/** Sujets auxquels cette exigence est rattachée. */
	subjects?: CoverageSubjectFact[];
	/** Décisions portant sur les sujets rattachés à cette exigence. */
	decisions?: CoverageDecisionFact[];
	/** Objets Nautobot marqués en traçabilité pour cette exigence. */
	plannedObjects?: CoveragePlannedObject[];
	/** Clauses KB liées (pour navigation). */
	kbClauseRefs?: string[];
}

export type CoverageGapCode =
	| 'BELOW_THRESHOLD'
	| 'BLOCKING_NOT_DECIDED'
	| 'EVACUATION_WITHOUT_MOTIVE'
	| 'DECISION_WITHOUT_RATIONALE'
	| 'DECISION_WITHOUT_KB_TRACE';

export interface CoverageGap {
	requirementId: string;
	clauseRef: string;
	title: string;
	criticality: NormalizedCriticality;
	domain: string;
	stage: CoverageStage;
	requiredStage: CoverageStage;
	blocking: boolean;
	code: CoverageGapCode;
	message: string;
}

export interface RequirementCoverageItem {
	id: string;
	clauseRef: string;
	title: string;
	section: string;
	domain: string;
	criticality: NormalizedCriticality;
	owner: string;
	disposition: RequirementDispositionKind;
	dispositionReason: string;
	/** True si l'exigence a été évacuée avec un motif explicite valide. */
	evacuatedWithMotive: boolean;
	/** True si l'exigence est marquée évacuée sans motif (interdit). */
	evacuationMissingMotive: boolean;
	/** Étape calculée la plus haute atteinte sans rupture de chaîne. */
	stage: CoverageStage;
	stageRank: number;
	stageLabel: string;
	/** État de chaque étape de la chaîne pour la matrice visuelle. */
	steps: Record<Exclude<CoverageStage, 'unqualified'>, 'reached' | 'evacuated' | 'blocked' | 'missing'>;
	subjectIds: string[];
	subjectTitles: string[];
	decisionIds: string[];
	kbClauseRefs: string[];
	plannedObjects: CoveragePlannedObject[];
	hasValidDecision: boolean;
	hasKbTrace: boolean;
	gap: CoverageGap | null;
}

export interface CoverageRatio {
	covered: number;
	total: number;
	/** Ex. « 41 / 57 exigences bloquantes décidées » */
	label: string;
}

export interface CoverageBreakdownRow {
	key: string;
	label: string;
	total: number;
	evacuated: number;
	/** Dénominateur actif (total - évacuées motivées). */
	activeTotal: number;
	qualified: number;
	attached: number;
	decided: number;
	planned: number;
	realizedProven: number;
	gapsCount: number;
	ratioLabel: string;
}

export interface CoverageIndicators {
	totalRequirements: number;
	activeRequirements: number;
	evacuatedRequirements: number;
	headline: string;
	blockingDecided: CoverageRatio;
	overallDecided: CoverageRatio;
	overallPlanned: CoverageRatio;
	overallRealizedProven: CoverageRatio;
	byStage: Record<CoverageStage, number>;
	byCriticality: CoverageBreakdownRow[];
	byDomain: CoverageBreakdownRow[];
	bySubject: CoverageBreakdownRow[];
}

export interface CoverageReport {
	threshold: CoverageStage;
	items: RequirementCoverageItem[];
	gaps: CoverageGap[];
	blockingGaps: CoverageGap[];
	indicators: CoverageIndicators;
	lastReconciliationAt: string | null;
}

export type CoverageRegressionEventKind =
	| 'retraction'
	| 'decision_invalidated'
	| 'subject_detached'
	| 'nautobot_unlinked'
	| 'drift_detected'
	| 'disposition_reset';

export interface AcceptedBlockingDeviation {
	requirementId: string;
	justification: string;
	acceptedBy: string;
	acceptedAt?: string;
}

export interface SealingReadinessResult {
	canSeal: boolean;
	blockingGaps: CoverageGap[];
	acceptedDeviations: AcceptedBlockingDeviation[];
	unacceptedBlockingGaps: CoverageGap[];
	invalidEvacuations: CoverageGap[];
	summary: string;
}

const MIN_MOTIVE_LENGTH = 5;

/** Normalise la criticité vers un vocabulaire fermé (`bloquant` | `majeur` | `info`). */
export function normalizeCriticality(raw: string | null | undefined): NormalizedCriticality {
	const v = (raw ?? '').trim().toLowerCase();
	if (
		v === 'bloquant' ||
		v === 'blocking' ||
		v === 'critical' ||
		v === 'critique' ||
		v === 'mandatory' ||
		v === 'must' ||
		v === 'p0' ||
		v === 'p1'
	) {
		return 'bloquant';
	}
	if (v === 'majeur' || v === 'major' || v === 'high' || v === 'important' || v === 'should' || v === 'medium') {
		return 'majeur';
	}
	return 'info';
}

/** Vérifie si une décision porte une justification et une vérification KB tracée (ou dérogation motivée). */
export function isDecisionCompleteForCoverage(decision: CoverageDecisionFact): {
	valid: boolean;
	hasRationale: boolean;
	hasKbTrace: boolean;
} {
	if (decision.retracted) {
		return { valid: false, hasRationale: false, hasKbTrace: false };
	}
	const hasRationale = typeof decision.rationale === 'string' && decision.rationale.trim().length >= MIN_MOTIVE_LENGTH;
	const hasKbTrace =
		decision.kbCheckStatus === 'checked' ||
		decision.kbCheckStatus === 'derogated' ||
		(typeof decision.kbDerogationReason === 'string' && decision.kbDerogationReason.trim().length >= MIN_MOTIVE_LENGTH);
	return {
		valid: hasRationale && hasKbTrace,
		hasRationale,
		hasKbTrace
	};
}

/**
 * Calcule de manière pure et déterministe l'état de couverture d'une exigence.
 */
export function computeRequirementCoverage(
	input: CoverageRequirementInput,
	threshold: CoverageStage = 'decided'
): RequirementCoverageItem {
	const criticality = normalizeCriticality(input.criticality);
	const clauseRef = (input.clauseRef || input.id).trim();
	const domain = (input.domain || input.subjects?.[0]?.domain || 'Général').trim() || 'Général';
	const section = (input.section || input.subjects?.[0]?.sectionRef || 'Sans section').trim() || 'Sans section';
	const owner = (input.owner || input.subjects?.[0]?.owner || 'Non assigné').trim() || 'Non assigné';
	const disposition = input.disposition ?? null;
	const dispositionReason = (input.dispositionReason ?? '').trim();

	const subjects = input.subjects ?? [];
	const decisions = input.decisions ?? [];
	const plannedObjects = input.plannedObjects ?? [];
	const kbClauseRefs = Array.from(new Set(input.kbClauseRefs ?? [])).sort();

	const isEvacuated = disposition === 'evacuated';
	const hasMotive = dispositionReason.length >= MIN_MOTIVE_LENGTH;
	const evacuatedWithMotive = isEvacuated && hasMotive;
	const evacuationMissingMotive = isEvacuated && !hasMotive;

	// 1. Qualification
	const isQualified =
		disposition === 'deliberated' ||
		evacuatedWithMotive ||
		(disposition === 'clarification_needed' &&
			(dispositionReason.length >= MIN_MOTIVE_LENGTH ||
				(input.clarificationQuestion ?? '').trim().length >= MIN_MOTIVE_LENGTH));

	// 2. Rattachement à un sujet
	const isAttached = isQualified && !evacuatedWithMotive && subjects.length > 0;

	// 3. Décision complète (justification + vérification KB tracée)
	const evaluatedDecisions = decisions.map((d) => ({ d, eval: isDecisionCompleteForCoverage(d) }));
	const validDecisions = evaluatedDecisions.filter((x) => x.eval.valid);
	const hasAnyActiveDecision = evaluatedDecisions.some((x) => !x.d.retracted);
	const hasRationaleOnAny = evaluatedDecisions.some((x) => x.eval.hasRationale);
	const hasKbTrace = evaluatedDecisions.some((x) => x.eval.hasKbTrace);
	const hasValidDecision = validDecisions.length > 0;
	const isDecided = isAttached && hasValidDecision;

	// 4. Planification (≥ 1 objet Nautobot marqué)
	const isPlanned = isDecided && plannedObjects.length > 0;

	// 5. Réalisation prouvée (write-back confirmé sur au moins un objet planifié)
	const isRealizedProven = isPlanned && plannedObjects.some((o) => o.realizedProven === true);

	let stage: CoverageStage = 'unqualified';
	if (isRealizedProven) stage = 'realized_proven';
	else if (isPlanned) stage = 'planned';
	else if (isDecided) stage = 'decided';
	else if (isAttached) stage = 'attached';
	else if (isQualified) stage = 'qualified';

	const stageRank = COVERAGE_STAGE_RANK[stage];
	const thresholdRank = COVERAGE_STAGE_RANK[threshold];

	const steps: RequirementCoverageItem['steps'] = {
		qualified: evacuationMissingMotive
			? 'blocked'
			: evacuatedWithMotive
				? 'evacuated'
				: stageRank >= COVERAGE_STAGE_RANK.qualified
					? 'reached'
					: 'missing',
		attached: evacuatedWithMotive
			? 'evacuated'
			: stageRank >= COVERAGE_STAGE_RANK.attached
				? 'reached'
				: 'missing',
		decided: evacuatedWithMotive
			? 'evacuated'
			: stageRank >= COVERAGE_STAGE_RANK.decided
				? 'reached'
				: hasAnyActiveDecision && !hasValidDecision
					? 'blocked'
					: 'missing',
		planned: evacuatedWithMotive
			? 'evacuated'
			: stageRank >= COVERAGE_STAGE_RANK.planned
				? 'reached'
				: 'missing',
		realized_proven: evacuatedWithMotive
			? 'evacuated'
			: stageRank >= COVERAGE_STAGE_RANK.realized_proven
				? 'reached'
				: 'missing'
	};

	let gap: CoverageGap | null = null;
	if (evacuationMissingMotive) {
		gap = {
			requirementId: input.id,
			clauseRef,
			title: input.title,
			criticality,
			domain,
			stage,
			requiredStage: 'qualified',
			blocking: true,
			code: 'EVACUATION_WITHOUT_MOTIVE',
			message: `Exigence ${clauseRef} évacuée sans motif explicite (interdit).`
		};
	} else if (!evacuatedWithMotive && stageRank < thresholdRank) {
		const isBlocking = criticality === 'bloquant' && stageRank < COVERAGE_STAGE_RANK.decided;
		let code: CoverageGapCode = isBlocking ? 'BLOCKING_NOT_DECIDED' : 'BELOW_THRESHOLD';
		let message = `Exigence ${clauseRef} à l'étape « ${COVERAGE_STAGE_LABEL[stage]} » (seuil attendu : « ${COVERAGE_STAGE_LABEL[threshold]} »).`;

		if (isAttached && hasAnyActiveDecision && !hasValidDecision) {
			if (!hasRationaleOnAny) {
				code = 'DECISION_WITHOUT_RATIONALE';
				message = `Exigence ${clauseRef} : décision présente sans justification suffisante.`;
			} else if (!hasKbTrace) {
				code = 'DECISION_WITHOUT_KB_TRACE';
				message = `Exigence ${clauseRef} : décision sans trace de vérification KB ni dérogation motivée.`;
			}
		}

		gap = {
			requirementId: input.id,
			clauseRef,
			title: input.title,
			criticality,
			domain,
			stage,
			requiredStage: threshold,
			blocking: isBlocking,
			code,
			message
		};
	}

	return {
		id: input.id,
		clauseRef,
		title: input.title,
		section,
		domain,
		criticality,
		owner,
		disposition,
		dispositionReason,
		evacuatedWithMotive,
		evacuationMissingMotive,
		stage,
		stageRank,
		stageLabel: evacuatedWithMotive ? 'Évacuée (motivée)' : COVERAGE_STAGE_LABEL[stage],
		steps,
		subjectIds: subjects.map((s) => s.id),
		subjectTitles: subjects.map((s) => s.title),
		decisionIds: validDecisions.map((x) => x.d.id),
		kbClauseRefs,
		plannedObjects,
		hasValidDecision,
		hasKbTrace,
		gap
	};
}

function buildBreakdown(
	groups: Map<string, { label: string; items: RequirementCoverageItem[] }>
): CoverageBreakdownRow[] {
	const rows: CoverageBreakdownRow[] = [];
	for (const [key, { label, items }] of groups.entries()) {
		const evacuated = items.filter((i) => i.evacuatedWithMotive).length;
		const activeItems = items.filter((i) => !i.evacuatedWithMotive);
		const activeTotal = activeItems.length;
		const qualified = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.qualified).length;
		const attached = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.attached).length;
		const decided = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.decided).length;
		const planned = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.planned).length;
		const realizedProven = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.realized_proven).length;
		const gapsCount = items.filter((i) => i.gap !== null).length;

		rows.push({
			key,
			label,
			total: items.length,
			evacuated,
			activeTotal,
			qualified,
			attached,
			decided,
			planned,
			realizedProven,
			gapsCount,
			ratioLabel: `${decided} / ${activeTotal} décidées`
		});
	}
	return rows;
}

/**
 * Calcule le rapport complet de couverture des exigences pour un dossier / projet.
 * Source de vérité unique pour l'API, l'UI et l'export RTM.
 */
export function computeCoverageReport(
	requirements: CoverageRequirementInput[],
	options?: {
		threshold?: CoverageStage;
		lastReconciliationAt?: string | null;
	}
): CoverageReport {
	const threshold = options?.threshold ?? 'decided';
	const items = requirements.map((req) => computeRequirementCoverage(req, threshold));

	const gaps = items
		.map((i) => i.gap)
		.filter((g): g is CoverageGap => g !== null)
		.sort((a, b) => {
			if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
			const critDiff = CRITICALITY_RANK[a.criticality] - CRITICALITY_RANK[b.criticality];
			if (critDiff !== 0) return critDiff;
			const stageDiff = COVERAGE_STAGE_RANK[a.stage] - COVERAGE_STAGE_RANK[b.stage];
			if (stageDiff !== 0) return stageDiff;
			return a.requirementId.localeCompare(b.requirementId);
		});

	const blockingGaps = gaps.filter((g) => g.blocking);

	const byStage: Record<CoverageStage, number> = {
		unqualified: 0,
		qualified: 0,
		attached: 0,
		decided: 0,
		planned: 0,
		realized_proven: 0
	};
	for (const item of items) {
		byStage[item.stage] += 1;
	}

	const activeItems = items.filter((i) => !i.evacuatedWithMotive);
	const evacuatedRequirements = items.length - activeItems.length;

	const blockingActive = activeItems.filter((i) => i.criticality === 'bloquant');
	const blockingDecidedCount = blockingActive.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.decided).length;
	const overallDecidedCount = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.decided).length;
	const overallPlannedCount = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.planned).length;
	const overallRealizedCount = activeItems.filter((i) => i.stageRank >= COVERAGE_STAGE_RANK.realized_proven).length;

	const blockingDecided: CoverageRatio = {
		covered: blockingDecidedCount,
		total: blockingActive.length,
		label: `${blockingDecidedCount} / ${blockingActive.length} exigences bloquantes décidées`
	};

	const overallDecided: CoverageRatio = {
		covered: overallDecidedCount,
		total: activeItems.length,
		label: `${overallDecidedCount} / ${activeItems.length} exigences décidées`
	};

	const overallPlanned: CoverageRatio = {
		covered: overallPlannedCount,
		total: activeItems.length,
		label: `${overallPlannedCount} / ${activeItems.length} exigences planifiées`
	};

	const overallRealizedProven: CoverageRatio = {
		covered: overallRealizedCount,
		total: activeItems.length,
		label: `${overallRealizedCount} / ${activeItems.length} exigences réalisées prouvées`
	};

	// Ventilation par criticité (ordre fixe)
	const critMap = new Map<string, { label: string; items: RequirementCoverageItem[] }>([
		['bloquant', { label: 'Bloquante', items: [] }],
		['majeur', { label: 'Majeure', items: [] }],
		['info', { label: 'Information', items: [] }]
	]);
	for (const item of items) {
		critMap.get(item.criticality)!.items.push(item);
	}

	// Ventilation par domaine
	const domainMap = new Map<string, { label: string; items: RequirementCoverageItem[] }>();
	for (const item of items) {
		const existing = domainMap.get(item.domain) ?? { label: item.domain, items: [] };
		existing.items.push(item);
		domainMap.set(item.domain, existing);
	}

	// Ventilation par sujet
	const subjectMap = new Map<string, { label: string; items: RequirementCoverageItem[] }>();
	for (const item of items) {
		if (item.subjectIds.length === 0) {
			const existing = subjectMap.get('__unattached__') ?? { label: 'Non rattachées', items: [] };
			existing.items.push(item);
			subjectMap.set('__unattached__', existing);
		} else {
			item.subjectIds.forEach((sid, idx) => {
				const label = item.subjectTitles[idx] || sid;
				const existing = subjectMap.get(sid) ?? { label, items: [] };
				existing.items.push(item);
				subjectMap.set(sid, existing);
			});
		}
	}

	const byCriticality = buildBreakdown(critMap);
	const byDomain = buildBreakdown(domainMap).sort((a, b) => a.label.localeCompare(b.label));
	const bySubject = buildBreakdown(subjectMap).sort((a, b) => a.label.localeCompare(b.label));

	const headline =
		blockingActive.length > 0
			? blockingDecided.label
			: overallDecided.label;

	return {
		threshold,
		items,
		gaps,
		blockingGaps,
		indicators: {
			totalRequirements: items.length,
			activeRequirements: activeItems.length,
			evacuatedRequirements,
			headline,
			blockingDecided,
			overallDecided,
			overallPlanned,
			overallRealizedProven,
			byStage,
			byCriticality,
			byDomain,
			bySubject
		},
		lastReconciliationAt: options?.lastReconciliationAt ?? null
	};
}

/**
 * Vérifie la propriété de monotonie d'une transition d'étape :
 * une étape ne peut régresser que si un événement explicite de régression est fourni.
 */
export function isMonotonicStageTransition(
	from: CoverageStage,
	to: CoverageStage,
	explicitRegressionEvent?: CoverageRegressionEventKind | null
): boolean {
	if (COVERAGE_STAGE_RANK[to] >= COVERAGE_STAGE_RANK[from]) {
		return true;
	}
	return Boolean(explicitRegressionEvent);
}

/**
 * Évalue si un dossier ou une section peut être scellé selon les règles de complétude :
 * - Aucune évacuation sans motif n'est tolérée.
 * - Aucune exigence bloquante ne peut rester en deçà de `decided` sans acceptation explicite tracée.
 */
export function evaluateSealingReadiness(
	report: CoverageReport,
	acceptedDeviations: AcceptedBlockingDeviation[] = []
): SealingReadinessResult {
	const invalidEvacuations = report.blockingGaps.filter((g) => g.code === 'EVACUATION_WITHOUT_MOTIVE');
	const validAcceptedMap = new Map<string, AcceptedBlockingDeviation>();
	for (const dev of acceptedDeviations) {
		if (
			dev.requirementId &&
			typeof dev.justification === 'string' &&
			dev.justification.trim().length >= MIN_MOTIVE_LENGTH &&
			typeof dev.acceptedBy === 'string' &&
			dev.acceptedBy.trim().length > 0
		) {
			validAcceptedMap.set(dev.requirementId, dev);
		}
	}

	const nonEvacBlocking = report.blockingGaps.filter((g) => g.code !== 'EVACUATION_WITHOUT_MOTIVE');
	const unacceptedBlockingGaps = nonEvacBlocking.filter((g) => !validAcceptedMap.has(g.requirementId));
	const appliedAccepted = nonEvacBlocking
		.map((g) => validAcceptedMap.get(g.requirementId))
		.filter((d): d is AcceptedBlockingDeviation => Boolean(d));

	const canSeal = invalidEvacuations.length === 0 && unacceptedBlockingGaps.length === 0;

	let summary: string;
	if (canSeal) {
		summary =
			appliedAccepted.length > 0
				? `Scellement autorisé avec ${appliedAccepted.length} acceptation(s) tracée(s) (${report.indicators.headline}).`
				: `Scellement autorisé (${report.indicators.headline}).`;
	} else {
		const parts: string[] = [];
		if (invalidEvacuations.length > 0) {
			parts.push(`${invalidEvacuations.length} évacuation(s) sans motif`);
		}
		if (unacceptedBlockingGaps.length > 0) {
			parts.push(`${unacceptedBlockingGaps.length} exigence(s) bloquante(s) non décidée(s)`);
		}
		summary = `Scellement refusé : ${parts.join(' et ')}.`;
	}

	return {
		canSeal,
		blockingGaps: report.blockingGaps,
		acceptedDeviations: appliedAccepted,
		unacceptedBlockingGaps,
		invalidEvacuations,
		summary
	};
}

/**
 * Construit le rapport de couverture directement depuis un EngagementBundle scellé.
 * Garantit que la RTM exportée affiche exactement les mêmes chiffres que l'API et l'UI.
 */
export function coverageFromBundle(
	bundle: EngagementBundle,
	threshold: CoverageStage = 'decided'
): CoverageReport {
	const d = bundle.data;
	const subjectsByReq = new Map<string, CoverageSubjectFact[]>();
	const subjectDecisionIds = new Map<string, string[]>();

	for (const s of d.subjects) {
		subjectDecisionIds.set(s.id, s.decision_ids);
		for (const rid of s.requirement_ids) {
			const list = subjectsByReq.get(rid) ?? [];
			list.push({
				id: s.id,
				title: s.title,
				domain: s.domains[0] ?? 'Général'
			});
			subjectsByReq.set(rid, list);
		}
	}

	const decisionsById = new Map(d.decisions.map((dec) => [dec.id, dec]));
	const controlsByReq = new Map<string, string[]>();
	for (const c of d.compliance) {
		const list = controlsByReq.get(c.requirement_id) ?? [];
		list.push(c.control_ref);
		controlsByReq.set(c.requirement_id, list);
	}

	const inputs: CoverageRequirementInput[] = d.requirements.map((r) => {
		const subs = subjectsByReq.get(r.id) ?? [];
		const decIds = Array.from(new Set(subs.flatMap((s) => subjectDecisionIds.get(s.id) ?? [])));
		const decs: CoverageDecisionFact[] = decIds
			.map((id) => decisionsById.get(id))
			.filter((dec): dec is NonNullable<typeof dec> => Boolean(dec))
			.map((dec) => {
				const check = dec.compliance_check;
				const kbCheckStatus: KbCheckTraceStatus = check
					? check.status === 'checked'
						? 'checked'
						: check.derogation?.reason
							? 'derogated'
							: check.status
					: 'checked'; // rétrocompatibilité des dossiers scellés antérieurs à #382
				return {
					id: dec.id,
					subjectId: dec.subject_id,
					rationale: dec.rationale || dec.decision,
					kbCheckStatus,
					kbDerogationReason: check?.derogation?.reason ?? null
				};
			});

		return {
			id: r.id,
			clauseRef: r.clause_ref,
			title: r.title || r.text.slice(0, 80),
			domain: r.category || subs[0]?.domain || 'Général',
			criticality: r.criticality ?? 'majeur',
			disposition: r.disposition ?? (subs.length > 0 ? 'deliberated' : 'to_qualify'),
			dispositionReason: r.disposition_reason ?? '',
			clarificationQuestion: r.clarification_question ?? '',
			subjects: subs,
			decisions: decs,
			kbClauseRefs: controlsByReq.get(r.id) ?? []
		};
	});

	return computeCoverageReport(inputs, { threshold });
}
