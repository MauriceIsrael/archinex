import { canonicalJson } from '$lib/domain/canonicalJson';
import { universalSha256 } from '$lib/validation/epistemicEnvelope';

export type EpistemicStatus =
	| 'validated'
	| 'reused_confirmed'
	| 'ai_proposed'
	| 'assumption'
	| 'contested';

export type AssertionLevel = 'asserted' | 'proposed' | 'assumption' | 'open';

export const ASSERTION_OF: Record<EpistemicStatus, AssertionLevel> = {
	validated: 'asserted',
	reused_confirmed: 'asserted',
	ai_proposed: 'proposed',
	assumption: 'assumption',
	contested: 'open'
};

export const HUMAN_BASES = ['human_validation', 'reuse_confirmation'] as const;
export const UNRIPE_MATURITIES = ['L0_named', 'L1_framed', 'L2_decomposed'] as const;

export type ConfidentialityLevel = 'public' | 'internal' | 'confidential' | 'secret';

export interface ProvenanceInfo {
	basis: 'human_validation' | 'reuse_confirmation' | 'ai_proposal' | 'assumption' | string;
	by: string[];
	at: string;
	references?: string[];
}

export interface EngagementIdentity {
	id: string;
	title: string;
	language: string;
	confidentiality: ConfidentialityLevel;
	client_label: string;
}

export interface BundlePins {
	llmops_contract_version?: string;
	kb?: {
		snapshot_id: string;
		payload_sha256: string;
	};
	frameworks?: Array<{
		framework_id: string;
		version: string;
		source_sha256: string;
		coverage: string;
	}>;
	embedding?: {
		model: string;
		version: string;
	};
}

export interface SourceDocument {
	id: string;
	kind: string;
	title: string;
	language: string;
	sha256: string;
}

export interface BundleRequirement {
	id: string;
	source_document_id: string;
	clause_ref: string;
	text: string;
	language: string;
	// ── Extension « audit des exigences » (champs optionnels : un dossier sans audit reste valide) ──
	title?: string;
	criticality?: 'bloquant' | 'majeur' | 'info';
	category?: string;
	/** État retenu : la décision humaine si elle existe, sinon la proposition du modèle. */
	disposition?: 'deliberated' | 'evacuated' | 'clarification_needed' | 'to_qualify';
	/** Motif de l'évacuation, tension à délibérer ou raison de l'indécision. */
	disposition_reason?: string;
	clarification_question?: string;
	/** `asserted` : décidé par un humain. `proposed` : proposé par le modèle. `open` : non qualifié. */
	assertion_level?: AssertionLevel;
	provenance?: ProvenanceInfo;
}

export interface OpenQuestion {
	id: string;
	text: string;
	status?: string;
}

export interface BundleSubject {
	id: string;
	title: string;
	domains: string[];
	maturity: string;
	status: 'open' | 'in_progress' | 'decided' | 'archived';
	requirement_ids: string[];
	decision_ids: string[];
	open_questions?: OpenQuestion[];
}

export interface BundleDecision {
	id: string;
	subject_id: string;
	status: 'proposed' | 'validated' | 'reused' | 'superseded';
	epistemic_status: EpistemicStatus;
	assertion_level: AssertionLevel;
	decision: string;
	justification: string;
	alternatives?: string[];
	consequences?: string[];
	provenance: ProvenanceInfo;
	derived_from?: {
		kb_ref: string;
		reuse_log_id: string;
	};
}

export interface BundleStatement {
	id: string;
	subject_id: string;
	epistemic_status: EpistemicStatus;
	assertion_level: AssertionLevel;
	text: string;
	property: string;
	value: unknown;
	provenance: ProvenanceInfo;
}

export interface BundleCompliance {
	id: string;
	requirement_id: string;
	control_ref: string;
	epistemic_status: EpistemicStatus;
	assertion_level: AssertionLevel;
	implementation_statement: string;
	decision_ids: string[];
	provenance: ProvenanceInfo;
}

export interface BundleConflict {
	id: string;
	kind: 'contradiction' | 'principle_violation' | 'stale_basis';
	status: 'open' | 'arbitrated' | 'resolved';
	statement_ids: string[];
	description?: string;
	resolution?: string;
}

export interface BundleGap {
	id: string;
	code: string;
	subject_id?: string;
	requirement_id?: string;
	description: string;
	blocking: boolean;
}

export interface BundleElement {
	id: string;
	name: string;
	kind: string;
	boundary_id?: string;
	decision_ids?: string[];
	epistemic_status?: EpistemicStatus;
	assertion_level?: AssertionLevel;
	provenance?: ProvenanceInfo;
}

