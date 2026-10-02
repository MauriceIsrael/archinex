/**
 * Tolérance zéro (D8) contre le VRAI serveur LLMOps : le serveur refuse toute confirmation de réutilisation
 * incohérente, et un refus n'enregistre RIEN. À lancer avec LLMOPS_LIVE_URL (scripts/contract_server.py).
 */
import { describe, it, expect } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { anonymizeSubjectText, computeSubjectFingerprint, encodeToyBow, syncEmbeddingsWithLLMOps } from '../../src/lib/server/similarity/embeddings';

const LIVE = process.env.LLMOPS_LIVE_URL;
const TOKEN = process.env.LLMOPS_LIVE_TOKEN || 'contract-service-token';
const ARCHITECT = 'alice@example.org';
const A1 = 'The control plane handles fewer than 10000 managed devices.';
const A2 = 'Every site keeps an out-of-band access path to its routers.';

describe.skipIf(!LIVE)('Contrat réel LLMOps — réutilisation : refus et mémoire (serveur vivant)', () => {
  const client = new LLMOpsClient({ baseUrl: LIVE, authToken: TOKEN });
  const fp = (n: string) => computeSubjectFingerprint(`sujet de test négatif ${n}`);
  const base = (fingerprint: string, extra: Record<string, unknown> = {}): any => ({
    subject_fingerprint: fingerprint,
    subject_label: 'Sujet de test négatif',
    matched_ref: 'ADR-0001',
    model: 'toy-bow',
    scores: { vector: 0.9 },
    ...extra
  });
  const count = async (fingerprint: string) => (await client.getReuseConfirmations({ subject_fingerprint: fingerprint })).data.length;

  async function expectRefused(body: any, actor = ARCHITECT) {
    const fingerprint = body.subject_fingerprint;
    const before = await count(fingerprint);
    const res = await client.postReuseConfirmation(body, actor);
    expect(res.status, JSON.stringify(res)).toBe('error');
    expect(await count(fingerprint)).toBe(before); // un refus n'enregistre rien
  }

  it('refuse « reused » quand une hypothèse ne tient pas', async () => {
    await expectRefused(base(fp('a'), { outcome: 'reused', assumptions: [{ text: A1, status: 'does_not_hold' }, { text: A2, status: 'holds' }] }));
  });

  it('refuse « reused » quand une hypothèse est inconnue', async () => {
    await expectRefused(base(fp('b'), { outcome: 'reused', assumptions: [{ text: A1, status: 'unknown' }, { text: A2, status: 'holds' }] }));
  });

  it('refuse un jugement incomplet ou portant sur d’autres hypothèses que celles de l’actif', async () => {
    await expectRefused(base(fp('c'), { outcome: 'reused', assumptions: [{ text: A1, status: 'holds' }] }));
    await expectRefused(base(fp('d'), { outcome: 'reused', assumptions: [{ text: A1, status: 'holds' }, { text: 'Une autre hypothèse.', status: 'holds' }] }));
  });

  it('refuse la réutilisation d’un actif sans hypothèses documentées', async () => {
    await expectRefused(base(fp('e'), { matched_ref: 'ADR-0002', outcome: 'reused', assumptions: [] }));
  });

  it('exige un commentaire pour une exception et une raison pour « pas le même sujet »', async () => {
    const both = [{ text: A1, status: 'unknown' }, { text: A2, status: 'holds' }];
    await expectRefused(base(fp('f'), { outcome: 'reused_with_exception', assumptions: both }));
    await expectRefused(base(fp('g'), { outcome: 'rejected_not_same', assumptions: [] }));
  });

  it('refuse sans acteur identifié', async () => {
    await expectRefused(base(fp('h'), { outcome: 'deferred', assumptions: [] }), '');
  });

  it('mémorise un rejet avec sa raison dans la recherche suivante', async () => {
    await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });
    const subject = 'Restauration de la configuration réseau après une panne';
    const anonymized = anonymizeSubjectText(subject);
    const fingerprint = computeSubjectFingerprint(anonymized);
    const reason = `Autre périmètre : accès physique ${Date.now()}`;

    const rejected = await client.postReuseConfirmation(
      base(fingerprint, { outcome: 'rejected_not_same', comment: reason, assumptions: [] }),
      ARCHITECT
    );
    expect(rejected.status, JSON.stringify(rejected)).toBe('ok');

    const search = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector: encodeToyBow(anonymized),
      query_text: anonymized,
      subject_fingerprint: fingerprint,
      top_k: 10
    });
    expect(search.status).toBe('ok');
    const adr = search.data!.results.find((r) => r.ref === 'ADR-0001');
    expect(adr, 'ADR-0001 doit être proposé').toBeDefined();
    expect(adr!.judgements?.some((j) => j.outcome === 'rejected_not_same' && j.comment === reason)).toBe(true);
    for (const r of search.data!.results) expect(r.requires_confirmation).toBe(true);
  });
});
