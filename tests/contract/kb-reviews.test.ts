import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('Contract: KB Review Inbox, Expert Actions & 7 Checks (Lot A7 - Porte G5)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  const expertEmail = 'expert@archinex.local'; // owns 'security' and 'cloud'
  const unauthorizedEmail = 'architect@archinex.local'; // owns no domain by default

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token',
      timeoutMs: 3000
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. getReviewInbox renvoie les candidats à examiner avec calcul d’échéance et de retard', async () => {
    const res = await client.getReviewInbox(expertEmail);

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.length).toBeGreaterThanOrEqual(3);

    // Vérification de la présence de la dérogation en retard
    const overdueItem = res.data!.find((i) => i.candidate_id === 'cand-overdue-003');
    expect(overdueItem).toBeDefined();
    expect(overdueItem?.is_overdue).toBe(true);

    const normalItem = res.data!.find((i) => i.candidate_id === 'cand-sec-001');
    expect(normalItem).toBeDefined();
    expect(normalItem?.is_overdue).toBe(false);

    // Filtrage par domaine
    const cloudOnly = await client.getReviewInbox(expertEmail, { domain: 'cloud' });
    expect(cloudOnly.status).toBe('ok');
    expect(cloudOnly.data!.every((i) => i.domain === 'cloud')).toBe(true);
  });

  it('2. getCandidate renvoie le détail complet et les 7 contrôles automatiques (Gate G5)', async () => {
    const res = await client.getCandidate('cand-sec-001', expertEmail);

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();

    const candidate = res.data!;
    expect(candidate.id).toBe('cand-sec-001');
    expect(candidate.checks).toBeDefined();
    expect(candidate.checks.length).toBe(7);

    // Vérification exhaustive des 7 vérifications automatiques
    const checkNames = candidate.checks.map((c) => c.name);
    expect(checkNames).toContain('schema_validity');
    expect(checkNames).toContain('clarity_score');
    expect(checkNames).toContain('testability');
    expect(checkNames).toContain('non_duplication');
    expect(checkNames).toContain('sovereign_compliance');
    expect(checkNames).toContain('domain_alignment');
    expect(checkNames).toContain('architectural_impact');

    // Vérification de l'historique initial
    expect(candidate.history).toBeDefined();
    expect(candidate.history.length).toBeGreaterThanOrEqual(1);
    expect(candidate.history[0].action).toBe('submitted');
  });

  it('3. reviewCandidate refuse un rejet sans motif (400)', async () => {
    const res = await client.reviewCandidate(
      'cand-sec-001',
      'reject',
      { reason: '' },
      expertEmail
    );

    expect(res.status).toBe('error');
    expect(res.error).toMatch(/motif/i);
  });

  it('4. reviewCandidate retourne 403 Forbidden si l’expert ne possède pas le domaine', async () => {
    const res = await client.reviewCandidate(
      'cand-sec-001', // domain: 'security'
      'accept',
      { reason: 'Approbation indue' },
      unauthorizedEmail // no domain ownership
    );

    expect(res.status).toBe('forbidden');
    expect(res.error).toMatch(/ne possède pas le domaine/i);
  });

  it('5. reviewCandidate accepte une clause normale et l’enregistre dans l’historique', async () => {
    const res = await client.reviewCandidate(
      'cand-sec-001',
      'accept',
      { reason: 'Vérification souveraine conforme' },
      expertEmail
    );

    expect(res.status).toBe('ok');
    expect(res.data!.status).toBe('accepted');

    const lastHistory = res.data!.history[res.data!.history.length - 1];
    expect(lastHistory.action).toBe('accepted');
    expect(lastHistory.actor).toBe(expertEmail);
  });

  it('6. reviewCandidate retourne 409 Conflict sur un candidat déjà accepté/rejeté', async () => {
    const res = await client.reviewCandidate(
      'cand-sec-001',
      'reject',
      { reason: 'Changement d’avis ultérieur' },
      expertEmail
    );

    expect(res.status).toBe('conflict');
    expect(res.error).toMatch(/état final/i);
  });

  it('7. reviewCandidate sur un actif de type principle déclenche automatiquement un second avis collégial', async () => {
    // cand-principle-002 est un actif 'principle'
    const res = await client.reviewCandidate(
      'cand-principle-002',
      'accept',
      { reason: 'Premier avis favorable par Security Lead' },
      expertEmail
    );

    expect(res.status).toBe('ok');
    // Le candidat reste in_review car la 2ème revue est requise
    expect(res.data!.status).toBe('in_review');
    expect(res.data!.second_review_requested).toBe(true);

    // Une tâche de 2nd avis a été injectée dans la boîte de revue
    const inbox = await client.getReviewInbox(expertEmail);
    const secondReview = inbox.data!.find(
      (i) => i.candidate_id === 'cand-principle-002' && i.reason === 'second_review'
    );
    expect(secondReview).toBeDefined();
    expect(secondReview?.kind).toBe('principle');
  });

  it('8. assignCandidate réassigne le candidat et consigne l’action', async () => {
    const res = await client.assignCandidate(
      'cand-overdue-003',
      '@cloud-architect',
      'Besoin de validation architecture infra',
      expertEmail
    );

    expect(res.status).toBe('ok');
    expect(res.data!.assigned_to).toBe('@cloud-architect');

    const lastHistory = res.data!.history[res.data!.history.length - 1];
    expect(lastHistory.action).toBe('assigned');
    expect(lastHistory.details).toContain('@cloud-architect');
  });

  it('9. requestReview permet de solliciter un avis consultatif', async () => {
    const res = await client.requestReview(
      'cand-overdue-003',
      {
        kind: 'advice',
        recipient: '@sec-officer',
        message: 'Impact sur la synchronisation SIEM ?'
      },
      expertEmail
    );

    expect(res.status).toBe('ok');
    expect(res.success).toBe(true);
  });

  it('10. addComment et getComments maintiennent le fil de discussion', async () => {
    const addRes = await client.addComment(
      'cand-sec-001',
      'Question sur le chiffrement au repos',
      expertEmail
    );

    expect(addRes.status).toBe('ok');
    expect(addRes.data).toBeDefined();
    expect(addRes.data!.author_handle).toBe('@sec-lead');

    const listRes = await client.getComments('cand-sec-001', expertEmail);
    expect(listRes.status).toBe('ok');
    expect(listRes.data!.length).toBeGreaterThanOrEqual(2);
  });

  it('11. pollEvents permet une scrutation incrémentale par curseur', async () => {
    const pollRes = await client.pollEvents();
    expect(pollRes.status).toBe('ok');
    expect(pollRes.data).toBeDefined();
    expect(pollRes.data!.events.length).toBeGreaterThan(0);
    expect(pollRes.data!.next_cursor).toBeDefined();

    // Scruter avec le curseur actuel ne doit pas renvoyer les événements précédents
    const pollSince = await client.pollEvents(pollRes.data!.next_cursor);
    expect(pollSince.status).toBe('ok');
    expect(pollSince.data!.events.length).toBe(0);
  });
});
