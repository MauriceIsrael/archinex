/**
 * Modèle déterministe et exporteurs (SVG + Markdown) de la « Carte de décision » (Issue #403 / Épique #400).
 *
 * Fonction PURE, sans modèle de langage à l'affichage :
 * - Chaque élément affiché porte une référence source explicite (`sourceRef`).
 * - Les verdicts KB `non_verifie` (Hub injoignable) et `inconnu` sont explicites et ne sont
 *   JAMAIS affichés comme « conforme ».
 * - Les règles brouillon (`draft`) sont distinguées des règles validées (`validated`).
 */

import type { Option, Criterion, Decision } from './options';
import type { Argument } from './debate';

export type KbConstraintVerdict = 'conforme' | 'viole' | 'inconnu' | 'non_verifie';

export const KB_VERDICT_LABEL: Record<KbConstraintVerdict, { icon: string; text: string }> = {
	conforme: { icon: '✓', text: 'Conforme' },
	viole: { icon: '✕', text: 'Viole' },
	inconnu: { icon: '?', text: 'Inconnu' },
	non_verifie: { icon: '⚠', text: 'Non vérifié' }
};

export interface SourceReference {
	kind: 'requirement' | 'statement' | 'clause' | 'rule' | 'option' | 'argument' | 'decision' | 'nautobot_plan';
	id: string;
	label: string;
}

export interface DecisionCardRequirement {
	id: string;
	clauseRef: string;
	title: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	sourceRef: SourceReference;
}

export interface DecisionCardKbConstraint {
	id: string;
	framework: string;
	title: string;
	verdict: KbConstraintVerdict;
	ruleStatus: 'validated' | 'draft';
	optionId?: string;
	reason?: string;
	sourceRef: SourceReference;
}

export interface DecisionCardCriterionBreakdown {
	criterionId: string;
	criterionName: string;
	weight: number;
	score: number;
	weightedScore: number;
	justification?: string;
	sourceRef: SourceReference;
}

export interface DecisionCardOptionRow {
	optionId: string;
	title: string;
	isRetained: boolean;
	totalScore: number;
	maxPossibleScore: number;
	normalizedPct: number;
	breakdown: DecisionCardCriterionBreakdown[];
	rejectionReason?: string;
	sourceRef: SourceReference;
}

export interface DecisionCardArgument {
	id: string;
	optionId: string;
	type: 'pro' | 'con' | 'objection';
	content: string;
	status: 'open' | 'answered' | 'risk_accepted';
	origin: 'human' | 'agent';
	author: string;
	sourceRef: SourceReference;
}

export interface DecisionCardAcceptedDeviation {
	id: string;
	label: string;
	justification: string;
	sourceRef: SourceReference;
}

export interface DecisionCardPlannedConsequence {
	id: string;
	kind: string;
	label: string;
	action: 'create' | 'update' | 'verify';
	targetSystem: 'nautobot';
	intentHash?: string;
	sourceRef: SourceReference;
}

export interface DecisionCardModel {
	subjectId: string;
	subjectTitle: string;
	sectionRef: string;
	sources: DecisionCardRequirement[];
	kbOffline: boolean;
	kbConstraints: DecisionCardKbConstraint[];
	criteria: Array<{ id: string; name: string; weight: number }>;
	optionsMatrix: DecisionCardOptionRow[];
	argumentsByOption: Record<string, DecisionCardArgument[]>;
	decision: {
		retainedOptionId: string | null;
		retainedOptionTitle: string | null;
		rationale: string;
		reversibility: 'reversible' | 'costly' | 'irreversible' | null;
		rejectedOptions: Array<{ optionId: string; title: string; reason: string; sourceRef: SourceReference }>;
		acceptedDeviations: DecisionCardAcceptedDeviation[];
		decided: boolean;
		sourceRef: SourceReference | null;
	};
	consequences: {
		plannedObjects: DecisionCardPlannedConsequence[];
		impactedDependencies: Array<{ id: string; label: string; sourceRef: SourceReference }>;
	};
}

