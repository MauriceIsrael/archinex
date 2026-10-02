import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * Tolérance zéro (D8) — chemins NÉGATIFS du « deuxième RFP » (issue A15, cas 2 à 7).
 * Serveur LLMOps réel (scripts/contract_server.py ou conteneur) ; seuls les cas 4 et 5 façonnent la réponse de
 * /api/knowledge/similar (aucun actif de la KB de contrat ne répond à ces deux situations), le refus côté serveur
 * est testé séparément par tests/contract/llmops-live-reuse-negative.test.ts.
 */
const AUTH = resolve(process.cwd(), 'tests/e2e/.auth/lead.json');
const A1 = 'The control plane handles fewer than 10000 managed devices.';
const A2 = 'Every site keeps an out-of-band access path to its routers.';

async function openModal(page: Page, shape?: (results: any[]) => any[]) {
  if (shape) {
    await page.route('**/api/knowledge/similar', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = { ...body.data, results: shape(body.data?.results ?? []) };
      await route.fulfill({ response, json: body });
    });
  }
  await page.goto('/workspaces/new', { waitUntil: 'networkidle' });
  await page.locator('button:has-text("Docs Amonts")').click();
  await page.locator('[data-testid="btn-open-rfp-confrontation"], button:has-text("Importer & Confronter un RFP")').click();
  await page.locator('[data-testid="template-btn-rfp-second-loop"], button:has-text("Deuxième RFP")').click();
  await page.locator('[data-testid="btn-run-shred-and-confront"], button:has-text("Dépouillement Brut Clause-par-Clause")').click();
  await expect(page.locator('text=Résultat de Confrontation au Patrimoine')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('text=Actif proche détecté :').first()).toBeVisible();
  await page.locator('button:has-text("Examiner les hypothèses")').first().click();
  await expect(page.locator('text=1. Examen des Hypothèses Documentées')).toBeVisible();
}

const submit = (page: Page) => page.locator('[data-testid="btn-submit-reuse-confirmation"]');
const outcome = (page: Page, name: string) => page.locator(`[data-testid="outcome-${name}"]`);
const journal = async (page: Page, params = 'matched_ref=ADR-0001') => {
  const res = await page.request.get(`/api/knowledge/reuse-confirmations?${params}`);
  expect(res.status()).toBe(200);
  return ((await res.json()).data ?? []) as any[];
};

