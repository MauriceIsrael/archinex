import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import {
  encodeToyBow,
  computeSubjectFingerprint,
  anonymizeSubjectText,
  syncEmbeddingsWithLLMOps
} from '../../src/lib/server/similarity/embeddings';

describe('Contrat 1.9 : Vecteurs sémantiques et recherche de similarité (A12 / Issue #14)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeEach(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'archinex-token'
    });
  });

  afterEach(async () => {
    await fakeLlmops.close();
  });

  it('liste les actifs en attente d’embeddings avec texte verbatim et SHA-256', async () => {
    const res = await client.getEmbeddingsPending('toy-bow');
    expect(res.status).toBe('ok');
    expect(res.pending.length).toBeGreaterThan(10);
    const p002 = res.pending.find((p) => p.ref === 'P-002');
    expect(p002).toBeDefined();
    expect(p002?.text_sha256).toHaveLength(64);
    expect(p002?.reason).toBe('missing');
  });

  it('calcule localement les vecteurs déterministes et dépose les embeddings', async () => {
    const syncRes = await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });
    expect(syncRes.status).toBe('ok');
    expect(syncRes.count).toBeGreaterThan(10);

    // Une fois déposés, la liste d’attente est vide pour ce modèle
    const pendingAfter = await client.getEmbeddingsPending('toy-bow');
    expect(pendingAfter.pending).toHaveLength(0);

    // Et le health rapporte les embeddings
    const health = await client.getKbHealth();
    expect(health.data).toBeDefined();
    expect(health.data?.embeddings).toBeDefined();
    const emb = health.data?.embeddings?.find((e: any) => e.model_id === 'toy-bow');
    expect(emb?.missing).toBe(0);
    expect(emb?.vectors).toBeGreaterThan(10);
  });

  it('recherche des actifs similaires sans jamais décider automatiquement (requires_confirmation: true)', async () => {
    await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });

    const query = 'P-002 Approbation humaine préalable aux remédiations. Les remédiations automatiques du réseau doivent être approuvées par un humain avant leur exécution.';
    const anonymized = anonymizeSubjectText(query);
    const vector = encodeToyBow(anonymized);
    const fp = computeSubjectFingerprint(anonymized);

    const searchRes = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector,
      query_text: anonymized,
      subject_fingerprint: fp,
      top_k: 5
    });

    expect(searchRes.status).toBe('ok');
    expect(searchRes.data?.results).toBeDefined();
    const results = searchRes.data!.results;
    expect(results.length).toBeGreaterThan(0);

    const top = results[0];
    expect(top.ref).toBe('P-002');
    expect(top.zone).toBe('strong');
    expect(top.score).toBeGreaterThan(0.9);

    // Décision D8 : toujours requires_confirmation === true
    for (const r of results) {
      expect(r.requires_confirmation).toBe(true);
    }

    // Statut des seuils : uncalibrated
    expect(searchRes.data?.config.status).toBe('uncalibrated');
  });

  it('filtre par type d’actif (ex: pattern uniquement)', async () => {
    await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });

    const vector = encodeToyBow('circuit breaker et bascule dégradée en cas de panne');
    const searchRes = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector,
      types: ['pattern']
    });

    expect(searchRes.status).toBe('ok');
    const results = searchRes.data!.results;
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.type).toBe('pattern');
    }
  });

  it('classe les actifs obsolètes en zone superseded et ne les présente jamais comme valides', async () => {
    await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });

    // Marquer P-002 comme superseded dans le store
    fakeLlmops.state.embeddings['toy-bow'].items['P-002'].status = 'superseded';

    const vector = encodeToyBow('Approbation humaine préalable aux remédiations');
    const res = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector
    });

    expect(res.status).toBe('ok');
    const p002 = res.data!.results.find((r) => r.ref === 'P-002');
    expect(p002).toBeDefined();
    expect(p002?.zone).toBe('superseded');
    expect(p002?.superseded_by).toBeDefined();
  });
});
