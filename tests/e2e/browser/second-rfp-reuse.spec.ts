import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const AUTH_DIR = resolve(process.cwd(), 'tests/e2e/.auth');
const AUTH_STATES = {
  lead: resolve(AUTH_DIR, 'lead.json'),
  alice: resolve(AUTH_DIR, 'alice.json')
};

test.describe('E2E Navigateur : « Deuxième RFP » — reconnaissance de sujets validés, confirmation d’hypothèses et zéro réutilisation silencieuse (Issue #17 / A15)', () => {
  test('Parcours complet : import 2e RFP → détection sémantique ADR-0001 → garantie D8 → confirmation des hypothèses → réutilisation validée', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.lead });
    const page = await context.newPage();

    // 1. Navigation vers l'initialisation d'un espace de travail
    await page.goto('/workspaces/new', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Initialiser un Nouvel Espace de Travail');

    // 2. Bascule vers l'étape 3 : Docs Amonts
    const step3Btn = page.locator('button:has-text("Docs Amonts")');
    await expect(step3Btn).toBeVisible();
    await step3Btn.click();

    // 3. Ouverture du dialogue de confrontation RFP
    const openRfpBtn = page.locator('[data-testid="btn-open-rfp-confrontation"], button:has-text("Importer & Confronter un RFP")');
    await expect(openRfpBtn).toBeVisible();
    await openRfpBtn.click();

    // 4. Vérification de la présence de la boîte de dialogue
    await expect(page.locator('text=Dépouillement RFP & Factorisation en Sujets d\'Architecture')).toBeVisible();

    // 5. Sélection du modèle pré-configuré "Deuxième RFP"
    const secondRfpTemplateBtn = page.locator('[data-testid="template-btn-rfp-second-loop"], button:has-text("Deuxième RFP")');
    await expect(secondRfpTemplateBtn).toBeVisible();
    await secondRfpTemplateBtn.click();

    // 6. Déclenchement du dépouillement analytique clause-par-clause
    const shredBtn = page.locator('[data-testid="btn-run-shred-and-confront"], button:has-text("Dépouillement Brut Clause-par-Clause")');
    await expect(shredBtn).toBeVisible();
    await shredBtn.click();

    // 7. Attente et vérification des résultats de confrontation
    await expect(page.locator('text=Résultat de Confrontation au Patrimoine')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Matrice des Exigences & Alignement Doctrinal')).toBeVisible();

    // 8. Vérification de la détection sémantique de ADR-0001 pour la Clause 1.1
    const similarityBadge = page.locator('text=Actif proche détecté :').first();
    await expect(similarityBadge).toBeVisible();
    await expect(page.locator('text=ADR-0001').first()).toBeVisible();

    // 9. Vérification de l'invariant D8 (Garantie Zéro Faux Positif Silencieux)
    // L'actif NE DOIT PAS être validé automatiquement malgré un fort score de similarité
    const d8Notice = page.locator('text=Confirmation obligatoire (D8)').first();
    await expect(d8Notice).toBeVisible();

    // Capture d'écran : Détection de similarité et alerte D8
    await page.screenshot({ path: 'tests/e2e/screenshots/second-rfp-confrontation.png', fullPage: true });

    // 10. Clic sur "Examiner les hypothèses"
    const reviewHypothesesBtn = page.locator('button:has-text("Examiner les hypothèses")').first();
    await expect(reviewHypothesesBtn).toBeVisible();
    await reviewHypothesesBtn.click();

    // 11. Vérification de la modale de confirmation d'hypothèses
    await expect(page.locator('text=1. Examen des Hypothèses Documentées')).toBeVisible();
    await expect(page.locator('text=Garantie Zéro Faux Positif Silencieux (D8)')).toBeVisible();
    await expect(page.locator('text=The control plane handles fewer than 10000 managed devices.')).toBeVisible();
    await expect(page.locator('text=Every site keeps an out-of-band access path to its routers.')).toBeVisible();

    // Capture d'écran : Modale d'examen des hypothèses
    await page.screenshot({ path: 'tests/e2e/screenshots/second-rfp-hypotheses-modal.png' });

    // 12. D8 : rien n'est présélectionné ; la confirmation reste impossible tant que chaque hypothèse n'est pas jugée
    const confirmBtn = page.locator('[data-testid="btn-submit-reuse-confirmation"]');
    await expect(confirmBtn).toBeDisabled();
    await expect(page.locator('[data-testid="outcome-reused"]')).toBeDisabled();
    await page.locator('[data-testid="hyp-0-holds"]').check();
    await expect(confirmBtn).toBeDisabled();
    await page.locator('[data-testid="hyp-1-holds"]').check();
    await page.locator('[data-testid="outcome-reused"]').check();
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // 13. Vérification que la clause est désormais marquée comme réutilisation validée par l'architecte
    await expect(page.locator('text=✓ Validé par').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Conforme (Réutilisé)').first()).toBeVisible();

    // Capture d'écran : Décision réutilisée et validée
    await page.screenshot({ path: 'tests/e2e/screenshots/second-rfp-reuse-confirmed.png', fullPage: true });

    await context.close();
  });
});
