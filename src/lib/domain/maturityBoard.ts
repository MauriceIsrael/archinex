import type { MaturityLevel, ArchitectRole } from '$lib/types/epistemic';

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
	foundation_contested?: boolean;
	/** Exigences du RFP que ce sujet porte (identifiants du dossier scellé : `SRC-xxxx:clause`). */
	requirement_ids?: string[];
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

export type VisualGapType =
	| 'G1_definition'
	| 'G2_decomposition'
	| 'G3_contradiction'
	| 'G4_compliance'
	| 'G5_competence';

export interface VisualGap {
	type: VisualGapType;
	subject_id: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	description: string;
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
		if (b.unlocks_count !== a.unlocks_count) {
			return b.unlocks_count - a.unlocks_count;
		}
		// 2. Stagnation
		if (b.stall_days !== a.stall_days) {
			return b.stall_days - a.stall_days;
		}
		// 3. Nombre de bloquants
		return b.blocking_count - a.blocking_count;
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
				reason: 'Seul le Lead Architect peut homologuer (L4) ou archiver (L5) une décision architecturale.'
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
			const newBlockingCount = Math.max(0, s.blocking_count - 1);
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
