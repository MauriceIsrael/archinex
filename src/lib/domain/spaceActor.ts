import type { ArchitectRole } from '$lib/types/epistemic';
import type { ProjectParticipant } from '$lib/domain/engagements';

export const ARCHITECT_ROLE_LABELS: Record<string, string> = {
	lead_architect: 'Lead Architect (Arbitre)',
	'Lead Architect': 'Lead Architect (Arbitre)',
	infra_expert_architect: 'Architecte Infra / Réseau',
	'Network Architect': 'Architecte Infra / Réseau',
	security_architect: 'Architecte Sécurité NIS2',
	'Security Architect': 'Architecte Sécurité NIS2',
	domain_architect: 'Architecte Métier & Domaine',
	'Domain Architect': 'Architecte Métier & Domaine',
	data_architect: 'Architecte Données & IA',
	'Data Architect': 'Architecte Données & IA',
	domain_expert: 'Expert Métier',
	admin: 'Administrateur (Lead Architect)'
};

export function getRoleLabel(role: string | null | undefined): string {
	if (!role) return 'Observateur (non affecté)';
	return ARCHITECT_ROLE_LABELS[role] || role;
}

export function getRolePrivileges(role: string): string {
	switch (role) {
		case 'lead_architect':
		case 'Lead Architect':
		case 'admin':
			return 'Autorité complète : arbitrage formel L3, homologation L4, scellement L5 et gel officiel SHA-256.';
		case 'security_architect':
		case 'Security Architect':
			return 'Expertise sécurité NIS2 & ANSSI : instruction des controverses, proposition d\'options et d\'arbitrages. Homologation L4/L5 réservée au Lead Architect.';
		case 'infra_expert_architect':
		case 'Network Architect':
			return 'Expertise infrastructure & réseau : instruction des controverses, proposition d\'options et d\'arbitrages. Homologation L4/L5 réservée au Lead Architect.';
		case 'domain_architect':
		case 'Domain Architect':
			return 'Expertise métier & domaine : instruction des controverses, proposition d\'options et d\'arbitrages. Homologation L4/L5 réservée au Lead Architect.';
		case 'data_architect':
		case 'Data Architect':
			return 'Expertise données & IA : instruction des controverses, proposition d\'options et d\'arbitrages. Homologation L4/L5 réservée au Lead Architect.';
		default:
			return 'Consultation et contribution aux débats d\'architecture.';
	}
}

export interface SpaceRoleInfo {
	role: ArchitectRole;
	roleLabel: string;
	isAssigned: boolean;
	isAdmin: boolean;
	participant: ProjectParticipant | null;
	displayText: string;
	privilegesSummary: string;
}

/**
 * Détermine le rôle contextuel d'un utilisateur dans un espace donné.
 * Règle (#61 / #76) :
 * 1. Recherche par participant explicite (email ou identifiant de compte)
 * 2. Si non trouvé et administrateur : rôle Lead Architect avec pleins pouvoirs
 * 3. Si compte existant mais non rattaché : statut Observateur (lecture seule)
 * 4. Sans session : valeur par défaut Lead Architect
 */
export function resolveUserSpaceRole(
	engagement: { participants?: ProjectParticipant[] } | null | undefined,
	user: { id?: string; email?: string; name?: string; role?: string } | null | undefined
): SpaceRoleInfo {
	const userEmail = user?.email?.trim().toLowerCase();
	const userId = user?.id;
	const isAdmin = user?.role === 'admin';

	const participant =
		engagement?.participants?.find(
			(p) =>
				(p.email && userEmail && p.email.trim().toLowerCase() === userEmail) ||
				(p.id && userId && p.id === userId)
		) || null;

	if (participant?.role) {
		const role = participant.role;
		const roleLabel = getRoleLabel(role);
		return {
			role,
			roleLabel,
			isAssigned: true,
			isAdmin: Boolean(isAdmin),
			participant,
			displayText: `Vous êtes : ${roleLabel}`,
			privilegesSummary: getRolePrivileges(role)
		};
	}

	if (isAdmin) {
		return {
			role: 'lead_architect',
			roleLabel: 'Administrateur (Lead Architect)',
			isAssigned: true,
			isAdmin: true,
			participant: null,
			displayText: 'Vous êtes : Administrateur (Lead Architect)',
			privilegesSummary: getRolePrivileges('lead_architect')
		};
	}

	if (user) {
		return {
			role: 'domain_architect',
			roleLabel: 'Observateur (non affecté)',
			isAssigned: false,
			isAdmin: false,
			participant: null,
			displayText: 'Vous êtes : Observateur (aucun rôle attribué dans cet espace)',
			privilegesSummary:
				'Consultation en lecture seule. Vous n\'êtes pas encore désigné comme participant dans cet espace.'
		};
	}

	return {
		role: 'lead_architect',
		roleLabel: 'Lead Architect (Arbitre)',
		isAssigned: false,
		isAdmin: false,
		participant: null,
		displayText: 'Vous êtes : Lead Architect (Arbitre)',
		privilegesSummary: getRolePrivileges('lead_architect')
	};
}

/**
 * Explique en clair pourquoi une action d'architecture est refusée pour un rôle donné (#61).
 */
export function explainActionRefusal(
	action: 'freeze' | 'homologate' | 'arbitrate' | 'affirm',
	currentRole: string,
	options?: { isAuthor?: boolean; targetLevel?: string }
): string {
	const currentLabel = getRoleLabel(currentRole);
	if (action === 'freeze') {
		return `Action refusée : Vous êtes actuellement « ${currentLabel} ». Seul le Lead Architect est habilité à sceller officiellement une section pour homologation.`;
	}
	if (action === 'homologate') {
		const lvl = options?.targetLevel || 'L4/L5';
		return `Action refusée : Vous êtes actuellement « ${currentLabel} ». Seul le Lead Architect peut homologuer (${lvl}) une décision architecturale.`;
	}
	if (action === 'affirm') {
		if (options?.isAuthor) {
			return `Auto-validation interdite (règle K16) : Vous êtes l'auteur de cette proposition de décision. Conformément à la gouvernance opposable, seul un décideur distinct peut prononcer l'affirmation.`;
		}
		return `Action refusée : Vous êtes actuellement « ${currentLabel} ». L'affirmation requiert un rôle de décideur distinct qualifié (decider ou lead_architect).`;
	}
	if (action === 'arbitrate') {
		return `Action refusée : L'arbitrage formel requiert l'intervention d'un architecte qualifié.`;
	}
	return `Action non autorisée pour le rôle « ${currentLabel} ».`;
}