export interface BundleRelation {
	id: string;
	from: string;
	to: string;
	kind: string;
	decision_ids?: string[];
	epistemic_status?: EpistemicStatus;
	assertion_level?: AssertionLevel;
	provenance?: ProvenanceInfo;
}

export interface BundleArchitecture {
	elements: BundleElement[];
	relations: BundleRelation[];
}

export interface KbReference {
	ref: string;
	version?: string | null;
	citable: boolean;
	confidence?: string;
	title?: string;
}

export interface ReuseAssumption {
	text: string;
	status: 'holds' | 'does_not_hold' | 'unknown';
}

export interface ReuseLogEntry {
	id: string;
	matched_ref: string;
	outcome: 'reused' | 'reused_with_exception' | 'rejected_not_same' | 'rejected_other';
	assumptions: ReuseAssumption[];
	comment: string | null;
	by: string;
	at: string;
}

export interface GlossaryTerm {
	term: string;
	definition: string;
	kb_ref?: string;
}

export interface EngagementBundleData {
	engagement: EngagementIdentity;
	is_provisional: boolean;
	provisional_reasons: {
		unripe_subjects: string[];
		open_conflicts: string[];
	};
	pins: BundlePins;
	source_documents: SourceDocument[];
	requirements: BundleRequirement[];
	subjects: BundleSubject[];
	decisions: BundleDecision[];
	statements: BundleStatement[];
	conflicts: BundleConflict[];
	compliance: BundleCompliance[];
	gaps: BundleGap[];
	architecture: BundleArchitecture;
	kb_references: KbReference[];
	reuse_log: ReuseLogEntry[];
	glossary: GlossaryTerm[];
}

export interface EngagementBundle {
	schemaVersion: '1.0';
	snapshotId: string;
	sourceSystem: 'archinex';
	createdAt: string;
	sourceRevision: string;
	data: EngagementBundleData;
	checksum: string;
}

export interface BuildEngagementBundleParams {
	engagement: EngagementIdentity;
	pins?: BundlePins;
	sourceDocuments?: SourceDocument[];
	requirements?: BundleRequirement[];
	subjects: BundleSubject[];
	decisions: BundleDecision[];
	statements: BundleStatement[];
	conflicts?: BundleConflict[];
	compliance?: BundleCompliance[];
	gaps?: BundleGap[];
	architecture?: BundleArchitecture;
	kbReferences?: KbReference[];
	reuseLog?: ReuseLogEntry[];
	glossary?: GlossaryTerm[];
	snapshotId?: string;
	sourceRevision?: string;
	createdAt?: string;
}

/**
 * Construit un EngagementBundle complet avec calcul rigoureux et déterministe
 * de l'étage épistémique provisoire et du sceau cryptographique canonical-json v1.
 */
export function buildEngagementBundle(params: BuildEngagementBundleParams): EngagementBundle {
	const createdAt = params.createdAt ?? new Date().toISOString();
	const snapshotId =
		params.snapshotId ??
		`bundle-${params.engagement.id}-${createdAt.replace(/[:.]/g, '')}`;
	const sourceRevision = params.sourceRevision ?? 'main';

	const subjects = params.subjects;
	const conflicts = params.conflicts ?? [];

	// Dérivation déterministe des étages épistémiques provisoires
	const unripe_subjects = subjects
		.filter((s) => (UNRIPE_MATURITIES as readonly string[]).includes(s.maturity))
		.map((s) => s.id)
		.sort();

	const open_conflicts = conflicts
		.filter((c) => c.status === 'open')
		.map((c) => c.id)
		.sort();

	const is_provisional = unripe_subjects.length > 0 || open_conflicts.length > 0;

	const data: EngagementBundleData = {
		engagement: params.engagement,
		is_provisional,
		provisional_reasons: {
			unripe_subjects,
			open_conflicts
		},
		pins: params.pins ?? {},
		source_documents: params.sourceDocuments ?? [],
		requirements: params.requirements ?? [],
		subjects,
		decisions: params.decisions,
		statements: params.statements,
		conflicts,
		compliance: params.compliance ?? [],
		gaps: params.gaps ?? [],
		architecture: params.architecture ?? { elements: [], relations: [] },
		kb_references: params.kbReferences ?? [],
		reuse_log: params.reuseLog ?? [],
		glossary: params.glossary ?? []
	};

	const checksum = `sha256:${universalSha256(canonicalJson(data))}`;

	return {
		schemaVersion: '1.0',
		snapshotId,
		sourceSystem: 'archinex',
		createdAt,
		sourceRevision,
		data,
		checksum
	};
}