test.describe('Tolérance zéro — chemins négatifs du « deuxième RFP »', () => {
  test.setTimeout(90_000);

  test('rien n’est présélectionné : aucune issue de réutilisation tant que chaque hypothèse n’est pas jugée', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await openModal(page);

    for (const i of [0, 1]) {
      for (const status of ['holds', 'does_not_hold', 'unknown']) {
        await expect(page.locator(`[data-testid="hyp-${i}-${status}"]`)).not.toBeChecked();
      }
    }
    await expect(page.locator('[data-testid="judge-all-hint"]')).toBeVisible();
    for (const name of ['reused', 'reused_with_exception', 'rejected_assumption_fails']) {
      await expect(outcome(page, name)).toBeDisabled();
    }
    await expect(submit(page)).toBeDisabled();

    await page.locator('[data-testid="hyp-0-holds"]').check(); // une seule sur deux jugée
    await expect(outcome(page, 'reused')).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await context.close();
  });

  test('une hypothèse qui ne tient pas interdit la réutilisation et réouvre la question', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await openModal(page);
    const beforeRows = await journal(page);
    const before = beforeRows.length;

    await page.locator('[data-testid="hyp-0-does_not_hold"]').check();
    await page.locator('[data-testid="hyp-1-holds"]').check();
    await expect(outcome(page, 'reused')).toBeDisabled();
    await expect(outcome(page, 'rejected_assumption_fails')).toBeEnabled();
    await outcome(page, 'rejected_assumption_fails').check();
    await submit(page).click();

    await expect(page.locator('[data-testid^="reuse-refused-notice-"]').first()).toContainText('la question reste ouverte');
    await expect(page.locator('[data-testid^="reuse-confirmed-badge-"]')).toHaveCount(0);
    await expect(page.locator('text=Conforme (Réutilisé)')).toHaveCount(0);
    await expect(page.locator('text=Confirmation obligatoire (D8)').first()).toBeVisible(); // la clause reste à traiter

    const after = await journal(page);
    expect(after.length).toBe(before + 1);
    const refused = (rows: any[]) => rows.filter((r) => r.outcome === 'rejected_assumption_fails').length;
    expect(refused(after)).toBe(refused(beforeRows) + 1);
    await context.close();
  });

  test('une hypothèse inconnue interdit « réutiliser tel quel » ; l’exception exige un commentaire', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await openModal(page);

    await page.locator('[data-testid="hyp-0-unknown"]').check();
    await page.locator('[data-testid="hyp-1-holds"]').check();
    await expect(outcome(page, 'reused')).toBeDisabled();
    await expect(outcome(page, 'reused_with_exception')).toBeEnabled();
    await outcome(page, 'reused_with_exception').check();
    await expect(submit(page)).toBeDisabled(); // pas de commentaire
    await page.locator('#arbitration-comment').fill('   ');
    await expect(submit(page)).toBeDisabled(); // un commentaire vide ne compte pas
    await page.locator('#arbitration-comment').fill('Volume à confirmer ; procédure manuelle de repli en attendant.');
    await expect(submit(page)).toBeEnabled();
    await context.close();
  });

  test('un actif sans hypothèses documentées ne peut pas être réutilisé', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await openModal(page, (results) =>
      results.filter((r) => r.ref === 'ADR-0001').map((r) => ({ ...r, assumptions: [], assumptions_documented: false }))
    );
    await expect(page.locator('[data-testid="no-assumptions-notice"]')).toContainText('Hypothèses non documentées');
    for (const name of ['reused', 'reused_with_exception', 'rejected_assumption_fails']) {
      await expect(outcome(page, name)).toBeDisabled();
    }
    await expect(submit(page)).toBeDisabled();
    await context.close();
  });

  test('un actif remplacé n’est jamais réutilisable, même si toutes les hypothèses sont jugées valides', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await openModal(page, (results) =>
      results.filter((r) => r.ref === 'ADR-0001').map((r) => ({ ...r, zone: 'superseded', superseded_by: 'ADR-0099' }))
    );
    await expect(page.locator('[data-testid="superseded-notice"]')).toContainText('ADR-0099');
    await page.locator('[data-testid="hyp-0-holds"]').check();
    await page.locator('[data-testid="hyp-1-holds"]').check();
    await expect(outcome(page, 'reused')).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await context.close();
  });

  test('le rejet « pas le même sujet » est mémorisé avec sa raison et réaffiché à la proposition suivante', async ({ browser }) => {
    const reason = `Autre périmètre : réseau d’accès physique (${Date.now()})`;
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await openModal(page);
    await outcome(page, 'rejected_not_same').check();
    await expect(submit(page)).toBeDisabled(); // raison obligatoire
    await page.locator('#arbitration-comment').fill(reason);
    await submit(page).click();
    await expect(page.locator('[data-testid^="reuse-refused-notice-"]').first()).toContainText(reason);

    // Nouvelle analyse du même RFP, nouvelle session : la raison est affichée, pas masquée.
    const again = await browser.newContext({ storageState: AUTH });
    const page2 = await again.newPage();
    await openModal(page2);
    await expect(page2.locator('text=Historique des arbitrages passés pour ce sujet')).toBeVisible();
    await expect(page2.locator(`text=${reason}`).first()).toBeVisible();
    await context.close();
    await again.close();
  });

  test('contournement par l’API : le serveur refuse et rien n’est enregistré', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const fingerprint = 'b'.repeat(64);
    const before = (await journal(page, `subject_fingerprint=${fingerprint}`)).length;
    const base = { subject_fingerprint: fingerprint, subject_label: 'Contournement', matched_ref: 'ADR-0001', model: 'toy-bow', scores: { vector: 0.9 } };

    const failing = await page.request.post('/api/knowledge/reuse-confirmations', {
      data: { ...base, outcome: 'reused', assumptions: [{ text: A1, status: 'does_not_hold' }, { text: A2, status: 'holds' }] }
    });
    expect([400, 409]).toContain(failing.status());

    const partial = await page.request.post('/api/knowledge/reuse-confirmations', {
      data: { ...base, outcome: 'reused', assumptions: [{ text: A1, status: 'holds' }] } // une hypothèse non jugée
    });
    expect([400, 409]).toContain(partial.status());

    const undocumented = await page.request.post('/api/knowledge/reuse-confirmations', {
      data: { ...base, matched_ref: 'ADR-0002', outcome: 'reused', assumptions: [] }
    });
    expect([400, 409]).toContain(undocumented.status());

    expect((await journal(page, `subject_fingerprint=${fingerprint}`)).length).toBe(before);

    // Sans session : refus net, et un en-tête X-Actor-Email choisi par l'appelant n'y change rien.
    const anonymous = await browser.newContext();
    const res = await anonymous.request.post('/api/knowledge/reuse-confirmations', {
      headers: { 'X-Actor-Email': 'alice@example.org' },
      data: { ...base, outcome: 'deferred', assumptions: [] }
    });
    expect(res.status()).toBe(401);
    await anonymous.close();
    await context.close();
  });
});
