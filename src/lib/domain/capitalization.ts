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

const METADATA_VIOLATION_PREFIXES = ['COMPLIANCE_STATUS:', 'PORTABILITY:'];
const TYPED_REF_PREFIXES = ['principle:', 'pattern:', 'decision:', 'control:', 'glossary:', 'trigger:', 'fact_key:'];

const VALID_LLMOPS_DOMAINS = new Set([
	'architecture',
	'security',
	'network-automation',
	'automation',
	'ran',
	'mobile-core',
	'telecom-core',
	'cloud-platform',
	'infrastructure',
	'it-infrastructure',
	'data-protection',
	'data-isolation',
	'observability',
	'operations',
	'governance',
	'transport',
	'network-transport',
	'delivery',
	'service-management',
	'ai-assistance',
	'resilience'
]);

const DOMAIN_MAPPING: Record<string, string> = {
	general: 'architecture',
	cloud: 'cloud-platform',
	core: 'mobile-core',
	telecom: 'telecom-core',
	data: 'data-protection',
	network: 'transport',
	'sécurité': 'security',
	securite: 'security',
	exploitation: 'operations'
};

export function isDecisionMetadataViolation(typedId?: string | null): boolean {
	if (!typedId) return false;
	const upper = typedId.trim().toUpperCase();
	return METADATA_VIOLATION_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

export function normalizeKbDomain(domain?: string | null): string {
	if (!domain || !domain.trim()) return 'architecture';
	const clean = domain.trim().toLowerCase();
	if (DOMAIN_MAPPING[clean]) return DOMAIN_MAPPING[clean];
	if (VALID_LLMOPS_DOMAINS.has(clean)) return clean;
	const parent = clean.split('/')[0];
	if (VALID_LLMOPS_DOMAINS.has(parent)) return clean;
	return 'architecture';
}

export function normalizeTargetAssetId(targetRef?: string | null): string | undefined {
	if (!targetRef || !targetRef.trim()) return undefined;
	const trimmed = targetRef.trim();
	if (isDecisionMetadataViolation(trimmed)) return undefined;
	const lower = trimmed.toLowerCase();
	for (const prefix of TYPED_REF_PREFIXES) {
		if (lower.startsWith(prefix)) {
			const stripped = trimmed.slice(prefix.length).trim();
			return stripped || undefined;
		}
	}
	return trimmed;
}

export function inferCandidateAssetType(
	kind: KbCandidate['kind'],
	targetAssetId?: string
): KbCandidate['asset_type'] {
	if (kind === 'new_asset') return 'pattern';
	if (kind === 'rex') return 'decision';
	if (kind === 'principle') return 'principle';
	if (kind === 'amendment' && targetAssetId) {
		const upper = targetAssetId.toUpperCase();
		if (upper.startsWith('P-')) return 'principle';
		if (upper.startsWith('PAT-')) return 'pattern';
		if (upper.startsWith('ADR-')) return 'decision';
		if (upper.startsWith('TRG-')) return 'trigger';
		return 'control';
	}
	return 'pattern';
}

function yamlEscape(str: string): string {
	return JSON.stringify(str.replace(/\r?\n/g, ' ').trim());
}

function deterministicNumericSuffix(seed: string, min: number, span: number): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	return min + (Math.abs(hash) % span);
}

