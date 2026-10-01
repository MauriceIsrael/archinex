/**
 * Contrat réel Archinex ⇄ LLMOps pour A9 (évaluations, retours) et A11 (santé, promotion, publication,
 * campagnes) — à exécuter contre un VRAI serveur LLMOps (voir tests/contract/llmops-live.test.ts).
 *
 *   # dans LLMOps (main, PR « annotation sans expected » incluse) : make contract-server
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/llmops-live-a9-a11.test.ts
 *
 * Contrat : LLMOps docs/contracts/knowledge-hub-api-v1.md §5.6 (évaluations, retours), §5.8 (promotion,
 * publication, santé). Les méthodes absentes du client sont appelées par le nom attendu ; un autre nom est
 * acceptable si ce test est adapté dans la même PR. Un test rouge ici est un défaut d'intégration réel.
 */
import { describe, it, expect } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';

const LIVE = process.env.LLMOPS_LIVE_URL;
const ALICE = 'alice@example.org'; // propriétaire du domaine network-automation, sans rôle d'évaluateur
const EVA = 'eva@example.org'; // kb:evaluate
const MAINT = 'maint@example.org'; // kb:maintain + kb:admin

const PATTERN2 = `---
id: PAT-097
title: Staged rollout gates for configuration pushes
type: pattern
status: draft
confidence: assumed
phase: [BUILD, RUN]
domain: [network-automation]
related: [P-009]
---

# PAT-097 — Staged rollout gates for configuration pushes

## Problem
A faulty configuration pushed to every site at once causes a fleet-wide incident.

## Forces
Rollouts must stay fast enough for urgent security fixes.

## Solution
Push to a canary ring first, then widen automatically after health gates pass.

## Trade-offs
Slower propagation and a more complex pipeline.

## When not to use this
Single-site deployments with a manual change window.
`;

const PATTERN = `---
id: PAT-098
title: Break-glass access path for the automation chain
type: pattern
status: draft
confidence: assumed
phase: [BUILD, RUN]
domain: [network-automation]
related: [P-009]
---

# PAT-098 — Break-glass access path

## Problem
Operators lose access to devices when the central identity provider is down.

## Forces
Access must stay auditable even in degraded mode.

## Solution
Provide a locally verifiable emergency credential with after-the-fact review.

## Trade-offs
More credentials to protect and rotate.

## When not to use this
Environments with a highly available identity provider and on-site hands.
`;

