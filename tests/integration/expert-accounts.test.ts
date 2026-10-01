import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import type { KbOwner, KbCandidate } from '../../src/lib/types/llmops';

describe('Integration: Expert Accounts, Identity Propagation & LLMOps Hub (Lot A6)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer({
      owners: [
        {
          handle: '@sec-lead',
          name: 'Security Lead',
          email: 'expert@archinex.local',
          roles: ['kb:review', 'kb:maintain'],
          domains: ['security', 'cloud'],
          delegated: true
        }
      ]
    });

    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-a6',
      defaultEngagement: 'test-engagement'
    });
  });

  afterAll(async () => {
    if (fakeLlmops) {
      await fakeLlmops.close();
    }
  });

  it('1. GET /api/knowledge/me propage strictement le header X-Actor-Email', async () => {
    const res = await client.getMe('expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data?.email).toBe('expert@archinex.local');
    expect(res.data?.handle).toBe('@sec-lead');
    expect(res.data?.kb_roles).toEqual(['kb:review', 'kb:maintain']);
    expect(res.data?.owned_domains).toEqual(['security', 'cloud']);
    expect(res.data?.delegated).toBe(true);
    expect(res.data?.pending_reviews).toBeGreaterThanOrEqual(1);
  });

  it('2. getMe renvoie un profil vierge sécurisé pour une identité sans délégation', async () => {
    const res = await client.getMe('architect@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data?.email).toBe('architect@archinex.local');
    expect(res.data?.handle).toBe('@architect');
    expect(res.data?.kb_roles).toEqual([]);
    expect(res.data?.delegated).toBe(false);
    expect(res.data?.pending_reviews).toBe(0);
  });

  it('3. getOwners et updateOwners synchronisent le registre avec LLMOps', async () => {
    const initial = await client.getOwners('admin@archinex.local');
    expect(initial.owners.length).toBe(1);
    expect(initial.owners[0].handle).toBe('@sec-lead');

    const updatedList: KbOwner[] = [
      ...initial.owners,
      {
        handle: '@compliance-lead',
        name: 'Compliance Officer',
        email: 'compliance@archinex.local',
        roles: ['kb:review', 'kb:evaluate'],
        domains: ['gdpr', 'nis2'],
        delegated: true
      }
    ];

    const putRes = await client.updateOwners(updatedList, 'admin@archinex.local');
    expect(putRes.success).toBe(true);
    expect(putRes.updated_count).toBe(2);

    // Vérifier l'état dans fakeLlmops
    const verified = await client.getOwners();
    expect(verified.owners.length).toBe(2);
    expect(verified.owners.find((o) => o.handle === '@compliance-lead')).toBeDefined();
  });

  it('4. submitCandidate propage X-Actor-Email lors de la soumission de candidats', async () => {
    const candidate: KbCandidate = {
      kind: 'new_asset',
      title: 'Anti-Affinity Cross-Zone Sovereign Rule',
      summary: 'Les composants critiques doivent être répartis sur des zones de disponibilité souveraines distinctes.',
      rationale: 'Exigence de résilience bancaire',
      source: {
        system: 'archinex',
        engagement: 'test-engagement',
        decision_id: 'dec-001',
        subject_id: 'sub-ha-01'
      },
      author: 'expert@archinex.local',
      author_role: 'security_architect',
      production_mode: 'human-authored'
    };

    const submitRes = await client.submitCandidate(candidate, 'expert@archinex.local');
    expect(submitRes.status).toBe('in_review');
    expect(submitRes.candidate_id).toBeDefined();

    const candidates = await client.listCandidates({ engagement: 'test-engagement' }, 'expert@archinex.local');
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[candidates.length - 1].title).toBe('Anti-Affinity Cross-Zone Sovereign Rule');
  });

  it('5. Résilience dégradée : repli gracieux sans crash si LLMOps est déconnecté', async () => {
    // Créer un client pointant sur un port injoignable
    const deadClient = new LLMOpsClient({
      baseUrl: 'http://127.0.0.1:59999',
      timeoutMs: 150
    });

    const meRes = await deadClient.getMe('expert@archinex.local');
    expect(meRes.status).toBe('ok');
    expect(meRes.data?.offline).toBe(true);
    expect(meRes.data?.email).toBe('expert@archinex.local');

    const ownersRes = await deadClient.getOwners();
    expect(ownersRes.offline).toBe(true);
    expect(ownersRes.owners).toEqual([]);

    const putRes = await deadClient.updateOwners([]);
    expect(putRes.success).toBe(false);
    expect(putRes.offline).toBe(true);
  });
});
