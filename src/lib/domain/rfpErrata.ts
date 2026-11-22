/**
 * Gestion des vagues Q&R acheteur / errata CCTP, propagation sur le DAG causal `basedOn`
 * et export de la Matrice de Conformité Contractuelle Acheteur (Issue #443).
 *
 * Fonctions pures, déterministes et agnostiques de tout projet particulier.
 */

import type { Statement, SubjectMaturity } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import { executeRetractionCascade } from '$lib/domain/retractation';
import type { EngagementBundle } from '$lib/domain/engagementBundle';

export type AmendmentEffect = 'clarifies' | 'modifies' | 'relaxes' | 'withdraws';

export interface BuyerQaAmendment {
	id: string;
	waveLabel: string;
	targetClauseRef: string;
	buyerQuestion: string;
	buyerAnswer: string;
	effect: AmendmentEffect;
	previousTextSnapshot?: string;
	amendedText?: string;
	amendedCriticality?: 'bloquant' | 'majeur' | 'info';
	recordedBy: string;
	recordedAt: string;
}

export interface AmendmentPropagationResult {
	amendment: BuyerQaAmendment;
	impactedStatementIds: string[];
	impactedSubjectIds: string[];
	demotedSubjectIds: string[];
	staleEdpSubjectIds: string[];
	unblockedSubjectIds: string[];
	updatedStatements: Statement[];
	updatedSubjects: MaturitySubject[];
	updatedDrafts: Record<string, TelegraphicDraft>;
	summaryMessage: string;
}

export type BuyerComplianceStatus =
	| 'Conforme'
	| 'Partiellement conforme'
	| 'Non conforme'
	| 'Conforme (Standard)'
	| 'Retirée (Q&R)'
	| 'À statuer [PROVISOIRE]';

export interface BuyerComplianceRow {
	clauseRef: string;
	sourceDocument: string;
	requirementTitle: string;
	criticality: string;
	amendmentRefs: string[];
	complianceStatus: BuyerComplianceStatus;
	technicalCommitment: string;
	hldAndCmdbRefs: string[];
}

const VALID_EFFECTS = new Set<AmendmentEffect>(['clarifies', 'modifies', 'relaxes', 'withdraws']);

/**
 * Parse un export CSV/TSV de vague Q&R acheteur (`clauseRef;question;answer;effect` ou tabulation/virgule).
 * Ignore les lignes vides et l'en-tête éventuel.
 */
export function parseBuyerQaWaveCsv(
	rawText: string,
	waveLabel: string,
	recordedBy: string,
	recordedAt = new Date().toISOString()
): { amendments: BuyerQaAmendment[]; errors: string[] } {
	const lines = rawText
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

	const amendments: BuyerQaAmendment[] = [];
	const errors: string[] = [];

	const waveSlug = waveLabel
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 16) || 'WAVE';

	lines.forEach((line, idx) => {
		const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
		const cols = splitDelimitedLine(line, delimiter).map((c) => c.trim());

		if (
			idx === 0 &&
			/^(?:ref|clause|clauseref|req)/i.test(cols[0] || '') &&
			/question/i.test(cols[1] || '')
		) {
			return;
		}

		const [targetClauseRef, buyerQuestion, buyerAnswer, rawEffect] = cols;
		if (!targetClauseRef || !buyerAnswer) {
			errors.push(`Ligne ${idx + 1} ignorée : référence de clause et réponse acheteur obligatoires.`);
			return;
		}

		const normalizedEffect = (rawEffect || 'clarifies').toLowerCase() as AmendmentEffect;
		const effect: AmendmentEffect = VALID_EFFECTS.has(normalizedEffect) ? normalizedEffect : 'clarifies';

		amendments.push({
			id: `QA-${waveSlug}-${String(amendments.length + 1).padStart(3, '0')}`,
			waveLabel,
			targetClauseRef,
			buyerQuestion: buyerQuestion || '(Question acheteur)',
			buyerAnswer,
			effect,
			amendedText: effect === 'modifies' ? buyerAnswer : undefined,
			recordedBy,
			recordedAt
		});
	});

	return { amendments, errors };
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === delimiter && !inQuotes) {
			result.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	result.push(current);
	return result;
}

