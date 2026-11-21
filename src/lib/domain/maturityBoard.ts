import type { MaturityLevel, ArchitectRole } from '$lib/types/epistemic';
import { explainActionRefusal } from '$lib/domain/spaceActor';

export interface MaturitySubject {
	id: string;
	section_ref: string;
	name: string;
	level: MaturityLevel;
	blocking_count: number;
	unlocks_count: number;
	waiting_for_role: ArchitectRole;
	relative_effort: 'XS' | 'S' | 'M' | 'L' | 'XL';
	last_transition_date: string; // ISO String
	stall_days: number;
	is_stalled: boolean;
	dependent_subject_ids: string[];
	parent_subject_id?: string;
	parent_subject_name?: string;
	/** Décision tranchée par un autre architecte que le Lead : en attente d'affirmation par un décideur distinct. */
	awaiting_review?: boolean;
	foundation_contested?: boolean;
	/** Exigences du RFP que ce sujet porte (identifiants du dossier scellé : `SRC-xxxx:clause`). */
	requirement_ids?: string[];
	/** Énoncé du problème d'architecture, repris à la création du sujet côté serveur. */
	problem_statement?: string;
	/** Nature proposée à la factorisation : architecture, contractuel ou organisationnel. */
	nature?: 'architecture' | 'contractuel' | 'organisationnel';
	/** Sujets de l'espace à trancher avant celui-ci. */
	depends_on_subject_ids?: string[];
	/** Options, critères et évaluations proposés par le modèle (créés côté serveur à la création du sujet). */
	proposal?: import('$lib/domain/factorization').SubjectProposal;
}

/**
 * Forme brute d'un sujet à la frontière serveur / JSON / store :
 * accepte aussi bien le format métier snake_case (`MaturitySubject`) que le format Prisma / API camelCase.
 */
export interface ServerSubjectLike {
	id: string;
	section_ref?: string | null;
	sectionRef?: string | null;
	name?: string | null;
	level?: MaturityLevel | string | null;
	maturityLevel?: MaturityLevel | string | null;
	blocking_count?: number | string | null;
	blockingCount?: number | string | null;
	unlocks_count?: number | string | null;
	unlocksCount?: number | string | null;
	waiting_for_role?: ArchitectRole | string | null;
	waitingForRole?: ArchitectRole | string | null;
	relative_effort?: MaturitySubject['relative_effort'] | string | null;
	relativeEffort?: MaturitySubject['relative_effort'] | string | null;
	last_transition_date?: string | Date | null;
	lastTransitionDate?: string | Date | null;
	updatedAt?: string | Date | null;
	stall_days?: number | string | null;
	stallDays?: number | string | null;
	is_stalled?: boolean | null;
	isStalled?: boolean | null;
	dependent_subject_ids?: string[] | string | null;
	dependentSubjectIds?: string[] | string | null;
	parent_subject_id?: string | null;
	parentSubjectId?: string | null;
	parent_subject_name?: string | null;
	parentSubjectName?: string | null;
	awaiting_review?: boolean | null;
	deliberationStatus?: string | null;
	foundation_contested?: boolean | null;
	foundationContested?: boolean | null;
	requirement_ids?: string[] | string | null;
	requirementIds?: string[] | string | null;
	requirementRefs?: string[] | string | null;
	problem_statement?: string | null;
	problemStatement?: string | null;
	nature?: MaturitySubject['nature'] | string | null;
	depends_on_subject_ids?: string[] | string | null;
	dependsOnSubjectIds?: string[] | string | null;
	dependsOn?: string[] | string | null;
	proposal?: MaturitySubject['proposal'];
	[key: string]: unknown;
}

const VALID_MATURITY_LEVELS: ReadonlySet<string> = new Set<MaturityLevel>([
	'L0_named',
	'L1_framed',
	'L2_decomposed',
	'L3_decided',
	'L4_specified',
	'L5_archived'
]);

const VALID_RELATIVE_EFFORTS: ReadonlySet<string> = new Set<MaturitySubject['relative_effort']>([
	'XS',
	'S',
	'M',
	'L',
	'XL'
]);