describe.skipIf(!LIVE)('Contrat réel LLMOps — A9 évaluations et retours (serveur vivant)', () => {
  const client = new LLMOpsClient({
    baseUrl: LIVE ?? 'http://127.0.0.1:8099',
    authToken: process.env.LLMOPS_LIVE_TOKEN ?? 'contract-service-token',
    timeoutMs: 60000
  });
  const c: any = client;
  let feedbackId: string | number = '';

  it('A9 — jeu d’évaluation : 30 cas, statut d’annotation lisible', async () => {
    const res = await client.getEvalDataset('check_option_v1', EVA);
    expect(res.status).toBe('ok');
    const cases = (res.data as any).cases as any[];
    expect(cases.length).toBe(30);
    for (const k of cases) {
      expect(['proposed', 'validated', 'rejected']).toContain(k.annotation_status);
      expect(typeof k.expected).toBe('object');
    }
  });

  it('A9 — annotation : le corps du contrat est accepté et RÉELLEMENT enregistré', async () => {
    const res = await client.annotateEvalTestCase('check_option_v1', 'CO-001', { annotation_status: 'validated' } as any, EVA);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    expect((res.data as any).annotation_status).toBe('validated');
    expect((res.data as any).annotated_by).toBe('@ciso-office');
    const after = await client.getEvalDataset('check_option_v1', EVA);
    expect(((after.data as any).cases as any[]).find((k) => k.id === 'CO-001').annotation_status).toBe('validated');
  });

  it('A9 — annotation : l’ancien corps {expected_status, notes} ne doit plus être envoyé (LLMOps le refuse, pas de faux succès)', async () => {
    const res = await client.annotateEvalTestCase('check_option_v1', 'CO-002', { expected_status: 'violates', notes: 'x' } as any, EVA);
    expect(res.status).not.toBe('ok');
  });

  it('A9 — annotation : un expert sans rôle kb:evaluate est refusé (forbidden)', async () => {
    const res = await client.annotateEvalTestCase('check_option_v1', 'CO-003', { annotation_status: 'validated' } as any, ALICE);
    expect(res.status).toBe('forbidden');
  });

  it('A9 — exécution du banc : rappel sur les annotations, historisé', async () => {
    const res = await client.runEvalBenchmark('check_option_v1', EVA);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    const run = res.data as any;
    expect(typeof run.violation_recall).toBe('number');
    expect(run.validated_cases).toBeGreaterThanOrEqual(1);
    expect(run.run_by).toBe('@ciso-office');
  });

  it('A9 — retour sur verdict au format du contrat (typed_id, feedback, justification, option)', async () => {
    const res = await client.submitVerdictFeedback(
      {
        typed_id: 'principle:P-002',
        check_id: 'P-002-C1',
        feedback: 'wrong_violation',
        justification: 'L’approbation est donnée par le comité de changement, pas à l’exécution.',
        option: { title: 'Remédiation approuvée par le comité', description: 'Le comité approuve le playbook une fois.' },
        subject: 'Remédiation'
      } as any,
      ALICE
    );
    expect(res.status, JSON.stringify(res)).toBe('ok');
    feedbackId = (res.data as any).id;
    expect((res.data as any).reporter).toBe('@core-owner-architecture');
    expect((res.data as any).status).toBe('open');
  });

  it('A9 — retour sur verdict : l’ancien format {subject_id, option_id, suggested_action} est refusé', async () => {
    const res = await client.submitVerdictFeedback(
      { subject_id: 's', option_id: 'o', disagree_rationale: 'x', suggested_action: 'add_test_case' } as any,
      ALICE
    );
    expect(res.status).not.toBe('ok');
  });

  it('A9 — file des retours ouverts puis conversion par un évaluateur (nouvelle méthode convertVerdictFeedback)', async () => {
    const list = await client.listVerdictFeedbacks(EVA);
    expect(list.status).toBe('ok');
    expect((list.data as any[]).some((f) => f.id === feedbackId)).toBe(true);

    expect(typeof c.convertVerdictFeedback, 'méthode convertVerdictFeedback(id, {to, …}, actorEmail) à ajouter').toBe('function');
    const denied = await c.convertVerdictFeedback(feedbackId, { to: 'dismiss' }, ALICE);
    expect(denied.status).toBe('forbidden'); // pas évaluateur
    const done = await c.convertVerdictFeedback(feedbackId, { to: 'eval_case', dataset: 'check_option_v1', expected: 'supports' }, EVA);
    expect(done.status, JSON.stringify(done)).toBe('ok');
    expect(String((done.data as any).converted_to)).toMatch(/^eval_case:CO-\d+/);
    const again = await c.convertVerdictFeedback(feedbackId, { to: 'dismiss' }, EVA);
    expect(again.status).toBe('conflict'); // déjà converti
  });
});

