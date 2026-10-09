/**
 * Matrice de traçabilité des exigences, générée à partir du dossier scellé et de lui seul.
 *
 * Sert de preuve de la chaîne « JSON scellé → document » : fonction pure, sans horloge, sans accès à la base.
 * Même dossier, mêmes octets. Un dossier qui échoue à la vérification est refusé : on ne produit pas de document
 * à partir d'un artefact altéré ou incohérent.
 */

import type { BundleRequirement, EngagementBundle } from './engagementBundle';
import { verifyEngagementBundle } from './bundleVerifier';
import { cell } from './requirementsAuditReport';

export class BundleRejectedError extends Error {
	constructor(readonly problems: Array<{ code: string; message: string }>) {
		super(`Dossier refusé par le vérificateur (${problems.length} problème(s)) : ${problems.slice(0, 3).map((p) => p.code).join(', ')}`);
		this.name = 'BundleRejectedError';
	}
}

const STATE_LABEL: Record<string, string> = {
	deliberated: 'À délibérer',
	evacuated: 'Évacuée',
	clarification_needed: 'À clarifier',
	to_qualify: 'À qualifier'
};

const LEVEL_LABEL: Record<string, string> = {
	asserted: 'décidé par un humain',
	proposed: 'proposé par le modèle',
	open: 'non tranché'
};

function who(r: BundleRequirement): string {
	const p = r.provenance;
	return p ? `${p.by.join(', ')} · ${p.at.slice(0, 10)}` : '—';
}

export function renderTraceabilityMatrix(bundle: EngagementBundle): string {
	const problems = verifyEngagementBundle(bundle);
	if (problems.length > 0) throw new BundleRejectedError(problems);

	const d = bundle.data;
	const subjectsOf = new Map<string, typeof d.subjects>();
	for (const s of d.subjects) {
		for (const rid of s.requirement_ids) subjectsOf.set(rid, [...(subjectsOf.get(rid) ?? []), s]);
	}
	const gapsOf = new Map<string, typeof d.gaps>();
	for (const g of d.gaps) {
		if (g.requirement_id) gapsOf.set(g.requirement_id, [...(gapsOf.get(g.requirement_id) ?? []), g]);
	}
	const decisionsOf = new Map(d.decisions.map((x) => [x.id, x]));

	const out: string[] = [];
	out.push(`# Matrice de traçabilité : ${d.engagement.title}`);
	out.push('');
	out.push(`Empreinte du dossier \`${bundle.checksum}\` · ${d.is_provisional ? '**provisoire**' : 'non provisoire'}`);
	out.push('');
	if (d.provisional_reasons.unripe_subjects.length > 0 || d.provisional_reasons.open_conflicts.length > 0) {
		out.push(
			`Provisoire car : ${d.provisional_reasons.unripe_subjects.length} sujet(s) immature(s), ${d.provisional_reasons.open_conflicts.length} conflit(s) ouvert(s).`
		);
		out.push('');
	}

	const blocking = d.gaps.filter((g) => g.blocking);
	out.push(`## Lacunes bloquantes (${blocking.length})`);
	out.push('');
	if (blocking.length === 0) out.push('_Aucune._');
	for (const g of blocking) out.push(`- \`${g.code}\` ${g.requirement_id ? `(${g.requirement_id}) ` : g.subject_id ? `(${g.subject_id}) ` : ''}: ${cell(g.description, 240)}`);
	out.push('');

	for (const src of d.source_documents) {
		const reqs = d.requirements.filter((r) => r.source_document_id === src.id);
		out.push(`## Source ${src.id} : ${src.title}`);
		out.push('');
		out.push(`Empreinte \`${src.sha256}\` · ${reqs.length} exigence(s)`);
		out.push('');
		out.push('| Exigence | Criticité | État | Niveau | Qui · quand | Sujet(s) | Décision(s) | Lacune |');
		out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
		for (const r of reqs) {
			const subs = subjectsOf.get(r.id) ?? [];
			const decs = subs.flatMap((s) => s.decision_ids).map((id) => decisionsOf.get(id)).filter(Boolean);
			const gaps = gapsOf.get(r.id) ?? [];
			const detail = r.disposition === 'clarification_needed' ? r.clarification_question : r.disposition_reason;
			out.push(
				`| \`${r.id}\` ${cell(r.title, 60)}${detail ? ` — ${cell(detail, 120)}` : ''} ` +
					`| ${r.criticality ?? '—'} ` +
					`| ${STATE_LABEL[r.disposition ?? ''] ?? '—'} ` +
					`| ${LEVEL_LABEL[r.assertion_level ?? ''] ?? '—'} ` +
					`| ${who(r)} ` +
					`| ${subs.map((s) => cell(s.title, 50)).join('; ') || '—'} ` +
					`| ${decs.map((x) => cell(x!.decision, 60)).join('; ') || '—'} ` +
					`| ${gaps.map((g) => `${g.code}${g.blocking ? ' (bloquante)' : ''}`).join('; ') || '—'} |`
			);
		}
		out.push('');
	}

	// Traçabilité inverse : toute exigence « à délibérer » doit avoir un sujet (sinon le dossier est refusé en amont).
	const covered = d.requirements.filter((r) => r.disposition === 'deliberated').length;
	out.push('## Synthèse');
	out.push('');
	const count = (s: string) => d.requirements.filter((r) => r.disposition === s).length;
	out.push(
		`- ${d.requirements.length} exigence(s) : ${covered} à délibérer, ${count('evacuated')} évacuée(s), ${count('clarification_needed')} à clarifier, ${count('to_qualify')} à qualifier`
	);
	out.push(`- ${d.requirements.filter((r) => r.assertion_level === 'asserted').length} décidée(s) par un humain, ${d.requirements.filter((r) => r.assertion_level === 'proposed').length} proposée(s) par le modèle`);
	out.push('');
	return out.join('\n');
}