export interface BuildDecisionCardInput {
	subjectId: string;
	subjectTitle: string;
	sectionRef?: string;
	requirements?: Array<{
		id: string;
		clauseRef?: string;
		title: string;
		criticality?: string;
	}>;
	kbCompliance?: {
		offline?: boolean;
		checkStatus?: 'checked' | 'partial' | 'not_checked';
		frameworks?: string[];
		violations?: Array<{
			typedId: string;
			framework?: string;
			title?: string;
			optionId?: string;
			validated?: boolean;
			reason?: string;
			verdict?: KbConstraintVerdict;
		}>;
		unassessedRuleIds?: string[];
		conformedRules?: Array<{
			typedId: string;
			framework?: string;
			title?: string;
			validated?: boolean;
		}>;
	} | null;
	options: Array<Option & { evaluations?: Record<string, { score: number; justification?: string }> }>;
	evaluations?: Array<{ optionId: string; criterionId: string; score: number; justification?: string }>;
	criteria: Criterion[];
	argumentsList?: Argument[];
	decision?: Decision | null;
	/** Sélection en cours dans le formulaire d'arbitrage (avant signature définitive). */
	draftSelection?: {
		retainedOptionId?: string;
		rationale?: string;
		reversibility?: 'reversible' | 'costly' | 'irreversible';
		rejectionReasons?: Record<string, string>;
		violationJustifications?: Record<string, string>;
		derogationReason?: string;
	};
	plannedObjects?: Array<{
		id: string;
		kind: string;
		label: string;
		action?: 'create' | 'update' | 'verify';
		intentHash?: string;
	}>;
	impactedDependencies?: Array<{ id: string; label: string }>;
}

function normalizeCardCriticality(raw?: string): 'bloquant' | 'majeur' | 'info' {
	const v = (raw ?? '').toLowerCase().trim();
	if (v === 'bloquant' || v === 'blocking' || v === 'critical' || v === 'mandatory') return 'bloquant';
	if (v === 'majeur' || v === 'major' || v === 'high' || v === 'medium') return 'majeur';
	return 'info';
}

function mapArgumentType(raw: string): 'pro' | 'con' | 'objection' {
	if (raw === 'pro') return 'pro';
	if (raw === 'con') return 'con';
	return 'objection';
}

function mapArgumentStatus(raw?: string): 'open' | 'answered' | 'risk_accepted' {
	if (raw === 'answered' || raw === 'resolved' || raw === 'addressed') return 'answered';
	if (raw === 'risk_accepted' || raw === 'accepted_risk' || raw === 'waived') return 'risk_accepted';
	return 'open';
}

/**
 * Construit le modèle complet et déterministe de la carte de décision.
 */
