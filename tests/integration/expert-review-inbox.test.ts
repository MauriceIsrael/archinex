import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { kbNotificationService } from '../../src/lib/server/kbNotifications';
import { prisma } from '../../src/lib/server/prisma';

describe('Integration: Review Inbox, Expert Actions, Notifications & Degradation (Lot A7 - Porte G5)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  const expertEmail = `expert.review.${Date.now()}@archinex.local`;
  const expertHandle = `@sec-rev-${Date.now()}`;
  let expertUserId: string;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer({
      owners: [
        {
          handle: expertHandle,
          name: 'Security Lead Integrator',
          email: expertEmail,
          roles: ['kb:review', 'kb:maintain'],
          domains: ['security', 'cloud'],
          delegated: true
        }
      ]
    });

    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-a7'
    });

    // Création de l'utilisateur et du profil KB en base
    const user = await prisma.user.create({
      data: {
        email: expertEmail,
        name: 'Security Lead Integrator',
        role: 'user',
        passwordHash: 'test-hash'
      }
    });
    expertUserId = user.id;

    await prisma.kbProfile.create({
      data: {
        userId: user.id,
        kbHandle: expertHandle,
        kbRoles: JSON.stringify(['kb:review', 'kb:maintain']),
        ownedDomains: JSON.stringify(['security', 'cloud']),
        delegated: true,
        isActive: true
      }
    });

    // Mettre à jour l'inbox du fake state pour assigner cet expert
    fakeLlmops.state.owners.push({
      handle: expertHandle,
      name: 'Security Lead Integrator',
      email: expertEmail,
      roles: ['kb:review', 'kb:maintain'],
      domains: ['security', 'cloud'],
      delegated: true
    });
  });

  afterAll(async () => {
    await prisma.kbNotification.deleteMany({ where: { userId: expertUserId } });
    await prisma.kbProfile.deleteMany({ where: { userId: expertUserId } });
    await prisma.user.deleteMany({ where: { id: expertUserId } });
    await fakeLlmops.close();
  });

  it('1. Boîte de réception identifie les retards (>= 5 jours ouvrés) et permet le filtrage', async () => {
    const inboxRes = await client.getReviewInbox(expertEmail);

    expect(inboxRes.status).toBe('ok');
    expect(inboxRes.data).toBeDefined();

    const overdueCandidate = inboxRes.data!.find((i) => i.candidate_id === 'cand-overdue-003');
    expect(overdueCandidate).toBeDefined();
    expect(overdueCandidate?.is_overdue).toBe(true);

    // Filtrage par type d'actif (principle)
    const principlesOnly = await client.getReviewInbox(expertEmail, { kind: 'principle' });
    expect(principlesOnly.status).toBe('ok');
    expect(principlesOnly.data!.every((i) => i.kind === 'principle')).toBe(true);
  });

  it('2. Détail du candidat contient les 7 vérifications automatiques (Gate G5)', async () => {
    const candRes = await client.getCandidate('cand-sec-001', expertEmail);

    expect(candRes.status).toBe('ok');
    const cand = candRes.data!;
    expect(cand.checks).toBeDefined();
    expect(cand.checks.length).toBe(7);

    const checkNames = cand.checks.map((c) => c.name);
    expect(checkNames).toEqual(
      expect.arrayContaining([
        'schema_validity',
        'clarity_score',
        'testability',
        'non_duplication',
        'sovereign_compliance',
        'domain_alignment',
        'architectural_impact'
      ])
    );
  });

  it('3. Respect absolu de la matrice d’habilitation domaine (403 Forbidden)', async () => {
    const unauthorizedEmail = 'junior@archinex.local';

    const res = await client.reviewCandidate(
      'cand-sec-001', // domain: 'security'
      'accept',
      { reason: 'Approbation sans mandat' },
      unauthorizedEmail
    );

    expect(res.status).toBe('forbidden');
    expect(res.error).toContain('ne possède pas le domaine');
  });

  it('4. Examen avec acceptation, traçabilité et verrouillage contre les conflits (409 Conflict)', async () => {
    // 1ère acceptation
    const acceptRes = await client.reviewCandidate(
      'cand-sec-001',
      'accept',
      { reason: 'Chiffrement validé sur base des critères ANSSI' },
      expertEmail
    );

    expect(acceptRes.status).toBe('ok');
    expect(acceptRes.data!.status).toBe('accepted');

    // 2ème tentative sur un candidat déjà finalisé -> Conflit 409
    const conflictRes = await client.reviewCandidate(
      'cand-sec-001',
      'reject',
      { reason: 'Tentative après décision' },
      expertEmail
    );

    expect(conflictRes.status).toBe('conflict');
    expect(conflictRes.error).toContain('déjà dans l\'état final');
  });

  it('5. Revue d’un actif "principle" déclenche automatiquement une demande de 2nd avis', async () => {
    const res = await client.reviewCandidate(
      'cand-principle-002',
      'accept',
      { reason: 'Favorable au principe d’immuabilité' },
      expertEmail
    );

    expect(res.status).toBe('ok');
    expect(res.data!.second_review_requested).toBe(true);
    expect(res.data!.status).toBe('in_review');

    // Vérifier la présence du 2nd avis dans l'inbox
    const inbox = await client.getReviewInbox(expertEmail);
    const secondRev = inbox.data!.find(
      (i) => i.candidate_id === 'cand-principle-002' && i.reason === 'second_review'
    );
    expect(secondRev).toBeDefined();
  });

  it('6. Moteur de notification & curseur scellé : scrutation idempotente sans duplicata', async () => {
    // Ajouter un événement ciblant explicitement notre expert
    fakeLlmops.state.events.push({
      id: `evt-integ-${Date.now()}`,
      type: 'candidate.assigned',
      cursor: `cur-integ-${Date.now()}`,
      candidate_id: 'cand-sec-001',
      recipients: [expertHandle],
      payload: {
        title: 'Chiffrement Homomorphe Inter-Services',
        domain: 'security',
        actor: 'architect@archinex.local',
        message: 'Examen requis pour homologation'
      },
      timestamp: new Date().toISOString()
    });

    // 1er cycle de scrutation via le service
    const cycle1 = await kbNotificationService.pollAndDispatchEvents(client);
    expect(cycle1.processedCount).toBeGreaterThanOrEqual(1);

    // Vérification de la création en base Prisma
    const notifs1 = await kbNotificationService.getUserNotifications(expertUserId);
    expect(notifs1.length).toBeGreaterThanOrEqual(1);
    expect(notifs1[0].recipientHandle).toBe(expertHandle);
    expect(notifs1[0].read).toBe(false);

    // 2ème cycle immédiat : AUCUN nouveau duplicata ne doit être créé (Idempotence)
    const cycle2 = await kbNotificationService.pollAndDispatchEvents(client);
    expect(cycle2.processedCount).toBe(0);

    const notifs2 = await kbNotificationService.getUserNotifications(expertUserId);
    expect(notifs2.length).toBe(notifs1.length);

    // Acquittement de lecture
    await kbNotificationService.markNotificationRead(notifs1[0].id, expertUserId);
    const unread = await kbNotificationService.getUserNotifications(expertUserId, true);
    expect(unread.length).toBe(notifs1.length - 1);
  });

  it('7. Dégradation gracieuse en cas de panne gouvernance (503)', async () => {
    // Simulation 503 sur endpoint inatteignable
    const deadClient = new LLMOpsClient({
      baseUrl: 'http://127.0.0.1:1', // port fermé
      timeoutMs: 200
    });

    const res = await deadClient.getReviewInbox(expertEmail);
    expect(res.status).toBe('unavailable');
    expect(res.data).toBeUndefined();
  });
});
