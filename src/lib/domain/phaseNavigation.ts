import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { MaturityLevel } from '$lib/types/epistemic';

export type PhaseId =
	| 'appropriation'
	| 'deliberation'
	| 'rendu'
	| 'refinement'
	| 'consolidation';

export type PhaseStatus = 'not_started' | 'in_progress' | 'ready' | 'blocked';

export interface PhaseState {
	id: PhaseId;
	status: PhaseStatus;
	statusLabel: string;
	reason: string;
}

export interface NextAction {
	phaseId: PhaseId;
	viewMode?: 'board' | 'conversation';
	label: string;
	reason: string;
}

export interface PhaseNavigationSummary {
	phases: Record<PhaseId, PhaseState>;
	nextAction: NextAction;
}

export interface PhaseNavigationInput {
	corpusCount: number;
	subjects: ReadonlyArray<
		Pick<MaturitySubject, 'id' | 'section_ref' | 'name' | 'level' | 'blocking_count' | 'awaiting_review'>
	>;
	activeSubject?:
		| Pick<MaturitySubject, 'id' | 'section_ref' | 'name' | 'level' | 'blocking_count' | 'awaiting_review'>
		| null;
	frozenSnapshotIds: ReadonlyArray<string>;
	isArchived?: boolean;
}

const STATUS_LABELS: Record<PhaseStatus, string> = {
	not_started: 'Non démarré',
	in_progress: 'En cours',
	ready: 'Prêt',
	blocked: 'Bloqué'
};

const MATURITY_SHORT: Record<MaturityLevel, string> = {
	L0_named: 'L0 (Nommé)',
	L1_framed: 'L1 (Cadré)',
	L2_decomposed: 'L2 (Décomposé)',
	L3_decided: 'L3 (Décidé)',
	L4_specified: 'L4 (Spécifié)',
	L5_archived: 'L5 (Scellé)'
};

function isDecidedOrBeyond(level: MaturityLevel): boolean {
	return level === 'L3_decided' || level === 'L4_specified' || level === 'L5_archived';
}

function isSpecifiedOrBeyond(level: MaturityLevel): boolean {
	return level === 'L4_specified' || level === 'L5_archived';
}

function isInProgressLevel(level: MaturityLevel): boolean {
	return level === 'L1_framed' || level === 'L2_decomposed';
}

function makeState(id: PhaseId, status: PhaseStatus, reason: string): PhaseState {
	return {
		id,
		status,
		statusLabel: STATUS_LABELS[status],
		reason
	};
}

/**
 * Calcule l'état de chaque phase (non démarré / en cours / prêt / bloqué) avec sa raison
 * explicative, ainsi que l'unique « prochaine action » recommandée pour le projet/sujet actif.
 */
