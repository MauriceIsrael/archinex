/**
 * Parité entre le dossier scellé d'Archinex et l'instantané du Hub (archinex#34).
 *
 * Le Hub est l'émetteur unique ; le dossier d'Archinex n'est conservé que « jusqu'à la parité ». Cette comparaison dit, pour un
 * même état, ce que chacun contient : les sections du dossier que le Hub porte (et si leur contenu coïncide), celles qu'il ne
 * porte pas encore. L'écart est LISTÉ, jamais masqué : tant qu'une section utile à un document manque au Hub, l'émission
 * d'Archinex ne peut pas être retirée pour ce document.
 *
 * Fonction pure : aucune lecture, aucun appel.
 */

import type { EngagementBundle } from './engagementBundle';
import type { HubEngagementSnapshot } from './hubSnapshot';
import { hubRequirementId } from './hubRequirementId';

/** `not_exercised` : le scénario n'a aucun élément dans cette section, donc rien n'a été comparé (ce n'est PAS « couverte »). */
export type SectionStatus = 'covered' | 'partial' | 'absent_in_hub' | 'not_exercised';

export interface SectionParity {
	/** Section du dossier d'Archinex (`data.<name>`). */
	section: string;
	status: SectionStatus;
	inBundle: number;
	/** Nombre d'éléments correspondants dans l'instantané du Hub, ou null si le Hub n'a pas cette section. */
	inHub: number | null;
	note: string;
}

export interface ParityReport {
	sections: SectionParity[];
	/** Écarts de CONTENU sur ce que le Hub porte : liste vide = ce qui est commun coïncide. */
	differences: string[];
	/** Sections que le Hub ne porte pas du tout. */
	absentInHub: string[];
}

const normalise = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const stripOption = (s: string) => s.replace(/^Option retenue\s*:\s*/i, '');

