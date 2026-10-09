/**
 * Rapport lisible de l'audit des exigences d'un RFP (Markdown).
 *
 * Répond à trois questions : pourquoi ces sujets, que devient chaque autre clause, que dois-je relire.
 * Fonction pure, utilisée par l'écran de revue (téléchargement) et par la ligne de commande
 * (`npm run eval:requirements -- … --report rapport.md`).
 *
 * Invariant : chaque clause reçue apparaît exactement une fois dans le rapport, dans la section de son état.
 */

import type { AuditMetrics } from './requirementsAuditEval';

export interface ReportRequirement {
	clauseRef: string;
	title: string;
	text: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	category?: string;
	disposition: 'deliberated' | 'evacuated' | 'clarification_needed' | 'to_qualify';
	evacuationReason?: string;
	clarificationQuestion?: string;
	deliberationReason?: string;
	qualifyReason?: string;
	linkedSubjectId?: string;
}

export interface ReportSubject {
	id: string;
	name: string;
	sectionRef: string;
	coveredClauseRefs: string[];
	waitingForRole: string;
	effort: string;
	knowledgeAlignment?: string;
	alignmentRationale?: string;
	matchedKbItemIds?: string[];
	seed: {
		initialQuestion?: string;
		initialHypothesis?: string;
		initialConflict?: string;
		expertQuestions?: string[];
	};
}

export interface AuditReportInput {
	title: string;
	model: string;
	status?: string;
	generatedAt: string;
	requirements: ReportRequirement[];
	subjects: ReportSubject[];
	warnings?: string[];
	metrics?: AuditMetrics | null;
}

const CRIT_ORDER = { bloquant: 0, majeur: 1, info: 2 } as const;

