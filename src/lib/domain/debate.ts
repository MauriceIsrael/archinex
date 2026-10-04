import type { ProductionMode, EpistemicConfidence } from '$lib/types/epistemic';

export type Stance = 'support' | 'objection' | 'question' | 'verification' | 'synthesis';
export type ArgumentResolution = 'open' | 'answered' | 'accepted_risk' | 'withdrawn';
export type AgentRole = 'proposer' | 'challenger' | 'verifier' | 'synthesizer';

export interface Argument {
	id: string;
	subjectId: string;
	optionId?: string | null;
	targetArgumentId?: string | null;
	stance: Stance;
	claim: string;
	grounds: string;
	kbRefs: string[];
	confidence: EpistemicConfidence;
	author: string;
	authorKind: string; // 'agent:proposer' | 'agent:challenger' | 'agent:verifier' | 'agent:synthesizer' | 'human'
	productionMode: ProductionMode;
	round: number;
	resolution: ArgumentResolution;
	resolvedBy?: string | null;
	resolvedAt?: string | null;
	version: number;
	createdAt?: string;
	updatedAt?: string;
}

export interface DebateRun {
	id: string;
	subjectId: string;
	status: 'running' | 'completed' | 'failed';
	round: number;
	maxRounds: number;
	startedAt: string;
	finishedAt?: string | null;
	error?: string | null;
}

export interface ArgumentValidationResult {
	valid: boolean;
	reason?: string;
}

/**
 * Valide un argument selon les invariants du co-design Archinex.
 * - Invariant IV & Rigueur : 'grounds' (fondement factuel ou technique) obligatoire.
 * - Invariant II : Respect strict du mode de production selon l'auteur (agent => llm-derived, humain => human-authored).
 * - Intégrité doctrinale : Tout kbRef doit appartenir à la doctrine autorisée pour ce sujet.
 */
export function validateArgument(
	arg: Partial<Argument>,
	allowedKbRefs?: string[]
): ArgumentValidationResult {
	if (!arg.claim || !arg.claim.trim()) {
		return { valid: false, reason: "L'affirmation ('claim') de l'argument est obligatoire." };
	}

	if (!arg.grounds || !arg.grounds.trim()) {
		return { valid: false, reason: "Le fondement ('grounds') de l'argument est obligatoire et ne peut être vide." };
	}

	if (arg.kbRefs && Array.isArray(arg.kbRefs) && allowedKbRefs && allowedKbRefs.length > 0) {
		for (const ref of arg.kbRefs) {
			if (!allowedKbRefs.includes(ref)) {
				return {
					valid: false,
					reason: `La référence doctrinale '${ref}' n'existe pas dans le contexte de doctrine de ce sujet.`
				};
			}
		}
	}

	if (arg.authorKind?.startsWith('agent:')) {
		if (arg.productionMode !== 'llm-derived') {
			return {
				valid: false,
				reason: "Un argument généré par un agent doit obligatoirement avoir 'productionMode: llm-derived'."
			};
		}
	} else if (arg.authorKind === 'human') {
		if (arg.productionMode !== 'human-authored') {
			return {
				valid: false,
				reason: "Un argument rédigé par un humain doit avoir 'productionMode: human-authored'."
			};
		}
	}

	return { valid: true };
}

/**
 * Regroupe les arguments par optionId (null pour les arguments transverses/synthesis).
 */
export function groupArgumentsByOption(args: Argument[]): Map<string | null, Argument[]> {
	const map = new Map<string | null, Argument[]>();
	for (const arg of args) {
		const key = arg.optionId || null;
		if (!map.has(key)) {
			map.set(key, []);
		}
		map.get(key)!.push(arg);
	}
	return map;
}

/**
 * Compte le nombre d'objections non résolues (bloquantes pour l'arbitrage en A4).
 */
export function countOpenObjections(args: Argument[]): number {
	return args.filter((a) => a.stance === 'objection' && a.resolution === 'open').length;
}