export function compareBundleWithHubSnapshot(bundle: EngagementBundle, hub: HubEngagementSnapshot): ParityReport {
	const b = bundle.data;
	const h = hub.data;
	const differences: string[] = [];

	// Exigences : présence, et décision humaine (seule la part « engagée » a un équivalent au Hub)
	const hubReq = new Map(h.requirements.map((r) => [r.id, r]));
	let reqMatched = 0;
	for (const r of b.requirements) {
		const other = hubReq.get(hubRequirementId(r.id));
		if (!other) {
			differences.push(`exigence ${r.id} : absente de l'instantané du Hub`);
			continue;
		}
		reqMatched++;
		if (other.text !== r.text) differences.push(`exigence ${r.id} : le texte diffère`);
		if (r.assertion_level === 'asserted') {
			const d = other.disposition;
			if (!d || d.status !== 'active') differences.push(`exigence ${r.id} : décidée « ${r.disposition} » dans le dossier, sans décision affirmée au Hub`);
			else if (d.value !== r.disposition) differences.push(`exigence ${r.id} : « ${r.disposition} » dans le dossier, « ${d.value} » au Hub`);
			else if (r.disposition !== 'deliberated') {
				const reason = r.disposition === 'clarification_needed' ? r.clarification_question : r.disposition_reason;
				if (normalise(reason ?? '') !== normalise(d.reason)) differences.push(`exigence ${r.id} : le motif diffère`);
			}
		}
	}

	// Sujets : nom, maturité, exigences portées
	const hubSubject = new Map(h.subjects.map((s) => [normalise(s.name), s]));
	let subjMatched = 0;
	for (const s of b.subjects) {
		const other = hubSubject.get(normalise(s.title));
		if (!other) {
			differences.push(`sujet « ${s.title} » : absent de l'instantané du Hub`);
			continue;
		}
		subjMatched++;
		const maturity = s.maturity === 'L5_archived' ? 'L4_specified' : s.maturity;
		if (other.maturity !== maturity) differences.push(`sujet « ${s.title} » : maturité ${maturity} dans le dossier, ${other.maturity} au Hub`);
		const wanted = [...s.requirement_ids].map(hubRequirementId).sort();
		const got = [...(other.requirement_ids ?? [])].sort();
		if (JSON.stringify(wanted) !== JSON.stringify(got)) differences.push(`sujet « ${s.title} » : exigences portées différentes (${wanted.length} contre ${got.length})`);
	}

	// Décisions : sujet, option retenue, justification, alternatives écartées
	const hubDecision = new Map(h.decisions.filter((d) => d.status === 'active').map((d) => [normalise(d.subject), d]));
	const subjectTitle = new Map(b.subjects.map((s) => [s.id, s.title]));
	let decMatched = 0;
	for (const d of b.decisions) {
		const title = subjectTitle.get(d.subject_id) ?? d.subject_id;
		const other = hubDecision.get(normalise(title));
		if (!other) {
			differences.push(`décision sur « ${title} » : aucune décision affirmée au Hub`);
			continue;
		}
		decMatched++;
		if (normalise(stripOption(d.decision)) !== normalise(other.decision)) differences.push(`décision sur « ${title} » : l'option retenue diffère`);
		if (normalise(d.rationale) !== normalise(other.rationale)) differences.push(`décision sur « ${title} » : la justification diffère`);
		const rejected = ((other as unknown as { rejected?: Array<{ option: string }> }).rejected ?? []).map((r) => normalise(r.option)).sort();
		const alternatives = (d.alternatives ?? []).map((a) => normalise(a.title)).sort();
		if (JSON.stringify(rejected) !== JSON.stringify(alternatives)) differences.push(`décision sur « ${title} » : les alternatives écartées diffèrent`);
	}

	// Énoncés affirmés : valeur (les énoncés proposés n'engagent rien)
	const hubStatements = ((h as unknown as { statements?: Array<{ value: string; status: string }> }).statements ?? []).filter((s) => s.status === 'active');
	const assertedBundle = b.statements.filter((s) => s.assertion_level === 'asserted');
	let stMatched = 0;
	for (const s of assertedBundle) {
		if (hubStatements.some((x) => normalise(s.text).includes(normalise(x.value)))) stMatched++;
		else differences.push(`énoncé ${s.id} : aucun énoncé affirmé de même valeur au Hub`);
	}

	const sections: SectionParity[] = [
		sec('requirements', b.requirements.length, reqMatched, 'identifiants Hub; la décision engagée est comparée (contrat 1.27)'),
		sec('subjects', b.subjects.length, subjMatched, 'nom, maturité et exigences portées'),
		sec('decisions', b.decisions.length, decMatched, 'option retenue, justification, alternatives écartées'),
		sec('statements', assertedBundle.length, stMatched, 'énoncés affirmés'),
		{ section: 'gaps', status: 'partial', inBundle: b.gaps.length, inHub: h.gaps.length, note: "le Hub ne calcule que G1 et G2 ; les lacunes d'exigence (à qualifier, à clarifier) sont du processus d'Archinex" },
		counted('conflicts', b.conflicts.length, ((h as unknown as { conflicts?: unknown[] }).conflicts ?? []).length, 'conflits entre énoncés : comptés, contenu non comparé'),
		counted('kb_references', b.kb_references.length, ((h as unknown as { kb_references?: unknown[] }).kb_references ?? []).length, 'références de la base de connaissance : comptées, contenu non comparé'),
		absent('source_documents', b.source_documents.length, "le Hub ne tient pas le document source : l'empreinte du RFP et sa version ne figurent que dans le dossier"),
		absent('compliance', b.compliance.length, 'matrice exigence → contrôle (K17 : pas encore au Hub)'),
		absent('architecture', b.architecture.elements.length + b.architecture.relations.length, "éléments et relations d'architecture : pas au Hub"),
		absent('reuse_log', b.reuse_log.length, 'journal des réutilisations confirmées, hypothèse par hypothèse : pas au Hub'),
		absent('glossary', b.glossary.length, 'glossaire : pas au Hub')
	];

	return { sections, differences, absentInHub: sections.filter((s) => s.status === 'absent_in_hub').map((s) => s.section) };
}

function sec(section: string, inBundle: number, matched: number, note: string): SectionParity {
	if (inBundle === 0) return { section, status: 'not_exercised', inBundle, inHub: matched, note };
	return { section, status: matched === inBundle ? 'covered' : 'partial', inBundle, inHub: matched, note };
}
/** Section que le Hub porte mais dont on ne compare que le nombre d'éléments. */
function counted(section: string, inBundle: number, inHub: number, note: string): SectionParity {
	return { section, status: inBundle === 0 && inHub === 0 ? 'not_exercised' : 'partial', inBundle, inHub, note };
}
function absent(section: string, inBundle: number, note: string): SectionParity {
	return { section, status: 'absent_in_hub', inBundle, inHub: null, note };
}

export function renderParityReport(report: ParityReport): string {
	const out = ['| Section du dossier | Dans le dossier | Au Hub | État | Remarque |', '| --- | --- | --- | --- | --- |'];
	for (const s of report.sections) {
		const label = { covered: 'couverte', partial: 'partielle', absent_in_hub: 'absente du Hub', not_exercised: 'non éprouvée par ce scénario' }[s.status];
		out.push(`| \`${s.section}\` | ${s.inBundle} | ${s.inHub ?? '—'} | ${label} | ${s.note} |`);
	}
	out.push('');
	out.push(report.differences.length === 0 ? '_Aucun écart de contenu sur ce que le Hub porte._' : report.differences.map((d) => `- ${d}`).join('\n'));
	return out.join('\n') + '\n';
}
