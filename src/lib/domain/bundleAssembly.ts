/**
 * Assemblage déterministe du dossier d'engagement scellé.
 *
 * Fonction PURE de l'état stocké : mêmes données en entrée, mêmes octets scellés en sortie, quelle que soit l'heure
 * de l'export ou l'ordre dans lequel la base renvoie les lignes. L'horloge n'entre jamais dans `data` : les dates
 * qui y figurent sont celles des décisions et des propositions, pas celle de l'export.
 *
 * Rien n'est fabriqué : pas de sujet, de décision ou de validation inventés, et personne n'est crédité d'une
 * validation qu'il n'a pas donnée. Une incohérence du projet devient une lacune (`gaps`) visible du générateur.
 */

import {
	buildEngagementBundle,
	type BundleDecision,
	type BundleGap,
	type BundleRequirement,
	type BundleStatement,
	type BundleSubject,
	type ConfidentialityLevel,
	type EngagementBundle,
	type SourceDocument
} from './engagementBundle';
import { effectiveRequirementState, requirementBundleId, sourceBundleId } from './requirementAudit';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Handle `@nom` sans adresse e-mail. Idempotent : un handle déjà normalisé est rendu tel quel. */
export function sanitizeHandle(handleOrEmail: string): string {
	const stripped = (handleOrEmail ?? '').trim().replace(/^@+/, '').split('@')[0].trim();
	const slug = stripped.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
	return `@${slug || 'lead-architect'}`;
}

