import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const AUTH_DIR = resolve(process.cwd(), 'tests/e2e/.auth');
const AUTH_STATES = {
  lead: resolve(AUTH_DIR, 'lead.json'),
  alice: resolve(AUTH_DIR, 'alice.json')
};

test.describe.serial('Démonstration Interactive E2E : Cas Réel LUMICC (CCTP Lot 1 · NOC, Cœur 5G PPDR & Résilience)', () => {
  test('Acte 1 : Dépouillement & Découverte de l\'Audit ArcKit J0 (CCTP Réel LUMICC - 92 clauses)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.lead });
    const page = await context.newPage();

    // 1. Navigation directe vers la création d'espace depuis un RFP avec analyses enregistrées
    await page.goto('/workspaces/new?import=rfp', { waitUntil: 'networkidle' });

    // 2. Vérification de la présence de la boîte de dialogue de confrontation RFP
    await expect(page.locator('text=Dépouillement RFP & Factorisation en Sujets d\'Architecture')).toBeVisible();

    // 3. Dépliage de la liste des factorisations enregistrées
    const persistedRunsBtn = page.locator('button:has-text("Factorisations enregistrées")');
    if (await persistedRunsBtn.isVisible()) {
      await persistedRunsBtn.click();
    }

    // 4. Recherche de l'audit live LUMICC scellé (run_lumicc_live_j0)
    const lumiccRunTitle = page.locator('text=LUMICC Statement of Work – Lot 1 (Section 4 : NOC & Résilience)').first();
    await expect(lumiccRunTitle).toBeVisible();

    // 5. Chargement de l'audit enregistré dans la session
    const loadBtn = page.locator('button:has-text("Charger"), button:has-text("État actuel")').first();
    await expect(loadBtn).toBeVisible();
    await loadBtn.click();

    // 6. Vérification du rapport d'audit et des sujets décomposés (7 sujets majeurs, 92 clauses)
    await expect(page.locator('text=Audit & Décomposition en Sujets d\'Architecture')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=92 clauses')).toBeVisible();

    // Capture d'écran Acte 1 : Dépouillement analytique et factorisation ArcKit J0
    await page.screenshot({ path: 'tests/e2e/screenshots/lumicc-01-audit-factorization.png', fullPage: true });

    await context.close();
  });

  test('Acte 2 : Exploration de l\'Espace Projet LUMICC (lumicc-lot1-noc) & Piliers de Résilience', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.lead });
    const page = await context.newPage();

    // 1. Navigation vers le gestionnaire des espaces de travail
    await page.goto('/workspaces', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Espaces de Travail & Délibérations');

    // 2. Localisation du projet de démonstration LUMICC pré-chargé
    const lumiccCard = page.locator('div:has-text("LUMICC · Lot 1 (NOC, Cœur 5G PPDR & Résilience)")').first();
    await expect(lumiccCard).toBeVisible();

    // 3. Clic sur le bouton d'ouverture de l'espace projet
    const openBtn = page.locator('button:has-text("Ouvrir cet Espace"), button:has-text("Reprendre la Délibération")').first();
    await openBtn.click();

    // 4. Arrivée sur l'établi de délibération (/deliberation)
    await page.waitForURL(/\/deliberation/);
    await expect(page.locator('text=LUMICC · Lot 1 (NOC, Cœur 5G PPDR & Résilience)')).toBeVisible();

    // 5. Vérification des objectifs stratégiques affichés
    await expect(page.locator('text=Haute disponibilité 99,999 % et résilience géo-distribuée')).toBeVisible();

    // Capture d'écran Acte 2 : Espace Projet & Cadre Stratégique LUMICC
    await page.screenshot({ path: 'tests/e2e/screenshots/lumicc-02-workspace-overview.png' });

    await context.close();
  });

  test('Acte 3 : Matrice des Options & Délibération sur SUBJ-LUMICC-01 (Topologie 3 DC POST & RTO UDR)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.lead });
    const page = await context.newPage();

    await page.goto('/deliberation', { waitUntil: 'networkidle' });

    // 1. Sélection du sujet critique SUBJ-LUMICC-01 dans la liste des conversations
    const subj1Btn = page.locator('button:has-text("Topologie 3 DC POST"), [data-testid="subject-item-SUBJ-LUMICC-01"], div:has-text("SUBJ-LUMICC-01")').first();
    if (await subj1Btn.isVisible()) {
      await subj1Btn.click();
    }

    // 2. Ouverture du volet de dossier si fermé
    const toggleDossierBtn = page.locator('[data-testid="btn-toggle-dossier"]');
    if (await toggleDossierBtn.isVisible()) {
      const btnText = (await toggleDossierBtn.textContent()) || '';
      if (!btnText.includes('Masquer')) {
        await toggleDossierBtn.click();
      }
    }

    // 3. Bascule vers l'onglet Matrice d'options
    const matrixTabBtn = page.locator('button:has-text("Matrice"), button:has-text("Options & Critères")').first();
    if (await matrixTabBtn.isVisible()) {
      await matrixTabBtn.click();
    }

    // 4. Vérification de la présence des deux options en concurrence
    await expect(page.locator('text=2 DC Tier IV actifs (RCE/RCS) + 3e DC standby (RCW)')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=3 DC actifs avec réplication tri-directionnelle')).toBeVisible();

    // 5. Vérification des critères d'évaluation pondérés
    await expect(page.locator('text=RTO Base UDR')).toBeVisible();
    await expect(page.locator('text=Surcoût CAPEX/OPEX')).toBeVisible();
    await expect(page.locator('text=Immunité Split-Brain')).toBeVisible();

    // Capture d'écran Acte 3 : Matrice d'évaluation multicritères
    await page.screenshot({ path: 'tests/e2e/screenshots/lumicc-03-options-matrix.png' });

    await context.close();
  });

  test('Acte 4 : Rapprochement Doctrinal & Contraintes de Survie (Holdover GNSS 30j & Wi-Fi Offload)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.lead });
    const page = await context.newPage();

    await page.goto('/deliberation', { waitUntil: 'networkidle' });

    // 1. Ouverture du dossier de sujet
    const toggleDossierBtn = page.locator('[data-testid="btn-toggle-dossier"]');
    if (await toggleDossierBtn.isVisible()) {
      const btnText = (await toggleDossierBtn.textContent()) || '';
      if (!btnText.includes('Masquer')) {
        await toggleDossierBtn.click();
      }
    }

    // 2. Consultation de l'onglet Doctrine / Références Doctrinales
    const kbTabBtn = page.locator('button:has-text("Doctrine"), button:has-text("Règles"), button:has-text("Patrimoine")').first();
    if (await kbTabBtn.isVisible()) {
      await kbTabBtn.click();
    }

    // 3. Vérification des exigences normatives LUMICC
    await expect(page.locator('text=LUMICC').first()).toBeVisible();

    // Capture d'écran Acte 4 : Alignement Doctrinal et Contraintes de Survie
    await page.screenshot({ path: 'tests/e2e/screenshots/lumicc-04-doctrine-alignment.png' });

    await context.close();
  });

  test('Acte 5 : Arbitrage & Validation de la Décision d\'Architecture (Porte G3)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.lead });
    const page = await context.newPage();

    await page.goto('/deliberation', { waitUntil: 'networkidle' });

    // 1. Vérification du statut de maturation du sujet LUMICC (L2 ou L3)
    const statusBadge = page.locator('text=L2_decomposed, text=L3_decided, text=Maturation').first();
    await expect(statusBadge).toBeVisible();

    // 2. Vérification que l'Option A reste l'option préférentielle retenue pour l'architecture cible
    await expect(page.locator('text=2 DC Tier IV actifs (RCE/RCS) + 3e DC standby (RCW)').first()).toBeVisible();

    // Capture d'écran Acte 5 : Décision arbitrée et dossier prêt pour publication
    await page.screenshot({ path: 'tests/e2e/screenshots/lumicc-05-decision-arbitrated.png' });

    await context.close();
  });
});