function normalizeRef(ref: string): string {
	return ref.trim().toLowerCase();
}

function isSubjectDecidedOrHigher(level: SubjectMaturity): boolean {
	return level === 'L3_decided' || level === 'L4_specified' || level === 'L5_archived';
}

/**
 * Propage un amendement Q&R / erratum acheteur sur le graphe causal `basedOn` et le Board de maturité :
 * - `modifies` / `withdraws` : déclenche `executeRetractionCascade` sur les énoncés racines liés à la clause,
 *   rétrograde les sujets déjà arbitrés (L3/L4) en `L2_decomposed` (provisoire) et marque leurs EDP comme `stale`.
 * - `clarifies` / `relaxes` : conserve les arbitrages acquis et signale les sujets débloqués pour arbitrage.
 */
export function propagateAmendmentToDeliberation(params: {
	amendment: BuyerQaAmendment;
	subjects: MaturitySubject[];
	statements: Statement[];
	drafts: Record<string, TelegraphicDraft>;
}): AmendmentPropagationResult {
	const { amendment } = params;
	const targetNorm = normalizeRef(amendment.targetClauseRef);

	let currentStatements = params.statements.map((s) => ({ ...s }));
	let currentSubjects = params.subjects.map((s) => ({ ...s }));
	let currentDrafts: Record<string, TelegraphicDraft> = { ...params.drafts };

	const matchingSubjects = currentSubjects.filter((sub) =>
		(sub.requirement_ids || []).some((rid) => normalizeRef(rid) === targetNorm)
	);
	const matchingRootStatements = currentStatements.filter((stmt) => {
		const refs = [
			...(stmt.justification.basedOn || []),
			...(stmt.revisability.antecedents || [])
		];
		return refs.some((r) => normalizeRef(r) === targetNorm);
	});

	const impactedStatementIds = new Set<string>(matchingRootStatements.map((s) => s.id));
	const impactedSubjectIds = new Set<string>(matchingSubjects.map((s) => s.id));
	const demotedSubjectIds = new Set<string>();
	const staleEdpSubjectIds = new Set<string>();
	const unblockedSubjectIds = new Set<string>();

	const isDisruptive = amendment.effect === 'modifies' || amendment.effect === 'withdraws';

	if (isDisruptive) {
		const reason = `Amendement Acheteur [${amendment.id} · ${amendment.waveLabel}] (${amendment.effect}) : ${amendment.buyerAnswer}`;

		for (const rootStmt of matchingRootStatements) {
			const cascade = executeRetractionCascade({
				targetStatementId: rootStmt.id,
				reason,
				statements: currentStatements,
				subjects: currentSubjects,
				drafts: currentDrafts
			});

			for (const id of cascade.impactedDescendantIds) impactedStatementIds.add(id);
			for (const subId of cascade.demotedSubjectIds) {
				impactedSubjectIds.add(subId);
				demotedSubjectIds.add(subId);
				staleEdpSubjectIds.add(subId);
			}

			const demotedById = new Map(cascade.demotedStatements.map((s) => [s.id, s]));
			currentStatements = currentStatements.map((s) => {
				if (cascade.retractedStatement && s.id === cascade.retractedStatement.id) {
					return cascade.retractedStatement;
				}
				return demotedById.get(s.id) ?? s;
			});
			currentSubjects = cascade.updatedSubjects;
			currentDrafts = cascade.updatedDrafts;
		}

		// Rétrogradation directe des sujets rattachés à la clause même si aucun Statement n'y pointait encore
		currentSubjects = currentSubjects.map((sub) => {
			if (!impactedSubjectIds.has(sub.id)) return sub;
			if (isSubjectDecidedOrHigher(sub.level)) {
				demotedSubjectIds.add(sub.id);
				staleEdpSubjectIds.add(sub.id);
				return {
					...sub,
					level: 'L2_decomposed' as SubjectMaturity,
					blocking_count: (sub.blocking_count ?? 0) + 1
				};
			}
			return sub;
		});

		// Réactive le statut provisoire sur les brouillons des sujets impactés
		for (const subId of impactedSubjectIds) {
			if (currentDrafts[subId]) {
				currentDrafts[subId] = {
					...currentDrafts[subId],
					is_provisional: true
				};
			}
		}
	} else {
		for (const sub of matchingSubjects) {
			if (sub.level === 'L0_named' || sub.level === 'L1_framed' || sub.level === 'L2_decomposed') {
				unblockedSubjectIds.add(sub.id);
			}
		}
	}

	const summaryMessage = isDisruptive
		? `Amendement [${amendment.id}] sur ${amendment.targetClauseRef} (${amendment.effect}) : ${impactedSubjectIds.size} sujet(s) impacté(s), ${demotedSubjectIds.size} sujet(s) rétrogradé(s) pour ré-arbitrage, ${impactedStatementIds.size} énoncé(s) touché(s).`
		: `Clarification [${amendment.id}] sur ${amendment.targetClauseRef} (${amendment.effect}) : ${unblockedSubjectIds.size} sujet(s) enrichi(s) sans invalidation d'arbitrage.`;

	return {
		amendment,
		impactedStatementIds: Array.from(impactedStatementIds),
		impactedSubjectIds: Array.from(impactedSubjectIds),
		demotedSubjectIds: Array.from(demotedSubjectIds),
		staleEdpSubjectIds: Array.from(staleEdpSubjectIds),
		unblockedSubjectIds: Array.from(unblockedSubjectIds),
		updatedStatements: currentStatements,
		updatedSubjects: currentSubjects,
		updatedDrafts: currentDrafts,
		summaryMessage
	};
}