/** Rend un texte sûr dans une cellule de tableau Markdown : une ligne, sans barre verticale. */
export function cell(text: string | undefined | null, max = 170): string {
	const t = (text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
	return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

function table(head: string[], rows: string[][]): string {
	if (rows.length === 0) return '_Aucune._\n';
	return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') + '\n';
}

export function buildAuditReportMarkdown(input: AuditReportInput): string {
	const reqs = input.requirements;
	const by = (d: ReportRequirement['disposition']) => reqs.filter((r) => r.disposition === d);
	const deliberated = by('deliberated');
	const toQualify = by('to_qualify');
	const clarify = by('clarification_needed');
	const evacuated = by('evacuated');
	const byRef = new Map(reqs.map((r) => [r.clauseRef, r]));
	const sortRisk = (a: ReportRequirement, b: ReportRequirement) => CRIT_ORDER[a.criticality] - CRIT_ORDER[b.criticality];

	const out: string[] = [];
	out.push(`# Audit des exigences : ${input.title}`);
	out.push('');
	out.push(`Modèle : \`${input.model}\`${input.status ? ` · statut : ${input.status}` : ''} · généré le ${input.generatedAt}`);
	out.push('');
	out.push(
		"> Toutes les dispositions ci-dessous sont des **propositions du modèle**. Rien n'est décidé tant qu'un humain ne les a pas relues. " +
			'Chaque clause apparaît exactement une fois, dans la section de son état.'
	);
	out.push('');

	out.push('## Lecture rapide');
	out.push('');
	out.push(
		table(
			['État', 'Clauses', 'Que faire'],
			[
				['À délibérer', String(deliberated.length), `Ouvrir les ${input.subjects.length} sujets dans l'espace de délibération`],
				['À qualifier', String(toQualify.length), 'Trancher vous-même : promouvoir en sujet, ou évacuer avec un motif'],
				['À clarifier', String(clarify.length), 'Envoyer les questions au donneur d\'ordre'],
				['Évacuation proposée', String(evacuated.length), 'Relire toutes les clauses « majeur », un échantillon des « info »'],
				['**Total**', `**${reqs.length}**`, '']
			]
		)
	);

	if (input.warnings && input.warnings.length > 0) {
		out.push('## Avertissements');
		out.push('');
		for (const w of input.warnings) out.push(`- ${w}`);
		out.push('');
	}

	out.push(`## Pourquoi ces sujets (${input.subjects.length})`);
	out.push('');
	if (input.subjects.length === 0) out.push('_Aucun sujet : aucune clause n\'a été jugée à délibérer._\n');
	for (const s of input.subjects) {
		out.push(`### ${s.id} · ${s.name}`);
		out.push('');
		out.push(`Section ${s.sectionRef} · en attente de \`${s.waitingForRole}\` · effort ${s.effort} · ${s.coveredClauseRefs.length} clause(s)`);
		out.push('');
		if (s.seed.initialQuestion) out.push(`- **Question à trancher** : ${s.seed.initialQuestion}`);
		if (s.seed.initialConflict) out.push(`- **Tension principale** : ${s.seed.initialConflict}`);
		if (s.seed.initialHypothesis) out.push(`- **Hypothèse de départ** (proposée, non retenue) : ${s.seed.initialHypothesis}`);
		const kb = s.matchedKbItemIds && s.matchedKbItemIds.length > 0 ? `rapproché de ${s.matchedKbItemIds.join(', ')}` : 'aucune règle de doctrine rapprochée';
		out.push(`- **Doctrine** : ${kb}${s.alignmentRationale ? ` (${s.alignmentRationale})` : ''}`);
		for (const q of s.seed.expertQuestions || []) out.push(`- **Question pour le sachant** : ${q}`);
		out.push('');
		out.push(
			table(
				['Clause', 'Criticité', 'Pourquoi elle est ici'],
				s.coveredClauseRefs.map((ref) => {
					const r = byRef.get(ref);
					return [`\`${ref}\``, r?.criticality ?? '?', cell(r?.deliberationReason) || '_non précisé par le modèle_'];
				})
			)
		);
	}

	const inSubject = new Set(input.subjects.flatMap((s) => s.coveredClauseRefs));
	const orphans = deliberated.filter((r) => !inSubject.has(r.clauseRef));
	if (orphans.length > 0) {
		out.push(`## À délibérer mais sans sujet (${orphans.length})`);
		out.push('');
		out.push("Ces clauses ont été jugées à délibérer sans être rattachées à un sujet : à rattacher ou à promouvoir en sujet.");
		out.push('');
		out.push(table(['Clause', 'Criticité', 'Titre', 'Pourquoi'], orphans.map((r) => [`\`${r.clauseRef}\``, r.criticality, cell(r.title, 70), cell(r.deliberationReason)])));
	}

	out.push(`## À qualifier par vous (${toQualify.length})`);
	out.push('');
	out.push("Le pipeline n'a pas pu ou pas osé trancher. C'est la liste à traiter en premier.");
	out.push('');
	out.push(
		table(
			['Clause', 'Criticité', 'Titre', 'Pourquoi'],
			[...toQualify].sort(sortRisk).map((r) => [`\`${r.clauseRef}\``, r.criticality, cell(r.title, 70), cell(r.qualifyReason)])
		)
	);

	out.push(`## À clarifier avec le donneur d'ordre (${clarify.length})`);
	out.push('');
	out.push(table(['Clause', 'Titre', 'Question'], clarify.map((r) => [`\`${r.clauseRef}\``, cell(r.title, 70), cell(r.clarificationQuestion, 300)])));

	out.push(`## Évacuations proposées (${evacuated.length})`);
	out.push('');
	out.push("À relire : une évacuation à tort fait disparaître une exigence du débat. Les clauses « majeur » d'abord.");
	out.push('');
	out.push(
		table(
			['Clause', 'Criticité', 'Titre', 'Motif proposé'],
			[...evacuated].sort(sortRisk).map((r) => [`\`${r.clauseRef}\``, r.criticality, cell(r.title, 70), cell(r.evacuationReason)])
		)
	);

	if (input.metrics) {
		const m = input.metrics;
		out.push('## Comparaison avec l\'analyse de référence');
		out.push('');
		out.push(`- Rappel « à délibérer » : **${pct(m.deliberateRecall)}**`);
		out.push(
			`- Faux négatifs dangereux (clause de référence évacuée) : **${m.dangerousFalseNegatives.length}**` +
				(m.dangerousFalseNegatives.length ? ` : ${m.dangerousFalseNegatives.map((r) => `\`${r}\``).join(', ')}` : '')
		);
		out.push(`- Clauses de référence laissées « à qualifier » : ${m.referenceLeftToQualify.length}`);
		out.push(`- Rappel « à clarifier » : ${pct(m.clarificationRecall)}`);
		out.push(`- Taux d'évacuation : ${pct(m.evacuationRate)} · taux « à qualifier » : ${pct(m.toQualifyRate)}`);
		out.push(`- Intégrité : **${m.integrityOk ? 'OK' : 'ÉCHEC'}**`);
		out.push('');
		out.push(
			table(
				['Point dur de référence', 'Clauses', 'Meilleur sujet généré', 'Rappel', 'Précision'],
				m.hardPointMatches.map((h) => [
					`${h.referenceId} · ${cell(h.referenceName, 60)}`,
					String(h.referenceClauseCount),
					h.bestSubjectName ? `${h.bestSubjectId} · ${cell(h.bestSubjectName, 60)}` : '_aucun_',
					pct(h.recall),
					pct(h.precision)
				])
			)
		);
	}

	return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
