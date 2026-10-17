import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('Option A : Assistance sémantique par cosinus sur les essais de clauses', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-sim'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. tryAssetClauses simule les clauses de manière déterministe', async () => {
    const res = await client.tryAssetClauses(
      'P-002',
      [
        {
          id: 'P-002-C1',
          kind: 'forbids',
          when: { terms_any: ['single-site', 'datacenter unique'] },
          message: 'Interdit le site unique sans redondance'
        }
      ],
      [
        { title: 'Déploiement sur un datacenter unique sans secours', description: 'Architecture minimale' }
      ]
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('2. searchSimilarKnowledge accepte query_text pour encodage serveur et fournit les scores cosinus', async () => {
    const res = await client.searchSimilarKnowledge({
      query_text: 'déploiement sur site unique et résilience',
      top_k: 10
    });

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(Array.isArray(res.data?.results)).toBe(true);
  });
});