export function computePhaseNavigation(input: PhaseNavigationInput): PhaseNavigationSummary {
	const { corpusCount, subjects, frozenSnapshotIds, isArchived = false } = input;
	const frozenSet = new Set(frozenSnapshotIds);
	const target = input.activeSubject ?? subjects[0] ?? null;

	// 1. Phase 1 : Corpus & Règles
	let appropriation: PhaseState;
	if (corpusCount === 0 && subjects.length === 0) {
		appropriation = makeState(
			'appropriation',
			'not_started',
			'Aucun document importé dans le corpus du projet.'
		);
	} else if (subjects.length === 0) {
		appropriation = makeState(
			'appropriation',
			'in_progress',
			`${corpusCount} document(s) importé(s), aucun sujet d'architecture encore structuré.`
		);
	} else {
		appropriation = makeState(
			'appropriation',
			'ready',
			`${corpusCount} document(s) et ${subjects.length} sujet(s) prêts pour l'instruction.`
		);
	}

	// 2. Phase 2 : Délibération (à l'échelle du sujet actif)
	let deliberation: PhaseState;
	if (!target) {
		deliberation = makeState(
			'deliberation',
			'blocked',
			'Importez un corpus ou créez au moins un sujet en Phase 1 avant de délibérer.'
		);
	} else if (target.blocking_count > 0) {
		deliberation = makeState(
			'deliberation',
			'blocked',
			`${target.blocking_count} blocage(s) ouvert(s) sur ${target.section_ref} à lever avant arbitrage.`
		);
	} else if (isDecidedOrBeyond(target.level)) {
		deliberation = makeState(
			'deliberation',
			'ready',
			`Sujet ${target.section_ref} arbitré (${MATURITY_SHORT[target.level]}).`
		);
	} else if (target.awaiting_review) {
		deliberation = makeState(
			'deliberation',
			'in_progress',
			`Décision sur ${target.section_ref} en attente de ratification par un décideur distinct.`
		);
	} else if (isInProgressLevel(target.level)) {
		deliberation = makeState(
			'deliberation',
			'in_progress',
			`Délibération en cours sur ${target.section_ref} (${MATURITY_SHORT[target.level]}).`
		);
	} else {
		deliberation = makeState(
			'deliberation',
			'not_started',
			`Sujet ${target.section_ref} nommé (L0) : cadrage non démarré.`
		);
	}

	// 3. Phase 3 : Rendu HLD & Scellement
	let rendu: PhaseState;
	if (!target) {
		rendu = makeState('rendu', 'blocked', 'Aucun sujet disponible pour produire un rendu HLD.');
	} else if (frozenSet.has(target.id) || target.level === 'L5_archived') {
		rendu = makeState('rendu', 'ready', `Rendu HLD scellé pour ${target.section_ref}.`);
	} else if (isDecidedOrBeyond(target.level)) {
		rendu = makeState(
			'rendu',
			'in_progress',
			`Sujet ${target.section_ref} arbitré (${MATURITY_SHORT[target.level]}) : prêt à être consolidé et scellé en HLD.`
		);
	} else {
		rendu = makeState(
			'rendu',
			'blocked',
			`Décision L3 requise sur ${target.section_ref} avant de sceller le rendu HLD (actuellement ${MATURITY_SHORT[target.level]}).`
		);
	}

	// 4. Phase 4 : Raffinement LLD (opposable uniquement après L3, cf. #380)
	let refinement: PhaseState;
	if (!target) {
		refinement = makeState(
			'refinement',
			'blocked',
			'Aucun sujet disponible pour le raffinement technique LLD.'
		);
	} else if (!isDecidedOrBeyond(target.level)) {
		refinement = makeState(
			'refinement',
			'blocked',
			`Raffinement LLD non opposable tant que ${target.section_ref} n'est pas décidé en L3 (actuellement ${MATURITY_SHORT[target.level]}).`
		);
	} else if (isSpecifiedOrBeyond(target.level)) {
		refinement = makeState(
			'refinement',
			'ready',
			`Sujet ${target.section_ref} raffiné et spécifié (${MATURITY_SHORT[target.level]}).`
		);
	} else {
		refinement = makeState(
			'refinement',
			'in_progress',
			`Sujet ${target.section_ref} décidé (L3) : prêt pour le raffinement technique LLD.`
		);
	}

	// 5. Phase 5 : Consolidation Projet (transversale multi-sujets)
	const decidedCount = subjects.filter((s) => isDecidedOrBeyond(s.level)).length;
	const sealedCount = subjects.filter(
		(s) => frozenSet.has(s.id) || s.level === 'L5_archived'
	).length;

	let consolidation: PhaseState;
	if (subjects.length === 0) {
		consolidation = makeState(
			'consolidation',
			'blocked',
			'Aucun sujet dans le projet à consolider.'
		);
	} else if (decidedCount === 0) {
		consolidation = makeState(
			'consolidation',
			'blocked',
			`Aucun sujet n'a encore atteint L3 (Décidé) sur ${subjects.length} sujet(s) pour alimenter la consolidation.`
		);
	} else if (decidedCount === subjects.length) {
		consolidation = makeState(
			'consolidation',
			'ready',
			`Tous les sujets (${decidedCount}/${subjects.length}) sont arbitrés${sealedCount > 0 ? ` (${sealedCount} scellé(s))` : ''} : prêt pour consolidation transverse.`
		);
	} else {
		consolidation = makeState(
			'consolidation',
			'in_progress',
			`Consolidation partielle : ${decidedCount}/${subjects.length} sujet(s) arbitré(s) (L3+).`
		);
	}

	// Prochaine action unique recommandée
	let nextAction: NextAction;
	if (isArchived) {
		nextAction = {
			phaseId: 'consolidation',
			label: 'Consulter la synthèse',
			reason: 'Espace archivé en consultation seule.'
		};
	} else if (subjects.length === 0) {
		nextAction = {
			phaseId: 'appropriation',
			label: corpusCount === 0 ? 'Importer le corpus' : 'Structurer les sujets',
			reason: appropriation.reason
		};
	} else if (target && !isDecidedOrBeyond(target.level)) {
		nextAction = {
			phaseId: 'deliberation',
			viewMode: 'conversation',
			label:
				target.blocking_count > 0
					? `Lever les blocages (${target.section_ref})`
					: target.awaiting_review
						? `Ratifier ${target.section_ref}`
						: `Arbitrer ${target.section_ref}`,
			reason: deliberation.reason
		};
	} else if (target && !frozenSet.has(target.id) && target.level !== 'L5_archived') {
		nextAction = {
			phaseId: 'rendu',
			label: `Sceller le HLD (${target.section_ref})`,
			reason: rendu.reason
		};
	} else if (target && !isSpecifiedOrBeyond(target.level)) {
		nextAction = {
			phaseId: 'refinement',
			label: `Raffiner en LLD (${target.section_ref})`,
			reason: refinement.reason
		};
	} else if (decidedCount < subjects.length) {
		nextAction = {
			phaseId: 'deliberation',
			viewMode: 'board',
			label: `Poursuivre les sujets (${decidedCount}/${subjects.length})`,
			reason: `${subjects.length - decidedCount} sujet(s) restent à arbitrer en L3.`
		};
	} else {
		nextAction = {
			phaseId: 'consolidation',
			label: 'Consolider le projet',
			reason: consolidation.reason
		};
	}

	return {
		phases: {
			appropriation,
			deliberation,
			rendu,
			refinement,
			consolidation
		},
		nextAction
	};
}
