import type { SubjectMaturity } from '$lib/types/epistemic';
import type { Criterion, Option, OptionEvaluation, Decision } from './options';
import type { Argument } from './debate';

export type MaturityBlockerCode =
	| 'MISSING_PROBLEM_STATEMENT'
	| 'MISSING_CRITERIA'
	| 'INSUFFICIENT_OPTIONS'
	| 'UNEVALUATED_OPTION'
	| 'OPEN_OBJECTION'
	| 'UNRESOLVED_VIOLATION'
	| 'OPEN_BLOCKING_QUESTION'
	| 'COVERAGE_INCOMPLETE';

export interface MaturityBlocker {
	code: MaturityBlockerCode;
	message: string;
	targetId?: string;
}

export interface FrameworkCoverageStatus {
	frameworkId: string;
	name?: string;
	status: 'covered' | 'partial' | 'missing' | 'unknown';
}

export interface MaturityComputationInput {
	subject: {
		id: string;
		name: string;
		problemStatement?: string | null;
		maturityLevel?: SubjectMaturity;
	};
	criteria: Criterion[];
	options: Option[];
	evaluations: OptionEvaluation[];
	arguments: Argument[];
	requiredFrameworks?: FrameworkCoverageStatus[];
	acceptedViolations?: Array<{ typedId: string; justification: string }>;
	decision?: Decision | null;
}

export interface MaturityComputationResult {
	level: SubjectMaturity;
	readyForArbitration: boolean;
	blockers: MaturityBlocker[];
}

/**
 * Calcule de manière pure la maturité d'un sujet d'architecture et son éligibilité à l'arbitrage (Gate G3).
 *
 * Règles :
 * - L0_named : sujet existant mais sans cadrage suffisant.
 * - L1_framed : problemStatement non vide et au moins 2 critères.
 * - L2_decomposed : au moins 2 options évaluées sur TOUS les critères avec justification.
 * - readyForArbitration : L2 atteint + aucune objection ouverte + aucune violation non couverte par acceptedViolations
 *                         + aucune question bloquante ouverte + tous les référentiels requis sont 'covered'.
 * - L3_decided : posé UNIQUEMENT suite à l'arbitrage formel (présence d'une Decision ou niveau déjà fixé à L3+).
 */
export function computeMaturity(input: MaturityComputationInput): MaturityComputationResult {
	const currentLevel = input.subject.maturityLevel;

	// Si le sujet est déjà arbitré, spécifié ou scellé, on préserve son statut
	if (
		input.decision ||
		currentLevel === 'L3_decided' ||
		currentLevel === 'L4_specified' ||
		currentLevel === 'L5_archived'
	) {
		return {
			level: currentLevel && ['L3_decided', 'L4_specified', 'L5_archived'].includes(currentLevel)
				? currentLevel
				: 'L3_decided',
			readyForArbitration: false,
			blockers: []
		};
	}

	const blockers: MaturityBlocker[] = [];
	let l1Passed = true;
	let l2Passed = true;

	// --- 1. Validation L1 (Framed) ---
	const hasProblemStatement =
		typeof input.subject.problemStatement === 'string' &&
		input.subject.problemStatement.trim().length > 0;

	if (!hasProblemStatement) {
		l1Passed = false;
		blockers.push({
			code: 'MISSING_PROBLEM_STATEMENT',
			message: "L'énoncé du problème d'architecture (problemStatement) est absent ou vide."
		});
	}

	if (input.criteria.length < 2) {
		l1Passed = false;
		blockers.push({
			code: 'MISSING_CRITERIA',
			message: `Au moins 2 critères d'architecture sont requis (${input.criteria.length} défini(s)).`
		});
	}

	// --- 2. Validation L2 (Decomposed) ---
	if (input.options.length < 2) {
		l2Passed = false;
		blockers.push({
			code: 'INSUFFICIENT_OPTIONS',
			message: `Au moins 2 options d'architecture sont requises (${input.options.length} définie(s)).`
		});
	}

	// Vérification de l'évaluation complète de chaque option sur chaque critère
	for (const opt of input.options) {
		for (const crit of input.criteria) {
			const evaluation = input.evaluations.find(
				(e) => e.optionId === opt.id && e.criterionId === crit.id
			);
			if (!evaluation || !evaluation.justification || evaluation.justification.trim().length === 0) {
				l2Passed = false;
				blockers.push({
					code: 'UNEVALUATED_OPTION',
					message: `L'option "${opt.title}" n'est pas évaluée avec justification sur le critère "${crit.name}".`,
					targetId: opt.id
				});
			}
		}
	}

	// Détermination du palier courant
	let level: SubjectMaturity = 'L0_named';
	if (l1Passed && l2Passed) {
		level = 'L2_decomposed';
	} else if (l1Passed) {
		level = 'L1_framed';
	} else {
		level = 'L0_named';
	}

	// --- 3. Validation de l'Arbitrabilité (readyForArbitration) ---

	// a. Objections ouvertes
	const openObjections = input.arguments.filter(
		(a) => a.stance === 'objection' && a.resolution === 'open'
	);
	for (const obj of openObjections) {
		blockers.push({
			code: 'OPEN_OBJECTION',
			message: `Objection non levée [${obj.claim}] : ${obj.grounds}`,
			targetId: obj.id
		});
	}

	// b. Questions bloquantes ouvertes
	const openBlockingQuestions = input.arguments.filter(
		(a) =>
			a.stance === 'question' &&
			a.resolution === 'open' &&
			(a.claim.toLowerCase().includes('bloqu') || a.grounds.toLowerCase().includes('bloqu'))
	);
	for (const q of openBlockingQuestions) {
		blockers.push({
			code: 'OPEN_BLOCKING_QUESTION',
			message: `Question bloquante en attente de réponse humaine : ${q.claim}`,
			targetId: q.id
		});
	}

	// c. Violations doctrinales non traitées
	const acceptedViolationIds = new Set(
		(input.acceptedViolations || [])
			.filter((v) => v.justification && v.justification.trim().length > 0)
			.map((v) => v.typedId)
	);

	const violationArguments = input.arguments.filter((a) => {
		if (a.stance !== 'verification') return false;
		if (a.resolution === 'answered' || a.resolution === 'accepted_risk' || a.resolution === 'withdrawn') {
			return false;
		}
		const text = `${a.claim} ${a.grounds}`.toLowerCase();
		return text.includes('violat') || text.includes('non conforme') || text.includes('non-conforme');
	});

	for (const vArg of violationArguments) {
		// Est-ce couvert par un acceptedViolation ?
		const isCovered = vArg.kbRefs.some((ref) => acceptedViolationIds.has(ref));
		if (!isCovered) {
			blockers.push({
				code: 'UNRESOLVED_VIOLATION',
				message: `Violation doctrinale non couverte par une dispense formelle : ${vArg.claim}`,
				targetId: vArg.id
			});
		}
	}

	// d. Couverture réglementaire du projet
	if (input.requiredFrameworks && input.requiredFrameworks.length > 0) {
		for (const fw of input.requiredFrameworks) {
			if (fw.status !== 'covered') {
				blockers.push({
					code: 'COVERAGE_INCOMPLETE',
					message: `Le référentiel réglementaire "${fw.name || fw.frameworkId}" est incomplet (statut: ${fw.status}, requis: "covered").`,
					targetId: fw.frameworkId
				});
			}
		}
	}

	const readyForArbitration = level === 'L2_decomposed' && blockers.length === 0;

	return {
		level,
		readyForArbitration,
		blockers
	};
}