export function buildDecisionCardModel(input: BuildDecisionCardInput): DecisionCardModel {
	const retainedId = input.decision?.retainedOptionId || input.draftSelection?.retainedOptionId || null;

	// 1. Sources (exigences couvertes)
	const sources: DecisionCardRequirement[] = (input.requirements ?? []).map((req) => ({
		id: req.id,
		clauseRef: req.clauseRef || req.id,
		title: req.title,
		criticality: normalizeCardCriticality(req.criticality),
		sourceRef: {
			kind: 'requirement',
			id: req.id,
			label: req.clauseRef || req.id
		}
	}));

	// 2. Contraintes KB applicables & verdict (échec fermé : jamais "conforme" si inconnu / non vérifié)
	const kb = input.kbCompliance;
	const kbOffline = Boolean(!kb || kb.offline || kb.checkStatus === 'not_checked');
	const kbConstraints: DecisionCardKbConstraint[] = [];

	if (kbOffline) {
		kbConstraints.push({
			id: 'kb-hub-unreachable',
			framework: (kb?.frameworks ?? []).join(', ') || 'Base de connaissances (KB)',
			title: 'Contrôle réglementaire KB non vérifié (Hub injoignable ou non exécuté)',
			verdict: 'non_verifie',
			ruleStatus: 'validated',
			reason: 'Une contrainte non vérifiée ne peut jamais être affichée comme conforme.',
			sourceRef: { kind: 'rule', id: 'kb-hub-unreachable', label: 'Vérification KB' }
		});
	}

	for (const v of kb?.violations ?? []) {
		const verdict: KbConstraintVerdict =
			v.verdict === 'inconnu' || v.verdict === 'non_verifie' ? v.verdict : 'viole';
		kbConstraints.push({
			id: v.typedId,
			framework: v.framework || 'KB',
			title: v.title || v.typedId,
			verdict,
			ruleStatus: v.validated === false ? 'draft' : 'validated',
			optionId: v.optionId,
			reason: v.reason,
			sourceRef: { kind: 'rule', id: v.typedId, label: v.typedId }
		});
	}

	for (const ruleId of kb?.unassessedRuleIds ?? []) {
		kbConstraints.push({
			id: ruleId,
			framework: 'KB',
			title: `Règle ${ruleId} non évaluée automatiquement`,
			verdict: 'inconnu',
			ruleStatus: 'validated',
			reason: 'Verdict inconnu — revue humaine requise avant arbitrage.',
			sourceRef: { kind: 'rule', id: ruleId, label: ruleId }
		});
	}

	if (!kbOffline) {
		for (const ok of kb?.conformedRules ?? []) {
			kbConstraints.push({
				id: ok.typedId,
				framework: ok.framework || 'KB',
				title: ok.title || ok.typedId,
				verdict: 'conforme',
				ruleStatus: ok.validated === false ? 'draft' : 'validated',
				sourceRef: { kind: 'rule', id: ok.typedId, label: ok.typedId }
			});
		}
	}

	// 3. Matrice Options × Critères pondérés
	const criteriaList = input.criteria.map((c) => ({
		id: c.id,
		name: c.name,
		weight: c.weight ?? 1
	}));
	const totalWeight = criteriaList.reduce((acc, c) => acc + c.weight, 0);
	const maxPossibleScore = totalWeight * 5;

	const rejectedMap = new Map<string, string>();
	for (const rej of input.decision?.rejected ?? []) {
		rejectedMap.set(rej.optionId, rej.reason);
	}
	for (const [optId, reason] of Object.entries(input.draftSelection?.rejectionReasons ?? {})) {
		if (reason && !rejectedMap.has(optId)) rejectedMap.set(optId, reason);
	}

	const evalByPair = new Map<string, { score: number; justification?: string }>();
	for (const ev of input.evaluations ?? []) {
		evalByPair.set(`${ev.optionId}:${ev.criterionId}`, { score: ev.score, justification: ev.justification });
	}

	const optionsMatrix: DecisionCardOptionRow[] = input.options.map((opt) => {
		const breakdown: DecisionCardCriterionBreakdown[] = criteriaList.map((crit) => {
			const evalEntry = opt.evaluations?.[crit.id] ?? evalByPair.get(`${opt.id}:${crit.id}`);
			const score = typeof evalEntry?.score === 'number' ? evalEntry.score : 0;
			const weightedScore = score * crit.weight;
			return {
				criterionId: crit.id,
				criterionName: crit.name,
				weight: crit.weight,
				score,
				weightedScore,
				justification: evalEntry?.justification,
				sourceRef: {
					kind: 'option',
					id: `${opt.id}:${crit.id}`,
					label: `${opt.title} · ${crit.name}`
				}
			};
		});
		const totalScore = breakdown.reduce((acc, b) => acc + b.weightedScore, 0);
		const normalizedPct = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;

		return {
			optionId: opt.id,
			title: opt.title,
			isRetained: opt.id === retainedId,
			totalScore,
			maxPossibleScore,
			normalizedPct,
			breakdown,
			rejectionReason: opt.id !== retainedId ? rejectedMap.get(opt.id) : undefined,
			sourceRef: { kind: 'option', id: opt.id, label: opt.title }
		};
	});

	// 4. Arguments par option (pour/contre/objections, statut, origine humain/agent)
	const argumentsByOption: Record<string, DecisionCardArgument[]> = {};
	for (const opt of input.options) {
		argumentsByOption[opt.id] = [];
	}
	for (const arg of input.argumentsList ?? []) {
		const targetOptId = arg.optionId || input.options[0]?.id || '_general';
		if (!argumentsByOption[targetOptId]) argumentsByOption[targetOptId] = [];
		const rawArg = arg as unknown as {
			type?: string;
			content?: string;
			status?: string;
			isResolved?: boolean;
			authorName?: string;
			authorRole?: string;
		};
		const kindStr = (arg.authorKind || rawArg.authorRole || '').toLowerCase();
		const authorStr = (arg.author || rawArg.authorName || '').toLowerCase();
		const origin: 'human' | 'agent' =
			kindStr.startsWith('agent') || kindStr.includes('ia') || authorStr.includes('agent')
				? 'agent'
				: 'human';
		const rawType =
			rawArg.type ??
			(arg.stance === 'support' ? 'pro' : arg.stance === 'objection' ? 'objection' : 'con');
		const rawStatus =
			rawArg.status ??
			(arg.resolution === 'answered'
				? 'answered'
				: arg.resolution === 'accepted_risk'
					? 'risk_accepted'
					: rawArg.isResolved
						? 'answered'
						: 'open');
		argumentsByOption[targetOptId].push({
			id: arg.id,
			optionId: targetOptId,
			type: mapArgumentType(rawType),
			content: rawArg.content || arg.claim || arg.grounds || '',
			status: mapArgumentStatus(rawStatus),
			origin,
			author: arg.author || rawArg.authorName || rawArg.authorRole || 'Contributeur',
			sourceRef: { kind: 'argument', id: arg.id, label: `Argument ${arg.id}` }
		});
	}

	// 5. Décision & écarts acceptés
	const retainedOpt = input.options.find((o) => o.id === retainedId) ?? null;
	const acceptedDeviations: DecisionCardAcceptedDeviation[] = [];

	const decViolations = (input.decision as unknown as { acceptedViolations?: Array<{ typedId: string; justification: string }> })
		?.acceptedViolations;
	for (const av of decViolations ?? []) {
		acceptedDeviations.push({
			id: av.typedId,
			label: `Écart KB ${av.typedId}`,
			justification: av.justification,
			sourceRef: { kind: 'rule', id: av.typedId, label: av.typedId }
		});
	}
	for (const [typedId, justif] of Object.entries(input.draftSelection?.violationJustifications ?? {})) {
		if (justif.trim() && !acceptedDeviations.some((d) => d.id === typedId)) {
			acceptedDeviations.push({
				id: typedId,
				label: `Écart KB ${typedId}`,
				justification: justif.trim(),
				sourceRef: { kind: 'rule', id: typedId, label: typedId }
			});
		}
	}
	if (input.draftSelection?.derogationReason?.trim()) {
		acceptedDeviations.push({
			id: 'kb-derogation',
			label: 'Dérogation vérification KB incomplète',
			justification: input.draftSelection.derogationReason.trim(),
			sourceRef: { kind: 'decision', id: input.decision?.id || input.subjectId, label: 'Dérogation KB' }
		});
	}

	const rejectedOptions = input.options
		.filter((o) => o.id !== retainedId)
		.map((o) => ({
			optionId: o.id,
			title: o.title,
			reason: rejectedMap.get(o.id) || 'Motif non encore saisi',
			sourceRef: { kind: 'option' as const, id: o.id, label: o.title }
		}));

	// 6. Conséquences Nautobot (dry-run) & dépendances
	const plannedObjects: DecisionCardPlannedConsequence[] = (input.plannedObjects ?? []).map((p) => ({
		id: p.id,
		kind: p.kind,
		label: p.label,
		action: p.action ?? 'create',
		targetSystem: 'nautobot',
		intentHash: p.intentHash,
		sourceRef: { kind: 'nautobot_plan', id: p.id, label: `${p.kind}:${p.label}` }
	}));

	const impactedDependencies = (input.impactedDependencies ?? []).map((dep) => ({
		id: dep.id,
		label: dep.label,
		sourceRef: { kind: 'statement' as const, id: dep.id, label: dep.label }
	}));

	return {
		subjectId: input.subjectId,
		subjectTitle: input.subjectTitle,
		sectionRef: input.sectionRef || input.subjectId,
		sources,
		kbOffline,
		kbConstraints,
		criteria: criteriaList,
		optionsMatrix,
		argumentsByOption,
		decision: {
			retainedOptionId: retainedId,
			retainedOptionTitle: retainedOpt?.title ?? null,
			rationale: input.decision?.rationale || input.draftSelection?.rationale || '',
			reversibility: input.decision?.reversibility || input.draftSelection?.reversibility || null,
			rejectedOptions,
			acceptedDeviations,
			decided: Boolean(input.decision),
			sourceRef: input.decision
				? { kind: 'decision', id: input.decision.id, label: `Décision ${input.decision.id}` }
				: null
		},
		consequences: {
			plannedObjects,
			impactedDependencies
		}
	};
}