/**
 * Construit la Matrice de Conformité Contractuelle Acheteur à partir d'un EngagementBundle
 * et des éventuels amendements Q&R enregistrés.
 */
export function buildBuyerComplianceMatrix(
	bundle: EngagementBundle,
	amendments: BuyerQaAmendment[] = []
): BuyerComplianceRow[] {
	const d = bundle.data;
	const sourceById = new Map(d.source_documents.map((s) => [s.id, s]));
	const subjectsByReq = new Map<string, typeof d.subjects>();
	for (const sub of d.subjects) {
		for (const rid of sub.requirement_ids) {
			subjectsByReq.set(rid, [...(subjectsByReq.get(rid) ?? []), sub]);
		}
	}
	const decisionById = new Map(d.decisions.map((dec) => [dec.id, dec]));
	const amendmentsByClause = new Map<string, BuyerQaAmendment[]>();
	for (const am of amendments) {
		const key = normalizeRef(am.targetClauseRef);
		amendmentsByClause.set(key, [...(amendmentsByClause.get(key) ?? []), am]);
	}

	return d.requirements.map((req) => {
		const src = sourceById.get(req.source_document_id);
		const reqAmendments = amendmentsByClause.get(normalizeRef(req.id)) ?? [];
		const subs = subjectsByReq.get(req.id) ?? [];
		const decs = subs
			.flatMap((s) => s.decision_ids)
			.map((id) => decisionById.get(id))
			.filter((dec): dec is NonNullable<typeof dec> => Boolean(dec));

		const isWithdrawn = reqAmendments.some((a) => a.effect === 'withdraws');
		let complianceStatus: BuyerComplianceStatus = 'À statuer [PROVISOIRE]';
		if (isWithdrawn) {
			complianceStatus = 'Retirée (Q&R)';
		} else if (req.disposition === 'evacuated') {
			complianceStatus = 'Conforme (Standard)';
		} else if (decs.length > 0) {
			const hasNonCompliant = decs.some((dec) => dec.compliance_status === 'Non-compliant');
			const hasPartial = decs.some(
				(dec) => dec.compliance_status === 'Partially compliant' || dec.compliance_status === 'Provisional'
			);
			complianceStatus = hasNonCompliant
				? 'Non conforme'
				: hasPartial
					? 'Partiellement conforme'
					: 'Conforme';
		}

		const commitmentParts: string[] = [];
		if (isWithdrawn) {
			const w = reqAmendments.find((a) => a.effect === 'withdraws')!;
			commitmentParts.push(`Clause retirée par l'acheteur [${w.id}] : ${w.buyerAnswer}`);
		} else if (decs.length > 0) {
			for (const dec of decs) {
				const reserve = dec.compliance_rationale ? ` (Réserve : ${dec.compliance_rationale})` : '';
				commitmentParts.push(`${dec.decision} — ${dec.rationale}${reserve}`);
			}
		} else if (req.disposition === 'evacuated') {
			commitmentParts.push(req.disposition_reason || 'Exigence standard traitée par le socle de référence.');
		} else if (req.disposition === 'clarification_needed') {
			commitmentParts.push(`Clarification en cours : ${req.clarification_question || 'Question ouverte'}`);
		} else {
			commitmentParts.push('Décision d’architecture en cours d’instruction.');
		}

		if (reqAmendments.length > 0 && !isWithdrawn) {
			const latest = reqAmendments[reqAmendments.length - 1];
			commitmentParts.push(`[Intègre ${latest.id} : ${latest.buyerAnswer}]`);
		}

		const hldAndCmdbRefs = Array.from(
			new Set([
				...subs.map((s) => `HLD:${s.id}`),
				...decs.map((dec) => `ADR:${dec.id}`)
			])
		);

		return {
			clauseRef: req.id,
			sourceDocument: src ? src.title : req.source_document_id,
			requirementTitle: req.title || req.id,
			criticality: req.criticality || 'majeur',
			amendmentRefs: reqAmendments.map((a) => a.id),
			complianceStatus,
			technicalCommitment: commitmentParts.join(' | '),
			hldAndCmdbRefs
		};
	});
}

