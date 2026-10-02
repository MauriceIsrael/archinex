/**
 * Tests de contrat vivants Archinex ⇄ LLMOps pour les lots A12 à A15.
 * Exécutés lorsque LLMOPS_LIVE_URL est configuré (ex: contre python scripts/contract_server.py --port 8099).
 *
 * Couvre les endpoints :
 *   - GET  /api/knowledge/embeddings/pending
 *   - PUT  /api/knowledge/embeddings
 *   - POST /api/knowledge/similar
 *   - POST /api/knowledge/reuse-confirmations
 *   - GET  /api/knowledge/reuse-confirmations
 *   - GET  /api/knowledge/similarity-evals/{dataset}
 *   - POST /api/knowledge/similarity-evals/{dataset}/runs
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import {
  encodeToyBow,
  computeSubjectFingerprint,
  anonymizeSubjectText,
  syncEmbeddingsWithLLMOps
} from '../../src/lib/server/similarity/embeddings';

const LIVE = process.env.LLMOPS_LIVE_URL;
const TOKEN = process.env.LLMOPS_LIVE_TOKEN || 'contract-service-token';

const ALICE = 'alice@example.org';
const EVA = 'eva@example.org'; // kb:evaluate
const MAINT = 'maint@example.org'; // kb:maintain + kb:admin
const ARCHITECT = 'lead@archinex.local';

describe.skipIf(!LIVE)('Contrat réel LLMOps — A12 à A15 (serveur vivant)', () => {
  const client = new LLMOpsClient({
    baseUrl: LIVE,
    authToken: TOKEN
  });

  const FP = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('A12 — GET /api/knowledge/embeddings/pending liste les actifs en attente', async () => {
    const res = await client.getEmbeddingsPending('toy-bow');
    expect(res.status).toBe('ok');
    expect(Array.isArray(res.pending)).toBe(true);
    // Avant dépôt ou après re-indexation, le serveur fournit des pending ou une liste vide
    if (res.pending.length > 0) {
      expect(res.pending[0].ref).toBeTruthy();
      expect(res.pending[0].text_sha256).toHaveLength(64);
    }
  });

  it('A12 — PUT /api/knowledge/embeddings dépose les vecteurs déterministes calculés', async () => {
    const syncRes = await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });
    expect(syncRes.status).toBe('ok');

    // Après synchronisation, plus aucun actif n'est en attente pour toy-bow
    const pendingAfter = await client.getEmbeddingsPending('toy-bow');
    expect(pendingAfter.status).toBe('ok');
    expect(pendingAfter.pending).toHaveLength(0);
  });

  it('A12 — POST /api/knowledge/similar recherche les connaissances similaires avec garde-fou D8', async () => {
    const query = 'P-002 Approbation humaine préalable aux remédiations automatiques du réseau.';
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

    // D8 : Chaque résultat impose obligatoirement requires_confirmation: true
    for (const r of results) {
      expect(r.requires_confirmation).toBe(true);
    }
  });

  it('A13 — POST & GET /api/knowledge/reuse-confirmations trace les décisions d’arbitrage humain', async () => {
    const body = {
      subject_fingerprint: FP,
      subject_label: 'Restoration of network configuration after incident',
      matched_ref: 'ADR-0001',
      model: 'toy-bow',
      scores: { vector: 0.92 },
      outcome: 'reused' as const,
      assumptions: [
        { text: 'The control plane handles fewer than 10000 managed devices.', status: 'holds' as const },
        { text: 'Every site keeps an out-of-band access path to its routers.', status: 'holds' as const }
      ]
    };

    // Refus sans acteur humain (X-Actor-Email absent)
    const refusedNoActor = await client.postReuseConfirmation(body, '');
    expect(refusedNoActor.status).toBe('error');

    // Succès avec acteur humain identifié
    const ok = await client.postReuseConfirmation(body, ARCHITECT);
    expect(ok.status, JSON.stringify(ok)).toBe('ok');
    expect(ok.data?.outcome).toBe('reused');
    expect(ok.data?.actor).toContain(ARCHITECT);

    // Consultation du journal de réutilisation
    const list = await client.getReuseConfirmations({ matched_ref: 'ADR-0001' });
    expect(list.status).toBe('ok');
    expect(Array.isArray(list.data)).toBe(true);
    expect(list.data.length).toBeGreaterThan(0);
  });

  it('A14 — GET /api/knowledge/similarity-evals/{id} fournit le dataset d’évaluation', async () => {
    const res = await client.getSimilarityDataset('similarity_v1');
    expect(res.status).toBe('ok');
    expect(res.data?.cases).toBeDefined();
    const cases = res.data!.cases;
    expect(cases.length).toBeGreaterThanOrEqual(16);

    const families = new Set(cases.map((c) => c.family));
    expect(families).toContain('cross_lingual');
    expect(families).toContain('same_words_different_subject');
  });

  it('A14 — POST /api/knowledge/similarity-evals/{id}/runs exécute le banc de similarité', async () => {
    const dataset = await client.getSimilarityDataset('similarity_v1');
    expect(dataset.status).toBe('ok');
    const cases = dataset.data!.cases;
    const vectors: Record<string, number[]> = {};
    for (const c of cases) {
      vectors[c.id] = encodeToyBow(c.query_text);
    }

    // Exécution du banc réservée aux évaluateurs (EVA)
    const runRes = await client.runSimilarityEvaluation(
      'similarity_v1',
      {
        model: 'toy-bow',
        vectors
      },
      EVA
    );
    expect(runRes.status, JSON.stringify(runRes)).toBe('ok');
    expect(runRes.data?.id).toBeDefined();
    expect(runRes.data?.cases).toBe(cases.length);
  });
});
