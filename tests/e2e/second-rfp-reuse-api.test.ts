import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import {
  encodeToyBow,
  computeSubjectFingerprint,
  anonymizeSubjectText,
  syncEmbeddingsWithLLMOps
} from '../../src/lib/server/similarity/embeddings';
import {
  shredRfpTextToClauses,
  SAMPLE_RFP_TEMPLATES
} from '../../src/lib/domain/rfpConfrontation';

describe('E2E API : « Deuxième RFP » — reconnaissance de sujets validés, confirmation d’hypothèses et zéro réutilisation silencieuse (Issue #17 / A15)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;
  const LEAD_ARCHITECT = 'lead@archinex.local';
  const CORE_OWNER = 'alice@example.org';

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'archinex-token'
    });

    // Enregistrer Alice comme Core Owner
    fakeLlmops.state.owners.push({
      handle: '@core-owner-architecture',
      name: 'Alice Core Owner',
      email: CORE_OWNER,
      roles: ['kb:review', 'kb:maintain'],
      domains: ['network-automation', 'gitops', 'architecture'],
      delegated: false
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('Phase 1 : Synchronisation initiale des vecteurs sémantiques vers LLMOps', async () => {
    // 1. Actifs en attente
    const pending = await client.getEmbeddingsPending('toy-bow');
    expect(pending.status).toBe('ok');
    expect(pending.pending.length).toBeGreaterThan(0);
    const adrPending = pending.pending.find((p) => p.ref === 'ADR-0001');
    expect(adrPending).toBeDefined();

    // 2. Synchronisation par lots
    const syncRes = await syncEmbeddingsWithLLMOps(client, { model: 'toy-bow' });
    expect(syncRes.status).toBe('ok');
    expect(syncRes.count).toBeGreaterThan(10);

    // 3. Contrôle de santé KB (embeddings actifs)
    const health = await client.getKbHealth();
    expect(health.status).toBe('ok');
    const embHealth = health.data?.embeddings?.find((e: any) => e.model_id === 'toy-bow');
    expect(embHealth).toBeDefined();
    expect(embHealth?.missing).toBe(0);
    expect(embHealth?.vectors).toBeGreaterThan(10);
  });

  it('Phase 2 : Dépouillement du Deuxième RFP et extraction des clauses', () => {
    const tmpl = SAMPLE_RFP_TEMPLATES.find((t) => t.id === 'rfp-second-loop');
    expect(tmpl).toBeDefined();

    const clauses = shredRfpTextToClauses(tmpl!.text);
    expect(clauses.length).toBe(3);

    // Clause 1.1 : GitOps & Restauration
    expect(clauses[0].clauseRef).toBe('§1.1');
    expect(clauses[0].text).toContain('Git');
    expect(clauses[0].text).toContain('Restoration of network configuration after an outage');

    // Clause 2.1 : Validation humaine
    expect(clauses[1].clauseRef).toBe('§2.1');
    expect(clauses[1].text).toContain('remédiations automatiques');

    // Clause 3.1 : Accès indépendant
    expect(clauses[2].clauseRef).toBe('§3.1');
    expect(clauses[2].text).toContain('accès de secours indépendant');
  });

  it('Phase 3 : Détection de similarité sémantique pour Clause 1.1 -> ADR-0001 en Zone Forte', async () => {
    const clause1Text = 'La configuration du réseau doit être versionnée dans Git et déployée uniquement par pipeline. Restoration of network configuration after an outage.';
    const cleanText = anonymizeSubjectText(clause1Text);
    const vector = encodeToyBow(cleanText);
    const fp = computeSubjectFingerprint(cleanText);

    const searchRes = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector,
      query_text: cleanText,
      subject_fingerprint: fp,
      top_k: 5
    });

    expect(searchRes.status).toBe('ok');
    expect(searchRes.data?.results).toBeDefined();
    const results = searchRes.data!.results;
    expect(results.length).toBeGreaterThan(0);

    // L'actif le plus proche est ADR-0001
    const adr = results.find((r) => r.ref === 'ADR-0001');
    expect(adr).toBeDefined();
    expect(adr?.zone).toBe('strong');
    expect(adr?.score).toBeGreaterThanOrEqual(0.80);

    // INVARIANT D8 : requires_confirmation DOIT être true
    expect(adr?.requires_confirmation).toBe(true);

    // Les hypothèses documentées de ADR-0001 sont restituées
    expect(adr?.assumptions).toBeDefined();
    expect(adr?.assumptions.length).toBe(2);
    expect(adr?.assumptions[0]).toBe('The control plane handles fewer than 10000 managed devices.');
    expect(adr?.assumptions[1]).toBe('Every site keeps an out-of-band access path to its routers.');
  });

  it('Phase 4 : Règle D8 — Jamais de faux positif silencieux, validation stricte des hypothèses', async () => {
    const clause1Text = 'La configuration du réseau doit être versionnée dans Git et déployée uniquement par pipeline. Restoration of network configuration after an outage.';
    const fp = computeSubjectFingerprint(anonymizeSubjectText(clause1Text));

    const adrAssumptions = [
      'The control plane handles fewer than 10000 managed devices.',
      'Every site keeps an out-of-band access path to its routers.'
    ];

    // Tentative 1 : Réutilisation sans confirmation explicite d'une des hypothèses -> REFUS 409
    const incompleteConfirmation = await client.postReuseConfirmation(
      {
        subject_fingerprint: fp,
        subject_label: 'Restauration Réseau Automatisée',
        matched_ref: 'ADR-0001',
        outcome: 'reused',
        assumptions: [{ text: adrAssumptions[0], status: 'holds' }]
      },
      LEAD_ARCHITECT
    );
    expect(incompleteConfirmation.status).toBe('error');

    // Tentative 2 : Statut "reused" alors qu'une hypothèse faillit -> REFUS 409
    const conflictingReused = await client.postReuseConfirmation(
      {
        subject_fingerprint: fp,
        subject_label: 'Restauration Réseau Automatisée',
        matched_ref: 'ADR-0001',
        outcome: 'reused',
        assumptions: [
          { text: adrAssumptions[0], status: 'holds' },
          { text: adrAssumptions[1], status: 'does_not_hold' }
        ]
      },
      LEAD_ARCHITECT
    );
    expect(conflictingReused.status).toBe('error');

    // Tentative 3 : Réutilisation avec exception sans justification -> REFUS 400
    const noCommentException = await client.postReuseConfirmation(
      {
        subject_fingerprint: fp,
        subject_label: 'Restauration Réseau Automatisée',
        matched_ref: 'ADR-0001',
        outcome: 'reused_with_exception',
        assumptions: [
          { text: adrAssumptions[0], status: 'holds' },
          { text: adrAssumptions[1], status: 'does_not_hold' }
        ],
        comment: ''
      },
      LEAD_ARCHITECT
    );
    expect(noCommentException.status).toBe('error');

    // Succès : Confirmation valide avec validation de toutes les hypothèses par l'architecte
    const validConfirmation = await client.postReuseConfirmation(
      {
        subject_fingerprint: fp,
        subject_label: 'Déploiement et Restauration Automatisée des Équipements Réseau',
        matched_ref: 'ADR-0001',
        outcome: 'reused',
        assumptions: adrAssumptions.map((text) => ({ text, status: 'holds' })),
        comment: 'Validation en comité d’architecture pour le 2e RFP.'
      },
      LEAD_ARCHITECT
    );

    expect(validConfirmation.status).toBe('ok');
    expect(validConfirmation.data?.outcome).toBe('reused');
    expect(validConfirmation.data?.actor).toBe(`email:${LEAD_ARCHITECT}`);
    expect(validConfirmation.data?.assumptions).toHaveLength(2);
  });

  it('Phase 5 : Traçabilité et historique d’arbitrage alimentés pour les recherches ultérieures', async () => {
    const clause1Text = 'La configuration du réseau doit être versionnée dans Git et déployée uniquement par pipeline. Restoration of network configuration after an outage.';
    const cleanText = anonymizeSubjectText(clause1Text);
    const vector = encodeToyBow(cleanText);
    const fp = computeSubjectFingerprint(cleanText);

    // Nouvelle recherche de similarité avec le même fingerprint
    const searchRes = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector,
      query_text: cleanText,
      subject_fingerprint: fp
    });

    expect(searchRes.status).toBe('ok');
    const adr = searchRes.data?.results.find((r) => r.ref === 'ADR-0001');
    expect(adr).toBeDefined();

    // L'historique d'arbitrage de ce sujet porte le jugement précédent
    expect(adr?.judgements).toBeDefined();
    expect(adr?.judgements?.length).toBeGreaterThan(0);
    const past = adr?.judgements?.find((j) => j.actor === `email:${LEAD_ARCHITECT}`);
    expect(past).toBeDefined();
    expect(past?.outcome).toBe('reused');
    expect(adr?.reuse_summary?.reused).toBeGreaterThanOrEqual(1);
  });

  it('Phase 6 : Confirmation pour la Clause 2.1 -> P-002 avec mesure compensatoire (reused_with_exception)', async () => {
    const clause2Text = 'Les remédiations automatiques du réseau doivent être approuvées par un humain avant leur exécution.';
    const cleanText = anonymizeSubjectText(clause2Text);
    const vector = encodeToyBow(cleanText);
    const fp = computeSubjectFingerprint(cleanText);

    const searchRes = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector,
      query_text: cleanText,
      subject_fingerprint: fp
    });

    expect(searchRes.status).toBe('ok');
    const p002 = searchRes.data?.results.find((r) => r.ref === 'P-002');
    expect(p002).toBeDefined();
    expect(['strong', 'possible']).toContain(p002?.zone);

    // P-002 a l'hypothèse : "Un exploitant qualifié est joignable 24/7..."
    expect(p002?.assumptions).toBeDefined();
    expect(p002?.assumptions[0]).toContain('exploitant qualifié');

    // Arbitrage avec exception documentée par Alice (@core-owner-architecture)
    const exceptionConfirm = await client.postReuseConfirmation(
      {
        subject_fingerprint: fp,
        subject_label: 'Contrôle Opérateur et Remédiation',
        matched_ref: 'P-002',
        outcome: 'reused_with_exception',
        assumptions: [
          {
            text: p002!.assumptions[0],
            status: 'does_not_hold',
            note: 'Permanence assurée par astreinte de 30 min la nuit, pas de présence en salle 24/7'
          }
        ],
        comment: 'Mesure compensatoire validée : mise en file d’attente sécurisée des remédiations non urgentes la nuit.'
      },
      CORE_OWNER
    );

    expect(exceptionConfirm.status).toBe('ok');
    expect(exceptionConfirm.data?.outcome).toBe('reused_with_exception');
    expect(exceptionConfirm.data?.actor).toBe('Alice Core Owner');
  });

  it('Phase 7 : Zéro faux positif sur un sujet hors-périmètre (out of base)', async () => {
    const offTopic = 'The supplier shall deliver a printed user manual in three languages with each shipment.';
    const cleanText = anonymizeSubjectText(offTopic);
    const vector = encodeToyBow(cleanText);

    const searchRes = await client.searchSimilarKnowledge({
      model: 'toy-bow',
      vector,
      query_text: cleanText
    });

    expect(searchRes.status).toBe('ok');
    const results = searchRes.data?.results || [];

    // Aucun actif en zone forte
    const strongMatches = results.filter((r) => r.zone === 'strong');
    expect(strongMatches).toHaveLength(0);

    // Tous les résultats exigent une confirmation (jamais d'application automatique)
    for (const r of results) {
      expect(r.requires_confirmation).toBe(true);
    }
  });
});
