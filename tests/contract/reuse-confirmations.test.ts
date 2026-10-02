import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import {
  encodeToyBow,
  computeSubjectFingerprint,
  syncEmbeddingsWithLLMOps
} from '../../src/lib/server/similarity/embeddings';

describe('Contrat 1.10 : Confirmation de réutilisation des décisions validées (A13 / Issue #15)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;
  const ARCHITECT = 'architect@customer-side.example';
  const ALICE = 'alice@example.org';
  const ADR_ASSUMPTIONS = [
    'The control plane handles fewer than 10000 managed devices.',
    'Every site keeps an out-of-band access path to its routers.'
  ];
  const FP = computeSubjectFingerprint('Restoration of network configuration after an outage');

  beforeEach(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'archinex-token'
    });
    // Add Alice as core owner
    fakeLlmops.state.owners.push({
      handle: '@core-owner-architecture',
      name: '@core-owner-architecture',
      email: ALICE,
      roles: ['kb:review', 'kb:maintain'],
      domains: ['architecture'],
      delegated: false
    });
  });

  afterEach(async () => {
    await fakeLlmops.close();
  });

  it('exige obligatoirement une personne humaine (X-Actor-Email) et attribue le jugement', async () => {
    const body = {
      subject_fingerprint: FP,
      subject_label: 'Restoration of network configuration after an outage',
      matched_ref: 'ADR-0001',
      model: 'toy-bow',
      scores: { vector: 0.93 },
      outcome: 'reused' as const,
      assumptions: ADR_ASSUMPTIONS.map((text) => ({ text, status: 'holds' as const }))
    };

    // Sans acteur humain -> 403
    const refused = await client.postReuseConfirmation(body, '');
    expect(refused.status).toBe('error');

    // Avec architecte externe -> succès et attribué email:architect
    const ok = await client.postReuseConfirmation(body, ARCHITECT);
    expect(ok.status).toBe('ok');
    expect(ok.data?.actor).toBe(`email:${ARCHITECT}`);
    expect(ok.data?.outcome).toBe('reused');
    expect(ok.data?.assumptions).toHaveLength(2);

    // Avec Alice experte enregistrée -> attribué @core-owner-architecture
    const okAlice = await client.postReuseConfirmation(body, ALICE);
    expect(okAlice.status).toBe('ok');
    expect(okAlice.data?.actor).toBe('@core-owner-architecture');
  });

  it('refuse le statut reused si une hypothèse documentée est manquante ou ne tient pas', async () => {
    // Une hypothèse manquante -> 409
    const missingOne = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Restoration of network configuration',
        matched_ref: 'ADR-0001',
        outcome: 'reused',
        assumptions: [{ text: ADR_ASSUMPTIONS[0], status: 'holds' }]
      },
      ARCHITECT
    );
    expect(missingOne.status).toBe('error');

    // Une hypothèse qui ne tient pas avec statut 'reused' -> 409 (doit être reused_with_exception)
    const failsWithReused = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Restoration of network configuration',
        matched_ref: 'ADR-0001',
        outcome: 'reused',
        assumptions: [
          { text: ADR_ASSUMPTIONS[0], status: 'holds' },
          { text: ADR_ASSUMPTIONS[1], status: 'does_not_hold' }
        ]
      },
      ARCHITECT
    );
    expect(failsWithReused.status).toBe('error');
  });

  it('valide reused_with_exception uniquement si motivé et si au moins une hypothèse faillit', async () => {
    const failingAssumptions = [
      { text: ADR_ASSUMPTIONS[0], status: 'holds' as const },
      { text: ADR_ASSUMPTIONS[1], status: 'does_not_hold' as const }
    ];

    // Sans commentaire -> 400
    const noComment = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Restoration of network configuration',
        matched_ref: 'ADR-0001',
        outcome: 'reused_with_exception',
        assumptions: failingAssumptions,
        comment: ''
      },
      ARCHITECT
    );
    expect(noComment.status).toBe('error');

    // Avec commentaire motivé -> 201 succès
    const withComment = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Restoration of network configuration',
        matched_ref: 'ADR-0001',
        outcome: 'reused_with_exception',
        assumptions: failingAssumptions,
        comment: 'Sites isolés couverts par une procédure manuelle de repli.'
      },
      ARCHITECT
    );
    expect(withComment.status).toBe('ok');
    expect(withComment.data?.outcome).toBe('reused_with_exception');

    // Si toutes les hypothèses tiennent, ce n'est pas une exception -> 409
    const allHoldException = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Restoration of network configuration',
        matched_ref: 'ADR-0001',
        outcome: 'reused_with_exception',
        assumptions: ADR_ASSUMPTIONS.map((text) => ({ text, status: 'holds' })),
        comment: 'Toutes les hypothèses tiennent quand même.'
      },
      ARCHITECT
    );
    expect(allHoldException.status).toBe('error');
  });

  it('exige une explication pour rejected_not_same et vérifie rejected_assumption_fails', async () => {
    // rejected_not_same sans commentaire -> 400
    const noReason = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Déploiement fibre',
        matched_ref: 'ADR-0001',
        outcome: 'rejected_not_same',
        assumptions: ADR_ASSUMPTIONS.map((text) => ({ text, status: 'holds' })),
        comment: ''
      },
      ARCHITECT
    );
    expect(noReason.status).toBe('error');

    // rejected_not_same avec commentaire -> succès
    const withReason = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Déploiement fibre',
        matched_ref: 'ADR-0001',
        outcome: 'rejected_not_same',
        assumptions: ADR_ASSUMPTIONS.map((text) => ({ text, status: 'holds' })),
        comment: 'Concerne le génie civil physique et non le plan logique réseau.'
      },
      ARCHITECT
    );
    expect(withReason.status).toBe('ok');

    // rejected_assumption_fails quand aucune ne faillit -> 409
    const nothingFails = await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Restoration of network configuration',
        matched_ref: 'ADR-0001',
        outcome: 'rejected_assumption_fails',
        assumptions: ADR_ASSUMPTIONS.map((text) => ({ text, status: 'holds' }))
      },
      ARCHITECT
    );
    expect(nothingFails.status).toBe('error');
  });

  it('intègre les jugements passés dans la recherche de similarité pour le même sujet', async () => {
    await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });

    // Enregistrer un jugement préalable
    await client.postReuseConfirmation(
      {
        subject_fingerprint: FP,
        subject_label: 'Restoration of network configuration',
        matched_ref: 'ADR-0001',
        outcome: 'reused',
        assumptions: ADR_ASSUMPTIONS.map((text) => ({ text, status: 'holds' }))
      },
      ALICE
    );

    // Recherche de similarité avec ce même fingerprint
    const vector = encodeToyBow('Restoration of network configuration after an outage');
    const searchRes = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector,
      subject_fingerprint: FP
    });

    expect(searchRes.status).toBe('ok');
    const adr = searchRes.data?.results.find((r) => r.ref === 'ADR-0001');
    expect(adr).toBeDefined();
    expect(adr?.judgements).toBeDefined();
    expect(adr?.judgements?.length).toBeGreaterThan(0);
    expect(adr?.judgements?.[0].actor).toBe('@core-owner-architecture');
    expect(adr?.judgements?.[0].outcome).toBe('reused');
    expect(adr?.reuse_summary?.reused).toBe(1);
  });
});