/**
 * Vérifie si un acteur a le droit de lever ou d'accepter le risque sur une objection.
 * Invariant III : Seul un expert du domaine ou le lead architect humain peut arbitrer/clore une objection.
 */
export function canCloseObjection(actorRole: string, isHuman: boolean): boolean {
	if (!isHuman) return false;
	return actorRole === 'lead_architect' || actorRole === 'domain_expert';
}

export interface ArgumentVisualAttributes {
	alignment: 'left' | 'right' | 'full';
	bubbleStyle: 'solid' | 'dashed' | 'synthesis';
	isAgent: boolean;
	badgeLabel: string; // 'IA' | 'Humain'
	roleLabel: string;
	stanceLabel: string;
	stanceBadgeClass: string;
	canCollapseGrounds: boolean;
	hasTargetCitation: boolean;
}

export function formatAgentRole(authorKind: string): string {
	switch (authorKind) {
		case 'agent:proposer':
			return 'Agent Proposeur';
		case 'agent:challenger':
			return 'Agent Challenger';
		case 'agent:verifier':
			return 'Agent Vérificateur';
		case 'agent:synthesizer':
			return 'Agent Synthétiseur';
		default:
			return authorKind.replace('agent:', 'Agent ');
	}
}

export function formatStanceLabel(stance: Stance): string {
	switch (stance) {
		case 'support':
			return 'Soutien';
		case 'objection':
			return 'Objection';
		case 'question':
			return 'Question';
		case 'verification':
			return 'Vérification';
		case 'synthesis':
			return 'Synthèse';
	}
}

export function getStanceBadgeClass(stance: Stance): string {
	switch (stance) {
		case 'support':
			return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
		case 'objection':
			return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20';
		case 'question':
			return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
		case 'verification':
			return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20';
		case 'synthesis':
			return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20';
	}
}

export function formatMaturityMilestoneSeparator(level: string): string {
	switch (level) {
		case 'L0_named':
			return '── Cadrage initial L0 · Nommé ──';
		case 'L1_framed':
			return '── Passé à L1 · Cadré & Dilemme ──';
		case 'L2_decomposed':
			return '── Passé à L2 · Décomposé ──';
		case 'L3_decided':
			return '── Passé à L3 · Arbitré ──';
		case 'L4_specified':
			return '── Passé à L4 · Spécifié ──';
		case 'L5_archived':
			return '── Passé à L5 · Scellé ──';
		default:
			return `── Jalon ${level} ──`;
	}
}

/**
 * Jalon spécifique affiché dans le fil lorsqu'une décision et ses faits sont affirmés (A27).
 * Format contractuel : ── Décision affirmée par X · L3 ──
 */
export function formatDecisionAffirmedMilestone(affirmer: string, level = 'L3'): string {
	return `── Décision affirmée par ${affirmer} · ${level} ──`;
}

export function getArgumentVisualAttributes(arg: Argument): ArgumentVisualAttributes {
	const isAgent = Boolean(arg.authorKind?.startsWith('agent:'));
	const isSynthesis = arg.stance === 'synthesis';

	if (isSynthesis) {
		return {
			alignment: 'full',
			bubbleStyle: 'synthesis',
			isAgent,
			badgeLabel: isAgent ? 'IA' : 'Humain',
			roleLabel: isAgent ? formatAgentRole(arg.authorKind) : arg.author,
			stanceLabel: 'Synthèse',
			stanceBadgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
			canCollapseGrounds: true,
			hasTargetCitation: Boolean(arg.targetArgumentId)
		};
	}

	return {
		alignment: isAgent ? 'left' : 'right',
		bubbleStyle: isAgent ? 'dashed' : 'solid',
		isAgent,
		badgeLabel: isAgent ? 'IA' : 'Humain',
		roleLabel: isAgent ? formatAgentRole(arg.authorKind) : arg.author,
		stanceLabel: formatStanceLabel(arg.stance),
		stanceBadgeClass: getStanceBadgeClass(arg.stance),
		canCollapseGrounds: true,
		hasTargetCitation: Boolean(arg.targetArgumentId)
	};
}

