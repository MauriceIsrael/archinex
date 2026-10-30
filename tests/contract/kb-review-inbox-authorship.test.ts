import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('KB Review Inbox - Séparation des tâches & Prévention de l\'auto-évaluation', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  const expertEmail = 'expert@archinex.local'; // Expert security & cloud (handle @expert)
  const expertHandle = '@expert';
  const peerEmail = 'peer@archinex.local';

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token',
      timeoutMs: 3000
    });

    // Ajouter un candidat explicitement rédigé par l'expert dans la boîte
    fakeLlmops.state.inbox.push({
      id: 'cand-expert-own-01',
      candidate_id: 'cand-expert-own-01',
      title: 'Politique de chiffrement post-quantique souverain',
      kind: 'new_asset',
      domain: 'security',
      reason: 'review',
      waiting_since: new Date().toISOString(),
      due_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      is_overdue: false,
      author: expertEmail
    });

    // Ajouter un candidat rédigé avec le handle de l'expert
    fakeLlmops.state.inbox.push({
      id: 'cand-expert-own-02',
      candidate_id: 'cand-expert-own-02',
      title: 'Cloisonnement bastion OAM',
      kind: 'new_asset',
      domain: 'security',
      reason: 'review',
      waiting_since: new Date().toISOString(),
      due_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      is_overdue: false,
      author: expertHandle
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. getReviewInbox identifie automatiquement les clauses dont l’acteur connecté est l’auteur (isAuthor)', async () => {
    const res = await client.getReviewInbox(expertEmail, { actorHandle: expertHandle });

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();

    const ownByEmail = res.data!.find((i) => i.candidate_id === 'cand-expert-own-01');
    expect(ownByEmail).toBeDefined();
    expect(ownByEmail?.isAuthor).toBe(true);

    const ownByHandle = res.data!.find((i) => i.candidate_id === 'cand-expert-own-02');
    expect(ownByHandle).toBeDefined();
    expect(ownByHandle?.isAuthor).toBe(true);

    const peerItem = res.data!.find((i) => i.candidate_id === 'cand-sec-001');
    expect(peerItem).toBeDefined();
    expect(peerItem?.isAuthor).toBe(false);
  });

  it('2. getReviewInbox avec excludeOwn=true filtre strictement les clauses de l’auteur connecté', async () => {
    const res = await client.getReviewInbox(expertEmail, {
      excludeOwn: true,
      actorHandle: expertHandle
    });

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();

    // Aucun candidat de l'auteur ne doit être présent
    expect(res.data!.some((i) => i.candidate_id === 'cand-expert-own-01')).toBe(false);
    expect(res.data!.some((i) => i.candidate_id === 'cand-expert-own-02')).toBe(false);
    expect(res.data!.every((i) => !i.isAuthor)).toBe(true);

    // Les candidats des pairs restent présents pour être examinés
    expect(res.data!.some((i) => i.candidate_id === 'cand-sec-001')).toBe(true);
  });

  it('3. Pour un pair, les clauses rédigées par l’expert sont examinables (isAuthor=false)', async () => {
    const peerRes = await client.getReviewInbox(peerEmail, {
      excludeOwn: true,
      actorHandle: '@peer'
    });

    expect(peerRes.status).toBe('ok');
    expect(peerRes.data).toBeDefined();

    // Le pair voit bien la clause rédigée par l'expert comme étant à examiner
    const candForPeer = peerRes.data!.find((i) => i.candidate_id === 'cand-expert-own-01');
    expect(candForPeer).toBeDefined();
    expect(candForPeer?.isAuthor).toBe(false);
  });

  it('4. Règle métier : l’auteur ne peut pas s’auto-évaluer (separation_of_duties au Hub)', async () => {
    const sub = await client.submitCandidate(
      {
        kind: 'new_asset',
        title: 'Candidat post-quantique',
        rationale: 'r',
        summary: 's',
        domain: 'security',
        author: expertEmail,
        source: { system: 'archinex', engagement: 'sod-test' }
      } as any,
      expertEmail
    );
    const candId = sub.candidate_id;

    // Tentative d'auto-évaluation par l'auteur
    const ownEval = await client.reviewCandidate(
      candId,
      'accept',
      { reason: 'Auto-approbation illicite' },
      expertEmail
    );

    expect(ownEval.status).toBe('forbidden');
    expect(ownEval.code).toBe('separation_of_duties');
    expect(ownEval.error).toMatch(/auteur/i);

    // Évaluation légitime par un pair relecteur
    const peerEval = await client.reviewCandidate(
      candId,
      'accept',
      { reason: 'Revue croisée collégiale effectuée par un pair' },
      peerEmail
    );

    expect(peerEval.status).toBe('ok');
  });
});
