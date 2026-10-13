/**
 * Matrice de traçabilité des exigences : un modèle de lecture, deux sources, un rendu.
 *
 * Sources : le dossier scellé d'Archinex (projet non basculé) ou l'instantané du Hub (projet basculé, où Archinex n'émet
 * rien). Fonctions pures : sans horloge, sans accès à la base. Même contenu scellé, même texte.
 */

import type { EngagementBundle } from './engagementBundle';
import type { HubEngagementSnapshot } from './hubSnapshot';
import { cell } from './requirementsAuditReport';

export interface TraceRow {
	id: string;
	title: string;
	detail: string;
	criticality: string;
	state: string;
	level: string;
	who: string;
	subjects: string[];
	decisions: string[];
	gaps: string[];
	/** Contrôles que des décisions DÉCLARENT couvrir (jamais « vérifiés »). */
	controls: string[];
	disposition: string | null;
	assertionLevel: string | null;
}

export interface TraceGroup {
	heading: string;
	subline: string;
	rows: TraceRow[];
}

export interface TraceabilityView {
	title: string;
	/** « Empreinte du dossier » ou « Empreinte de l'instantané du Hub ». */
	fingerprintLabel: string;
	checksum: string;
	provisional: boolean;
	provisionalDetail: string | null;
	blockingGaps: string[];
	groups: TraceGroup[];
}

const STATE_LABEL: Record<string, string> = {
	deliberated: 'À délibérer',
	evacuated: 'Évacuée',
	clarification_needed: 'À clarifier',
	to_qualify: 'À qualifier'
};

export function renderTraceabilityView(view: TraceabilityView): string {
	const out: string[] = [];
	out.push(`# Matrice de traçabilité : ${view.title}`);
	out.push('');
	out.push(`${view.fingerprintLabel} \`${view.checksum}\` · ${view.provisional ? '**provisoire**' : 'non provisoire'}`);
	out.push('');
	if (view.provisionalDetail) {
		out.push(view.provisionalDetail);
		out.push('');
	}
	out.push(`## Lacunes bloquantes (${view.blockingGaps.length})`);
	out.push('');
	if (view.blockingGaps.length === 0) out.push('_Aucune._');
	for (const g of view.blockingGaps) out.push(g);
	out.push('');

	for (const group of view.groups) {
		out.push(`## ${group.heading}`);
		out.push('');
		out.push(group.subline);
		out.push('');
		out.push('| Exigence | Criticité | État | Niveau | Qui · quand | Sujet(s) | Décision(s) | Contrôles déclarés | Lacune |');
		out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
		for (const r of group.rows) {
			out.push(
				`| \`${r.id}\` ${cell(r.title, 60)}${r.detail ? ` — ${cell(r.detail, 120)}` : ''} ` +
					`| ${r.criticality} | ${r.state} | ${r.level} | ${r.who} ` +
					`| ${r.subjects.join('; ') || '—'} | ${r.decisions.join('; ') || '—'} | ${r.controls.join('; ') || '—'} | ${r.gaps.join('; ') || '—'} |`
			);
		}
		out.push('');
	}

	const rows = view.groups.flatMap((g) => g.rows);
	const count = (s: string) => rows.filter((r) => r.disposition === s).length;
	out.push('## Synthèse');
	out.push('');
	out.push(
		`- ${rows.length} exigence(s) : ${count('deliberated')} à délibérer, ${count('evacuated')} évacuée(s), ${count('clarification_needed')} à clarifier, ${count('to_qualify')} à qualifier` +
			(rows.some((r) => r.disposition === null) ? `, ${rows.filter((r) => r.disposition === null).length} sans décision` : '')
	);
	out.push(
		`- ${rows.filter((r) => r.assertionLevel === 'asserted').length} décidée(s) par une personne, ${rows.filter((r) => r.assertionLevel === 'proposed').length} proposée(s)`
	);
	out.push('');
	return out.join('\n');
}

// ── Source : le dossier scellé d'Archinex ───────────────────────────────────────────────────────────────────────

const BUNDLE_LEVEL: Record<string, string> = { asserted: 'décidé par un humain', proposed: 'proposé par le modèle', open: 'non tranché' };

