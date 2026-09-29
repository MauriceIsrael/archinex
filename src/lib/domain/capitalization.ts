import type { KbCandidate } from '$lib/types/llmops';
import type { Decision, Option } from '$lib/domain/options';
import type { Argument } from '$lib/domain/debate';

export interface SubjectCapitalizationInfo {
	id: string;
	name: string;
	domain?: string | null;
	sectionRef?: string | null;
	problemStatement?: string | null;
}

export interface BuildKbCandidatesInput {
	decision: Decision;
	subject: SubjectCapitalizationInfo;
	options: Option[];
	arguments?: Argument[];
	engagement: string;
	author: string;
	authorRole?: string;
}

export interface AnonymizationContext {
	projectNames?: string[];
	clientNames?: string[];
	siteNames?: string[];
	participantNames?: string[];
	additionalTerms?: string[];
}

/**
 * Génère de manière pure les candidats à la Knowledge Base (Porte G4).
 * Trois cas de figure :
 * 1. new_asset : si l'option retenue n'a pas de kbRefs préalables.
 * 2. amendment : pour chaque violation acceptée par l'arbitre, avec sa justification.
 * 3. rex : systématique, résumant le dilemme, les options écartées et le compromis.
 */
export function buildKbCandidates(input: BuildKbCandidatesInput): KbCandidate[] {
	const { decision, subject, options, engagement, author, authorRole = 'lead_architect' } = input;
	const candidates: KbCandidate[] = [];

	const retainedOption = options.find((o) => o.id === decision.retainedOptionId);
	const rejectedDetails = decision.rejected
		.map((r) => {
			const opt = options.find((o) => o.id === r.optionId);
			const title = opt ? opt.title : r.optionId;
			return `${title} (motif: ${r.reason})`;
		})
		.join(' ; ');

	// Cas 1 : new_asset si l'option retenue n'a pas de kbRefs
	const retainedKbRefs = retainedOption?.kbRefs || [];
	if (retainedKbRefs.length === 0) {
		candidates.push({
			id: `cand-asset-${subject.id}-${Date.now()}`,
			kind: 'new_asset',
			title: `Pattern architectural émergent : ${retainedOption?.title || 'Nouvelle option'}`,
			summary: `Option retenue sans référence préalable à la doctrine KB : ${retainedOption?.summary || subject.name}`,
			suggested_change: `Considérer l'intégration d'un standard réutilisable pour le domaine "${subject.domain || 'architecture générale'}" couvrant ce cas d'usage.`,
			rationale: `Arbitrage motivé : ${decision.rationale}`,
			source: {
				system: 'archinex',
				engagement,
				decision_id: decision.id,
				subject_id: subject.id
			},
			author,
			author_role: authorRole,
			production_mode: 'human-authored',
			status: 'in_review'
		});
	}

	// Cas 2 : amendment pour chaque violation doctrinale acceptée
	const acceptedViolations = decision.acceptedViolations || [];
	for (const violation of acceptedViolations) {
		candidates.push({
			id: `cand-amend-${subject.id}-${violation.typedId}-${Date.now()}`,
			kind: 'amendment',
			target_asset_ref: violation.typedId,
			accepted_violation_justification: violation.justification,
			title: `Proposition d'amendement / dérogation pour ${violation.typedId}`,
			summary: `Dérogation arbitrée sur le sujet "${subject.name}" relative à la règle ${violation.typedId}. Justification : ${violation.justification}`,
			suggested_change: `Ajouter une clause d'exception ou faire évoluer la règle ${violation.typedId} pour accommoder : ${violation.justification}`,
			rationale: `Dérogation formellement arbitrée et assumée : ${violation.justification}`,
			source: {
				system: 'archinex',
				engagement,
				decision_id: decision.id,
				subject_id: subject.id
			},
			author,
			author_role: authorRole,
			production_mode: 'human-authored',
			status: 'in_review'
		});
	}

	// Cas 3 : REX systématique
	candidates.push({
		id: `cand-rex-${subject.id}-${Date.now()}`,
		kind: 'rex',
		title: `REX Décision : ${subject.name} - ${retainedOption?.title || 'Option retenue'}`,
		summary: `Sujet : ${subject.name}\nOption retenue : ${retainedOption?.title || decision.retainedOptionId}\nOptions écartées : ${rejectedDetails || 'Aucune'}`,
		suggested_change: `Enrichir la base de REX sur le compromis architectural (réversibilité: ${decision.reversibility}) et les motifs de choix.`,
		rationale: `Compromis et motifs : ${decision.rationale}`,
		source: {
			system: 'archinex',
			engagement,
			decision_id: decision.id,
			subject_id: subject.id
		},
		author,
		author_role: authorRole,
		production_mode: 'human-authored',
		status: 'in_review'
	});

	return candidates;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Anonymise une chaîne de texte avant envoi vers LLMOps.
 * Masque les identités projet, client, sites, participants, adresses IP et volumes chiffrés.
 */
export function anonymizeText(text: string, ctx: AnonymizationContext): string {
	if (!text) return '';

	let result = text;

	// 1. Remplacement des noms explicites (triés par longueur décroissante)
	const replacements: Array<{ term: string; placeholder: string }> = [];

	for (const p of ctx.projectNames || []) {
		if (p && p.trim().length > 1) replacements.push({ term: p.trim(), placeholder: '[PROJECT]' });
	}
	for (const c of ctx.clientNames || []) {
		if (c && c.trim().length > 1) replacements.push({ term: c.trim(), placeholder: '[CLIENT]' });
	}
	for (const s of ctx.siteNames || []) {
		if (s && s.trim().length > 1) replacements.push({ term: s.trim(), placeholder: '[SITE]' });
	}
	for (const part of ctx.participantNames || []) {
		if (part && part.trim().length > 1) replacements.push({ term: part.trim(), placeholder: '[PARTICIPANT]' });
	}
	for (const add of ctx.additionalTerms || []) {
		if (add && add.trim().length > 1) replacements.push({ term: add.trim(), placeholder: '[REDACTED]' });
	}

	replacements.sort((a, b) => b.term.length - a.term.length);

	for (const { term, placeholder } of replacements) {
		const reg = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
		result = result.replace(reg, placeholder);
	}

	// 2. Adresses IP (IPv4 et IPv6)
	const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
	result = result.replace(ipv4Regex, '[IP]');

	const ipv6Regex = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:[0-9a-fA-F]{1,4}\b/g;
	result = result.replace(ipv6Regex, '[IP]');

	// 3. Volumes chiffrés et chemins de disques sensibles (sans manger la ponctuation finale)
	const volumeMapperRegex = /\/(?:dev|mnt|vol)\/mapper\/[a-zA-Z0-9_\-]+(?:\.[a-zA-Z0-9_\-]+)*/gi;
	result = result.replace(volumeMapperRegex, '[STORAGE_VOLUME]');

	const blockDevRegex = /\/dev\/(?:sd[a-z][0-9]*|nvme\d+n\d+(?:p\d+)?|vd[a-z][0-9]*|xvd[a-z][0-9]*)/gi;
	result = result.replace(blockDevRegex, '[STORAGE_VOLUME]');

	const luksUuidRegex = /(?:UUID=|uuid=|LUKS-|luks-)[0-9a-fA-F\-]{8,}/gi;
	result = result.replace(luksUuidRegex, '[STORAGE_VOLUME]');

	const volIdRegex = /\bvol-[0-9a-fA-F]{8,}\b/gi;
	result = result.replace(volIdRegex, '[STORAGE_VOLUME]');

	return result;
}

/**
 * Anonymise un candidat KB en nettoyant tous ses champs textuels.
 */
export function anonymizeCandidate(candidate: KbCandidate, ctx: AnonymizationContext): KbCandidate {
	return {
		...candidate,
		title: anonymizeText(candidate.title, ctx),
		summary: anonymizeText(candidate.summary, ctx),
		suggested_change: candidate.suggested_change ? anonymizeText(candidate.suggested_change, ctx) : undefined,
		rationale: anonymizeText(candidate.rationale, ctx),
		accepted_violation_justification: candidate.accepted_violation_justification
			? anonymizeText(candidate.accepted_violation_justification, ctx)
			: undefined,
		author: anonymizeText(candidate.author, ctx)
	};
}

/**
 * Anonymise une liste complète de candidats.
 */
export function anonymizeCandidates(
	candidates: KbCandidate[],
	ctx: AnonymizationContext
): KbCandidate[] {
	return candidates.map((c) => anonymizeCandidate(c, ctx));
}
