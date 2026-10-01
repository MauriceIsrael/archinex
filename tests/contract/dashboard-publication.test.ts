import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('Contract: Tableau de Bord KB, Publication Scellée et Porte G7 (Lot A11)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-a11'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. getKbHealth restitue les métriques consolidées et détecte les bloquants Porte G7', async () => {
    const res = await client.getKbHealth('expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    const health = res.data!;

    // Doctrine health
    expect(health.doctrine_health.total_assets).toBeGreaterThanOrEqual(60);
    expect(health.doctrine_health.principles_count).toBe(12);

    // Reviews summary: initially 1 overdue review (rev-003)
    expect(health.reviews_summary.overdue_count).toBe(1);

    // Gate G7 should be blocked due to overdue review
    expect(health.gate_g7_eligible).toBe(false);
    expect(health.gate_g7_blockers.length).toBeGreaterThanOrEqual(1);
    expect(health.gate_g7_blockers[0]).toMatch(/Porte G5/);

    // Storage mode
    expect(health.storage.mode).toBe('persistent');
    expect(health.storage.persistent).toBe(true);
  });

  it('2. listKbPublications retourne l’historique des publications scellées avec SHA-256', async () => {
    const res = await client.listKbPublications('expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.length).toBeGreaterThanOrEqual(1);

    const firstPub = res.data![0];
    expect(firstPub.version).toBe('v1.0.0');
    expect(firstPub.snapshot_id).toMatch(/^snapshot-/);
    expect(firstPub.sha256_checksum).toHaveLength(64);
    expect(firstPub.storage_persistent).toBe(true);
  });

  it('3. publishKbDoctrine refuse l’action si l’acteur n’a pas le rôle kb:admin ou kb:maintain (403 Forbidden)', async () => {
    // peer@archinex.local ne possède que kb:review
    const res = await client.publishKbDoctrine(
      { changelog: 'Tentative de publication non autorisée' },
      'peer@archinex.local'
    );

    expect(res.status).toBe('forbidden');
    expect(res.error).toMatch(/Habilitation insuffisante/i);
  });

  it('4. publishKbDoctrine bloque la publication si les conditions de la Porte G7 ne sont pas remplies (409 Conflict)', async () => {
    // expert@archinex.local a kb:maintain, mais rev-003 est en retard
    const res = await client.publishKbDoctrine(
      { changelog: 'Publication prématurée' },
      'expert@archinex.local'
    );

    expect(res.status).toBe('conflict');
    expect(res.error).toMatch(/Conditions de la Porte G7 non remplies/i);
    expect(res.blockers).toBeDefined();
    expect(res.blockers!.length).toBeGreaterThanOrEqual(1);
  });

  it('5. publishKbDoctrine réussit lorsque les conditions de la Porte G7 sont satisfaites (201 Created)', async () => {
    // Résolution du blocage G5 : on retire ou valide la revue en retard
    fakeLlmops.state.inbox = fakeLlmops.state.inbox.filter((i) => !i.is_overdue);

    // Vérification de la santé mise à jour
    const healthRes = await client.getKbHealth('expert@archinex.local');
    expect(healthRes.data!.gate_g7_eligible).toBe(true);

    // Publication officielle
    const res = await client.publishKbDoctrine(
      { changelog: 'Publication officielle validant la Porte G7 avec audit de conformité NIS2' },
      'expert@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    const pub = res.data!;
    expect(pub.version).toBe('v1.2.0');
    expect(pub.snapshot_id).toMatch(/^snapshot-/);
    expect(pub.sha256_checksum).toHaveLength(64);
    expect(pub.changelog).toMatch(/NIS2/);
    expect(pub.published_by).toBe('expert@archinex.local');

    // Vérification de la présence dans la liste des publications
    const listRes = await client.listKbPublications('expert@archinex.local');
    expect(listRes.data![0].id).toBe(pub.id);
  });

  it('6. listKbCampaigns retourne la liste des campagnes d’enrichissement', async () => {
    const res = await client.listKbCampaigns('expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.length).toBeGreaterThanOrEqual(1);
    expect(res.data![0].domain).toBe('architecture');
  });

  it('7. createKbCampaign crée une nouvelle campagne d’enrichissement ciblée', async () => {
    const res = await client.createKbCampaign(
      {
        title: 'Campagne de Sécurisation des Secrets',
        domain: 'security',
        target_asset_type: 'control',
        target_count: 3,
        description: 'Définition des règles de gestion des certificats mTLS et clés KMS'
      },
      'expert@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.title).toBe('Campagne de Sécurisation des Secrets');
    expect(res.data!.domain).toBe('security');
    expect(res.data!.progress.current).toBe(0);
    expect(res.data!.progress.target).toBe(3);
    expect(res.data!.status).toBe('active');
  });

  it('8. updateKbCampaign incrémente la progression et termine la campagne lorsqu’atteinte', async () => {
    const campaignsRes = await client.listKbCampaigns('expert@archinex.local');
    const targetCamp = campaignsRes.data![0];

    const res = await client.updateKbCampaign(
      targetCamp.id,
      { progress_increment: 3 },
      'expert@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.progress.current).toBe(targetCamp.progress.target);
    expect(res.data!.status).toBe('completed');
  });
});
