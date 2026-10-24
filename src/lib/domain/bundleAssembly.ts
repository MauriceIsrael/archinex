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
	type BundleArchitecture,
	type BundleArchitectureProjections,
	type BundleDecision,
	type BundleElement,
	type BundleGap,
	type BundleRelation,
	type BundleRequirement,
	type BundleStatement,
	type BundleSubject,
	type ConfidentialityLevel,
	type EngagementBundle,
	type SourceDocument,
	type SubjectProjections
} from './engagementBundle';
import { effectiveRequirementState, requirementBundleId, sourceBundleId } from './requirementAudit';
import {
	generateMermaidDiagram,
	generateStructurizrDSL,
	generateSysMLv2,
	type ProjectionContext
} from './artifactProjections';
import type { Statement } from '$lib/types/epistemic';
import { renderStructurizrWorkspace, type C4Container, type C4System } from '$lib/domain/structurizrDsl';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Handle `@nom` sans adresse e-mail. Idempotent : un handle déjà normalisé est rendu tel quel. */
export function sanitizeHandle(handleOrEmail: string): string {
	const stripped = (handleOrEmail ?? '').trim().replace(/^@+/, '').split('@')[0].trim();
	const slug = stripped.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
	return `@${slug || 'lead-architect'}`;
}

/** Auteur d'une proposition du modèle (`model:<id>` en base) sous forme de handle du schéma : `@model-<id>`. */
export function modelHandle(proposedBy: string): string {
	const id = proposedBy.replace(/^model:/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '');
	return `@model-${id || 'inconnu'}`;
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
		complianceStatus?: 'Compliant' | 'Partially compliant' | 'Non-compliant' | 'Provisional';
		complianceRationale?: string;
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
	architecture?: BundleArchitecture;
	sourceRevision?: string;
	/** Heure de l'export : n'apparaît que HORS de `data` (donc hors du sceau). */
	now: Date;
}

const DECIDED_MATURITIES = ['L3_decided', 'L4_specified', 'L5_archived'];

function findEarliestStoredIsoDate(input: AssemblyInput): string {
	let earliest: number | null = null;
	for (const src of input.sources) {
		for (const r of src.requirements) {
			if (r.proposedAt) {
				const t = r.proposedAt.getTime();
				if (earliest === null || t < earliest) earliest = t;
			}
			if (r.decidedAt) {
				const t = r.decidedAt.getTime();
				if (earliest === null || t < earliest) earliest = t;
			}
		}
	}
	for (const st of input.statements) {
		if (st.createdAt) {
			const t = st.createdAt.getTime();
			if (earliest === null || t < earliest) earliest = t;
		}
	}
	for (const sub of input.subjects) {
		if (sub.decision?.decidedAt) {
			const t = sub.decision.decidedAt.getTime();
			if (earliest === null || t < earliest) earliest = t;
		}
	}
	return earliest !== null ? new Date(earliest).toISOString() : '1970-01-01T00:00:00.000Z';
}

function classifyElementKind(predicate: string, value: string): 'datastore' | 'network' | 'interface' | 'component' {
	const text = `${predicate} ${value}`.toLowerCase().replace(/[_.-]/g, ' ');
	if (
		/\b(db|database|storage|store|stockage|sql|nosql|s3|volume|disque|base|postgres|postgresql|mongo|redis|replication)\b/i.test(text)
	) {
		return 'datastore';
	}
	if (
		/\b(network|reseau|flux|vlan|tcp|udp|ip|lan|wan|dmz|subnetwork|vpn|switch|router)\b/i.test(text)
	) {
		return 'network';
	}
	if (
		/\b(api|interface|service|endpoint|rest|grpc|port|gateway|ingress|egress)\b/i.test(text)
	) {
		return 'interface';
	}
	return 'component';
}

function classifyRelationKind(predicate: string): 'uses' | 'depends_on' | 'data_flow' | 'deploys_to' | 'protects' | 'contains' {
	const lower = predicate.toLowerCase();
	if (lower === 'uses' || lower === 'utilise') return 'uses';
	if (lower === 'depends_on' || lower === 'depend_de') return 'depends_on';
	if (lower === 'data_flow' || lower === 'flux' || lower === 'transmet') return 'data_flow';
	if (lower === 'deploys_to' || lower === 'deploie_sur' || lower === 'hosts') return 'deploys_to';
	if (lower === 'protects' || lower === 'protege' || lower === 'securise') return 'protects';
	if (lower === 'contains' || lower === 'contient') return 'contains';
	return 'depends_on';
}