describe.skipIf(!LIVE)('Contrat réel LLMOps — A11 santé, promotion, publication, campagnes (serveur vivant)', () => {
  const client = new LLMOpsClient({
    baseUrl: LIVE ?? 'http://127.0.0.1:8099',
    authToken: process.env.LLMOPS_LIVE_TOKEN ?? 'contract-service-token',
    timeoutMs: 300000
  });
  const c: any = client;
  let candidateId = '';
  let snapshotId = '';

  it('A11 — santé : indicateurs et mode de stockage', async () => {
    const res = await client.getKbHealth(MAINT);
    expect(res.status).toBe('ok');
    const h = res.data as any;
    expect(h.assets.active).toBeGreaterThan(30);
    expect(h.storage).toEqual({ persistent: true, mode: 'normal' });
    expect(h.queue.by_status).toBeTypeOf('object');
    expect(Object.keys(h.coverage)).toContain('NIS2');
  });

  it('A11 — candidat soumis puis accepté par le propriétaire du domaine', async () => {
    const sub = await client.submitCandidate(
      { kind: 'new_asset', asset_type: 'pattern', title: 'Break-glass access path', proposed_content: PATTERN,
        source: { system: 'archinex', engagement: 'live-contract' } } as any,
      ALICE
    );
    expect(sub.candidate_id).toMatch(/^CAND-\d{8}-\d{4}$/);
    candidateId = sub.candidate_id;
    const acc = await client.reviewCandidate(candidateId, 'accept', { reason: 'Générique et éprouvé' }, ALICE);
    expect(acc.status, JSON.stringify(acc)).toBe('ok');
  });

  it('A11 — promotion par un mainteneur (nouvelle méthode promoteKbCandidate) ; refusée à un simple expert', async () => {
    expect(typeof c.promoteKbCandidate, 'méthode promoteKbCandidate(candidateId, actorEmail) à ajouter').toBe('function');
    const denied = await c.promoteKbCandidate(candidateId, ALICE);
    expect(denied.status).toBe('forbidden');
    const res = await c.promoteKbCandidate(candidateId, MAINT);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    expect(res.warnings).toEqual([]); // mode normal : pas d'avertissement de stockage éphémère
    const again = await c.promoteKbCandidate(candidateId, MAINT);
    expect(again.status).toBe('conflict');
  });

  it('A11 — publication : instantané scellé, candidats publiés (aucun corps requis par LLMOps)', async () => {
    const res = await client.publishKbDoctrine({}, MAINT);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    const data = res.data as any;
    expect(data.published).toContain(candidateId);
    expect(data.snapshot_id).toMatch(/^snapshot-/);
    snapshotId = data.snapshot_id;
    const again = await client.publishKbDoctrine({}, MAINT);
    expect(again.status).toBe('ok'); // « rien à publier » n'est pas une erreur
    expect((again.data as any).published).toEqual([]);
  });

  it('A11 — liste des publications : n’appelle aucune route inexistante (LLMOps n’a pas GET /publications)', async () => {
    const res = await client.listKbPublications(MAINT);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    expect(JSON.stringify(res.data)).toContain(snapshotId); // dérivée des candidats `published`
  });

  it('A11 — santé après publication : dernier instantané renseigné', async () => {
    const res = await client.getKbHealth(MAINT);
    expect((res.data as any).last_snapshot?.snapshot_id).toBe(snapshotId);
  });

  it('A11 — campagnes : gérées par Archinex (LLMOps n’a pas /campaigns) — création, liste, avancement', async () => {
    const created = await client.createKbCampaign(
      { title: 'Valider les actifs sans validated_by (security)', domain: 'security', target_count: 3 } as any,
      MAINT
    );
    expect(created.status, JSON.stringify(created)).toBe('ok');
    const id = (created.data as any).id;
    const list = await client.listKbCampaigns(MAINT);
    expect(list.status).toBe('ok');
    expect((list.data as any[]).some((k) => k.id === id)).toBe(true);
    const upd = await client.updateKbCampaign(id, { progress_increment: 1 }, MAINT);
    expect(upd.status, JSON.stringify(upd)).toBe('ok');
  });

  it('A11 — campagne : sollicite des experts précis via request-review (demande « advice » visible dans leur boîte)', async () => {
    const sub = await client.submitCandidate(
      { kind: 'new_asset', asset_type: 'pattern', title: 'Staged rollout gates for configuration pushes', proposed_content: PATTERN2,
        source: { system: 'archinex', engagement: 'live-contract' } } as any,
      ALICE
    );
    const res = await client.requestReview(sub.candidate_id, { kind: 'advice', recipient: '@ciso-office', message: 'Campagne de validation' }, MAINT);
    expect(res.status, JSON.stringify(res)).toBe('ok');
    const inbox = await client.getReviewInbox(EVA);
    expect(((inbox.data as any[]) ?? []).some((i) => i.candidate_id === sub.candidate_id && i.reason === 'advice')).toBe(true);
  });
});
