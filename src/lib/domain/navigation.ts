/**
 * Règles pures de navigation, titre applicatif et assainissement de redirection.
 * Utilisées par `+layout.svelte` et `login/+page.svelte` et vérifiées directement par les tests de comportement.
 */

export const APP_DEFAULT_TITLE = 'archinex';

export interface NavMenuItemMeta {
	href: string;
	labelKey: string;
	adminOnly: boolean;
	authOnly: boolean;
	isKnowledgeHub?: boolean;
}

export interface KnowledgeHubItemMeta {
	href: string;
	labelKey: string;
	defaultLabel: string;
}

export interface KnowledgeHubGroupMeta {
	id: 'visualisation' | 'doctrine' | 'validation';
	labelKey: string;
	defaultLabel: string;
	items: readonly KnowledgeHubItemMeta[];
}

export const MAIN_MENU_ITEMS: readonly NavMenuItemMeta[] = [
	{ href: '/', labelKey: 'nav.dashboard', adminOnly: false, authOnly: false },
	{ href: '/workspaces', labelKey: 'nav.workspaces', adminOnly: false, authOnly: true },
	{ href: '/deliberation', labelKey: 'nav.deliberation', adminOnly: false, authOnly: true },
	{
		href: '/knowledge',
		labelKey: 'nav.knowledgeHub',
		adminOnly: false,
		authOnly: true,
		isKnowledgeHub: true
	},
	{ href: '/users', labelKey: 'nav.users', adminOnly: false, authOnly: true }
] as const;

export const KNOWLEDGE_HUB_NAV_GROUPS: readonly KnowledgeHubGroupMeta[] = [
	{
		id: 'visualisation',
		labelKey: 'nav.kbGroupVisualisation',
		defaultLabel: '1. Exploration',
		items: [
			{ href: '/knowledge', labelKey: 'nav.knowledge', defaultLabel: 'Base de Connaissance' },
			{ href: '/kb/me', labelKey: 'nav.kbMe', defaultLabel: 'Mon profil expert' },
			{
				href: '/kb/frameworks',
				labelKey: 'nav.kbFrameworks',
				defaultLabel: 'Référentiels & Couverture'
			}
		]
	},
	{
		id: 'doctrine',
		labelKey: 'nav.kbGroupDoctrine',
		defaultLabel: '2. Doctrine & Rédaction',
		items: [
			{ href: '/kb/workshop', labelKey: 'nav.kbWorkshop', defaultLabel: 'Atelier de doctrine' },
			{ href: '/kb/clauses', labelKey: 'nav.kbClauses', defaultLabel: 'Clauses vérifiables' }
		]
	},
	{
		id: 'validation',
		labelKey: 'nav.kbGroupValidation',
		defaultLabel: '3. Validation & Publication',
		items: [
			{ href: '/kb/reviews', labelKey: 'nav.kbReviews', defaultLabel: 'Boîte de revue' },
			{ href: '/kb/evals', labelKey: 'nav.kbEvals', defaultLabel: "Banc d'évaluation" },
			{
				href: '/kb/dashboard',
				labelKey: 'nav.kbDashboard',
				defaultLabel: 'Gouvernance & Publication'
			}
		]
	}
] as const;

/**
 * Filtre les entrées de menu selon l'état d'authentification (aucune entrée `authOnly` pour un anonyme).
 */
export function filterMenuItemsForSession<T extends { authOnly: boolean }>(
	items: readonly T[],
	session: unknown
): T[] {
	const isAuthenticated = Boolean(session);
	return items.filter((item) => !item.authOnly || isAuthenticated);
}

/**
 * Assainit un paramètre `redirectTo` : autorise uniquement un chemin interne commençant par `/`
 * et refuse les redirections protocol-relative (`//evil.example`) ou absolues externes (`https://...`).
 */
export function sanitizeRedirectTarget(target: string | null | undefined): string {
	if (!target) return '/';
	return target.startsWith('/') && !target.startsWith('//') ? target : '/';
}