function generateGlobalMermaid(elements: BundleElement[], relations: BundleRelation[]): string {
	const lines = ['flowchart TD'];
	const systems = elements.filter((e) => e.kind === 'system' || e.kind === 'boundary');
	const components = elements.filter((e) => e.kind !== 'system' && e.kind !== 'boundary');

	for (const sys of systems) {
		const children = components.filter((c) => c.boundary_id === sys.id);
		const safeSysId = sys.id.replace(/[^a-zA-Z0-9_]/g, '_');
		lines.push(`    subgraph ${safeSysId}["${sys.name.replace(/["[\]()]/g, '')}"]`);
		for (const child of children) {
			const safeChildId = child.id.replace(/[^a-zA-Z0-9_]/g, '_');
			const safeName = child.name.replace(/["[\]()]/g, '');
			lines.push(`        ${safeChildId}["${safeName}"]`);
		}
		if (children.length === 0) {
			lines.push(`        ${safeSysId}_node["${sys.name.replace(/["[\]()]/g, '')}"]`);
		}
		lines.push('    end');
	}

	for (const comp of components) {
		if (!comp.boundary_id || !systems.some((s) => s.id === comp.boundary_id)) {
			const safeId = comp.id.replace(/[^a-zA-Z0-9_]/g, '_');
			const safeName = comp.name.replace(/["[\]()]/g, '');
			lines.push(`    ${safeId}["${safeName}"]`);
		}
	}

	for (const rel of relations) {
		const safeFrom = rel.from.replace(/[^a-zA-Z0-9_]/g, '_');
		const safeTo = rel.to.replace(/[^a-zA-Z0-9_]/g, '_');
		const safeLabel = (rel.label || rel.kind).replace(/["[\]()]/g, '');
		lines.push(`    ${safeFrom} -->|"${safeLabel}"| ${safeTo}`);
	}

	return lines.join('\n');
}

function generateGlobalStructurizr(projectName: string, elements: BundleElement[], relations: BundleRelation[]): string {
	const systems = elements.filter((e) => e.kind === 'system' || e.kind === 'boundary');
	const components = elements.filter((e) => e.kind !== 'system' && e.kind !== 'boundary');
	const systemIds = new Set(systems.map((s) => s.id));
	const toContainer = (c: BundleElement): C4Container => ({ id: c.id, name: c.name, description: c.description || c.kind, technology: c.kind });
	const c4Systems: C4System[] = systems.map((sys) => ({
		id: sys.id,
		name: sys.name,
		description: sys.description,
		containers: components.filter((c) => c.boundary_id === sys.id).map(toContainer)
	}));
	// Un élément sans périmètre connu n'est pas écarté en silence : il va dans un système à part, nommé comme tel.
	const orphans = components.filter((c) => !c.boundary_id || !systemIds.has(c.boundary_id));
	if (orphans.length > 0) c4Systems.push({ id: 'elem-hors-perimetre', name: 'Éléments sans périmètre', containers: orphans.map(toContainer) });

	return renderStructurizrWorkspace({
		name: projectName,
		description: 'Architecture globale scellée Archinex',
		group: projectName,
		systems: c4Systems,
		relations: relations.map((r) => ({ from: r.from, to: r.to, label: r.label || r.kind })),
		viewKey: 'Architecture_Globale'
	});
}

function generateGlobalSysMLv2(projectName: string, elements: BundleElement[], relations: BundleRelation[]): string {
	const lines: string[] = [
		`package '${projectName.replace(/'/g, "\\'")}' {`,
		"    doc /* Modèle d'architecture globale scellé Archinex */"
	];
	for (const el of elements) {
		const safeId = el.id.replace(/[^a-zA-Z0-9_]/g, '_');
		const safeName = el.name.replace(/"/g, '\\"');
		lines.push(`    part def ${safeId} {`);
		lines.push(`        attribute name : String = "${safeName}";`);
		lines.push(`        attribute kind : String = "${el.kind}";`);
		lines.push('    }');
	}
	lines.push('}');
	return lines.join('\n');
}

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
		sourceDocuments.push({ id: srcId, kind: src.kind, title: src.title, language: src.language, sha256: src.sha256.replace(/^sha256:/, '') });
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
					by: [state.basis === 'human_validation' ? sanitizeHandle(state.by) : modelHandle(state.by)],
					at: state.at.toISOString()
				}
			});
		}
	}

	// ── Sujets, décisions, lacunes ────────────────────────────────────────────────────────────────
	const subjects: BundleSubject[] = [];
	const decisions: BundleDecision[] = [];
	const gaps: BundleGap[] = [];

	const bySubjectProjections: Record<string, SubjectProjections> = {};
	const sortedSubjects = [...input.subjects].sort((a, b) => cmp(a.sectionRef, b.sectionRef) || cmp(a.id, b.id));

	for (const sub of sortedSubjects) {
		// L'ancien niveau L5 se projette sur L4 (vocabulaire de la suite).
		const maturity = sub.maturityLevel === 'L5_archived' ? 'L4_specified' : sub.maturityLevel || 'L0_named';
		const refs = [...new Set(sub.requirementRefs)].sort(
			(a, b) => (positionOf.get(a) ?? Infinity) - (positionOf.get(b) ?? Infinity) || cmp(a, b)
		);
		const hasDecision = Boolean(sub.decision);

		const subjectAssemblyStatements = [...input.statements]
			.filter((st) => st.subjectId === sub.id)
			.sort((a, b) => cmp(a.id, b.id));
		const matSubject: MaturitySubject = {
			id: sub.id,
			section_ref: sub.sectionRef,
			name: sub.name,
			level: (sub.maturityLevel === 'L5_archived' ? 'L4_specified' : sub.maturityLevel || 'L0_named') as any,
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'lead_architect',
			relative_effort: 'M',
			last_transition_date: sub.decision ? sub.decision.decidedAt.toISOString() : '2026-10-01T08:00:00.000Z',
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		};

		const draft: TelegraphicDraft = {
			section_id: sub.sectionRef,
			subject: sub.name,
			maturity: matSubject.level as any,
			is_provisional: sub.maturityLevel === 'L0_named' || sub.maturityLevel === 'L1_framed' || sub.maturityLevel === 'L2_decomposed',
			retenu: sub.decision ? [sub.options.find((o) => o.id === sub.decision!.retainedOptionId)?.title ?? sub.decision.retainedOptionId] : [],
			suppose: [],
			conflit: [],
			manque: sub.questions.filter((q) => q.status === 'open').map((q) => ({ id: q.id, question: q.text, assigned_role: 'lead_architect' }))
		};

		const mappedStatements: Statement[] = subjectAssemblyStatements.map((st) => ({
			id: st.id,
			section: sub.sectionRef,
			triplet: {
				subject: sub.id,
				predicate: st.predicate,
				value: st.value,
				...(st.unit ? { unit: st.unit } : {})
			},
			justification: { basedOn: [] },
			authority: {
				author: sanitizeHandle(st.author),
				role: 'lead_architect',
				productionMode: st.productionMode as any
			},
			maturity: {
				subjectLevel: matSubject.level as any,
				confidence: 'verified'
			},
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: st.createdAt.toISOString(),
			updatedAt: st.createdAt.toISOString()
		}));

		const projContext: ProjectionContext = {
			projectName: input.project.title,
			decision: sub.decision
				? {
						retainedOptionId: sub.decision.retainedOptionId,
						retainedOptionTitle: sub.options.find((o) => o.id === sub.decision!.retainedOptionId)?.title ?? sub.decision.retainedOptionId,
						rationale: sub.decision.rationale,
						decidedAt: sub.decision.decidedAt.toISOString(),
						arbiterId: sanitizeHandle(sub.decision.arbiterId),
						arbiterRole: 'lead_architect'
					}
				: null,
			options: [...sub.options].sort((a, b) => cmp(a.id, b.id)).map((o) => ({ id: o.id, title: o.title })),
			requirements: refs.map((rid) => ({ clauseRef: rid, title: rid }))
		};

		const mermaid = generateMermaidDiagram(matSubject, draft, mappedStatements, projContext);
		const structurizrDSL = generateStructurizrDSL(matSubject, draft, mappedStatements, projContext);
		const sysmlV2 = generateSysMLv2(matSubject, draft, mappedStatements, projContext);

		const subjectProjections: SubjectProjections = {
			mermaid,
			structurizr_dsl: structurizrDSL,
			structurizrDSL,
			sysml_v2: sysmlV2,
			sysmlV2
		};

		bySubjectProjections[sub.id] = subjectProjections;

		subjects.push({
			id: sub.id,
			title: sub.name,
			domains: [sub.domain || 'architecture'],
			maturity,
			// Un sujet n'est « décidé » que si une décision enregistrée existe : jamais d'après son seul niveau.
			status: hasDecision ? 'decided' : 'open',
			requirement_ids: refs,
			decision_ids: hasDecision ? [sub.decision!.id] : [],
			projections: subjectProjections
		});

		if (sub.decision) {
			const d = sub.decision;
			const title = (id: string) => sub.options.find((o) => o.id === id)?.title ?? id;
			const consequences: string[] = [];
			if (d.complianceStatus) {
				consequences.push(`compliance_status:${d.complianceStatus}`);
			}
			if (d.complianceRationale) {
				consequences.push(`compliance_rationale:${d.complianceRationale}`);
			}

			decisions.push({
				id: d.id,
				subject_id: sub.id,
				status: 'validated',
				epistemic_status: 'validated',
				assertion_level: 'asserted',
				decision: `Option retenue : ${title(d.retainedOptionId)}`,
				title: title(d.retainedOptionId),
				rationale: d.rationale,
				...(consequences.length > 0 ? { consequences } : {}),
				alternatives: [...d.rejected]
					.sort((x, y) => cmp(x.optionId, y.optionId))
					.map((r) => ({ title: title(r.optionId), rejected_because: r.reason })),
				provenance: { basis: 'human_validation', by: [sanitizeHandle(d.arbiterId)], at: d.decidedAt.toISOString() }
			});
		} else if (DECIDED_MATURITIES.includes(sub.maturityLevel)) {
			gaps.push({
				id: `GAP-NODEC-${sub.id}`,
				kind: 'decided_without_decision',
				subject_id: sub.id,
				description: `Le sujet « ${sub.name} » est au niveau ${sub.maturityLevel} sans décision enregistrée.`,
				blocking: true
			});
		}

		for (const q of [...sub.questions].sort((a, b) => cmp(a.id, b.id))) {
			if (q.status === 'open') {
				gaps.push({ id: `GAP-${q.id}`, kind: 'G2_unanswered_blocking', subject_id: sub.id, description: q.text, blocking: q.blocking });
			}
		}
	}

	// ── Lacunes issues des exigences non tranchées ──────────────────────────────────────────────
	for (const r of requirements) {
		const blocking = critOf.get(r.id) === 'bloquant';
		if (r.disposition === 'to_qualify') {
			gaps.push({
				id: `GAP-${r.id}`,
				kind: 'requirement_unqualified',
				requirement_id: r.id,
				description: `La clause ${r.clause_ref} n'est pas qualifiée${r.disposition_reason ? ` : ${r.disposition_reason}` : '.'}`,
				blocking
			});
		} else if (r.disposition === 'clarification_needed') {
			gaps.push({
				id: `GAP-${r.id}`,
				kind: 'requirement_clarification',
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
				kind: 'statement_without_subject',
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
			predicate: st.predicate,
			value: st.value,
			...(st.unit ? { unit: st.unit } : {}),
			provenance: {
				basis: isHuman ? 'human_validation' : 'ai_proposal',
				by: [sanitizeHandle(st.author)],
				at: st.createdAt.toISOString()
			}
		});
	}

	gaps.sort((a, b) => cmp(a.id, b.id));

	// ── Modèle d'architecture déterministe (éléments, relations, projections) ────────────────────
	let architecture: BundleArchitecture;
	if (input.architecture && (input.architecture.elements.length > 0 || input.architecture.relations.length > 0)) {
		architecture = input.architecture;
	} else if (input.subjects.length > 0 || input.statements.length > 0) {
		const elements: BundleElement[] = [];
		const relations: BundleRelation[] = [];
		const fallbackIsoDate = findEarliestStoredIsoDate(input);
		const subjectMap = new Map(input.subjects.map((s) => [s.id, s]));

		for (const sub of sortedSubjects) {
			const subElemId = `elem-sys-${sub.id}`;
			const hasDecision = Boolean(sub.decision);
			const subStatements = input.statements.filter((st) => st.subjectId === sub.id);
			const earliestSubDate = sub.decision
				? sub.decision.decidedAt.toISOString()
				: subStatements.length > 0
				? new Date(Math.min(...subStatements.map((s) => s.createdAt.getTime()))).toISOString()
				: fallbackIsoDate;

			elements.push({
				id: subElemId,
				name: sub.name,
				kind: 'system',
				description: `Système ${sub.name} (${sub.sectionRef})`,
				decision_ids: hasDecision ? [sub.decision!.id] : [],
				epistemic_status: hasDecision ? 'validated' : 'ai_proposed',
				assertion_level: hasDecision ? 'asserted' : 'proposed',
				provenance: {
					basis: hasDecision ? 'human_validation' : 'ai_proposal',
					by: [hasDecision ? sanitizeHandle(sub.decision!.arbiterId) : '@model-archinex'],
					at: earliestSubDate
				}
			});

			if (sub.decision) {
				const d = sub.decision;
				const optTitle = sub.options.find((o) => o.id === d.retainedOptionId)?.title ?? d.retainedOptionId;
				const optElemId = `elem-opt-${sub.id}-${d.retainedOptionId}`;

				elements.push({
					id: optElemId,
					name: optTitle,
					kind: 'component',
					boundary_id: subElemId,
					description: d.rationale || `Option retenue pour ${sub.name}`,
					decision_ids: [d.id],
					epistemic_status: 'validated',
					assertion_level: 'asserted',
					provenance: {
						basis: 'human_validation',
						by: [sanitizeHandle(d.arbiterId)],
						at: d.decidedAt.toISOString()
					}
				});

				relations.push({
					id: `rel-contains-${sub.id}-${d.retainedOptionId}`,
					from: subElemId,
					to: optElemId,
					kind: 'contains',
					label: 'Contient',
					decision_ids: [d.id],
					epistemic_status: 'validated',
					assertion_level: 'asserted',
					provenance: {
						basis: 'human_validation',
						by: [sanitizeHandle(d.arbiterId)],
						at: d.decidedAt.toISOString()
					}
				});
			}
		}

		for (const st of [...input.statements].sort((a, b) => cmp(a.id, b.id))) {
			if (!st.subjectId || !subjectMap.has(st.subjectId)) continue;
			const sub = subjectMap.get(st.subjectId)!;
			const isHuman = st.productionMode === 'human-authored';
			const stmtElemId = `elem-stmt-${st.id}`;
			const kind = classifyElementKind(st.predicate, st.value);
			const subElemId = `elem-sys-${sub.id}`;

			elements.push({
				id: stmtElemId,
				name: `${st.predicate}: ${st.value}${st.unit ? ' ' + st.unit : ''}`,
				kind,
				boundary_id: subElemId,
				decision_ids: sub.decision ? [sub.decision.id] : [],
				epistemic_status: isHuman ? 'validated' : 'ai_proposed',
				assertion_level: isHuman ? 'asserted' : 'proposed',
				provenance: {
					basis: isHuman ? 'human_validation' : 'ai_proposal',
					by: [isHuman ? sanitizeHandle(st.author) : modelHandle(st.author)],
					at: st.createdAt.toISOString()
				}
			});

			if (sub.decision) {
				const optElemId = `elem-opt-${sub.id}-${sub.decision.retainedOptionId}`;
				const relKind = classifyRelationKind(st.predicate);
				relations.push({
					id: `rel-use-${sub.id}-${sub.decision.retainedOptionId}-${st.id}`,
					from: optElemId,
					to: stmtElemId,
					kind: relKind,
					label: st.predicate,
					decision_ids: [sub.decision.id],
					epistemic_status: isHuman ? 'validated' : 'ai_proposed',
					assertion_level: isHuman ? 'asserted' : 'proposed',
					provenance: {
						basis: isHuman ? 'human_validation' : 'ai_proposal',
						by: [isHuman ? sanitizeHandle(st.author) : modelHandle(st.author)],
						at: st.createdAt.toISOString()
					}
				});
			} else {
				relations.push({
					id: `rel-contains-${sub.id}-${st.id}`,
					from: subElemId,
					to: stmtElemId,
					kind: 'contains',
					label: st.predicate,
					epistemic_status: isHuman ? 'validated' : 'ai_proposed',
					assertion_level: isHuman ? 'asserted' : 'proposed',
					provenance: {
						basis: isHuman ? 'human_validation' : 'ai_proposal',
						by: [isHuman ? sanitizeHandle(st.author) : modelHandle(st.author)],
						at: st.createdAt.toISOString()
					}
				});
			}
		}

		elements.sort((a, b) => cmp(a.id, b.id));
		relations.sort((a, b) => cmp(a.id, b.id));

		const globalMermaid = generateGlobalMermaid(elements, relations);
		const globalStructurizr = generateGlobalStructurizr(input.project.title, elements, relations);
		const globalSysML = generateGlobalSysMLv2(input.project.title, elements, relations);

		architecture = {
			elements,
			relations,
			projections: {
				mermaid: globalMermaid,
				structurizr_dsl: globalStructurizr,
				structurizrDSL: globalStructurizr,
				sysml_v2: globalSysML,
				sysmlV2: globalSysML,
				by_subject: bySubjectProjections
			}
		};
	} else {
		architecture = { elements: [], relations: [] };
	}

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
		architecture,
		sourceRevision: input.sourceRevision ?? 'main',
		createdAt: input.now.toISOString()
	});
}
