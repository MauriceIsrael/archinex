import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const AUTH_DIR = resolve(process.cwd(), 'tests/e2e/.auth');
const AUTH_STATES = {
	lead: resolve(AUTH_DIR, 'lead.json')
};

test.describe('E2E Navigateur : Quick-Ask Exigences au clavier', () => {
	test('ouvre le panneau flottant via Alt+/, interroge les exigences, affiche les citations et ferme via Escape', async ({
		browser
	}) => {
		const context = await browser.newContext({ storageState: AUTH_STATES.lead });
		const page = await context.newPage();

		await page.route('**/api/projects/*/requirements/ask', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					status: 'ok',
					verdict: 'imposed',
					answer: 'Oui, la clause [REQ-10] impose 3 datacenters actifs.',
					caveats: [],
					citations: [
						{
							clauseRef: 'REQ-10',
							bundleId: 'SRC-11223344:REQ-10',
							sourceTitle: 'CCTP Lot Infra',
							title: 'Topologie tri-site',
							criticality: 'bloquant',
							effectiveDisposition: 'deliberated',
							excerpt: 'Déploiement obligatoire sur 3 datacenters indépendants.',
							linkedSubjectIds: []
						}
					],
					meta: {
						mode: 'full_context',
						totalRequirements: 12,
						evaluatedRequirements: 12,
						model: 'claude-sonnet-5-5',
						cacheHint: 'abc123def456'
					}
				})
			});
		});

		await page.goto('/deliberation', { waitUntil: 'networkidle' });

		// Ouverture au clavier (Alt+/)
		await page.keyboard.press('Alt+/');
		const panel = page.getByTestId('requirements-quick-ask-panel');
		await expect(panel).toBeVisible();

		// Envoi de question
		const textarea = panel.locator('textarea');
		await textarea.fill('Les exigences imposent-elles 3 DC ?');
		await page.getByTestId('quick-ask-submit').click();

		await expect(panel.getByText('Exigé')).toBeVisible();
		await expect(panel.getByText('REQ-10', { exact: true })).toBeVisible();
		await expect(panel.getByText('Topologie tri-site')).toBeVisible();

		// Fermeture via Escape puis réouverture pour vérifier la persistance de session
		await page.keyboard.press('Escape');
		await expect(panel).toBeHidden();

		await page.getByTestId('quick-ask-trigger').click();
		await expect(panel).toBeVisible();
		await expect(panel.getByText('Topologie tri-site')).toBeVisible();

		await context.close();
	});
});