function escapeCsvCell(value: string, delimiter = ';'): string {
	const cleaned = value.replace(/\r?\n/g, ' ').trim();
	if (cleaned.includes(delimiter) || cleaned.includes('"')) {
		return `"${cleaned.replace(/"/g, '""')}"`;
	}
	return cleaned;
}

/**
 * Exporte la Matrice de Conformité Contractuelle au format CSV (séparateur `;` compatible Excel FR).
 */
export function exportBuyerComplianceMatrixCsv(rows: BuyerComplianceRow[], delimiter = ';'): string {
	const headers = [
		'Réf. Clause',
		'Document Source',
		'Exigence',
		'Criticité',
		'Amendements Q&R',
		'Statut Conformité Offre',
		'Engagement & Justification Technique',
		'Références HLD / Décisions'
	];
	const lines = [headers.map((h) => escapeCsvCell(h, delimiter)).join(delimiter)];
	for (const r of rows) {
		lines.push(
			[
				r.clauseRef,
				r.sourceDocument,
				r.requirementTitle,
				r.criticality,
				r.amendmentRefs.join(', ') || '—',
				r.complianceStatus,
				r.technicalCommitment,
				r.hldAndCmdbRefs.join(', ') || '—'
			]
				.map((v) => escapeCsvCell(v, delimiter))
				.join(delimiter)
		);
	}
	return lines.join('\n') + '\n';
}

/**
 * Exporte la Matrice de Conformité Contractuelle au format Markdown opposable.
 */
export function exportBuyerComplianceMatrixMarkdown(rows: BuyerComplianceRow[]): string {
	const lines = [
		'| Réf. Clause | Document Source | Criticité | Q&R / Errata | Statut Conformité | Engagement & Justification | Réf. HLD / ADR |',
		'| :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
	];
	for (const r of rows) {
		const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
		lines.push(
			`| \`${esc(r.clauseRef)}\` | ${esc(r.sourceDocument)} | ${esc(r.criticality)} | ${esc(r.amendmentRefs.join(', ') || '—')} | **${esc(r.complianceStatus)}** | ${esc(r.technicalCommitment)} | ${esc(r.hldAndCmdbRefs.join(', ') || '—')} |`
		);
	}
	return lines.join('\n') + '\n';
}
