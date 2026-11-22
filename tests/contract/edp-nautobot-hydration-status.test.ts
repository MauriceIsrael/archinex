import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$lib/server/projects/projectAccess', () => ({
  authorizeProjectAccess: vi.fn(async (_event: unknown, projectId: string) => ({
    project: { id: projectId, title: 'Projet Test Hydratation Nautobot' },
    session: {
      user: {
        id: 'architect-1',
        email: 'architect@archinex.local',
        role: 'lead_architect'
      }
    }
  }))
}));

vi.mock('$lib/server/prisma', () => ({
  prisma: {
    subject: {
      findUnique: vi.fn(async () => ({
        id: 'sub-test',
        title: 'Cluster Sylva Bare-Metal',
        problem: 'Provisionnement bare-metal',
        decisionText: 'Déploiement cluster workload Sylva',
        structuredFacts: null,
        statements: []
      }))
    },
    project: {
      findUnique: vi.fn(async () => ({
        id: 'proj-test',
        shortName: 'test',
        strategy: null
      }))
    },
    executableDecisionPackage: {
      findFirst: vi.fn(async () => null)
    }
  }
}));

import { loadOntologyCatalog } from '../../src/lib/server/edp/ontologyClient.js';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration
} from '../../src/lib/server/edp/refinementCoverage.js';
import {
  syncHydratedInventoryToNautobot,
  pullLiveInventoryFromNautobot
} from '../../src/lib/server/edp/nautobotSync.js';
import { POST } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/edp/+server.js';

describe('Hydratation Nautobot — Statut et gestion de l’indisponibilité', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('syncHydratedInventoryToNautobot signale reachable=false et une erreur explicite si Nautobot est arrêté', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: false });
    const coverage = computeRefinementCoverage(
      {
        subjectId: 'sub-unreachable',
        title: 'Cluster Sylva Bare-Metal',
        problem: 'Provisionnement bare-metal et réseau',
        decisionText: 'Déploiement cluster workload Sylva avec synchronisation Nautobot',
        autoBindFromText: true
      },
      catalog
    );
    const hydrated = composeMultiAxisHydration('sub-unreachable', coverage.composedBindings, catalog);

    const unreachableFetch = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8080');
    }) as unknown as typeof fetch;

    const summary = await syncHydratedInventoryToNautobot(hydrated, {
      baseUrl: 'http://127.0.0.1:8080',
      fetchImpl: unreachableFetch
    });

    expect(summary.reachable).toBe(false);
    expect(summary.devicesSynced).toBe(0);
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.errors[0]).toContain('Nautobot injoignable');
    expect(summary.errors[0]).toContain('ECONNREFUSED');
  });

  it('pullLiveInventoryFromNautobot signale reachable=false et une erreur explicite si Nautobot est arrêté', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: false });
    const coverage = computeRefinementCoverage(
      {
        subjectId: 'sub-unreachable-pull',
        title: 'Cluster Sylva Bare-Metal',
        problem: 'Provisionnement bare-metal',
        decisionText: 'Déploiement cluster workload Sylva',
        autoBindFromText: true
      },
      catalog
    );
    const hydrated = composeMultiAxisHydration(
      'sub-unreachable-pull',
      coverage.composedBindings,
      catalog
    );

    const unreachableFetch = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8080');
    }) as unknown as typeof fetch;

    const result = await pullLiveInventoryFromNautobot(hydrated, {
      baseUrl: 'http://127.0.0.1:8080',
      fetchImpl: unreachableFetch
    });

    expect(result.reachable).toBe(false);
    expect(result.source).toBe('local_fallback');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Nautobot injoignable');
  });

  it('POST /api/.../edp (action=hydrate) retourne notificationType=warning, success=false et un message clair quand Nautobot est arrêté', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:8080')
    );

    const request = new Request(
      'http://localhost/api/projects/proj-test/subjects/sub-test/edp?edp=1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hydrate',
          edpId: 'EDP-sub-test'
        })
      }
    );

    const response = await POST({
      params: { projectId: 'proj-test', subjectId: 'sub-test' },
      request
    } as any);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.nautobotSynced).toBe(false);
    expect(data.success).toBe(false);
    expect(data.notificationType).toBe('warning');
    expect(data.message).toContain('Nautobot injoignable');
    expect(data.nautobotSyncSummary?.reachable).toBe(false);
    expect(data.nautobotSyncSummary?.errors?.length).toBeGreaterThan(0);
  });
});
