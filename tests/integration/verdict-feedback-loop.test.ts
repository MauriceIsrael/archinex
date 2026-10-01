import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('Integration: Boucle Complète Retour Débat -> Cas de Test -> Benchmark Porte G6 (Lot A9)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'integration-token-a9'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('Boucle fermée : contestation de verdict -> enrichissement de check_option_v1 -> validation G6', async () => {
    const architectEmail = 'architect.projet@archinex.local';
    const evalExpertEmail = 'expert@archinex.local';

    // 1. L'architecte signale un désaccord sur un verdict émis lors d'une délibération
    const feedbackRes = await client.submitVerdictFeedback(
      {
        subject_id: 'sub-identity-01',
        option_id: 'opt-keycloak-isolated',
        rule_id: 'CTRL-SEC-01',
        verdict_status: 'violates',
        disagree_rationale:
          'Keycloak est déployé en enclave souveraine étanche sans accès internet, le chiffrement symétrique AES-256-GCM est assuré par module HSM local.',
        suggested_action: 'add_test_case'
      },
      architectEmail
    );

    expect(feedbackRes.status).toBe('ok');
    expect(feedbackRes.data).toBeDefined();
    expect(feedbackRes.data!.status).toBe('converted_to_test_case');
    const createdCaseId = feedbackRes.data!.converted_ref!;
    expect(createdCaseId).toBeDefined();

    // 2. L'expert évaluateur consulte le dataset check_option_v1
    const datasetRes = await client.getEvalDataset('check_option_v1', evalExpertEmail);
    expect(datasetRes.status).toBe('ok');
    const newCase = datasetRes.data!.cases.find((c) => c.id === createdCaseId);
    expect(newCase).toBeDefined();
    expect(newCase!.expected_status).toBe('supports'); // Inversé par rapport au 'violates' contesté

    // 3. L'expert évaluateur valide et affine l'annotation du nouveau cas
    const annotateRes = await client.annotateEvalTestCase(
      'check_option_v1',
      createdCaseId,
      {
        expected_status: 'supports',
        notes: 'Enclave certifiée et HSM validé : cas déclaré conforme aux règles de doctrine.'
      },
      evalExpertEmail
    );
    expect(annotateRes.status).toBe('ok');
    expect(annotateRes.data!.human_annotated).toBe(true);

    // 4. Exécution du benchmark global de rappel pour la Porte G6
    const runRes = await client.runEvalBenchmark('check_option_v1', evalExpertEmail);

    expect(runRes.status).toBe('ok');
    expect(runRes.data).toBeDefined();
    expect(runRes.data!.human_verified_cases).toBeGreaterThanOrEqual(5);
    expect(runRes.data!.actual_recall).toBeGreaterThanOrEqual(80);
    expect(runRes.data!.meets_target).toBe(true);
    expect(runRes.data!.precision).toBeGreaterThanOrEqual(90);

    // Vérifie que le nouveau cas fait partie des verdicts du run
    const matchedVerdict = runRes.data!.verdicts.find((v) => v.case_id === createdCaseId);
    expect(matchedVerdict).toBeDefined();
    expect(matchedVerdict!.matched).toBe(true);
  });
});
