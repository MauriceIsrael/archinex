import type { MaturityLevel } from '$lib/types/epistemic';
import type { Argument } from './debate';

export type MaturityStep =
	| 'L0_named'
	| 'L1_framed'
	| 'L2_decomposed'
	| 'L3_decided'
	| 'L4_specified'
	| 'L5_archived';

export interface MaturityCriterion {
	id: string;
	label: string;
	description: string;
	satisfied: boolean;
	actionLabel: string;
	actionType:
		| 'edit_problem'
		| 'edit_scope'
		| 'add_doctrine_ref'
		| 'add_option'
		| 'define_criteria'
		| 'resolve_question'
		| 'resolve_objection'
		| 'run_verifier'
		| 'hub_affirmation'
		| 'derive_subjects'
		| 'write_spec'
		| 'lead_gate';
	actionTarget?: string;
	unblockRole?: string;
}

export interface TransitionCheck {
	targetLevel: MaturityLevel;
	allowed: boolean;
	locked: boolean;
	lockRole?: string;
	criteria: MaturityCriterion[];
	missingReasons: string[];
	unblockHint?: string;
}

export interface ConvergenceStats {
	supportsCount: number;
	resolvedObjectionsCount: number;
	openObjectionsCount: number;
	ratioPercent: number;
}

export interface MaturityCriteriaInput {
	subject: {
		id: string;
		name: string;
		problemStatement?: string | null;
		scope?: string | null;
		sectionRef?: string | null;
		level: MaturityLevel;
		hubLevel?: MaturityLevel | null;
		is_stalled?: boolean;
		stall_days?: number;
	};
	criteria?: Array<{ id: string; name: string }>;
	options?: Array<{ id: string; title: string }>;
	arguments?: Argument[];
	doctrineConstraintsCount?: number;
	openQuestionsCount?: number;
	verifierPassed?: boolean;
	decision?: {
		authorId?: string;
		affirmedBy?: string;
		status?: string;
	} | null;
	derivedSubjects?: Array<{ id: string; level: MaturityLevel }>;
	specificationPresent?: boolean;
	actor?: {
		userId?: string;
		role: string;
		isHuman: boolean;
	};
	isHubCutover?: boolean;
}

export interface MaturityTransitionsReport {
	currentLevel: MaturityLevel;
	displayedLevel: MaturityLevel;
	sourceOfRecord: 'local' | 'hub';
	hubLevel: MaturityLevel | null;
	isStalled: boolean;
	stallDays: number;
	convergence: ConvergenceStats;
	transitions: Record<MaturityLevel, TransitionCheck>;
	nextTransition: TransitionCheck | null;
	suggestDecomposition: boolean;
	relanceMessage?: string;
}

const MATURITY_STEPS: MaturityLevel[] = [
	'L0_named',
	'L1_framed',
	'L2_decomposed',
	'L3_decided',
	'L4_specified',
	'L5_archived'
];

/**
 * Calcule les statistiques de convergence entre soutiens, objections résolues et objections ouvertes.
 */
export function calculateConvergence(args: Argument[] = []): ConvergenceStats {
	const supportsCount = args.filter((a) => a.stance === 'support').length;
	const resolvedObjectionsCount = args.filter(
		(a) => a.stance === 'objection' && a.resolution !== 'open'
	).length;
	const openObjectionsCount = args.filter(
		(a) => a.stance === 'objection' && a.resolution === 'open'
	).length;

	const positive = supportsCount + resolvedObjectionsCount;
	const denominator = positive + openObjectionsCount;
	const ratioPercent = denominator === 0 ? 100 : Math.round((positive / denominator) * 100);

	return {
		supportsCount,
		resolvedObjectionsCount,
		openObjectionsCount,
		ratioPercent
	};
}