/**
 * Exporte la carte de décision au format Markdown (intégrable dans le dossier HLD).
 */
export function renderDecisionCardMarkdown(card: DecisionCardModel): string {
	const out: string[] = [];
	out.push(`# Carte de décision — ${card.sectionRef} : ${card.subjectTitle}`);
	out.push('');
	out.push(`- **Statut** : ${card.decision.decided ? 'Décision signée' : 'Préparation avant signature'}`);
	out.push(`- **Option retenue** : ${card.decision.retainedOptionTitle ?? 'Aucune sélectionnée'}`);
	out.push(`- **Réversibilité** : ${card.decision.reversibility ?? 'Non renseignée'}`);
	out.push('');

	out.push(`## 1. Sources (exigences couvertes : ${card.sources.length})`);
	if (card.sources.length === 0) {
		out.push('_Aucune exigence rattachée._');
	} else {
		for (const s of card.sources) {
			out.push(`- \`${s.clauseRef}\` (${s.criticality}) : ${s.title} _[source: ${s.sourceRef.id}]_`);
		}
	}
	out.push('');

	out.push(`## 2. Contraintes KB applicables (${card.kbConstraints.length})`);
	if (card.kbConstraints.length === 0) {
		out.push('_Aucune contrainte KB recensée._');
	} else {
		for (const c of card.kbConstraints) {
			const badge = KB_VERDICT_LABEL[c.verdict];
			const statusTag = c.ruleStatus === 'draft' ? 'brouillon' : 'validée';
			out.push(
				`- **${badge.icon} ${badge.text}** [${statusTag}] \`${c.id}\` (${c.framework}) : ${c.title}${c.reason ? ` — ${c.reason}` : ''}`
			);
		}
	}
	out.push('');

	out.push('## 3. Matrice Options × Critères pondérés');
	if (card.optionsMatrix.length === 0) {
		out.push('_Aucune option évaluée._');
	} else {
		const header = ['Option', 'Statut', ...card.criteria.map((c) => `${c.name} (×${c.weight})`), 'Score total'];
		out.push(`| ${header.join(' | ')} |`);
		out.push(`| ${header.map(() => '---').join(' | ')} |`);
		for (const row of card.optionsMatrix) {
			const cells = [
				row.title,
				row.isRetained ? 'Retenue' : 'Écartée',
				...row.breakdown.map((b) => `${b.score}/5 (${b.weightedScore})`),
				`${row.totalScore}/${row.maxPossibleScore} (${row.normalizedPct}%)`
			];
			out.push(`| ${cells.join(' | ')} |`);
		}
	}
	out.push('');

	out.push('## 4. Motivation & écarts acceptés');
	out.push(card.decision.rationale || '_Motivation non renseignée._');
	if (card.decision.acceptedDeviations.length > 0) {
		out.push('');
		out.push('### Écarts acceptés');
		for (const dev of card.decision.acceptedDeviations) {
			out.push(`- **${dev.label}** : ${dev.justification} _[source: ${dev.sourceRef.id}]_`);
		}
	}
	out.push('');

	out.push(`## 5. Conséquences planifiées (dry-run Nautobot : ${card.consequences.plannedObjects.length})`);
	if (card.consequences.plannedObjects.length === 0) {
		out.push('_Aucun objet Nautobot planifié pour le moment._');
	} else {
		for (const obj of card.consequences.plannedObjects) {
			out.push(`- [${obj.action}] \`${obj.kind}\` **${obj.label}**${obj.intentHash ? ` (intent: \`${obj.intentHash}\`)` : ''}`);
		}
	}
	out.push('');

	return out.join('\n');
}

function escXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Exporte la carte de décision en SVG autonome imprimable pour le dossier HLD.
 */
export function renderDecisionCardSvg(card: DecisionCardModel): string {
	const width = 900;
	const kbLines = Math.max(1, card.kbConstraints.length);
	const optLines = Math.max(1, card.optionsMatrix.length);
	const planLines = Math.max(1, card.consequences.plannedObjects.length);
	const height = 220 + kbLines * 24 + optLines * 28 + planLines * 22;

	let y = 32;
	const svg: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Carte de décision ${escXml(card.subjectTitle)}">`,
		`<style>text{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;fill:#0f172a;}.h1{font-size:16px;font-weight:700;}.h2{font-size:12px;font-weight:700;fill:#1e293b;}.txt{font-size:11px;fill:#334155;}.badge{font-size:10px;font-weight:700;}</style>`,
		`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="#cbd5e1" rx="8"/>`,
		`<text x="20" y="${y}" class="h1">Carte de décision — ${escXml(card.sectionRef)} : ${escXml(card.subjectTitle)}</text>`
	];

	y += 22;
	svg.push(
		`<text x="20" y="${y}" class="txt">Option retenue : ${escXml(card.decision.retainedOptionTitle ?? 'En cours')} · Exigences : ${card.sources.length} · Écarts acceptés : ${card.decision.acceptedDeviations.length}</text>`
	);

	y += 28;
	svg.push(`<text x="20" y="${y}" class="h2">Contraintes KB (${card.kbConstraints.length})</text>`);
	y += 18;
	if (card.kbConstraints.length === 0) {
		svg.push(`<text x="28" y="${y}" class="txt">Aucune contrainte KB recensée.</text>`);
		y += 20;
	} else {
		for (const c of card.kbConstraints) {
			const b = KB_VERDICT_LABEL[c.verdict];
			const fill = c.verdict === 'conforme' ? '#065f46' : c.verdict === 'viole' ? '#991b1b' : '#92400e';
			svg.push(
				`<text x="28" y="${y}" class="badge" style="fill:${fill};">${b.icon} ${escXml(b.text)} [${c.ruleStatus === 'draft' ? 'brouillon' : 'validée'}] — ${escXml(c.title.slice(0, 85))}</text>`
			);
			y += 22;
		}
	}

	y += 12;
	svg.push(`<text x="20" y="${y}" class="h2">Options évaluées (${card.optionsMatrix.length})</text>`);
	y += 18;
	for (const row of card.optionsMatrix) {
		const tag = row.isRetained ? '★ RETENUE' : '○ Écartée';
		svg.push(
			`<text x="28" y="${y}" class="txt">${tag} — ${escXml(row.title.slice(0, 55))} : ${row.totalScore}/${row.maxPossibleScore} (${row.normalizedPct}%)</text>`
		);
		y += 24;
	}

	y += 12;
	svg.push(`<text x="20" y="${y}" class="h2">Conséquences planifiées Nautobot (${card.consequences.plannedObjects.length})</text>`);
	y += 18;
	if (card.consequences.plannedObjects.length === 0) {
		svg.push(`<text x="28" y="${y}" class="txt">Aucun objet planifié (dry-run vide).</text>`);
	} else {
		for (const obj of card.consequences.plannedObjects) {
			svg.push(
				`<text x="28" y="${y}" class="txt">[${escXml(obj.action)}] ${escXml(obj.kind)} : ${escXml(obj.label)}</text>`
			);
			y += 20;
		}
	}

	svg.push('</svg>');
	return svg.join('\n');
}
