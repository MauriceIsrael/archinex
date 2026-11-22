import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const FORBIDDEN_ENGLISH_STRINGS = [
	'Sign In',
	'Enter your credentials',
	'Demo accounts',
	'Welcome back!',
	'Signing in…',
	'Open menu',
	'Expand sidebar',
	'Collapse sidebar',
	'Toggle theme'
];

async function assertNoCriticalAxeViolations(page: Page, contextLabel: string) {
	const results = await new AxeBuilder({ page }).analyze();
	const critical = results.violations.filter((v) => v.impact === 'critical');
	expect(
		critical,
		`Violations axe critiques sur ${contextLabel}: ${JSON.stringify(
			critical.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length })),
			null,
			2
		)}`
	).toEqual([]);
}

async function loginAsAdmin(page: Page) {
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.locator('#email').fill('admin@archinex.local');
	await page.locator('#password').fill('admin123');
	await page.locator('button[type="submit"]').click();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
	await page.waitForLoadState('networkidle');
}

test.describe('Audit accessibilité (axe-core), langue française et responsive 390 px (Issue #393)', () => {
	test('Parcours connexion → délibération : 100 % français, 0 violation axe critique', async ({
		page
	}) => {
		await page.goto('/login', { waitUntil: 'networkidle' });

		// Langue HTML déclarée en français
		const htmlLang = await page.locator('html').getAttribute('lang');
		expect(htmlLang?.toLowerCase()).toMatch(/^fr/);

		// Vérification visuelle en français sans chaîne anglaise résiduelle
		await expect(page.locator('h1')).toContainText('Connexion');
		const loginBodyText = (await page.locator('body').innerText()) || '';
		for (const forbidden of FORBIDDEN_ENGLISH_STRINGS) {
			expect(loginBodyText, `Chaîne anglaise résiduelle sur /login : ${forbidden}`).not.toContain(
				forbidden
			);
		}

		await assertNoCriticalAxeViolations(page, '/login (desktop)');

		// Connexion via le formulaire
		await page.locator('#email').fill('admin@archinex.local');
		await page.locator('#password').fill('admin123');
		await page.locator('button[type="submit"]').click();
		await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
		await page.waitForLoadState('networkidle');

		// Vérification sur le tableau de bord
		await assertNoCriticalAxeViolations(page, '/ (tableau de bord)');
		const dashText = (await page.locator('body').innerText()) || '';
		for (const forbidden of FORBIDDEN_ENGLISH_STRINGS) {
			expect(dashText, `Chaîne anglaise résiduelle sur / : ${forbidden}`).not.toContain(forbidden);
		}
	});

	test('Pages clés Délibération (Tableau, Phase 2, Phase 4, Phase 5) : stepper à états et 0 violation axe critique', async ({
		page
	}) => {
		await loginAsAdmin(page);
		await page.goto('/deliberation', { waitUntil: 'networkidle' });

		// Chaque phase affiche un état calculé + infobulle de la raison
		for (const testId of [
			'phase-tab-appropriation',
			'phase-tab-deliberation',
			'phase-tab-rendu',
			'phase-tab-refinement',
			'phase-tab-consolidation'
		]) {
			const tab = page.locator(`[data-testid="${testId}"]`);
			await expect(tab).toBeVisible();
			const status = await tab.getAttribute('data-phase-status');
			expect(['not_started', 'in_progress', 'ready', 'blocked']).toContain(status);
			const title = await tab.getAttribute('title');
			expect((title ?? '').length).toBeGreaterThan(10);
		}

		// Prochaine action unique visible
		await expect(page.locator('[data-testid="next-action-cta"]')).toBeVisible();

		// 1. Tableau des sujets
		await page.locator('[data-testid="project-board-tab"]').click();
		await page.waitForTimeout(300);
		await assertNoCriticalAxeViolations(page, '/deliberation — Tableau des sujets');

		// 2. Phase 2 · Délibération
		await page.locator('[data-testid="phase-tab-deliberation"]').click();
		await page.waitForTimeout(300);
		await assertNoCriticalAxeViolations(page, '/deliberation — Phase 2 (Délibération)');

		// 3. Phase 4 · Raffinement
		await page.locator('[data-testid="phase-tab-refinement"]').click();
		await page.waitForTimeout(300);
		await assertNoCriticalAxeViolations(page, '/deliberation — Phase 4 (Raffinement)');

		// 4. Phase 5 · Consolidation
		await page.locator('[data-testid="phase-tab-consolidation"]').click();
		await page.waitForTimeout(300);
		await assertNoCriticalAxeViolations(page, '/deliberation — Phase 5 (Consolidation)');
	});

	test('Pages clés Knowledge Base (/kb/dashboard, /kb/reviews) : 0 violation axe critique', async ({
		page
	}) => {
		await loginAsAdmin(page);

		await page.goto('/kb/dashboard', { waitUntil: 'networkidle' });
		await assertNoCriticalAxeViolations(page, '/kb/dashboard');

		await page.goto('/kb/reviews', { waitUntil: 'networkidle' });
		await assertNoCriticalAxeViolations(page, '/kb/reviews');
	});

	test('Viewport mobile 390 px : /login, /deliberation (stepper + phases) et /kb/reviews sans violation axe critique', async ({
		browser
	}) => {
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 }
		});
		const page = await context.newPage();

		// /login à 390 px
		await page.goto('/login', { waitUntil: 'networkidle' });
		await assertNoCriticalAxeViolations(page, '/login (390px)');
		const loginOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(loginOverflow, 'Débordement horizontal excessif sur /login à 390px').toBeLessThanOrEqual(
			8
		);

		// Connexion puis /deliberation à 390 px
		await page.locator('#email').fill('admin@archinex.local');
		await page.locator('#password').fill('admin123');
		await page.locator('button[type="submit"]').click();
		await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });

		await page.goto('/deliberation', { waitUntil: 'networkidle' });
		await expect(page.locator('[data-testid="project-engagement-header"]')).toBeVisible();
		await expect(page.locator('[data-testid="next-action-cta"]')).toBeVisible();
		await assertNoCriticalAxeViolations(page, '/deliberation (390px)');

		// /kb/reviews à 390 px
		await page.goto('/kb/reviews', { waitUntil: 'networkidle' });
		await assertNoCriticalAxeViolations(page, '/kb/reviews (390px)');

		await context.close();
	});
});