export interface AssemblyRequirement {
	position: number;
	clauseRef: string;
	title: string;
	text: string;
	criticality: string;
	category?: string | null;
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

export interface AssemblySource {
	sha256: string;
	title: string;
	kind: string;
	language: string;
	requirements: AssemblyRequirement[];
}

export interface AssemblySubject {
	id: string;
	sectionRef: string;
	name: string;
	domain?: string | null;
	maturityLevel: string;
	requirementRefs: string[];
	decision?: {
		id: string;
		retainedOptionId: string;
		rejected: Array<{ optionId: string; reason: string }>;
		rationale: string;
		arbiterId: string;
		decidedAt: Date;
	} | null;
	options: Array<{ id: string; title: string }>;
	questions: Array<{ id: string; text: string; blocking: boolean; status: string }>;
}

export interface AssemblyStatement {
	id: string;
	subjectId?: string | null;
	subjectRef: string;
	predicate: string;
	value: string;
	unit?: string | null;
	productionMode: string;
	author: string;
	createdAt: Date;
}

export interface AssemblyInput {
	project: { id: string; title: string; language?: string };
	confidentiality: ConfidentialityLevel;
	subjects: AssemblySubject[];
	statements: AssemblyStatement[];
	sources: AssemblySource[];
	sourceRevision?: string;
	/** Heure de l'export : n'apparaît que HORS de `data` (donc hors du sceau). */
	now: Date;
}

const DECIDED_MATURITIES = ['L3_decided', 'L4_specified', 'L5_archived'];

export function assembleEngagementBundle(input: AssemblyInput): EngagementBundle {
	const language = input.project.language ?? 'fr';

	// ── Sources et exigences, dans l'ordre du document ─────────────────────────────────────────────
	const sources = [...input.sources].sort((a, b) => cmp(a.sha256, b.sha256));
	const sourceDocuments: SourceDocument[] = [];
	const requirements: BundleRequirement[] = [];
	const positionOf = new Map<string, number>();
	const stateOf = new Map<string, ReturnType<typeof effectiveRequirementState>>();
	const critOf = new Map<string, string>();
	let rank = 0;

	for (const src of sources) {
		const srcId = sourceBundleId(src.sha256);
		sourceDocuments.push({ id: srcId, kind: src.kind, title: src.title, language: src.language, sha256: src.sha256 });
		for (const r of [...src.requirements].sort((a, b) => a.position - b.position || cmp(a.clauseRef, b.clauseRef))) {
			const id = requirementBundleId(src.sha256, r.clauseRef);
			const state = effectiveRequirementState(r);
			positionOf.set(id, rank++);
			stateOf.set(id, state);
			critOf.set(id, r.criticality);
			requirements.push({
				id,
				source_document_id: srcId,
				clause_ref: r.clauseRef,
				text: r.text,
				language: src.language || language,
				title: r.title,
				criticality: r.criticality as BundleRequirement['criticality'],
				category: r.category ?? undefined,
				disposition: state.disposition,
				disposition_reason: state.reason,
				clarification_question: state.clarificationQuestion,
				assertion_level: state.assertionLevel,
				provenance: {
					basis: state.basis,
					by: [state.basis === 'human_validation' ? sanitizeHandle(state.by) : state.by],
					at: state.at.toISOString()
				}
			});
		}
	}

	// ── Sujets, décisions, lacunes ────────────────────────────────────────────────────────────────
	const subjects: BundleSubject[] = [];
	const decisions: BundleDecision[] = [];
	const gaps: BundleGap[] = [];

	for (const sub of [...input.subjects].sort((a, b) => cmp(a.sectionRef, b.sectionRef) || cmp(a.id, b.id))) {
		// L'ancien niveau L5 se projette sur L4 (vocabulaire de la suite).
		const maturity = sub.maturityLevel === 'L5_archived' ? 'L4_specified' : sub.maturityLevel || 'L0_named';
		const refs = [...new Set(sub.requirementRefs)].sort(
			(a, b) => (positionOf.get(a) ?? Infinity) - (positionOf.get(b) ?? Infinity) || cmp(a, b)
		);
		const hasDecision = Boolean(sub.decision);

		subjects.push({
			id: sub.id,
			title: sub.name,
			domains: [sub.domain || 'architecture'],
			maturity,
			// Un sujet n'est « décidé » que si une décision enregistrée existe : jamais d'après son seul niveau.
			status: hasDecision ? 'decided' : 'open',
			requirement_ids: refs,
			decision_ids: hasDecision ? [sub.decision!.id] : []
		});

		if (sub.decision) {
			const d = sub.decision;
			const title = (id: string) => sub.options.find((o) => o.id === id)?.title ?? id;
			decisions.push({
				id: d.id,
				subject_id: sub.id,
				status: 'validated',
				epistemic_status: 'validated',
				assertion_level: 'asserted',
				decision: `Option retenue : ${title(d.retainedOptionId)}`,
				justification: d.rationale,
				alternatives: [...d.rejected]
					.sort((x, y) => cmp(x.optionId, y.optionId))
					.map((r) => `${title(r.optionId)} : ${r.reason}`),
				provenance: { basis: 'human_validation', by: [sanitizeHandle(d.arbiterId)], at: d.decidedAt.toISOString() }
			});
		} else if (DECIDED_MATURITIES.includes(sub.maturityLevel)) {
			gaps.push({
				id: `GAP-NODEC-${sub.id}`,
				code: 'G_decided_without_decision',
				subject_id: sub.id,
				description: `Le sujet « ${sub.name} » est au niveau ${sub.maturityLevel} sans décision enregistrée.`,
				blocking: true
			});
		}

		for (const q of [...sub.questions].sort((a, b) => cmp(a.id, b.id))) {
			if (q.status === 'open') {
				gaps.push({ id: `GAP-${q.id}`, code: 'G2_unanswered_blocking', subject_id: sub.id, description: q.text, blocking: q.blocking });
			}
		}
	}

	// ── Lacunes issues des exigences non tranchées ──────────────────────────────────────────────
	for (const r of requirements) {
		const blocking = critOf.get(r.id) === 'bloquant';
		if (r.disposition === 'to_qualify') {
			gaps.push({
				id: `GAP-${r.id}`,
				code: 'G_requirement_unqualified',
				requirement_id: r.id,
				description: `La clause ${r.clause_ref} n'est pas qualifiée${r.disposition_reason ? ` : ${r.disposition_reason}` : '.'}`,
				blocking
			});
		} else if (r.disposition === 'clarification_needed') {
			gaps.push({
				id: `GAP-${r.id}`,
				code: 'G_requirement_clarification',
				requirement_id: r.id,
				description: `À clarifier auprès du donneur d'ordre : ${r.clarification_question ?? r.clause_ref}`,
				blocking
			});
		}
	}

	// ── Énoncés ─────────────────────────────────────────────────────────────────────────────────
	const statements: BundleStatement[] = [];
	for (const st of [...input.statements].sort((a, b) => cmp(a.id, b.id))) {
		const isHuman = st.productionMode === 'human-authored';
		if (!st.subjectId) {
			gaps.push({
				id: `GAP-NOSUBJ-${st.id}`,
				code: 'G_statement_without_subject',
				description: `L'énoncé ${st.id} n'est rattaché à aucun sujet.`,
				blocking: false
			});
		}
		statements.push({
			id: st.id,
			subject_id: st.subjectId ?? '',
			epistemic_status: isHuman ? 'validated' : 'ai_proposed',
			assertion_level: isHuman ? 'asserted' : 'proposed',
			text: `${st.subjectRef} ${st.predicate} ${st.value}${st.unit ? ' ' + st.unit : ''}`,
			property: st.predicate,
			value: st.value,
			provenance: {
				basis: isHuman ? 'human_validation' : 'ai_proposal',
				by: [sanitizeHandle(st.author)],
				at: st.createdAt.toISOString()
			}
		});
	}

	gaps.sort((a, b) => cmp(a.id, b.id));

	return buildEngagementBundle({
		engagement: {
			id: input.project.id,
			title: input.project.title,
			language,
			confidentiality: input.confidentiality,
			client_label: input.project.title
		},
		sourceDocuments,
		requirements,
		subjects,
		decisions,
		statements,
		gaps,
		sourceRevision: input.sourceRevision ?? 'main',
		createdAt: input.now.toISOString()
	});
}
