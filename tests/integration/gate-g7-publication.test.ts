import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

describe('Integration: Parcours de Clôture & Publication Scellée Porte G7 (Lot A11)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'integration-token-a11'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('Parcours complet : Blocage Porte G7 -> Instruction des revues critiques -> Scellement cryptographique', async () => {
    const leadArchitectEmail = 'expert@archinex.local'; // Possède kb:maintain, kb:review, kb:evaluate

    // 1. Consultation initiale de l'état de santé
    const initialHealthRes = await client.getKbHealth(leadArchitectEmail);
    expect(initialHealthRes.status).toBe('ok');
    expect(initialHealthRes.data!.gate_g7_eligible).toBe(false);
    expect(initialHealthRes.data!.reviews_summary.overdue_count).toBe(1);

    // 2. Tentative de publication immédiate : doit échouer avec conflit 409
    const blockedPubRes = await client.publishKbDoctrine(
      { changelog: 'Publication hâtive sans résolution des revues' },
      leadArchitectEmail
    );
    expect(blockedPubRes.status).toBe('conflict');
    expect(blockedPubRes.blockers).toContain(
      'Porte G5 non satisfaite : 1 revue(s) critique(s) en retard'
    );

    // 3. Instruction de la revue en retard (rev-003 liée à cand-overdue-003)
    const reviewRes = await client.reviewCandidate(
      'cand-overdue-003',
      'accept',
      { reason: 'Dérogation accordée après validation par le RSSI.' },
      leadArchitectEmail
    );
    expect(reviewRes.status).toBe('ok');

    // Mise à jour de la boîte de réception dans le serveur simulé
    fakeLlmops.state.inbox = fakeLlmops.state.inbox.filter((i) => i.id !== 'rev-003');

    // 4. Vérification de l'éligibilité Porte G7
    const postHealthRes = await client.getKbHealth(leadArchitectEmail);
    expect(postHealthRes.status).toBe('ok');
    expect(postHealthRes.data!.reviews_summary.overdue_count).toBe(0);
    expect(postHealthRes.data!.evals_summary.gate_g6_passed).toBe(true);
    expect(postHealthRes.data!.gate_g7_eligible).toBe(true);
    expect(postHealthRes.data!.gate_g7_blockers).toHaveLength(0);

    // 5. Déclenchement de la publication scellée officielle
    const pubRes = await client.publishKbDoctrine(
      {
        changelog:
          'Publication officielle validant la Porte G7. Clôture des revues critiques et intégration de la doctrine de résilience.'
      },
      leadArchitectEmail
    );

    expect(pubRes.status).toBe('ok');
    expect(pubRes.data).toBeDefined();
    const publication = pubRes.data!;

    expect(publication.version).toBe('v1.2.0');
    expect(publication.snapshot_id).toMatch(/^snapshot-/);
    expect(publication.sha256_checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(publication.storage_persistent).toBe(true);

    // 6. Vérification dans l'historique complet des publications
    const allPubsRes = await client.listKbPublications(leadArchitectEmail);
    expect(allPubsRes.status).toBe('ok');
    expect(allPubsRes.data![0].id).toBe(publication.id);
    expect(allPubsRes.data![0].sha256_checksum).toBe(publication.sha256_checksum);
  });
});
