import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import type { TestablePredicates } from '../../src/lib/types/llmops';

describe('Integration: Doctrine Workshop, Live Simulation, Regression & Submission (Lot A8)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  const expertEmail = `expert.maintainer.${Date.now()}@archinex.local`;
  const expertHandle = `@maint-${Date.now()}`;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer({
      owners: [
        {
          handle: expertHandle,
          name: 'Doctrine Maintainer',
          email: expertEmail,
          roles: ['kb:maintain', 'kb:review'],
          domains: ['security', 'cloud', 'architecture'],
          delegated: true
        }
      ]
    });

    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-a8-integ'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. Parcours complet : Chargement du gabarit et pré-remplissage des prédicats', async () => {
    const tmplRes = await client.getAssetTemplate('principle');
    expect(tmplRes.status).toBe('ok');
    expect(tmplRes.data).toBeDefined();

    const tmpl = tmplRes.data!;
    expect(tmpl.asset_type).toBe('principle');
    expect(tmpl.default_predicates.when).toContain('données critiques');
    expect(tmpl.default_predicates.expect).toContain('immuabilité');
  });

  it('2. Validation à blanc en direct avec analyse prévisionnelle des 7 contrôles', async () => {
    const predicates: TestablePredicates = {
      when: 'Pour tout échange de données inter-systèmes',
      expect: 'Le protocole mTLS avec certificats éphémères doit être imposé',
      requires: ['Autorité de certification interne'],
      forbids: ['Chiffrement obsolète ou absent']
    };

    const valRes = await client.validateCandidate({
      title: 'Sécurisation des Échanges Inter-Systèmes par mTLS',
      summary: 'Obligation de chiffrement mutuel et d’authentification forte.',
      domain: 'security',
      predicates
    });

    expect(valRes.status).toBe('ok');
    expect(valRes.data!.valid).toBe(true);
    expect(valRes.data!.all_checks_passed).toBe(true);
    expect(valRes.data!.checks.length).toBe(7);
  });

  it('3. Simulation d’impact mesurant précision et rappel sur le banc de référence', async () => {
    const simRes = await client.simulateClause({
      asset_type: 'control',
      title: 'Contrôle de Haute Disponibilité Multi-Régions',
      domain: 'cloud',
      predicates: {
        when: 'Dans tout déploiement de production critique',
        expect: 'La redondance multi-zones avec basculement automatique est obligatoire',
        forbids: ['Point unique de défaillance (SPOF)']
      }
    });

    expect(simRes.status).toBe('ok');
    const sim = simRes.data!;
    expect(sim.precision).toBeGreaterThanOrEqual(90);
    expect(sim.recall).toBeGreaterThanOrEqual(90);
    expect(sim.regression_detected).toBe(false);
    expect(sim.passed_cases).toBe(sim.total_cases);
  });

  it('4. Détection et alerte visuelle immédiate en cas de régression de rappel', async () => {
    const regRes = await client.simulateClause({
      asset_type: 'rule',
      title: 'Règle avec régression de compatibilité sur les nœuds existants',
      domain: 'cloud',
      predicates: {
        when: 'Condition provoquant une regression sur les cas de test',
        expect: 'Contrainte stricte non rétro-compatible',
        forbids: []
      }
    });

    expect(regRes.status).toBe('ok');
    const sim = regRes.data!;
    expect(sim.regression_detected).toBe(true);
    expect(sim.regression_details).toContain('régression de rappel');
  });

  it('5. Soumission formelle de la clause rédigée vers la boîte de réception des revues', async () => {
    // Soumission du candidat avec identité expert
    const submitRes = await fetch(`${fakeLlmops.url}/api/knowledge/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Actor-Email': expertEmail
      },
      body: JSON.stringify({
        kind: 'principle',
        title: 'Principe de Chiffrement Homomorphe Systématique',
        summary: 'Toutes les données au repos doivent être chiffrées de façon homomorphe.',
        rationale: 'Protection absolue contre la compromission des hyperviseurs',
        domain: 'security',
        author: expertEmail,
        production_mode: 'human-authored'
      })
    });

    expect(submitRes.status).toBe(201);
    const body = await submitRes.json();
    expect(body.data.id).toBeDefined();

    // Vérification que le candidat atterrit immédiatement dans l'inbox
    const inboxRes = await client.getReviewInbox(expertEmail, { domain: 'security' });
    expect(inboxRes.status).toBe('ok');
    const found = inboxRes.data!.find((i) => i.title.includes('Chiffrement Homomorphe Systématique'));
    expect(found).toBeDefined();
    expect(found?.domain).toBe('security');
  });

  it('6. Résilience et repli dégradé sans crash si le service LLMOps est hors-ligne', async () => {
    const offlineClient = new LLMOpsClient({
      baseUrl: 'http://127.0.0.1:1', // port fermé
      timeoutMs: 200
    });

    const tmplRes = await offlineClient.getAssetTemplate('principle');
    expect(tmplRes.status).toBe('unavailable');

    const valRes = await offlineClient.validateCandidate({ title: 'Test' });
    expect(valRes.status).toBe('unavailable');

    const simRes = await offlineClient.simulateClause({
      asset_type: 'principle',
      title: 'Test',
      domain: 'cloud',
      predicates: { when: 'A', expect: 'B' }
    });
    expect(simRes.status).toBe('unavailable');
  });
});
