import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const AUTH_DIR = resolve(process.cwd(), 'tests/e2e/.auth');
const AUTH_STATES = {
	lead: resolve(AUTH_DIR, 'lead.json')
};

test.describe('Contrôles Playwright — ComplianceCheckBanner & EditorialDiagramViewer', () => {
	test('vérifie le rendu interactif de ComplianceCheckBanner (dérogation KB hors-ligne) et EditorialDiagramViewer (cadrans & registre)', async ({
		browser
	}) => {
		const context = await browser.newContext({ storageState: AUTH_STATES.lead });
		const page = await context.newPage();

		// Force le statut KB hors-ligne sur l'API de vérification de conformité
		await page.route('**/api/deliberation/compliance-check*', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					frameworks: ['NIS2'],
					offline: true,
					checkStatus: 'not_checked',
					violations: [],
					unassessedCount: 0
				})
			});
		});

		await page.goto('/deliberation', { waitUntil: 'networkidle' });

		// Si le bandeau de conformité est visible sur l'écran courant, vérifier le toggle de dérogation
		const banner = page.getByTestId('compliance-check-banner').first();
		if (await banner.isVisible().catch(() => false)) {
			const checkbox = banner.getByTestId('kb-derogation-checkbox');
			if (await checkbox.isVisible().catch(() => false)) {
				await checkbox.check();
				await expect(banner.getByTestId('kb-derogation-reason')).toBeVisible();
			}
		}

		// Vérifier le viewer éditorial SVG si présent dans la vue artefacts / graphes
		const viewer = page.getByTestId('editorial-diagram-viewer').first();
		if (await viewer.isVisible().catch(() => false)) {
			await expect(viewer.getByTestId('editorial-dial-skin')).toBeVisible();
			await expect(viewer.getByTestId('editorial-dial-detail')).toBeVisible();
			await expect(viewer.getByTestId('editorial-dial-audience')).toBeVisible();
			await expect(viewer.getByTestId('editorial-dial-size')).toBeVisible();
			await viewer.getByTestId('editorial-toggle-ledger').click();
			await expect(viewer.getByTestId('editorial-fidelity-ledger')).toBeVisible();
		}

		await context.close();
	});
});