export function formatCandidateProposedContent(
	candidate: Pick<
		KbCandidate,
		| 'kind'
		| 'title'
		| 'summary'
		| 'suggested_change'
		| 'rationale'
		| 'target_asset_id'
		| 'target_asset_ref'
		| 'domain'
		| 'asset_type'
	>
): string {
	const rawDomain = Array.isArray(candidate.domain) ? candidate.domain[0] : candidate.domain;
	const domain = normalizeKbDomain(rawDomain);
	const title = (candidate.title || 'Architecture Candidate').trim();
	const fmTitle = title.length >= 5 ? title : `${title} — Architecture Asset`;
	const summary = (candidate.summary || title).trim();
	const suggested = (candidate.suggested_change || summary).trim();
	const rationale = (candidate.rationale || 'Arbitrage architectural motivé et généralisé.').trim();
	const seed = `${title}|${summary}`;

	if (candidate.kind === 'amendment') {
		const targetId = normalizeTargetAssetId(candidate.target_asset_id || candidate.target_asset_ref) || 'UNKNOWN';
		return [
			`# Amendment Proposal — ${targetId}`,
			'',
			'## Summary',
			summary,
			'',
			'## Proposed Change',
			suggested,
			'',
			'## Rationale',
			rationale,
			''
		].join('\n');
	}

	if (candidate.kind === 'rex' || candidate.asset_type === 'decision') {
		const adrId = `ADR-${String(deterministicNumericSuffix(seed, 1000, 8900)).padStart(4, '0')}`;
		return [
			'---',
			`id: ${adrId}`,
			`title: ${yamlEscape(fmTitle)}`,
			'type: decision',
			'status: draft',
			'confidence: assumed',
			'phase: [BID, BUILD, RUN]',
			`domain: [${domain}]`,
			'assumptions:',
			'  - "Applicable aux engagements d\'architecture partageant les mêmes contraintes de gouvernance et d\'exploitation."',
			'---',
			'',
			`# ${adrId} — ${fmTitle}`,
			'',
			'## Context',
			summary,
			'',
			'## Options considered',
			rationale,
			'',
			'## Decision',
			suggested,
			'',
			'## Consequences',
			rationale,
			''
		].join('\n');
	}

	const patId = `PAT-${String(deterministicNumericSuffix(seed, 100, 890)).padStart(3, '0')}`;
	return [
		'---',
		`id: ${patId}`,
		`title: ${yamlEscape(fmTitle)}`,
		'type: pattern',
		'status: draft',
		'confidence: assumed',
		'phase: [BID, BUILD, RUN]',
		`domain: [${domain}]`,
		'---',
		'',
		`# ${patId} — ${fmTitle}`,
		'',
		'## Problem',
		summary,
		'',
		'## Solution',
		suggested,
		'',
		'## Trade-offs',
		rationale,
		'',
		'## When not to use this',
		'Lorsque des contraintes contractuelles ou réglementaires propres à un projet imposent une dérogation locale.',
		''
	].join('\n');
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

	// Issue #120: Une décision qualifiée 'project_specific' (spécifique au contrat / lotissement)
	// reste cantonnée au projet et ne doit JAMAIS générer de candidat au moissonnage global LLMOps.
	if (decision.portability === 'project_specific') {
		return [];
	}

	const candidates: KbCandidate[] = [];
	const portability = decision.portability;
	const harvestable = portability === 'reusable_product_capability' || portability === 'reusable_architecture_doctrine';
	const normalizedDomain = normalizeKbDomain(subject.domain);
	const evidence = engagement ? [{ kind: 'engagement' as const, ref: engagement }] : [];

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
		const newAssetCand: KbCandidate = {
			id: `cand-asset-${subject.id}-${Date.now()}`,
			kind: 'new_asset',
			asset_type: 'pattern',
			domain: [normalizedDomain],
			title: `Pattern architectural émergent : ${retainedOption?.title || 'Nouvelle option'}`,
			summary: `Option retenue sans référence préalable à la doctrine KB : ${retainedOption?.summary || subject.name}`,
			suggested_change: `Considérer l'intégration d'un standard réutilisable pour le domaine "${subject.domain || 'architecture générale'}" couvrant ce cas d'usage.`,
			rationale: `Arbitrage motivé : ${decision.rationale}`,
			source: {
				system: 'archinex',
				engagement,
				decision_id: decision.id,
				subject_id: subject.id,
				author,
				production_mode: 'human-authored'
			},
			evidence,
			author,
			author_role: authorRole,
			portability,
			harvestable,
			production_mode: 'human-authored',
			status: 'in_review'
		};
		newAssetCand.proposed_content = formatCandidateProposedContent(newAssetCand);
		candidates.push(newAssetCand);
	}

	// Cas 2 : amendment pour chaque violation doctrinale acceptée (hors métadonnées COMPLIANCE_STATUS / PORTABILITY)
	const acceptedViolations = (decision.acceptedViolations || []).filter(
		(v) => v?.typedId && !isDecisionMetadataViolation(v.typedId)
	);
	for (const violation of acceptedViolations) {
		const targetAssetId = normalizeTargetAssetId(violation.typedId);
		const assetType = inferCandidateAssetType('amendment', targetAssetId);
		const amendCand: KbCandidate = {
			id: `cand-amend-${subject.id}-${violation.typedId}-${Date.now()}`,
			kind: 'amendment',
			asset_type: assetType,
			target_asset_id: targetAssetId,
			target_asset_ref: violation.typedId,
			domain: [normalizedDomain],
			accepted_violation_justification: violation.justification,
			title: `Proposition d'amendement / dérogation pour ${violation.typedId}`,
			summary: `Dérogation arbitrée sur le sujet "${subject.name}" relative à la règle ${violation.typedId}. Justification : ${violation.justification}`,
			suggested_change: `Ajouter une clause d'exception ou faire évoluer la règle ${violation.typedId} pour accommoder : ${violation.justification}`,
			rationale: `Dérogation formellement arbitrée et assumée : ${violation.justification}`,
			source: {
				system: 'archinex',
				engagement,
				decision_id: decision.id,
				subject_id: subject.id,
				author,
				production_mode: 'human-authored'
			},
			evidence,
			author,
			author_role: authorRole,
			portability,
			harvestable,
			production_mode: 'human-authored',
			status: 'in_review'
		};
		amendCand.proposed_content = formatCandidateProposedContent(amendCand);
		candidates.push(amendCand);
	}

	// Cas 3 : REX systématique
	const rexCand: KbCandidate = {
		id: `cand-rex-${subject.id}-${Date.now()}`,
		kind: 'rex',
		asset_type: 'decision',
		domain: [normalizedDomain],
		title: `REX Décision : ${subject.name} - ${retainedOption?.title || 'Option retenue'}`,
		summary: `Sujet : ${subject.name}\nOption retenue : ${retainedOption?.title || decision.retainedOptionId}\nOptions écartées : ${rejectedDetails || 'Aucune'}`,
		suggested_change: `Enrichir la base de REX sur le compromis architectural (réversibilité: ${decision.reversibility}) et les motifs de choix.`,
		rationale: `Compromis et motifs : ${decision.rationale}`,
		source: {
			system: 'archinex',
			engagement,
			decision_id: decision.id,
			subject_id: subject.id,
			author,
			production_mode: 'human-authored'
		},
		evidence,
		author,
		author_role: authorRole,
		portability,
		harvestable,
		production_mode: 'human-authored',
		status: 'in_review'
	};
	rexCand.proposed_content = formatCandidateProposedContent(rexCand);
	candidates.push(rexCand);

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
	const anonymized: KbCandidate = {
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
	anonymized.proposed_content = formatCandidateProposedContent(anonymized);
	return anonymized;
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
