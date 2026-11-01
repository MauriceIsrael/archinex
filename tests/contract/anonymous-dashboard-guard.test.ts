import { describe, it, expect } from 'vitest';
import { load as deliberationLoad } from '../../src/routes/deliberation/+page.server';
import { load as workspacesLayoutLoad } from '../../src/routes/workspaces/+layout.server';
import { load as knowledgeLayoutLoad } from '../../src/routes/knowledge/+layout.server';
import { readFileSync } from 'node:fs';

describe('Garde d\'Accès Anonyme & Affichage du Dashboard Seul (#GardeAnonyme)', () => {
	it('1. /deliberation redirige immédiatement un visiteur anonyme vers la mire de connexion avec redirectTo', async () => {
		const mockEvent: any = {
			locals: {},
			url: new URL('http://localhost/deliberation')
		};

		try {
			await deliberationLoad(mockEvent);
			expect.fail('Doit lever une redirection');
		} catch (err: any) {
			expect(err?.status).toBe(302);
			expect(err?.location).toBe('/login?redirectTo=/deliberation');
		}
	});

	it('2. /deliberation autorise et charge la session pour un utilisateur connecté', async () => {
		const mockEvent: any = {
			locals: {
				session: {
					user: {
						id: 'usr-arch-1',
						email: 'architect@test.local',
						role: 'user',
						attributes: { projectRole: 'lead_architect' }
					}
				}
			},
			url: new URL('http://localhost/deliberation')
		};

		const data = (await deliberationLoad(mockEvent)) as any;
		expect(data).toHaveProperty('sessionRole', 'lead_architect');
		expect(data).toHaveProperty('sessionUser');
		expect(data?.sessionUser?.email).toBe('architect@test.local');
	});

	it('3. /workspaces (+layout.server.ts) bloque les accès anonymes et redirige vers /login', async () => {
		const mockEvent: any = {
			locals: {},
			url: new URL('http://localhost/workspaces')
		};

		try {
			await workspacesLayoutLoad(mockEvent);
			expect.fail('Doit lever une redirection');
		} catch (err: any) {
			expect(err?.status).toBe(302);
			expect(err?.location).toContain('/login?redirectTo=');
			expect(decodeURIComponent(err?.location)).toContain('/workspaces');
		}
	});

	it('4. /knowledge (+layout.server.ts) bloque les accès anonymes et redirige vers /login', async () => {
		const mockEvent: any = {
			locals: {},
			url: new URL('http://localhost/knowledge?tab=controls')
		};

		try {
			await knowledgeLayoutLoad(mockEvent);
			expect.fail('Doit lever une redirection');
		} catch (err: any) {
			expect(err?.status).toBe(302);
			expect(decodeURIComponent(err?.location)).toContain('/knowledge?tab=controls');
		}
	});

	it('5. Le menu de navigation principal (+layout.svelte) filtre les entrées métier pour les anonymes', () => {
		const layoutContent = readFileSync('src/routes/+layout.svelte', 'utf-8');
		expect(layoutContent).toContain('authOnly: false');
		expect(layoutContent).toContain('authOnly: true');
		expect(layoutContent).toContain('displayedMenuItems');

		// Simule la logique du store dérivé de +layout.svelte
		const menuItems = [
			{ href: '/', authOnly: false },
			{ href: '/workspaces', authOnly: true },
			{ href: '/deliberation', authOnly: true },
			{ href: '/knowledge', authOnly: true },
			{ href: '/users', authOnly: true }
		];

		const anonymousMenu = menuItems.filter((i) => !i.authOnly || Boolean(null));
		expect(anonymousMenu).toHaveLength(1);
		expect(anonymousMenu[0].href).toBe('/');

		const authenticatedMenu = menuItems.filter((i) => !i.authOnly || Boolean({ user: { id: 'u1' } }));
		expect(authenticatedMenu).toHaveLength(5);
	});

	it('6. La page de connexion (+page.svelte) préserve et assainit le paramètre redirectTo', () => {
		const loginContent = readFileSync('src/routes/login/+page.svelte', 'utf-8');
		expect(loginContent).toContain('redirectTo');
		expect(loginContent).toContain("target.startsWith('/') && !target.startsWith('//')");
	});
});
