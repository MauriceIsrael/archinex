/**
 * Fragment de dossier de conception (HLD) d'un sujet, construit à partir de la délibération enregistrée.
 *
 * Structure reprise du modèle ADR d'ArcKit (.arckit/templates/adr-template.md) : contexte et problème,
 * critères de décision, options étudiées (statu quo compris quand il a été posé), décision et justification,
 * conséquences. Aucune phrase n'est rédigée par un modèle : chaque élément provient d'une donnée enregistrée
 * (sujet, exigences du RFP, critères, options, évaluations, arguments, décision), ce qui le rend traçable.
 */
import type { Criterion, Option, OptionEvaluation, Decision } from './options';
import type { Argument } from './debate';

export type HldFragmentStatus = 'decided' | 'awaiting_review' | 'undecided';

export interface HldRequirementRef {
	id: string;
	clauseRef: string;
	title: string;
	criticality: string;
	text?: string;
}

export interface HldFragmentInput {
	subject: {
		id: string;
		sectionRef: string;
		name: string;
		problemStatement?: string | null;
		nature?: string | null;
		maturityLevel: string;
		deliberationStatus?: string | null;
		singleOptionRationale?: string | null;
	};
	dependsOn: Array<{ id: string; name: string; maturityLevel: string }>;
	requirementRefs: string[];
	/** Exigences du dossier enregistré ; absentes si le dossier d'exigences du projet n'a pas été enregistré. */
	requirements: HldRequirementRef[];
	requirementsDossierPresent: boolean;
	criteria: Criterion[];
	options: Option[];
	evaluations: OptionEvaluation[];
	arguments: Argument[];
	decision: Decision | null;
	affirmedBy?: string | null;
	/** Référentiels applicables pas encore couverts par la base de connaissances (alertes). */
	coverageWarnings?: string[];
	generatedAt: string;
}

export interface HldFragmentOption {
	id: string;
	title: string;
	summary: string;
	status: 'retained' | 'rejected' | 'considered';
	proposedByModel: boolean;
	rejectionReason?: string;
	scores: Array<{ criterion: string; score: number; justification: string }>;
	weightedScore: number | null;
}

export interface HldFragment {
	subjectId: string;
	title: string;
	status: HldFragmentStatus;
	statusLabel: string;
	control: Array<{ label: string; value: string }>;
	context: { problem: string; nature?: string; dependsOn: string[] };
	requirements: { items: HldRequirementRef[]; unresolvedRefs: string[]; dossierPresent: boolean };
	drivers: Array<{ name: string; kind: string; weight: number; description?: string }>;
	options: HldFragmentOption[];
	singleOptionRationale?: string;
	decision?: { retained: string; rationale: string; yStatement: string; reversibility: string };
	consequences: { acceptedRisks: string[]; acceptedViolations: string[]; reversibility?: string; coverageWarnings: string[] };
	openPoints: string[];
	provenance: { modelProposedOptions: number; humanOptions: number; modelEvaluations: number; humanEvaluations: number };
	generatedAt: string;
}

const REVERSIBILITY_LABEL: Record<string, string> = {
	reversible: 'Réversible',
	costly: 'Réversible à coût élevé',
	irreversible: 'Irréversible'
};

const isModel = (productionMode?: string, origin?: string) =>
	origin === 'llm-proposed' || (productionMode ?? '').startsWith('llm');

export function hldFragmentStatus(subject: HldFragmentInput['subject'], decision: Decision | null): HldFragmentStatus {
	if (!decision) return 'undecided';
	if (subject.deliberationStatus === 'awaiting_review') return 'awaiting_review';
	return ['L3_decided', 'L4_specified', 'L5_archived'].includes(subject.maturityLevel) ? 'decided' : 'awaiting_review';
}

