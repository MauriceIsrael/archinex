/**
 * Audit des exigences d'un RFP : types partagés et identifiants stables.
 *
 * Une source de RFP est identifiée par l'empreinte SHA-256 de son texte intégral, ce qui rend les identifiants
 * d'exigences stables et indépendants du projet : `SRC-1a2b3c4d:REQ-12`. Le dossier scellé les cite tels quels.
 *
 * Le modèle PROPOSE une disposition ; seule une personne identifiée la DÉCIDE. Les deux sont conservées
 * séparément : le dossier scellé ne déclare « affirmé » que ce qu'un humain a décidé.
 */

import { universalSha256 } from '$lib/validation/epistemicEnvelope';

export type RequirementDisposition = 'deliberated' | 'evacuated' | 'clarification_needed' | 'to_qualify';

/** Dispositions qu'une personne peut décider. « À qualifier » n'est pas une décision : c'est l'absence de décision. */
export const DECIDABLE_DISPOSITIONS: readonly RequirementDisposition[] = ['deliberated', 'evacuated', 'clarification_needed'];

export const MIN_REASON_CHARS = 12;

export interface RequirementAuditItem {
	clauseRef: string;
	title: string;
	text: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	category?: string;
	/** Disposition proposée par le modèle. */
	disposition: RequirementDisposition;
	/** Tension (à délibérer), motif (évacuée) ou raison de l'indécision (à qualifier). */
	reason?: string;
	clarificationQuestion?: string;
	/** Rang de la clause dans le document source. */
	position: number;
}

export interface RequirementAuditInput {
	source: {
		title: string;
		kind: 'rfp';
		language: string;
		version?: string;
		/** `sha256:<hex>` du texte source intégral. */
		sha256: string;
	};
	/** Identifiant du modèle qui a proposé l'audit (ex. `claude-sonnet-5-5`). */
	model: string;
	auditedAt: string;
	items: RequirementAuditItem[];
	/** Clauses que l'humain a confirmées « à délibérer » (sujets retenus ou clauses promues en sujet). */
	confirmedDeliberated: string[];
}

/** `sha256:<hex>` du texte source. */
export function sourceSha256(text: string): string {
	return `sha256:${universalSha256(text)}`;
}

/** Identifiant de source dans le dossier scellé : `SRC-` + 8 premiers caractères hexadécimaux de l'empreinte. */
export function sourceBundleId(sha256: string): string {
	return `SRC-${sha256.replace(/^sha256:/, '').slice(0, 8)}`;
}

/** Identifiant d'exigence dans le dossier scellé. */
export function requirementBundleId(sha256: string, clauseRef: string): string {
	return `${sourceBundleId(sha256)}:${clauseRef}`;
}

/** Clause telle que l'écran de revue la manipule (sortie de l'audit). */
export interface ReviewedClause {
	clauseRef: string;
	title: string;
	text: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	category?: string;
	disposition: RequirementDisposition;
	evacuationReason?: string;
	clarificationQuestion?: string;
	deliberationReason?: string;
	qualifyReason?: string;
}

/**
 * Construit l'entrée de persistance depuis la sortie de l'audit et ce que l'humain a confirmé.
 * `confirmedDeliberated` : références des clauses couvertes par les sujets retenus (ou promues en sujet).
 */
export function buildRequirementAudit(params: {
	sourceText: string;
	sourceTitle: string;
	sourceVersion?: string;
	language?: string;
	model: string;
	auditedAt: string;
	reviewed: ReviewedClause[];
	confirmedDeliberated: string[];
}): RequirementAuditInput {
	const known = new Set(params.reviewed.map((r) => r.clauseRef));
	return {
		source: {
			title: params.sourceTitle,
			kind: 'rfp',
			language: params.language ?? 'fr',
			version: params.sourceVersion,
			sha256: sourceSha256(params.sourceText)
		},
		model: params.model,
		auditedAt: params.auditedAt,
		items: params.reviewed.map((r, position) => ({
			clauseRef: r.clauseRef,
			title: r.title,
			text: r.text,
			criticality: r.criticality,
			category: r.category,
			disposition: r.disposition,
			reason: r.evacuationReason ?? r.deliberationReason ?? r.qualifyReason,
			clarificationQuestion: r.clarificationQuestion,
			position
		})),
		confirmedDeliberated: [...new Set(params.confirmedDeliberated)].filter((ref) => known.has(ref))
	};
}

export interface EffectiveRequirementState {
	disposition: RequirementDisposition;
	reason?: string;
	clarificationQuestion?: string;
	/** `asserted` : décidé par un humain. `proposed` : proposé par le modèle. `open` : personne n'a pu trancher. */
	assertionLevel: 'asserted' | 'proposed' | 'open';
	basis: 'human_validation' | 'ai_proposal';
	by: string;
	at: Date;
}

export interface RequirementStateSource {
	proposedDisposition: string;
	proposedReason?: string | null;
	clarificationQuestion?: string | null;
	proposedBy: string;
	proposedAt: Date;
	decidedDisposition?: string | null;
	decidedReason?: string | null;
	decidedBy?: string | null;
	decidedAt?: Date | null;
}

/** État retenu d'une exigence : la décision humaine l'emporte sur la proposition du modèle. */
export function effectiveRequirementState(r: RequirementStateSource): EffectiveRequirementState {
	if (r.decidedDisposition && r.decidedBy && r.decidedAt) {
		return {
			disposition: r.decidedDisposition as RequirementDisposition,
			// Pour une clarification décidée, la « raison » est la question posée au donneur d'ordre.
			reason: r.decidedDisposition === 'clarification_needed' ? undefined : (r.decidedReason ?? undefined),
			clarificationQuestion:
				r.decidedDisposition === 'clarification_needed' ? (r.decidedReason ?? undefined) : undefined,
			assertionLevel: 'asserted',
			basis: 'human_validation',
			by: r.decidedBy,
			at: r.decidedAt
		};
	}
	const disposition = r.proposedDisposition as RequirementDisposition;
	return {
		disposition,
		reason: r.proposedReason ?? undefined,
		clarificationQuestion: r.clarificationQuestion ?? undefined,
		assertionLevel: disposition === 'to_qualify' ? 'open' : 'proposed',
		basis: 'ai_proposal',
		by: r.proposedBy,
		at: r.proposedAt
	};
}

/**
 * Contrôle d'une décision humaine avant écriture. Renvoie un message d'erreur, ou null si elle est valide.
 * `reason` : motif de l'évacuation, ou question posée au donneur d'ordre pour une clarification.
 */
export function validateRequirementDecision(decision: { disposition: string; reason?: string }): string | null {
	if (!(DECIDABLE_DISPOSITIONS as readonly string[]).includes(decision.disposition)) {
		return `Disposition « ${decision.disposition} » refusée : décider parmi ${DECIDABLE_DISPOSITIONS.join(', ')}.`;
	}
	const reason = (decision.reason ?? '').trim();
	if (decision.disposition === 'evacuated' && reason.length < MIN_REASON_CHARS) {
		return `Une évacuation décidée exige un motif d'au moins ${MIN_REASON_CHARS} caractères.`;
	}
	if (decision.disposition === 'clarification_needed' && reason.length < MIN_REASON_CHARS) {
		return `Une clarification exige une question d'au moins ${MIN_REASON_CHARS} caractères.`;
	}
	return null;
}
