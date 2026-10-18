/**
 * Matrice de Conformité de base d'un engagement Archinex.
 *
 * Statuts supportés :
 * - `Compliant` : L'architecture retenue répond intégralement à l'exigence / au contrôle réglementaire.
 * - `Partially compliant` : Réponse partielle, réserve ou écart accepté avec dispense justifiée.
 * - `Non-compliant` : Non-respect assumé (exigence évacuée, arbitrage négatif).
 * - `Provisional` : En attente d'arbitrage expert, question ouverte ou conflit non résolu.
 *
 * Règle d'or : Toute position « Partially compliant » ou « Non-compliant » doit comporter
 * une justification ou réserve explicite (au moins 5 caractères).
 */

import type { EngagementBundle, BundleRequirement, BundleSubject, BundleDecision } from './engagementBundle';

export type ComplianceStatus =
	| 'Compliant'
	| 'Partially compliant'
	| 'Non-compliant'
	| 'Provisional';

export type DecidedComplianceStatus =
	| 'Compliant'
	| 'Partially compliant'
	| 'Non-compliant';

export const COMPLIANCE_STATUSES: readonly ComplianceStatus[] = [
	'Compliant',
	'Partially compliant',
	'Non-compliant',
	'Provisional'
] as const;

export const DECIDED_COMPLIANCE_STATUSES: readonly DecidedComplianceStatus[] = [
	'Compliant',
	'Partially compliant',
	'Non-compliant'
] as const;

/**
 * Valide la cohérence d'un statut de conformité et de sa justification / réserve.
 */
export function validateCompliancePosition(
	status: ComplianceStatus,
	justification?: string | null
): { valid: boolean; reason?: string } {
	if (status === 'Partially compliant' || status === 'Non-compliant') {
		if (!justification || justification.trim().length < 5) {
			return {
				valid: false,
				reason: `Une justification ou réserve explicite (au moins 5 caractères) est obligatoire lorsque le statut est « ${status} ».`
			};
		}
	}
	return { valid: true };
}

export interface ComplianceMatrixRow {
	requirementId: string;
	clauseRef: string;
	requirementTitle: string;
	criticality: string;
	status: ComplianceStatus;
	justification: string;
	decisionRef: string | null;
	decisionTitle: string | null;
	kbReferences: string[];
	subjectId: string | null;
	subjectTitle: string | null;
	isProvisional: boolean;
	provisionalReason: string | null;
}

export interface ComplianceMatrixSummary {
	total: number;
	compliant: number;
	partiallyCompliant: number;
	nonCompliant: number;
	provisional: number;
	complianceRatePercent: number;
}

export interface ComplianceMatrix {
	title: string;
	snapshotId?: string;
	checksum?: string;
	isProvisional: boolean;
	summary: ComplianceMatrixSummary;
	rows: ComplianceMatrixRow[];
}

function escapeMarkdownCell(text: string | null | undefined): string {
	return (text ?? '')
		.replace(/\|/g, '\\|')
		.replace(/\n+/g, ' ')
		.trim();
}