export interface ExtractedMentions {
	kbRefs: string[];
	agentMentions: ('proposer' | 'challenger' | 'verifier' | 'synthesizer')[];
	userMentions: string[];
}

export function extractMentions(text: string): ExtractedMentions {
	const kbRefs: string[] = [];
	const agentMentions: ('proposer' | 'challenger' | 'verifier' | 'synthesizer')[] = [];
	const userMentions: string[] = [];

	if (!text) return { kbRefs, agentMentions, userMentions };

	// Extract #ref (e.g. #RULE-SEC-01, #sec-anssi-01)
	const hashMatches = text.matchAll(/#([a-zA-Z0-9_-]+)/g);
	for (const m of hashMatches) {
		if (m[1] && !kbRefs.includes(m[1])) {
			kbRefs.push(m[1]);
		}
	}

	// Extract @mention (e.g. @challenger, @alice)
	const atMatches = text.matchAll(/@([a-zA-Z0-9_-]+)/g);
	for (const m of atMatches) {
		const handle = m[1].toLowerCase();
		if (handle === 'challenger' || handle === 'proposer' || handle === 'verifier' || handle === 'synthesizer') {
			if (!agentMentions.includes(handle)) {
				agentMentions.push(handle);
			}
		} else {
			if (!userMentions.includes(m[1])) {
				userMentions.push(m[1]);
			}
		}
	}

	return { kbRefs, agentMentions, userMentions };
}

export function calculateMaturityPercent(level: string): number {
	switch (level) {
		case 'L0_named': return 10;
		case 'L1_framed': return 25;
		case 'L2_decomposed': return 50;
		case 'L3_decided': return 75;
		case 'L4_specified': return 90;
		case 'L5_archived': return 100;
		default: return 0;
	}
}

export interface ResumeSummary {
	hasRecentAbsence: boolean;
	newMessagesCount: number;
	resolvedObjectionsCount: number;
	maturityTransition?: string;
	summaryText: string;
}

export function computeResumeSummary(
	args: Argument[],
	lastVisitedTimestamp?: string | number,
	currentLevel?: string,
	previousLevel?: string
): ResumeSummary | null {
	if (!lastVisitedTimestamp) return null;
	const cutoff = typeof lastVisitedTimestamp === 'string' ? new Date(lastVisitedTimestamp).getTime() : lastVisitedTimestamp;
	const now = Date.now();
	// Check if absence is more than 24 hours (86_400_000 ms)
	const isMoreThan24h = (now - cutoff) >= 86_400_000;
	if (!isMoreThan24h) return null;

	const newArgs = args.filter((a) => a.createdAt && new Date(a.createdAt).getTime() > cutoff);
	const resolvedObjs = args.filter(
		(a) => a.stance === 'objection' && a.resolution !== 'open' && a.resolvedAt && new Date(a.resolvedAt).getTime() > cutoff
	);

	let transitionText = '';
	if (previousLevel && currentLevel && previousLevel !== currentLevel) {
		const cleanPrev = previousLevel.split('_')[0];
		const cleanCurr = currentLevel.split('_')[0];
		transitionText = `${cleanPrev}→${cleanCurr}`;
	}

	const transitionPart = transitionText ? `, ${transitionText}` : '';
	const summaryText = `Depuis votre dernière visite : ${newArgs.length} message(s), ${resolvedObjs.length} objection(s) levée(s)${transitionPart}`;

	return {
		hasRecentAbsence: true,
		newMessagesCount: newArgs.length,
		resolvedObjectionsCount: resolvedObjs.length,
		maturityTransition: transitionText || undefined,
		summaryText
	};
}