export function buildHldFragment(input: HldFragmentInput): HldFragment {
	const { subject, decision } = input;
	const status = hldFragmentStatus(subject, decision);
	const criterionById = new Map(input.criteria.map((c) => [c.id, c]));
	const rejected = new Map((decision?.rejected ?? []).map((r) => [r.optionId, r.reason]));

	const options: HldFragmentOption[] = input.options.map((o) => {
		const scores = input.evaluations
			.filter((e) => e.optionId === o.id && criterionById.has(e.criterionId))
			.map((e) => ({ criterion: criterionById.get(e.criterionId)!.name, score: e.score, justification: e.justification, weight: criterionById.get(e.criterionId)!.weight }));
		const weightSum = scores.reduce((acc, s) => acc + s.weight, 0);
		return {
			id: o.id,
			title: o.title,
			summary: o.summary,
			status: decision?.retainedOptionId === o.id ? 'retained' : rejected.has(o.id) || o.status === 'rejected' ? 'rejected' : 'considered',
			proposedByModel: isModel(o.productionMode, o.origin),
			rejectionReason: rejected.get(o.id),
			scores: scores.map(({ criterion, score, justification }) => ({ criterion, score, justification })),
			weightedScore: weightSum > 0 ? Math.round((scores.reduce((acc, s) => acc + s.score * s.weight, 0) / weightSum) * 100) / 100 : null
		};
	});

	const known = new Map(input.requirements.map((r) => [r.id, r]));
	const uniqueRefs = Array.from(new Set(input.requirementRefs));
	const items = uniqueRefs.map((ref) => known.get(ref)).filter((r): r is HldRequirementRef => !!r);
	const unresolvedRefs = uniqueRefs.filter((ref) => !known.has(ref));

	const objections = input.arguments.filter((a) => a.stance === 'objection');
	const acceptedRisks = Array.from(
		new Set(objections.filter((a) => a.resolution === 'accepted_risk').map((a) => a.claim))
	);
	const rawOpenPoints = [
		...objections.filter((a) => a.resolution === 'open').map((a) => `Objection ouverte : ${a.claim}`),
		...input.arguments.filter((a) => a.stance === 'question' && a.resolution === 'open').map((a) => `Question ouverte : ${a.claim}`)
	];
	const openPoints = Array.from(new Set(rawOpenPoints));

	const retained = options.find((o) => o.status === 'retained');
	const others = options.filter((o) => o.id !== retained?.id).map((o) => o.title);
	const topDrivers = [...input.criteria].sort((a, b) => b.weight - a.weight).slice(0, 3).map((c) => c.name);
	const problem = (subject.problemStatement || '').trim() || subject.name;

	const decisionBlock =
		decision && retained
			? {
					retained: retained.title,
					rationale: decision.rationale,
					reversibility: REVERSIBILITY_LABEL[decision.reversibility] ?? decision.reversibility,
					// Y-statement (gabarit ADR d'ArcKit) : contexte, exigence, choix, alternatives écartées, justification, prix accepté.
					yStatement:
						`Dans le contexte de « ${problem} », ` +
						(topDrivers.length ? `face à ${topDrivers.join(', ')}, ` : '') +
						`nous avons retenu « ${retained.title} »` +
						(others.length ? ` plutôt que ${others.map((t) => `« ${t} »`).join(', ')}` : '') +
						`, pour la raison suivante : ${decision.rationale.trim().replace(/\.$/, '')}` +
						((decision.acceptedViolations?.length ?? 0) > 0 || acceptedRisks.length > 0
							? `, en acceptant ${[...(decision.acceptedViolations ?? []).map((v) => `l'écart ${v.typedId}`), ...acceptedRisks.map((r) => `le risque « ${r} »`)].join(', ')}.`
							: '.')
				}
			: undefined;

	const statusLabel = { decided: 'Décidé', awaiting_review: 'Décision en revue', undecided: 'Non tranché' }[status];
	const control: Array<{ label: string; value: string }> = [
		{ label: 'Section', value: subject.sectionRef },
		{ label: 'Statut', value: statusLabel }
	];
	if (decision) {
		control.push({ label: 'Arbitre', value: `${decision.arbiterId} (${decision.arbiterRole})` });
		control.push({ label: 'Date de décision', value: decision.decidedAt.slice(0, 10) });
		if (input.affirmedBy) control.push({ label: 'Affirmée par', value: input.affirmedBy });
	}

	return {
		subjectId: subject.id,
		title: `${subject.sectionRef} ${subject.name}`,
		status,
		statusLabel,
		control,
		context: {
			problem,
			nature: subject.nature ?? undefined,
			dependsOn: input.dependsOn.map((d) => `${d.name}${['L3_decided', 'L4_specified', 'L5_archived'].includes(d.maturityLevel) ? '' : ' (non tranché)'}`)
		},
		requirements: { items, unresolvedRefs, dossierPresent: input.requirementsDossierPresent },
		drivers: input.criteria.map((c) => ({ name: c.name, kind: c.kind, weight: c.weight, description: c.description || undefined })),
		options,
		singleOptionRationale: options.length === 1 ? subject.singleOptionRationale ?? undefined : undefined,
		decision: decisionBlock,
		consequences: {
			acceptedRisks,
			acceptedViolations: Array.from(
				new Set((decision?.acceptedViolations ?? []).map((v) => `${v.typedId} : ${v.justification}`))
			),
			reversibility: decisionBlock?.reversibility,
			coverageWarnings: Array.from(new Set(input.coverageWarnings ?? []))
		},
		openPoints,
		provenance: {
			modelProposedOptions: options.filter((o) => o.proposedByModel).length,
			humanOptions: options.filter((o) => !o.proposedByModel).length,
			modelEvaluations: input.evaluations.filter((e) => isModel(e.productionMode)).length,
			humanEvaluations: input.evaluations.filter((e) => !isModel(e.productionMode)).length
		},
		generatedAt: input.generatedAt
	};
}

