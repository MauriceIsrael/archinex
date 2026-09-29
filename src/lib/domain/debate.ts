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