/** Le dossier doit avoir été vérifié par l'appelant (voir `renderTraceabilityMatrix`). */
export function viewFromBundle(bundle: EngagementBundle): TraceabilityView {
	const d = bundle.data;
	const subjectsOf = new Map<string, typeof d.subjects>();
	for (const s of d.subjects) for (const rid of s.requirement_ids) subjectsOf.set(rid, [...(subjectsOf.get(rid) ?? []), s]);
	const gapsOf = new Map<string, typeof d.gaps>();
	for (const g of d.gaps) if (g.requirement_id) gapsOf.set(g.requirement_id, [...(gapsOf.get(g.requirement_id) ?? []), g]);
	const decisionsOf = new Map(d.decisions.map((x) => [x.id, x]));

	const groups: TraceGroup[] = d.source_documents.map((src) => {
		const reqs = d.requirements.filter((r) => r.source_document_id === src.id);
		return {
			heading: `Source ${src.id} : ${src.title}`,
			subline: `Empreinte \`${src.sha256}\` · ${reqs.length} exigence(s)`,
			rows: reqs.map((r) => {
				const subs = subjectsOf.get(r.id) ?? [];
				const decs = subs.flatMap((s) => s.decision_ids).map((id) => decisionsOf.get(id)).filter(Boolean);
				const p = r.provenance;
				return {
					id: r.id,
					title: r.title ?? '',
					detail: (r.disposition === 'clarification_needed' ? r.clarification_question : r.disposition_reason) ?? '',
					criticality: r.criticality ?? '—',
					state: STATE_LABEL[r.disposition ?? ''] ?? '—',
					level: BUNDLE_LEVEL[r.assertion_level ?? ''] ?? '—',
					who: p ? `${p.by.join(', ')} · ${p.at.slice(0, 10)}` : '—',
					subjects: subs.map((s) => cell(s.title, 50)),
					decisions: decs.map((x) => cell(x!.decision, 60)),
					gaps: (gapsOf.get(r.id) ?? []).map((g) => `${g.kind}${g.blocking ? ' (bloquante)' : ''}`),
					controls: d.compliance
						.filter((c) => c.requirement_id === r.id)
						.map((c) => `\`${c.control_ref}\` (${c.assertion_level === 'asserted' ? 'décision affirmée' : 'décision proposée'})`)
						.sort(),
					disposition: r.disposition ?? null,
					assertionLevel: r.assertion_level ?? null
				};
			})
		};
	});

	return {
		title: d.engagement.title,
		fingerprintLabel: 'Empreinte du dossier',
		checksum: bundle.checksum,
		provisional: d.is_provisional,
		provisionalDetail:
			d.provisional_reasons.unripe_subjects.length > 0 || d.provisional_reasons.open_conflicts.length > 0
				? `Provisoire car : ${d.provisional_reasons.unripe_subjects.length} sujet(s) immature(s), ${d.provisional_reasons.open_conflicts.length} conflit(s) ouvert(s).`
				: null,
		blockingGaps: d.gaps
			.filter((g) => g.blocking)
			.map((g) => `- \`${g.kind}\` ${g.requirement_id ? `(${g.requirement_id}) ` : g.subject_id ? `(${g.subject_id}) ` : ''}: ${cell(g.description, 240)}`),
		groups
	};
}

// ── Source : l'instantané du Hub ────────────────────────────────────────────────────────────────────────────────

/**
 * L'instantané doit avoir été vérifié (`requireVerifiedHubSnapshot`). Le Hub ne connaît pas la proposition brute d'un modèle :
 * une exigence sans décision est « sans décision », pas « à qualifier ».
 */
export function viewFromHubSnapshot(env: HubEngagementSnapshot): TraceabilityView {
	const d = env.data;
	const carriedBy = new Map<string, string[]>();
	for (const s of d.subjects) for (const rid of s.requirement_ids ?? []) carriedBy.set(rid, [...(carriedBy.get(rid) ?? []), s.name]);
	const assertedBySubject = new Map<string, string[]>();
	for (const dec of d.decisions) {
		if (dec.status !== 'active') continue;
		assertedBySubject.set(dec.subject, [...(assertedBySubject.get(dec.subject) ?? []), dec.decision]);
	}

	const rows: TraceRow[] = d.requirements.map((r) => {
		const disp = r.disposition;
		const subjects = (carriedBy.get(r.id) ?? []).sort();
		return {
			id: r.id,
			title: r.text,
			detail: disp ? disp.reason : '',
			criticality: r.criticality || '—',
			state: disp ? STATE_LABEL[disp.value] : 'Sans décision',
			level: disp ? (disp.assertion_level === 'asserted' ? 'décidé par une personne' : 'proposé, en attente d\'affirmation') : 'non décidé',
			who: disp
				? disp.assertion_level === 'asserted'
					? `${disp.validated_by} (proposé par ${disp.author}) · ${disp.validated_at.slice(0, 10)}`
					: `${disp.author}`
				: '—',
			subjects: subjects.map((s) => cell(s, 50)),
			decisions: subjects.flatMap((s) => assertedBySubject.get(s) ?? []).map((x) => cell(x, 60)),
			gaps: [],
			controls: (d.compliance ?? [])
				.filter((c) => c.requirement_id === r.id)
				.map((c) => `\`${c.control_ref}\` (${c.status === 'allocated' ? 'décision affirmée' : 'décision proposée'})`)
				.sort(),
			disposition: disp ? disp.value : null,
			assertionLevel: disp ? disp.assertion_level : null
		};
	});

	return {
		title: d.engagement.id,
		fingerprintLabel: 'Empreinte de l\'instantané du Hub',
		checksum: env.checksum,
		provisional: d.is_provisional,
		provisionalDetail:
			d.provisional_reasons.unripe_subjects > 0 || d.provisional_reasons.open_conflicts > 0
				? `Provisoire car : ${d.provisional_reasons.unripe_subjects} sujet(s) immature(s), ${d.provisional_reasons.open_conflicts} conflit(s) ouvert(s).`
				: null,
		blockingGaps: d.gaps.filter((g) => g.blocking).map((g) => `- \`${g.kind}\` ${g.subject ? `(${g.subject}) ` : ''}: ${cell(g.description, 240)}`),
		groups: [{ heading: 'Exigences de l\'engagement', subline: `${rows.length} exigence(s) · instantané \`${env.snapshotId}\``, rows }]
	};
}
