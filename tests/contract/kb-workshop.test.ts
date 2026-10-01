import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import type { KbAssetType } from '../../src/lib/types/llmops';

describe('Contract: Doctrine Workshop, Templates, Validation & Simulation (Lot A8)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer();
    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token-a8'
    });
  });

  afterAll(async () => {
    await fakeLlmops.close();
  });

  it('1. getAssetTemplate restitue les structures et prédicats pour tous les types d’actifs', async () => {
    const assetTypes: KbAssetType[] = [
      'principle',
      'pattern',
      'decision',
      'control',
      'glossary',
      'rule',
      'amendment'
    ];

    for (const type of assetTypes) {
      const res = await client.getAssetTemplate(type);
      expect(res.status).toBe('ok');
      expect(res.data).toBeDefined();
      expect(res.data!.asset_type).toBe(type);
      expect(res.data!.title).toBeDefined();
      expect(res.data!.default_predicates).toBeDefined();
      expect(res.data!.default_predicates.when).toBeDefined();
      expect(res.data!.default_predicates.expect).toBeDefined();
      expect(res.data!.skeleton).toBeDefined();
    }
  });

  it('2. getAssetTemplate renvoie 404 pour un type d’actif non supporté', async () => {
    const res = await client.getAssetTemplate('unknown_type' as any);
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/introuvable/i);
  });

  it('3. validateCandidate détecte les champs manquants lors de la validation à blanc', async () => {
    const res = await client.validateCandidate({
      title: '',
      summary: '',
      domain: ''
    });

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();
    expect(res.data!.valid).toBe(false);
    expect(res.data!.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('4. validateCandidate valide une clause conforme et calcule les 7 contrôles prévisionnels', async () => {
    const res = await client.validateCandidate({
      title: 'Ségrégation Matérielle des Enclaves de Calcul',
      domain: 'security',
      summary: 'Les calculs sensibles doivent s’exécuter dans des enclaves isolées matériellement.',
      predicates: {
        when: 'Pour tout traitement de données classifiées',
        expect: 'L’enclave matérielle dédiée doit être activée',
        requires: ['CPU certifié'],
        forbids: ['Conteneur partagé']
      }
    });

    expect(res.status).toBe('ok');
    expect(res.data!.valid).toBe(true);
    expect(res.data!.errors.length).toBe(0);
    expect(res.data!.checks.length).toBe(7);
    expect(res.data!.all_checks_passed).toBe(true);
  });

  it('5. simulateClause exécute le banc de test et calcule les taux de précision et de rappel', async () => {
    const res = await client.simulateClause({
      asset_type: 'principle',
      title: 'Principe de Tolérance aux Pannes et Redondance',
      domain: 'cloud',
      predicates: {
        when: 'Dans tout environnement distribué',
        expect: 'La redondance N+1 multi-nœuds avec réplication synchrone est requise',
        requires: ['Healthcheck'],
        forbids: ['Point unique de défaillance (SPOF)']
      }
    });

    expect(res.status).toBe('ok');
    expect(res.data).toBeDefined();

    const sim = res.data!;
    expect(sim.total_cases).toBeGreaterThanOrEqual(4);
    expect(sim.precision).toBeGreaterThanOrEqual(90);
    expect(sim.recall).toBeGreaterThanOrEqual(90);
    expect(sim.regression_detected).toBe(false);
    expect(sim.verdicts.length).toBe(sim.total_cases);

    // Vérifier les statuts des cas
    const supportVerdict = sim.verdicts.find((v) => v.expected === 'supports');
    expect(supportVerdict?.status).toBe('supports');
    expect(supportVerdict?.matched).toBe(true);

    const violateVerdict = sim.verdicts.find((v) => v.expected === 'violates');
    expect(violateVerdict?.status).toBe('violates');
    expect(violateVerdict?.matched).toBe(true);
  });

  it('6. simulateClause déclenche une alerte explicite en cas de régression du rappel', async () => {
    const res = await client.simulateClause({
      asset_type: 'rule',
      title: 'Règle stricte avec regression de compatibilité',
      domain: 'security',
      predicates: {
        when: 'Cas de regression simulé',
        expect: 'Contrainte stricte provoquant un faux négatif',
        forbids: []
      }
    });

    expect(res.status).toBe('ok');
    const sim = res.data!;
    expect(sim.regression_detected).toBe(true);
    expect(sim.regression_details).toBeDefined();
    expect(sim.regression_details).toMatch(/régression de rappel/i);
    expect(sim.recall).toBeLessThan(85);
  });
});
