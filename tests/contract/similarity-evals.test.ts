import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import {
  encodeToyBow,
  syncEmbeddingsWithLLMOps
} from '../../src/lib/server/similarity/embeddings';

describe('Contrat 1.11 : Évaluation de similarité FR/EN et calibration des seuils (A14 / Issue #16)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;
  const EVA = 'eva@example.org';
  const ALICE = 'alice@example.org';

  beforeEach(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'archinex-token'
    });
    // Add Alice (expert without kb:evaluate) and Eva (evaluator with kb:evaluate)
    fakeLlmops.state.owners.push(
      {
        handle: '@core-owner-architecture',
        name: '@core-owner-architecture',
        email: ALICE,
        roles: ['kb:review'],
        domains: ['architecture'],
        delegated: false
      },
      {
        handle: '@ciso-office',
        name: '@ciso-office',
        email: EVA,
        roles: ['kb:evaluate'],
        domains: ['security'],
        delegated: false
      }
    );
    await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });
  });

  afterEach(async () => {
    await fakeLlmops.close();
  });

  it('fournit le dataset bilingue FR/EN couvrant les 4 familles', async () => {
    const res = await client.getSimilarityDataset('similarity_v1');
    expect(res.status).toBe('ok');
    const cases = res.data!.cases;
    expect(cases.length).toBeGreaterThanOrEqual(16);

    const families = new Set(cases.map((c) => c.family));
    expect(families).toContain('cross_lingual');
    expect(families).toContain('same_words_different_subject');
    expect(families).toContain('same_topic_different_assumptions');
    expect(families).toContain('out_of_base');

    const languages = new Set(cases.map((c) => c.language));
    expect(languages).toContain('fr');
    expect(languages).toContain('en');

    // Les cas démarrent en état "proposed"
    expect(res.data!.validated).toBe(0);
  });

  it('exige le rôle kb:evaluate pour annoter et valider un cas', async () => {
    // Sans acteur -> 403
    const refusedNoActor = await client.patchSimilarityCase(
      'similarity_v1',
      'SIM-001',
      { annotation_status: 'validated' },
      ''
    );
    expect(refusedNoActor.status).toBe('error');

    // Alice (sans kb:evaluate) -> 403
    const refusedAlice = await client.patchSimilarityCase(
      'similarity_v1',
      'SIM-001',
      { annotation_status: 'validated' },
      ALICE
    );
    expect(refusedAlice.status).toBe('error');

    // Eva (avec kb:evaluate) -> succès 200
    const okEva = await client.patchSimilarityCase(
      'similarity_v1',
      'SIM-001',
      { annotation_status: 'validated' },
      EVA
    );
    expect(okEva.status).toBe('ok');
    expect(okEva.data?.annotation_status).toBe('validated');
    expect(okEva.data?.annotated_by).toBe('@ciso-office');
  });

  it('exécute un benchmark complet avec vecteurs calculés et recommande un seuil si 0 false strong', async () => {
    const dsRes = await client.getSimilarityDataset('similarity_v1');
    const cases = dsRes.data!.cases;

    // Calculer les vecteurs client pour chaque cas
    const vectors: Record<string, number[]> = {};
    for (const c of cases) {
      vectors[c.id] = encodeToyBow(c.query_text);
    }

    const runRes = await client.runSimilarityEvaluation(
      'similarity_v1',
      {
        model: 'toy-bow',
        vectors
      },
      EVA
    );

    expect(runRes.status).toBe('ok');
    const run = runRes.data!;
    expect(run.id).toBeDefined();
    expect(run.cases).toBe(cases.length);
    expect(run.by_family.cross_lingual).toBeDefined();
    expect(run.by_language.fr).toBeDefined();
    expect(run.by_language.en).toBeDefined();
    expect(run.sweep.length).toBeGreaterThan(5);

    // Récupérer le run par son identifiant
    const fetched = await client.getSimilarityRun('similarity_v1', run.id);
    expect(fetched.status).toBe('ok');
    expect(fetched.data?.run_by).toBe('@ciso-office');
  });

  it('bloque la recommandation de seuil en cas de faux positif fort sur sujet hors-base', async () => {
    const dsRes = await client.getSimilarityDataset('similarity_v1');
    const cases = dsRes.data!.cases;

    const vectors: Record<string, number[]> = {};
    for (const c of cases) {
      // Pour le cas hors base SIM-301, on injecte délibérément le vecteur de P-002 pour simuler un faux positif fort
      if (c.id === 'SIM-301') {
        const p002Text = fakeLlmops.state.embeddings['toy-bow'].items['P-002'].text;
        vectors[c.id] = encodeToyBow(p002Text);
      } else {
        vectors[c.id] = encodeToyBow(c.query_text);
      }
    }

    const runRes = await client.runSimilarityEvaluation(
      'similarity_v1',
      {
        model: 'toy-bow',
        vectors
      },
      EVA
    );

    expect(runRes.status).toBe('ok');
    const run = runRes.data!;
    expect(run.false_strong).toBeGreaterThan(0);
    // Le seuil recommandé est bloqué à null quand il y a des false strong
    expect(run.recommended_strong_threshold).toBeNull();
    expect(run.recommendation_note).toContain('no threshold');
  });
});