/**
 * Calcule de façon pure l'ensemble des critères de passage L0 -> L5.
 *
 * Respecte les exigences A26 :
 * - L0->L1 : problème formulé, périmètre, au moins 1 contrainte #base rattachée ;
 * - L1->L2 : au moins 2 options, critères de choix définis, aucune question de cadrage ouverte ;
 * - L2->L3 : aucune objection ouverte, vérificateur passé, décision affirmée dans le Hub par un decider distinct de son auteur (K16) ;
 * - L3->L4 : sujets dérivés traités jusqu'à L1 au moins (A28), spécification rédigée, Lead Architect ;
 * - Projet basculé (SoR: hub) : la maturité affichée est celle du Hub, même si les critères locaux sont tous verts.
 */
export function computeMaturityCriteria(input: MaturityCriteriaInput): MaturityTransitionsReport {
	const currentLevel = input.subject.level;
	const isHubCutover = Boolean(input.isHubCutover);
	const hubLevel = input.subject.hubLevel ?? null;

	// Si projet basculé, la maturité affichée est strictement celle du Hub
	const displayedLevel = isHubCutover && hubLevel ? hubLevel : currentLevel;
	const sourceOfRecord: 'local' | 'hub' = isHubCutover ? 'hub' : 'local';

	const args = input.arguments || [];
	const convergence = calculateConvergence(args);

	// Éléments d'évaluation
	const hasProblem = Boolean(
		input.subject.problemStatement && input.subject.problemStatement.trim().length > 0
	);
	const hasScope = Boolean(
		(input.subject.scope && input.subject.scope.trim().length > 0) ||
			(input.subject.sectionRef && input.subject.sectionRef.trim().length > 0)
	);
	const argsKbRefsCount = args.reduce((acc, a) => acc + (a.kbRefs?.length || 0), 0);
	const hasDoctrine = (input.doctrineConstraintsCount ?? 0) > 0 || argsKbRefsCount > 0;

	const optionsCount = input.options?.length ?? 0;
	const criteriaCount = input.criteria?.length ?? 0;
	const openQuestionsArgs = args.filter((a) => a.stance === 'question' && a.resolution === 'open');
	const openQuestions = (input.openQuestionsCount ?? 0) + openQuestionsArgs.length;

	const openObjections = args.filter((a) => a.stance === 'objection' && a.resolution === 'open');
	const verifierPassed =
		input.verifierPassed === true ||
		args.some((a) => a.stance === 'verification' && a.resolution !== 'open');

	// Décision affirmée dans le Hub par un décideur distinct de son auteur (K16)
	const dec = input.decision;
	const isAuthor = Boolean(
		input.actor?.userId && dec?.authorId && input.actor.userId === dec.authorId
	);
	const isDeciderRole =
		input.actor?.role === 'decider' ||
		input.actor?.role === 'domain_expert' ||
		input.actor?.role === 'lead_architect' ||
		input.actor?.role === 'admin';

	const affirmedByDistinct = Boolean(
		dec &&
			dec.affirmedBy &&
			dec.authorId &&
			dec.affirmedBy !== dec.authorId &&
			(dec.status === 'active' || dec.status === 'asserted')
	);
	const hubAffirmed = isHubCutover ? (hubLevel === 'L3_decided' || hubLevel === 'L4_specified' || affirmedByDistinct) : affirmedByDistinct || Boolean(dec && dec.affirmedBy && dec.affirmedBy !== dec.authorId);

	// Sujets dérivés jusqu'à L1 au moins (A28)
	const derived = input.derivedSubjects || [];
	const derivedAllL1OrMore =
		derived.length === 0 ||
		derived.every((d) => d.level !== 'L0_named');

	const hasSpec = input.specificationPresent === true;
	const isLead =
		input.actor?.isHuman === true &&
		(input.actor?.role === 'lead_architect' ||
			input.actor?.role === 'admin' ||
			input.actor?.role === 'Lead Architect');

	// 1. Transition L0 -> L1
	const l0Criteria: MaturityCriterion[] = [
		{
			id: 'problem_formulated',
			label: 'Problème d’architecture formulé',
			description: 'Un énoncé clair du problème doit être renseigné dans le sujet.',
			satisfied: hasProblem,
			actionLabel: 'Formuler le problème',
			actionType: 'edit_problem',
			unblockRole: 'Architecte'
		},
		{
			id: 'scope_defined',
			label: 'Périmètre délimité',
			description: 'Le périmètre technique ou la section de rattachement doit être précisé.',
			satisfied: hasScope,
			actionLabel: 'Définir le périmètre',
			actionType: 'edit_scope',
			unblockRole: 'Architecte'
		},
		{
			id: 'doctrine_attached',
			label: 'Au moins une contrainte de la base rattachée',
			description: 'Le sujet doit être contextualisé par au moins une règle ou contrainte (#base).',
			satisfied: hasDoctrine,
			actionLabel: 'Rattacher une contrainte #base',
			actionType: 'add_doctrine_ref',
			unblockRole: 'Architecte'
		}
	];

	// 2. Transition L1 -> L2
	const l1Criteria: MaturityCriterion[] = [
		{
			id: 'options_plurality',
			label: 'Au moins 2 options d’architecture',
			description: 'La décomposition requiert au moins 2 options concurrentes.',
			satisfied: optionsCount >= 2,
			actionLabel: 'Créer une seconde option',
			actionType: 'add_option',
			unblockRole: 'Architecte'
		},
		{
			id: 'selection_criteria',
			label: 'Critères de choix définis',
			description: 'Des critères d’évaluation comparatifs doivent être posés.',
			satisfied: criteriaCount >= 2,
			actionLabel: 'Définir les critères',
			actionType: 'define_criteria',
			unblockRole: 'Architecte'
		},
		{
			id: 'no_open_questions',
			label: 'Aucune question de cadrage ouverte',
			description: 'Toutes les interrogations soulevées doivent être résolues.',
			satisfied: openQuestions === 0,
			actionLabel: 'Résoudre les questions ouvertes',
			actionType: 'resolve_question',
			actionTarget: openQuestionsArgs[0]?.id,
			unblockRole: 'Contributeur'
		}
	];

	// 3. Transition L2 -> L3 (🔒 Verrou : Décideur distinct K16)
	let hubAffirmationMissingReason = '';
	if (isHubCutover && !hubAffirmed) {
		hubAffirmationMissingReason =
			'Projet basculé vers le Hub : L3 requiert une affirmation formelle dans le Hub par un décideur distinct de son auteur.';
	} else if (!hubAffirmed) {
		hubAffirmationMissingReason =
			'La décision doit être affirmée par un décideur qualifié distinct de son auteur (K16).';
	}
	if (isAuthor) {
		hubAffirmationMissingReason += ' Vous êtes l’auteur de la décision, vous ne pouvez pas vous auto-valider.';
	}

	const l2Criteria: MaturityCriterion[] = [
		{
			id: 'no_open_objections',
			label: 'Aucune objection ouverte (ou risque accepté)',
			description: 'Toutes les objections doivent être levées, retirées ou acceptées en risque.',
			satisfied: openObjections.length === 0,
			actionLabel: 'Traiter les objections',
			actionType: 'resolve_objection',
			actionTarget: openObjections[0]?.id,
			unblockRole: 'Lead Architect / Expert'
		},
		{
			id: 'verifier_passed',
			label: 'Vérificateur d’architecture passé',
			description: 'L’agent vérificateur doit avoir inspecté et validé la conformité doctrinale.',
			satisfied: verifierPassed,
			actionLabel: 'Passer le vérificateur',
			actionType: 'run_verifier',
			unblockRole: 'Agent Vérificateur'
		},
		{
			id: 'hub_decision_affirmed',
			label: 'Décision affirmée dans le Hub par un decider distinct de son auteur',
			description:
				'Validation formelle K16 : Seul un décideur distinct de l’auteur peut acter le choix.',
			satisfied: hubAffirmed,
			actionLabel: 'Demander l’affirmation',
			actionType: 'hub_affirmation',
			unblockRole: 'Décideur distinct (K16)'
		}
	];

	// 4. Transition L3 -> L4 (🔒 Verrou : Lead Architect)
	const l3Criteria: MaturityCriterion[] = [
		{
			id: 'derived_subjects_l1',
			label: 'Sujets dérivés traités jusqu’à L1 au moins (A28)',
			description: 'Tous les sous-sujets enfants doivent être au minimum cadrés (L1+).',
			satisfied: derivedAllL1OrMore,
			actionLabel: 'Cadrer les sous-sujets',
			actionType: 'derive_subjects',
			unblockRole: 'Architecte'
		},
		{
			id: 'specification_drafted',
			label: 'Spécification technique rédigée',
			description: 'La formalisation DLD ou la spécification détaillée doit être rédigée.',
			satisfied: hasSpec,
			actionLabel: 'Rédiger la spécification',
			actionType: 'write_spec',
			unblockRole: 'Architecte'
		},
		{
			id: 'lead_architect_approval',
			label: 'Validation par le Lead Architect',
			description: 'L’homologation à L4 est strictement réservée au Lead Architect.',
			satisfied: isLead,
			actionLabel: 'Homologation Lead Architect',
			actionType: 'lead_gate',
			unblockRole: 'Lead Architect'
		}
	];

	// 5. Transition L4 -> L5
	const l4Criteria: MaturityCriterion[] = [
		{
			id: 'archiving_signoff',
			label: 'Clôture et archivage de la décision',
			description: 'Archivage opposable scellé par le Lead Architect.',
			satisfied: isLead,
			actionLabel: 'Archiver la décision',
			actionType: 'lead_gate',
			unblockRole: 'Lead Architect'
		}
	];

	function buildTransition(
		targetLevel: MaturityLevel,
		criteria: MaturityCriterion[],
		locked: boolean,
		lockRole?: string
	): TransitionCheck {
		const unsatisfied = criteria.filter((c) => !c.satisfied);
		const allowed = unsatisfied.length === 0;
		const missingReasons = unsatisfied.map((c) => c.label);
		let unblockHint: string | undefined = undefined;

		if (!allowed) {
			const roles = Array.from(new Set(unsatisfied.map((c) => c.unblockRole).filter(Boolean)));
			unblockHint = `Déblocage par : ${roles.join(', ') || 'équipe d’architecture'}`;
		}

		return {
			targetLevel,
			allowed,
			locked,
			lockRole,
			criteria,
			missingReasons,
			unblockHint
		};
	}

	const transitions: Record<MaturityLevel, TransitionCheck> = {
		L0_named: {
			targetLevel: 'L0_named',
			allowed: true,
			locked: false,
			criteria: [],
			missingReasons: []
		},
		L1_framed: buildTransition('L1_framed', l0Criteria, false),
		L2_decomposed: buildTransition('L2_decomposed', l1Criteria, false),
		L3_decided: buildTransition('L3_decided', l2Criteria, true, 'Décideur distinct (K16)'),
		L4_specified: buildTransition('L4_specified', l3Criteria, true, 'Lead Architect'),
		L5_archived: buildTransition('L5_archived', l4Criteria, true, 'Lead Architect')
	};

	// Prochaine transition théorique
	const currentIndex = MATURITY_STEPS.indexOf(displayedLevel);
	const nextLevel = currentIndex < MATURITY_STEPS.length - 1 ? MATURITY_STEPS[currentIndex + 1] : null;
	const nextTransition = nextLevel ? transitions[nextLevel] : null;

	const isStalled = Boolean(input.subject.is_stalled);
	const stallDays = input.subject.stall_days ?? (isStalled ? 14 : 0);
	const suggestDecomposition = isStalled && (displayedLevel === 'L1_framed' || displayedLevel === 'L2_decomposed');
	const relanceMessage = suggestDecomposition
		? `Ce sujet stagne depuis ${stallDays} jours sans convergence. Il est recommandé de découper le sujet en 2 sous-sujets plus restreints pour débloquer les arbitrages.`
		: undefined;

	return {
		currentLevel,
		displayedLevel,
		sourceOfRecord,
		hubLevel,
		isStalled,
		stallDays,
		convergence,
		transitions,
		nextTransition,
		suggestDecomposition,
		relanceMessage
	};
}
