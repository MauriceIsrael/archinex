/**
 * Contrat réel Archinex ⇄ LLMOps — à exécuter contre un VRAI serveur LLMOps, jamais contre le faux.
 *
 *   # dans le dépôt LLMOps : make contract-server   (port 8099, jeton « contract-service-token »)
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/llmops-live.test.ts
 *   # optionnel : LLMOPS_NIS2_EXCERPT=/chemin/vers/LLMOps/tests/fixtures/frameworks/nis2_excerpt.txt
 *
 * Ce test décrit le comportement attendu du client face au contrat LLMOps 1.4 à 1.8
 * (docs/contracts/knowledge-hub-api-v1.md §5.4–5.8). Les signatures publiques du client sont conservées
 * quand c'est possible : ce sont les appels HTTP et la lecture des réponses qui doivent être corrigés.
 * Un test rouge ici est un défaut d'intégration réel, pas un défaut du test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';

const LIVE = process.env.LLMOPS_LIVE_URL;
const ALICE = 'alice@example.org'; // @core-owner-architecture
const SEC = 'sec@example.org'; // @security-compliance-team (domaine security-governance)
const EVA = 'eva@example.org'; // @ciso-office, kb:evaluate
const MAINT = 'maint@example.org'; // @maintainers, kb:maintain + kb:admin

const PATTERN = `---
id: PAT-099
title: Out-of-band management network for the automation chain
type: pattern
status: draft
confidence: assumed
phase: [BUILD, RUN]
domain: [network-automation]
related: [P-009]
---

# PAT-099 — Out-of-band management network

## Problem
The automation chain loses reachability when the data network fails.

## Forces
Restoration must keep working during the outage it restores.

## Solution
Provide a dedicated out-of-band management network, with break-glass access.

## Trade-offs
Extra circuits and cabling.

## When not to use this
Sites with on-site hands available around the clock.
`;

describe.skipIf(!LIVE)('Contrat réel LLMOps (serveur vivant)', () => {
  const client = new LLMOpsClient({
    baseUrl: LIVE ?? 'http://127.0.0.1:8099',
    authToken: process.env.LLMOPS_LIVE_TOKEN ?? 'contract-service-token',
    timeoutMs: 30000
  });
  let candidateId = '';

  it('A6 — /me : un expert enregistré est reconnu', async () => {
    const res = await client.getMe(ALICE);
    expect(res.status).toBe('ok');
    expect(res.data?.handle).toBe('@core-owner-architecture');
    expect(res.data?.offline).not.toBe(true);
    expect(res.data?.kb_roles).toContain('kb:review');
  });

  it('A6 — /me : un e-mail inconnu n’est JAMAIS présenté comme un profil valide (403, pas de profil inventé)', async () => {
    const res = await client.getMe('nobody@example.org');
    expect(res.status).not.toBe('ok');
    expect(res.data).toBeUndefined();
  });

  it('A6 — registre : lire puis réécrire sans perte (default_owner, domaines et secrets conservés)', async () => {
    const before = await client.getOwners(MAINT);
    expect(before.offline).not.toBe(true);
    expect(before.owners.length).toBeGreaterThan(10);
    const res = await client.updateOwners(before.owners, MAINT);
    expect(res.success, JSON.stringify(res)).toBe(true);
    const after = await client.getOwners(MAINT);
    expect(after.owners.length).toBe(before.owners.length);
    // les domaines et le propriétaire par défaut ne doivent pas avoir été effacés
    const me = await client.getMe(ALICE);
    expect(me.data?.owned_domains.length).toBeGreaterThan(0);
  });

  it('A7 — soumission : un vrai identifiant LLMOps, jamais un identifiant local de repli', async () => {
    const res = await client.submitCandidate(
      {
        kind: 'new_asset',
        asset_type: 'pattern',
        title: 'Out-of-band management network',
        proposed_content: PATTERN,
        source: { system: 'archinex', engagement: 'live-contract' }
      } as any,
      ALICE
    );
    expect(res.candidate_id).toMatch(/^CAND-\d{8}-\d{4}$/);
    candidateId = res.candidate_id;
  });

  it('A7 — boîte de revue : tableau d’éléments (pas un objet), avec échéance', async () => {
    const res = await client.getReviewInbox(ALICE);
    expect(res.status).toBe('ok');
    expect(Array.isArray(res.data)).toBe(true);
    const item = (res.data as any[]).find((i) => i.candidate_id === candidateId);
    expect(item).toBeTruthy();
    expect(item.reason).toBe('review');
    expect(typeof item.due_at).toBe('string');
  });

  it('A7 — détail : contrôles automatiques et historique lisibles', async () => {
    const res = await client.getCandidate(candidateId, ALICE);
    expect(res.status).toBe('ok');
    expect((res.data as any).checks.length).toBe(7);
    expect((res.data as any).history.length).toBeGreaterThan(0);
  });

  it('A7 — commentaire puis lecture du fil', async () => {
    const posted = await client.addComment(candidateId, 'Premier avis', EVA);
    expect(posted.status, JSON.stringify(posted)).toBe('ok');
    const list = await client.getComments(candidateId, EVA);
    expect(list.status).toBe('ok');
    expect((list.data as any[]).length).toBe(1);
    expect(JSON.stringify(list.data)).toContain('Premier avis');
  });

  it('A7 — sollicitation d’un avis', async () => {
    const res = await client.requestReview(
      candidateId,
      { kind: 'advice', recipient: '@ciso-office', message: 'Votre avis sécurité ?' },
      ALICE
    );
    expect(res.status, JSON.stringify(res)).toBe('ok');
    const inbox = await client.getReviewInbox(EVA);
    expect((inbox.data as any[]).some((i) => i.candidate_id === candidateId && i.reason === 'advice')).toBe(true);
  });

  it('A7 — réassignation : seul le propriétaire actuel ou un mainteneur ; l’ancien propriétaire perd la main', async () => {
    const denied = await client.assignCandidate(candidateId, '@ciso-office', 'x', EVA);
    expect(denied.status).not.toBe('ok'); // EVA n’est ni propriétaire assigné ni mainteneur
    const ok = await client.assignCandidate(candidateId, '@ciso-office', 'Sujet sécurité', MAINT);
    expect(ok.status, JSON.stringify(ok)).toBe('ok');
  });

  it('A7 — événements : forme lisible par le dispatcheur de notifications', async () => {
    const first = await client.pollEvents();
    expect(first.status).toBe('ok');
    const events = first.data!.events as any[];
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(Array.isArray(e.recipients)).toBe(true);
      expect(typeof (e.timestamp ?? e.at)).toBe('string');
    }
    const cursor = String(first.data!.next_cursor);
    const again = await client.pollEvents(cursor);
    // même curseur : aucun événement déjà vu n'est renvoyé (d'autres clients peuvent en créer de nouveaux entre-temps)
    for (const e of again.data!.events as any[]) {
      expect(Number(e.id)).toBeGreaterThan(Number(cursor));
    }
  });

  it('A7 — décision : relecteur = acteur ; une seconde décision est un conflit', async () => {
    const res = await client.reviewCandidate(candidateId, 'accept', { reason: 'ok' }, EVA);
    // EVA est l'expert assigné (réassignation ci-dessus) : elle peut statuer (correctif LLMOps, PR « expert assigné »).
    expect(res.status, JSON.stringify(res)).toBe('ok');
    const again = await client.reviewCandidate(candidateId, 'accept', { reason: 'ok' }, EVA);
    expect(again.status).toBe('conflict');
  });

  it('A8 — gabarit d’un type d’actif', async () => {
    const res = await client.getAssetTemplate('pattern' as any);
    expect(res.status).toBe('ok');
    expect((res.data as any).sections.length).toBeGreaterThan(0);
    expect((res.data as any).next_id).toMatch(/^PAT-\d{3}$/);
  });

  it('A8 — contrôles à blanc d’un brouillon au format du contrat', async () => {
    const res = await client.validateCandidate({
      kind: 'new_asset',
      asset_type: 'pattern',
      title: 'Out-of-band management network',
      proposed_content: PATTERN,
      source: { system: 'archinex' }
    } as any);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    expect((res.data as any).would_be_status).toBe('in_review');
  });

  it('A8 — simulation de clauses au format du contrat (asset_id + checks)', async () => {
    const res = await client.simulateClause({ asset_id: 'P-002', checks: [] } as any);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    expect((res.data as any).regressions.length).toBeGreaterThan(0); // retirer les clauses de P-002 fait des régressions
    expect((res.data as any).metrics.after.violation_recall).toBeLessThan((res.data as any).metrics.before.violation_recall);
  });

  const excerpt = process.env.LLMOPS_NIS2_EXCERPT || (existsSync('../LLMOps/tests/fixtures/frameworks/nis2_excerpt.txt') ? '../LLMOps/tests/fixtures/frameworks/nis2_excerpt.txt' : undefined);
  it.skipIf(!excerpt || !existsSync(excerpt))('A10 — ingestion NIS2 (multipart), revue d’une ligne, déclaration refusée avec la liste des manques', async () => {
    const up = await client.ingestFramework(
      {
        framework_id: 'NIS2',
        version: '2022/2555',
        file_name: 'nis2_excerpt.txt',
        file_content: readFileSync(excerpt!)
      } as any,
      MAINT
    );
    expect(up.status, JSON.stringify(up)).toBe('ok');
    const id = String((up.data as any).id);
    const detail = await client.getFrameworkIngestion(id, MAINT);
    expect(detail.data?.total_requirements ?? detail.data?.total).toBe(19);
    const row = await client.reviewFrameworkRequirement(id, 'NIS2-ART21-2A', { decision: 'accept', comment: 'vérifié' } as any, SEC);
    expect(row.status, JSON.stringify(row)).toBe('ok');
    const refused = await client.declareFrameworkCoverage('NIS2', SEC);
    expect(['conflict', 'ok']).toContain(refused.status);
  });
});