function escapeCsvCell(text: string | null | undefined): string {
	const str = (text ?? '').replace(/\r?\n/g, ' ').trim();
	if (str.includes('"') || str.includes(',') || str.includes(';')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return `"${str}"`;
}

/**
 * Construit la matrice de conformité de base à partir d'un EngagementBundle scellé ou assemblé.
 */
export function buildComplianceMatrix(bundle: EngagementBundle): ComplianceMatrix {
	const d = bundle.data;
	const subjectsOf = new Map<string, BundleSubject[]>();
	for (const s of d.subjects) {
		for (const rid of s.requirement_ids) {
			subjectsOf.set(rid, [...(subjectsOf.get(rid) ?? []), s]);
		}
	}

	const decisionsOf = new Map<string, BundleDecision>(d.decisions.map((x) => [x.id, x]));
	const complianceControlsOfReq = new Map<string, string[]>();
	for (const c of d.compliance) {
		complianceControlsOfReq.set(c.requirement_id, [
			...(complianceControlsOfReq.get(c.requirement_id) ?? []),
			c.control_ref
		]);
	}

	const unripeSet = new Set(d.provisional_reasons?.unripe_subjects ?? []);
	const openConflictsCount = (d.conflicts ?? []).filter((c) => c.status === 'open').length;

	const rows: ComplianceMatrixRow[] = [];

	for (const r of d.requirements) {
		const linkedSubjects = subjectsOf.get(r.id) ?? [];
		const primarySubject = linkedSubjects[0] ?? null;
		const decId = primarySubject?.decision_ids?.[0];
		const decision = decId ? decisionsOf.get(decId) ?? null : null;

		const kbRefs = new Set<string>();
		for (const c of complianceControlsOfReq.get(r.id) ?? []) {
			kbRefs.add(c);
		}
		if (decision?.derived_from?.kb_ref) {
			kbRefs.add(decision.derived_from.kb_ref);
		}

		let status: ComplianceStatus;
		let justification = '';
		let isProvisional = false;
		let provisionalReason: string | null = null;

		// 1. Exigence évacuée
		if (r.disposition === 'evacuated') {
			status = 'Non-compliant';
			justification = r.disposition_reason?.trim() || 'Exigence formellement évacuée du périmètre.';
			isProvisional = r.assertion_level !== 'asserted';
			if (isProvisional) {
				provisionalReason = "Évacuation proposée par le modèle, en attente d'affirmation humaine.";
			}
		}
		// 2. Exigence non qualifiée ou nécessitant clarification
		else if (r.disposition === 'to_qualify' || r.disposition === 'clarification_needed') {
			status = 'Provisional';
			isProvisional = true;
			provisionalReason =
				r.disposition === 'to_qualify'
					? 'Exigence en attente de qualification.'
					: `Clarification requise : ${r.clarification_question ?? r.clause_ref}`;
			justification = r.clarification_question || r.disposition_reason || 'En attente de retour.';
		}
		// 3. Exigence non rattachée à un sujet d'architecture
		else if (!primarySubject) {
			status = 'Provisional';
			isProvisional = true;
			provisionalReason = 'Exigence orpheline non couverte par un sujet d architecture.';
			justification = 'Aucun sujet d architecture ne prend en charge cette exigence.';
		}
		// 4. Sujet non mûr ou conflits ouverts
		else if (
			primarySubject.status !== 'decided' ||
			!decision ||
			unripeSet.has(primarySubject.id) ||
			primarySubject.maturity === 'L0_named' ||
			primarySubject.maturity === 'L1_framed' ||
			primarySubject.maturity === 'L2_decomposed'
		) {
			status = 'Provisional';
			isProvisional = true;
			provisionalReason = `Sujet « ${primarySubject.title} » en cours de maturation (${primarySubject.maturity}).`;
			justification = 'En cours de délibération architecturale.';
		}
		// 5. Sujet décidé (L3+) avec décision formelle
		else {
			let decStatus = decision.compliance_status;
			let decRationale = decision.compliance_rationale;

			if (!decStatus && decision.consequences) {
				for (const c of decision.consequences) {
					if (c.startsWith('compliance_status:')) {
						decStatus = c.replace('compliance_status:', '') as ComplianceStatus;
					} else if (c.startsWith('compliance_rationale:')) {
						decRationale = c.replace('compliance_rationale:', '');
					}
				}
			}

			if (decStatus && COMPLIANCE_STATUSES.includes(decStatus)) {
				status = decStatus;
				justification = decRationale || decision.rationale;
			} else {
				// Dérivation par défaut : si des violations acceptées existent, partiellement conforme
				status = 'Compliant';
				justification = decision.rationale;
			}

			// Si des conflits ouverts existent globalement sur l'engagement, il reste provisoire
			if (openConflictsCount > 0) {
				isProvisional = true;
				provisionalReason = `${openConflictsCount} conflit(s) ouvert(s) non arbitré(s) dans le dossier.`;
			}
		}

		rows.push({
			requirementId: r.id,
			clauseRef: r.clause_ref,
			requirementTitle: r.title || r.text,
			criticality: r.criticality || 'info',
			status,
			justification,
			decisionRef: decision?.id ?? null,
			decisionTitle: decision?.title ?? null,
			kbReferences: [...kbRefs].sort(),
			subjectId: primarySubject?.id ?? null,
			subjectTitle: primarySubject?.title ?? null,
			isProvisional,
			provisionalReason
		});
	}

	const total = rows.length;
	const compliant = rows.filter((r) => r.status === 'Compliant').length;
	const partiallyCompliant = rows.filter((r) => r.status === 'Partially compliant').length;
	const nonCompliant = rows.filter((r) => r.status === 'Non-compliant').length;
	const provisional = rows.filter((r) => r.status === 'Provisional').length;

	const complianceRatePercent =
		total > 0 ? Math.round(((compliant + partiallyCompliant * 0.5) / total) * 100) : 0;

	return {
		title: d.engagement.title,
		snapshotId: bundle.snapshotId,
		checksum: bundle.checksum,
		isProvisional: bundle.data.is_provisional || provisional > 0,
		summary: {
			total,
			compliant,
			partiallyCompliant,
			nonCompliant,
			provisional,
			complianceRatePercent
		},
		rows
	};
}

/**
 * Génère le rendu textuel Markdown opposable de la matrice de conformité.
 */
export function renderComplianceMatrixMarkdown(matrix: ComplianceMatrix): string {
	const out: string[] = [];

	out.push(`# Matrice de Conformité : ${matrix.title}`);
	out.push('');
	if (matrix.snapshotId && matrix.checksum) {
		out.push(`Dossier scellé \`${matrix.snapshotId}\` · Empreinte \`${matrix.checksum}\``);
		out.push(`État : ${matrix.isProvisional ? '**Provisoire** (arbitrages ou qualifications en cours)' : '**Opposable & Finalisé**'}`);
		out.push('');
	}

	out.push('## Synthèse Exécutive de Conformité');
	out.push('');
	out.push('| Indicateur | Valeur |');
	out.push('| --- | --- |');
	out.push(`| Total exigences | **${matrix.summary.total}** |`);
	out.push(`| Conformes (Compliant) | **${matrix.summary.compliant}** |`);
	out.push(`| Partiellement conformes (Partially compliant) | **${matrix.summary.partiallyCompliant}** |`);
	out.push(`| Non conformes / Écartées (Non-compliant) | **${matrix.summary.nonCompliant}** |`);
	out.push(`| Provisoires / En délibération (Provisional) | **${matrix.summary.provisional}** |`);
	out.push(`| Taux de conformité pondéré | **${matrix.summary.complianceRatePercent}%** |`);
	out.push('');

	out.push('## Détail de la Matrice de Conformité');
	out.push('');
	out.push('| Exigence | Statut de conformité | Justification / Réserve | Référence Décision / KB | Sujet |');
	out.push('| --- | --- | --- | --- | --- |');

	for (const r of matrix.rows) {
		const reqLabel = `\`${r.clauseRef}\` ${escapeMarkdownCell(r.requirementTitle)}`;
		const statusBadge =
			r.status === 'Compliant'
				? '**Compliant**'
				: r.status === 'Partially compliant'
					? '**Partially compliant**'
					: r.status === 'Non-compliant'
						? '**Non-compliant**'
						: '_Provisional_';

		const decisionKbParts: string[] = [];
		if (r.decisionRef) {
			decisionKbParts.push(`\`${r.decisionRef}\`${r.decisionTitle ? ` (${escapeMarkdownCell(r.decisionTitle)})` : ''}`);
		}
		if (r.kbReferences.length > 0) {
			decisionKbParts.push(r.kbReferences.map((k) => `\`${k}\``).join(', '));
		}
		const decisionKbLabel = decisionKbParts.join(' · ') || '—';
		const subjectLabel = r.subjectTitle ? escapeMarkdownCell(r.subjectTitle) : '—';
		const justif = escapeMarkdownCell(r.justification) || (r.provisionalReason ? `_${escapeMarkdownCell(r.provisionalReason)}_` : '—');

		out.push(`| ${reqLabel} | ${statusBadge} | ${justif} | ${decisionKbLabel} | ${subjectLabel} |`);
	}

	out.push('');
	return out.join('\n');
}

/**
 * Génère le fichier CSV exportable (compatible Excel avec BOM UTF-8).
 */
export function renderComplianceMatrixCsv(matrix: ComplianceMatrix): string {
	const bom = '\uFEFF';
	const lines: string[] = [
		[
			'Exigence ID',
			'Clause',
			'Titre Exigence',
			'Criticité',
			'Statut de conformité',
			'Justification / Réserve',
			'Référence Décision',
			'Titre Décision',
			'Références KB',
			'Sujet ID',
			'Titre Sujet',
			'Provisoire',
			'Motif Provisoire'
		]
			.map(escapeCsvCell)
			.join(',')
	];

	for (const r of matrix.rows) {
		lines.push(
			[
				r.requirementId,
				r.clauseRef,
				r.requirementTitle,
				r.criticality,
				r.status,
				r.justification,
				r.decisionRef || '',
				r.decisionTitle || '',
				r.kbReferences.join('; '),
				r.subjectId || '',
				r.subjectTitle || '',
				r.isProvisional ? 'OUI' : 'NON',
				r.provisionalReason || ''
			]
				.map(escapeCsvCell)
				.join(',')
		);
	}

	return bom + lines.join('\r\n');
}