const VALID_NATURES: ReadonlySet<string> = new Set(['architecture', 'contractuel', 'organisationnel']);

/**
 * Convertit une valeur arbitraire en entier fini positif ou nul (`fallback` par défaut, 0).
 */
export function toSafeCount(value: unknown, fallback = 0): number {
	const n =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim() !== ''
				? Number(value)
				: NaN;
	return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function pickSafeCount(...values: unknown[]): number {
	for (const v of values) {
		if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.trunc(v);
		if (typeof v === 'string' && v.trim() !== '') {
			const parsed = Number(v);
			if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
		}
	}
	return 0;
}

function toStringArray(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string');
	}
	if (typeof value === 'string' && value.trim().startsWith('[')) {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed.filter((item): item is string => typeof item === 'string');
			}
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function toIsoDateString(...values: unknown[]): string {
	for (const v of values) {
		if (v instanceof Date && Number.isFinite(v.getTime())) {
			return v.toISOString();
		}
		if (typeof v === 'string' && v.trim().length > 0) {
			return v;
		}
	}
	return new Date().toISOString();
}

/**
 * Normalise un sujet brut (format serveur Prisma camelCase ou format JSON snake_case partiel)
 * vers un `MaturitySubject` canonique avec compteurs finis garantis.
 */
export function normalizeMaturitySubject(raw: ServerSubjectLike): MaturitySubject {
	const rawLevel =
		typeof raw.level === 'string' && VALID_MATURITY_LEVELS.has(raw.level)
			? (raw.level as MaturityLevel)
			: typeof raw.maturityLevel === 'string' && VALID_MATURITY_LEVELS.has(raw.maturityLevel)
				? (raw.maturityLevel as MaturityLevel)
				: 'L0_named';

	const rawEffort =
		typeof raw.relative_effort === 'string' && VALID_RELATIVE_EFFORTS.has(raw.relative_effort)
			? (raw.relative_effort as MaturitySubject['relative_effort'])
			: typeof raw.relativeEffort === 'string' && VALID_RELATIVE_EFFORTS.has(raw.relativeEffort)
				? (raw.relativeEffort as MaturitySubject['relative_effort'])
				: 'M';

	const dependentSubjectIds =
		toStringArray(raw.dependent_subject_ids) ?? toStringArray(raw.dependentSubjectIds) ?? [];
	const requirementIds =
		toStringArray(raw.requirement_ids) ??
		toStringArray(raw.requirementIds) ??
		toStringArray(raw.requirementRefs);
	const dependsOnSubjectIds =
		toStringArray(raw.depends_on_subject_ids) ??
		toStringArray(raw.dependsOnSubjectIds) ??
		toStringArray(raw.dependsOn);

	const parentSubjectId = raw.parent_subject_id ?? raw.parentSubjectId ?? undefined;
	const parentSubjectName = raw.parent_subject_name ?? raw.parentSubjectName ?? undefined;
	const awaitingReview =
		typeof raw.awaiting_review === 'boolean'
			? raw.awaiting_review || undefined
			: raw.deliberationStatus === 'awaiting_review'
				? true
				: undefined;
	const foundationContested =
		typeof raw.foundation_contested === 'boolean'
			? raw.foundation_contested
			: typeof raw.foundationContested === 'boolean'
				? raw.foundationContested
				: undefined;
	const problemStatement =
		(typeof raw.problem_statement === 'string' && raw.problem_statement.trim()) ||
		(typeof raw.problemStatement === 'string' && raw.problemStatement.trim()) ||
		undefined;
	const nature =
		typeof raw.nature === 'string' && VALID_NATURES.has(raw.nature)
			? (raw.nature as MaturitySubject['nature'])
			: undefined;

	const normalized: MaturitySubject = {
		id: String(raw.id),
		section_ref: (raw.section_ref || raw.sectionRef || '§0.0').trim() || '§0.0',
		name: (raw.name || 'Sujet sans titre').trim() || 'Sujet sans titre',
		level: rawLevel,
		blocking_count: pickSafeCount(raw.blocking_count, raw.blockingCount),
		unlocks_count: pickSafeCount(raw.unlocks_count, raw.unlocksCount),
		waiting_for_role: ((raw.waiting_for_role || raw.waitingForRole || 'lead_architect') as ArchitectRole),
		relative_effort: rawEffort,
		last_transition_date: toIsoDateString(raw.last_transition_date, raw.lastTransitionDate, raw.updatedAt),
		stall_days: pickSafeCount(raw.stall_days, raw.stallDays),
		is_stalled:
			typeof raw.is_stalled === 'boolean'
				? raw.is_stalled
				: typeof raw.isStalled === 'boolean'
					? raw.isStalled
					: false,
		dependent_subject_ids: dependentSubjectIds
	};

	if (parentSubjectId) normalized.parent_subject_id = parentSubjectId;
	if (parentSubjectName) normalized.parent_subject_name = parentSubjectName;
	if (awaitingReview) normalized.awaiting_review = awaitingReview;
	if (foundationContested !== undefined) normalized.foundation_contested = foundationContested;
	if (requirementIds && requirementIds.length > 0) normalized.requirement_ids = requirementIds;
	if (problemStatement) normalized.problem_statement = problemStatement;
	if (nature) normalized.nature = nature;
	if (dependsOnSubjectIds && dependsOnSubjectIds.length > 0) {
		normalized.depends_on_subject_ids = dependsOnSubjectIds;
	}
	if (raw.proposal !== undefined) normalized.proposal = raw.proposal;

	return normalized;
}

/**
 * Normalise une collection brute de sujets (tableau ou dictionnaire) vers `MaturitySubject[]`.
 */
export function normalizeMaturitySubjects(raw: unknown): MaturitySubject[] {
	const items: unknown[] = Array.isArray(raw)
		? raw
		: typeof raw === 'object' && raw !== null
			? Object.values(raw as Record<string, unknown>)
			: [];
	return items
		.filter((item): item is ServerSubjectLike => typeof item === 'object' && item !== null && typeof (item as ServerSubjectLike).id === 'string' && (item as ServerSubjectLike).id.length > 0)
		.map((item) => normalizeMaturitySubject(item));
}

export interface ActorContext {
	role: ArchitectRole;
	is_human: boolean;
}

export interface TransitionResult {
	allowed: boolean;
	reason?: string;
	code?:
		| 'SUCCESS'
		| 'HUMAN_GATE_REQUIRED'
		| 'LEAD_ARCHITECT_ROLE_REQUIRED'
		| 'INVALID_LEVEL_TRANSITION'
		| 'CRITERIA_UNMET';
	missingCriteria?: string[];
}

/**
 * Calcule la durée de stagnation en jours et lève l'alerte si >= 14 jours sous L3.
 */
export function computeStallDays(
	lastTransitionDate: string,
	currentDate: Date = new Date(),
	thresholdDays: number = 14
): { stall_days: number; is_stalled: boolean } {
	const lastDate = new Date(lastTransitionDate);
	const diffMs = currentDate.getTime() - lastDate.getTime();
	const stall_days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
	const is_stalled = stall_days >= thresholdDays;
	return { stall_days, is_stalled };
}

/**
 * Règle d'or de tri du Board de Maturité :
 * 1. `unlocks_count` Décroissant (priorité absolue à l'impact systémique / effet multiplicateur)
 * 2. `stall_days` Décroissant (éviter l'enlisement)
 * 3. `blocking_count` Décroissant
 */
export function sortMaturityBoard(subjects: MaturitySubject[]): MaturitySubject[] {
	return [...subjects].sort((a, b) => {
		// 1. Débloque (effet domino)
		const bUnlocks = toSafeCount(b.unlocks_count);
		const aUnlocks = toSafeCount(a.unlocks_count);
		if (bUnlocks !== aUnlocks) {
			return bUnlocks - aUnlocks;
		}
		// 2. Stagnation
		const bStall = toSafeCount(b.stall_days);
		const aStall = toSafeCount(a.stall_days);
		if (bStall !== aStall) {
			return bStall - aStall;
		}
		// 3. Nombre de bloquants
		return toSafeCount(b.blocking_count) - toSafeCount(a.blocking_count);
	});
}

const MATURITY_HIERARCHY: MaturityLevel[] = [
	'L0_named',
	'L1_framed',
	'L2_decomposed',
	'L3_decided',
	'L4_specified',
	'L5_archived'
];

import { computeMaturityCriteria, type MaturityCriteriaInput } from './maturityCriteria';

/**
 * Vérifie l'éligibilité d'une transition de maturité en appliquant les deux gates humains stricts :
 * - Porte G3 (L3) : Interdiction formelle aux agents IA de promouvoir à L3 sans arbitrage humain.
 * - Porte d'homologation (L4/L5) : Réservé exclusivement au Lead Architect humain.
 * - Critères de passage calculés (optionnel si criteriaInput fourni).
 */
export function canTransitionMaturity(
	currentLevel: MaturityLevel,
	targetLevel: MaturityLevel,
	actor: ActorContext,
	criteriaInput?: MaturityCriteriaInput
): TransitionResult {
	const currentIndex = MATURITY_HIERARCHY.indexOf(currentLevel);
	const targetIndex = MATURITY_HIERARCHY.indexOf(targetLevel);

	if (currentIndex === -1 || targetIndex === -1 || targetIndex < currentIndex) {
		return {
			allowed: false,
			code: 'INVALID_LEVEL_TRANSITION',
			reason: `Transition invalide de ${currentLevel} vers ${targetLevel}.`
		};
	}

	// Passage vers L3_decided (Porte G3)
	if (targetIndex >= 3 && !actor.is_human) {
		return {
			allowed: false,
			code: 'HUMAN_GATE_REQUIRED',
			reason: 'Porte G3 violée : Une promotion à L3+ exige formellement la signature d\'un architecte humain.'
		};
	}

	// Passage vers L4_specified ou L5_archived (Porte d'homologation)
	if (targetIndex >= 4) {
		if (!actor.is_human) {
			return {
				allowed: false,
				code: 'HUMAN_GATE_REQUIRED',
				reason: 'Porte d\'homologation violée : Une promotion à L4/L5 exige formellement la signature d\'un architecte humain.'
			};
		}
		if (actor.role !== 'lead_architect' && actor.role !== 'Lead Architect') {
			return {
				allowed: false,
				code: 'LEAD_ARCHITECT_ROLE_REQUIRED',
				reason: explainActionRefusal('homologate', actor.role, { targetLevel })
			};
		}
	}

	// Vérification approfondie des critères de passage si contexte fourni
	if (criteriaInput) {
		const report = computeMaturityCriteria(criteriaInput);
		const targetTransition = report.transitions[targetLevel];
		if (targetTransition && !targetTransition.allowed) {
			return {
				allowed: false,
				code: 'CRITERIA_UNMET',
				reason: `Critères de passage non remplis : ${targetTransition.missingReasons.join(' ; ')}. ${targetTransition.unblockHint || ''}`.trim(),
				missingCriteria: targetTransition.missingReasons
			};
		}
	}

	return { allowed: true, code: 'SUCCESS' };
}

/**
 * Résout un sujet et propage le déblocage en chaîne aux sujets dépendants.
 */
export function resolveSubjectArbitration(
	resolvedSubjectId: string,
	allSubjects: MaturitySubject[]
): {
	updatedSubjects: MaturitySubject[];
	unblockedSubjectIds: string[];
} {
	const target = allSubjects.find((s) => s.id === resolvedSubjectId);
	if (!target) {
		return { updatedSubjects: allSubjects, unblockedSubjectIds: [] };
	}

	const unblockedSubjectIds = [...target.dependent_subject_ids];

	const updatedSubjects = allSubjects.map((s) => {
		if (s.id === resolvedSubjectId) {
			return {
				...s,
				level: 'L3_decided' as MaturityLevel,
				blocking_count: 0,
				is_stalled: false,
				stall_days: 0
			};
		}

		if (unblockedSubjectIds.includes(s.id)) {
			const newBlockingCount = Math.max(0, toSafeCount(s.blocking_count) - 1);
			return {
				...s,
				blocking_count: newBlockingCount
			};
		}

		return s;
	});

	return {
		updatedSubjects: sortMaturityBoard(updatedSubjects),
		unblockedSubjectIds
	};
}
