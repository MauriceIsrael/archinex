import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render } from 'svelte/server';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { POST as runEvalBenchmarkEndpoint } from '../../src/routes/api/knowledge/evals/[datasetId]/runs/+server';
import EvalsPage from '../../src/routes/kb/evals/+page.svelte';

describe('Contract: Evals Benchmark check_option_v1 & Verdict Feedback (Lot A9 - Porte G6)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-a9'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. getEvalDataset restitue le jeu de données check_option_v1 avec ses cas de test', async () => {
    const res = await client.getEvalDataset('check_option_v1', 'expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.id).toBe('check_option_v1');
    expect(res.data!.total_cases).toBeGreaterThanOrEqual(5);
    expect(res.data!.human_annotated_count).toBeGreaterThanOrEqual(4);
    expect(res.data!.cases.length).toBeGreaterThanOrEqual(5);
  });

  it('2. getEvalDataset renvoie 404 pour un dataset inexistant', async () => {
    const res = await client.getEvalDataset('unknown_dataset', 'expert@archinex.local');

    expect(res.status).toBe('error');
    expect(res.error).toMatch(/introuvable/i);
  });

  it('3. annotateEvalTestCase permet à un expert kb:evaluate d’annoter un cas', async () => {
    // expert@archinex.local possède le rôle kb:evaluate
    const res = await client.annotateEvalTestCase(
      'check_option_v1',
      'case-05',
      {
        expected_status: 'violates',
        notes: 'Annotation confirmant la violation de résilience sans rate-limiting'
      },
      'expert@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.id).toBe('case-05');
    expect(res.data!.expected_status).toBe('violates');
    expect(res.data!.human_annotated).toBe(true);
    expect(res.data!.annotated_by).toBe('expert@archinex.local');
    expect(res.data!.notes).toMatch(/Annotation confirmant/);
  });

  it('4. annotateEvalTestCase refuse les modifications si l’expert n’a pas kb:evaluate (403 Forbidden)', async () => {
    // peer@archinex.local ne possède que le rôle kb:review
    const res = await client.annotateEvalTestCase(
      'check_option_v1',
      'case-01',
      {
        expected_status: 'supports'
      },
      'peer@archinex.local'
    );

    expect(res.status).toBe('forbidden');
    expect(res.error).toMatch(/rôle 'kb:evaluate' requis/i);
  });

  it('5. runEvalBenchmark exécute le banc et calcule le rappel réel strictement sur les cas humains', async () => {
    const res = await client.runEvalBenchmark('check_option_v1', 'expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.run_id).toBeDefined();
    expect(res.data!.human_verified_cases).toBeGreaterThan(0);
    expect(res.data!.actual_recall).toBeGreaterThanOrEqual(80);
    expect(res.data!.meets_target).toBe(true);
    expect(res.data!.precision).toBeGreaterThan(90);
    expect(res.data!.verdicts.length).toBe(res.data!.total_cases);
  });

  it('5b. runEvalBenchmark refuse l’exécution si l’expert n’a pas kb:evaluate (403 Forbidden)', async () => {
    // peer@archinex.local ne possède que kb:review
    const res = await client.runEvalBenchmark('check_option_v1', 'peer@archinex.local');

    expect(res.status).toBe('forbidden');
    expect(res.error).toMatch(/kb:evaluate/i);
  });

  it('5c. POST /api/knowledge/evals/:datasetId/runs renvoie HTTP 403 avec raison explicite en cas de refus', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'unauthorized',
          reason: "@admin needs the 'kb:evaluate' role."
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const res = await runEvalBenchmarkEndpoint({
      params: { datasetId: 'check_option_v1' },
      request: new Request('http://localhost/api/knowledge/evals/check_option_v1/runs', { method: 'POST' }),
      locals: {
        session: {
          user: {
            id: 'admin-id',
            email: 'admin@project1.org',
            name: 'Admin',
            role: 'admin'
          }
        }
      } as any
    } as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe('forbidden');
    expect(body.error).toContain("@admin needs the 'kb:evaluate' role.");
  });

  it('5d. Rendu SSR de /kb/evals affiche le mode lecture seule et désactive le benchmark pour un non-évaluateur', () => {
    const rendered = render(EvalsPage, {
      props: {
        data: {
          user: { id: 'admin-id', name: 'Admin User', email: 'admin@project1.org', role: 'admin' },
          expert: {
            kbHandle: '@admin',
            kbRoles: ['kb:admin', 'kb:review'],
            ownedDomains: [],
            canEvaluate: false
          },
          dataset: {
            id: 'check_option_v1',
            name: 'Options Check v1',
            version: '1.0',
            description: 'Test dataset',
            total_cases: 5,
            human_annotated_count: 3,
            cases: []
          },
          feedbacks: [],
          offline: false
        }
      }
    });

    expect(rendered.body).toContain('Lecture seule (rôle kb:evaluate requis)');
    expect(rendered.body).toContain('Mode Consultation (Lecture seule)');
    expect(rendered.body).toContain('disabled');
  });

  it('6. submitVerdictFeedback enregistre un désaccord et le convertit en cas de test si demandé', async () => {
    const res = await client.submitVerdictFeedback(
      {
        subject_id: 'sub-cloud-01',
        option_id: 'opt-vault-01',
        rule_id: 'CTRL-SEC-01',
        verdict_status: 'violates',
        disagree_rationale: 'Le coffre-fort de clés utilise un HSM conforme FIPS 140-3 certifié ANSSI.',
        suggested_action: 'add_test_case'
      },
      'architect@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.status).toBe('converted_to_test_case');
    expect(res.data!.converted_ref).toBeDefined();

    // Vérifie que le dataset check_option_v1 a bien reçu le nouveau cas
    const dataset = fakeLlmops.state.evalDatasets['check_option_v1'];
    const addedCase = dataset.cases.find((c) => c.id === res.data!.converted_ref);
    expect(addedCase).toBeDefined();
    expect(addedCase!.option_summary).toMatch(/HSM conforme FIPS 140-3/);
  });

  it('7. submitVerdictFeedback convertit un désaccord en proposition d’amendement doctrinal', async () => {
    const res = await client.submitVerdictFeedback(
      {
        subject_id: 'sub-db-02',
        option_id: 'opt-pg-async',
        rule_id: 'PAT-HA-01',
        verdict_status: 'violates',
        disagree_rationale: 'La réplication asynchrone est tolérée si un RPO < 60 secondes est explicitement accepté par le métier.',
        suggested_action: 'propose_amendment'
      },
      'architect@archinex.local'
    );

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.status).toBe('converted_to_amendment');
    expect(res.data!.converted_ref).toMatch(/^cand-amend-/);
  });

  it('8. listVerdictFeedbacks retourne l’historique des retours enregistrés', async () => {
    const res = await client.listVerdictFeedbacks('expert@archinex.local');

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.length).toBeGreaterThanOrEqual(2);
  });
});