const scoreLabel = (s: number) => (s > 0 ? `+${s}` : String(s));
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/** Rendu Markdown du fragment, pour l'insérer dans le dossier de conception. */
export function renderHldFragmentMarkdown(f: HldFragment): string {
	const out: string[] = [];
	out.push(`## ${f.title}`, '');
	out.push('| Contrôle | |', '|---|---|', ...f.control.map((c) => `| ${c.label} | ${cell(c.value)} |`), '');

	out.push('### Contexte et problème', '', f.context.problem, '');
	if (f.context.nature) out.push(`Nature : ${f.context.nature}.`, '');
	if (f.context.dependsOn.length) out.push(`À trancher avant : ${f.context.dependsOn.join(' ; ')}.`, '');

	out.push('### Exigences couvertes', '');
	if (f.requirements.items.length) {
		out.push('| Exigence | Intitulé | Criticité |', '|---|---|---|', ...f.requirements.items.map((r) => `| ${r.clauseRef} | ${cell(r.title)} | ${r.criticality} |`), '');
	}
	if (!f.requirements.dossierPresent && f.requirements.unresolvedRefs.length) {
		out.push(`_Dossier d'exigences non enregistré : ${f.requirements.unresolvedRefs.length} référence(s) non résolue(s)._`, '');
	} else if (!f.requirements.items.length) out.push('_Aucune exigence rattachée._', '');

	out.push('### Critères de décision', '');
	out.push(f.drivers.length ? ['| Critère | Nature | Poids |', '|---|---|---|', ...f.drivers.map((d) => `| ${cell(d.name)} | ${d.kind} | ${d.weight} |`)].join('\n') : '_Aucun critère posé._', '');

	out.push('### Options étudiées', '');
	for (const o of f.options) {
		const tag = o.status === 'retained' ? ' — **retenue**' : o.status === 'rejected' ? ' — écartée' : '';
		out.push(`**${o.title}**${tag}${o.proposedByModel ? ' _(proposée par le modèle)_' : ''}`, '', o.summary, '');
		if (o.scores.length) {
			out.push('| Critère | Score | Justification |', '|---|---|---|', ...o.scores.map((s) => `| ${cell(s.criterion)} | ${scoreLabel(s.score)} | ${cell(s.justification)} |`), '');
		}
		if (o.rejectionReason) out.push(`Écartée : ${o.rejectionReason}`, '');
	}
	if (f.singleOptionRationale) out.push(`Option unique : ${f.singleOptionRationale}`, '');

	out.push('### Décision', '');
	if (f.decision) {
		out.push(f.decision.yStatement, '', `Justification : ${f.decision.rationale}`, '', `Réversibilité : ${f.decision.reversibility}.`, '');
	} else out.push('_Sujet non tranché._', '');

	if (f.consequences.acceptedViolations.length || f.consequences.acceptedRisks.length) {
		out.push('### Conséquences et risques acceptés', '');
		out.push(...f.consequences.acceptedViolations.map((v) => `- Écart accepté : ${v}`), ...f.consequences.acceptedRisks.map((r) => `- Risque accepté : ${r}`), '');
	}
	if (f.openPoints.length) out.push('### Points ouverts', '', ...f.openPoints.map((p) => `- ${p}`), '');
	if (f.consequences.coverageWarnings.length) out.push('### Vérification réglementaire', '', ...f.consequences.coverageWarnings.map((w) => `- ${w}`), '');

	out.push(
		`_Provenance : ${f.provenance.modelProposedOptions} option(s) et ${f.provenance.modelEvaluations} évaluation(s) proposées par le modèle, ` +
			`${f.provenance.humanOptions} option(s) et ${f.provenance.humanEvaluations} évaluation(s) d'origine humaine. Généré le ${f.generatedAt.slice(0, 10)}._`
	);
	return out.join('\n');
}
