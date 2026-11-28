import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/server/prisma';
import {
  configureProjectReconciliation,
  reconcileProject,
  ReconciliationScheduler
} from '../../src/lib/server/edp/reconciliationJob';
import {
  getProjectDriftOverview,
  getProjectRealizationCoverage
} from '../../src/lib/server/edp/driftOverviewService';

const RUN_ID = `reconcile379_${Date.now()}`;
const PROJECT_ID = `proj_${RUN_ID}`;
const SUBJECT_ID = `sub_${RUN_ID}`;
const DECISION_ID = `dec_${RUN_ID}`;
const EDP_ID = `edp_${RUN_ID}`;
const SCOPE = `rec379`;

const FROZEN_INVENTORY = {
  subject_id: SUBJECT_ID,
  nautobot_planned_devices: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'node-alpha-01',
      device_type: 'Generic-Server-2U',
      role: 'compute',
      site: 'dc-north',
      status: 'planned',
      oob_ip: '10.50.0.10/24'
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'node-beta-02',
      device_type: 'Generic-Server-2U',
      role: 'compute',
      site: 'dc-north',
      status: 'planned',
      oob_ip: '10.50.0.11/24'
    }
  ]
};

const FROZEN_EDP_CONTENT = JSON.stringify({
  metadata: {
    id: EDP_ID,
    title: 'Socle de calcul générique',
    status: 'validated',
    revision: 2
  },
  decision_context: {
    problem: 'Déployer deux noeuds de calcul standardisés',
    decision: 'Provisionner 2 noeuds Generic-Server-2U sur dc-north',
    clause_refs: ['REQ-COMPUTE-01'],
    ontology_bindings: []
  },
  hydratedInventory: FROZEN_INVENTORY,
  lldOverrides: {}
});

function createSimulatedNautobotFetch(config: {
  reachable: boolean;
  devices?: any[];
  existingTags?: Array<{ name: string; content_types?: string[] }>;
  capturedUrls?: string[];
  delayMs?: number;
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    if (config.delayMs && config.delayMs > 0) {
      await new Promise((r) => setTimeout(r, config.delayMs));
    }
    if (!config.reachable) {
      throw new Error('ECONNREFUSED simulated Nautobot outage');
    }
    const urlStr = String(input);
    config.capturedUrls?.push(urlStr);
    const parsed = new URL(urlStr);
    const jsonResponse = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });

    // Reproduit STRICT_FILTERING = True de Nautobot 2.x : `tag` (singulier) => HTTP 400
    if (parsed.searchParams.has('tag')) {
      return jsonResponse({ tag: ['Unknown filter field'] }, 400);
    }

    if (parsed.pathname === '/api/status/') {
      return jsonResponse({ 'nautobot-version': '2.3.0' });
    }
    if (parsed.pathname === '/api/extras/tags/') {
      const nameFilter = parsed.searchParams.get('name');
      const allTags = config.existingTags ?? [];
      const results = nameFilter ? allTags.filter((t) => t.name === nameFilter) : allTags;
      return jsonResponse({ results });
    }

    const tagsParam = parsed.searchParams.get('tags');
    if (tagsParam) {
      const tagObj = (config.existingTags ?? []).find((t) => t.name === tagsParam);
      if (!tagObj) {
        return jsonResponse(
          { tags: [`Select a valid choice. ${tagsParam} is not one of the available choices.`] },
          400
        );
      }
    }

    if (parsed.pathname === '/api/dcim/devices/') {
      return jsonResponse({ results: config.devices ?? [] });
    }
    return jsonResponse({ results: [] });
  }) as typeof fetch;
}

describe('Issue #379 — Job de réconciliation périodique et vue Dérive', () => {
  beforeAll(async () => {
    await prisma.project.create({
      data: {
        id: PROJECT_ID,
        title: 'Projet Test Réconciliation 379',
        shortName: 'REC379',
        type: 'generic_blueprint',
        badge: 'TEST',
        description: 'Projet isolé pour tester la réconciliation périodique #379',
        strategy: JSON.stringify({
          nautobot: {
            url: 'https://nautobot.simulated.local',
            token: 'sim-token',
            isolationPrefix: SCOPE,
            isolateByProject: true
          }
        })
      }
    });

    await prisma.subject.create({
      data: {
        id: SUBJECT_ID,
        projectId: PROJECT_ID,
        sectionRef: 'SEC-379',
        name: 'Provisionnement noeuds génériques',
        deliberationStatus: 'decided'
      }
    });

    await prisma.executableDecisionPackage.create({
      data: {
        id: EDP_ID,
        decisionId: DECISION_ID,
        subjectId: SUBJECT_ID,
        revision: 2,
        status: 'validated',
        content: FROZEN_EDP_CONTENT,
        policyHash: 'hash-379',
        validatedAt: new Date('2026-11-21T08:00:00.000Z')
      }
    });
  });

  afterAll(async () => {
    await prisma.reconciliationRun.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.projectReconciliationState.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.driftFinding.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.executableDecisionPackage.deleteMany({ where: { subjectId: SUBJECT_ID } });
    await prisma.subject.deleteMany({ where: { projectId: PROJECT_ID } });
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
  });

  it('distingue « non vérifié » d’« aucune dérive » avant toute réconciliation et lors d’une panne Nautobot', async () => {
    const initialOverview = await getProjectDriftOverview(PROJECT_ID);
    expect(initialOverview.posture).toBe('unverified');
    expect(initialOverview.reconciliation.lastSuccessAt).toBeNull();

    // Panne de Nautobot -> état « non vérifié », pas « conforme »
    const outageRun = await reconcileProject(PROJECT_ID, {
      trigger: 'scheduled',
      fetchImpl: createSimulatedNautobotFetch({ reachable: false })
    });
    expect(outageRun.skipped).toBe(false);
    expect(outageRun.status).toBe('unverified');
    expect(outageRun.nautobotReachable).toBe(false);

    const afterOutage = await getProjectDriftOverview(PROJECT_ID);
    expect(afterOutage.posture).toBe('unverified');
    expect(afterOutage.reconciliation.consecutiveFailures).toBe(1);
    expect(afterOutage.reconciliation.lastSuccessAt).toBeNull();
  });

  it('reprend après panne, détecte écarts + réalisation (#399), et reste strictement idempotent', async () => {
    const t1 = new Date('2026-11-21T10:00:00.000Z');
    const simulatedDevices = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: `${SCOPE}--node-alpha-01`,
        device_type: { model: 'Generic-Server-2U' },
        role: { name: 'compute' },
        location: { name: 'dc-north' },
        status: { value: 'active' },
        last_updated: '2026-11-21T09:50:00.000Z',
        custom_fields: {
          archinex_project: PROJECT_ID,
          archinex_subject_id: SUBJECT_ID,
          archinex_decision_id: DECISION_ID,
          archinex_decision_revision: 2,
          archinex_clause_refs: ['REQ-COMPUTE-01'],
          oob_ip: '10.50.0.10/24',
          realized_status: 'active',
          realized_revision: 2,
          realized_by: 'connector-ref@1.0.0',
          realized_at: '2026-11-21T09:50:00.000Z',
          evidence_ref: 'https://ci.example/runs/101'
        }
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: `${SCOPE}--node-beta-02`,
        device_type: { model: 'Alt-Server-1U' }, // écart attribute_mismatch
        role: { name: 'compute' },
        location: { name: 'dc-north' },
        status: { value: 'active' }, // actif sans evidence_ref -> declared_unproven
        last_updated: '2026-11-21T09:40:00.000Z',
        custom_fields: {
          archinex_project: PROJECT_ID,
          archinex_subject_id: SUBJECT_ID,
          archinex_decision_id: DECISION_ID,
          archinex_decision_revision: 2,
          archinex_clause_refs: ['REQ-COMPUTE-01'],
          oob_ip: '10.50.0.11/24'
        }
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: `${SCOPE}--rogue-node-99`,
        device_type: { model: 'Unknown-Box' },
        status: { value: 'active' },
        last_updated: '2026-11-21T09:55:00.000Z',
        custom_fields: {} // non marqué -> hors décision
      }
    ];

    const fetchMock = createSimulatedNautobotFetch({
      reachable: true,
      devices: simulatedDevices
    });

    const firstRun = await reconcileProject(PROJECT_ID, {
      trigger: 'scheduled',
      fetchImpl: fetchMock,
      now: () => t1
    });

    expect(firstRun.status).toBe('succeeded');
    expect(firstRun.nautobotReachable).toBe(true);
    expect(firstRun.openFindingsCount).toBe(2); // device_type mismatch + rogue outOfDecision
    expect(firstRun.newFindingsCount).toBe(2);
    expect(firstRun.realizationSummary).toEqual({
      planned: 0,
      realized_proven: 1,
      declared_unproven: 1,
      unverified: 0,
      total: 2
    });

    // Idempotence : un second passage identique ne crée aucun doublon
    const secondRun = await reconcileProject(PROJECT_ID, {
      trigger: 'scheduled',
      fetchImpl: fetchMock,
      now: () => new Date('2026-11-21T10:02:00.000Z')
    });
    expect(secondRun.status).toBe('succeeded');
    expect(secondRun.openFindingsCount).toBe(2);
    expect(secondRun.newFindingsCount).toBe(0);
    expect(secondRun.resolvedFindingsCount).toBe(0);

    const overview = await getProjectDriftOverview(PROJECT_ID, {
      now: new Date('2026-11-21T10:05:00.000Z')
    });
    expect(overview.posture).toBe('drift_detected');
    expect(overview.reconciliation.consecutiveFailures).toBe(0);
    expect(overview.reconciliation.lastSuccessAgeMs).toBe(180_000); // 3 min
    expect(overview.indicators.outOfDecisionCount).toBe(1);
    expect(overview.indicators.outOfDecisionRatio).toBe(0.5);
    expect(overview.indicators.averageDetectionDelayMs).toBeGreaterThan(0);
    expect(overview.findings[0].nautobotUrl).toContain('https://nautobot.simulated.local/dcim/devices/');

    // Vérifier que getProjectRealizationCoverage alimente #402 avec les mêmes chiffres
    const coverage = await getProjectRealizationCoverage(PROJECT_ID, {
      now: new Date('2026-11-21T10:05:00.000Z')
    });
    expect(coverage.verified).toBe(true);
    expect(coverage.summary).toEqual(overview.realization.summary);

    // L'EDP figé en base n'a jamais été muté
    const edpAfter = await prisma.executableDecisionPackage.findUnique({ where: { id: EDP_ID } });
    expect(edpAfter?.content).toBe(FROZEN_EDP_CONTENT);
  });

  it('empêche les exécutions concurrentes grâce au verrou par projet', async () => {
    const slowFetch = createSimulatedNautobotFetch({
      reachable: true,
      devices: [],
      delayMs: 120
    });

    const p1 = reconcileProject(PROJECT_ID, { trigger: 'manual', fetchImpl: slowFetch });
    // Petit délai pour laisser p1 acquérir le verrou atomique
    await new Promise((r) => setTimeout(r, 25));
    const p2 = reconcileProject(PROJECT_ID, { trigger: 'scheduled', fetchImpl: slowFetch });

    const [r1, r2] = await Promise.all([p1, p2]);
    const skippedCount = [r1, r2].filter((r) => r.skipped && r.reason === 'locked').length;
    expect(skippedCount).toBe(1);
  });

  it('conserve lastSuccessAt lors d’une panne ultérieure et bascule l’état en non vérifié', async () => {
    // Restaurer d'abord un succès connu à T=10:10
    const tSuccess = new Date('2026-11-21T10:10:00.000Z');
    await reconcileProject(PROJECT_ID, {
      trigger: 'manual',
      fetchImpl: createSimulatedNautobotFetch({
        reachable: true,
        devices: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: `${SCOPE}--node-alpha-01`,
            device_type: { model: 'Generic-Server-2U' },
            role: { name: 'compute' },
            location: { name: 'dc-north' },
            status: { value: 'active' },
            custom_fields: {
              archinex_project: PROJECT_ID,
              archinex_subject_id: SUBJECT_ID,
              archinex_decision_id: DECISION_ID,
              archinex_decision_revision: 2,
              oob_ip: '10.50.0.10/24',
              realized_status: 'active',
              realized_revision: 2,
              evidence_ref: 'https://ci.example/runs/101'
            }
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: `${SCOPE}--node-beta-02`,
            device_type: { model: 'Generic-Server-2U' },
            role: { name: 'compute' },
            location: { name: 'dc-north' },
            status: { value: 'planned' },
            custom_fields: {
              archinex_project: PROJECT_ID,
              archinex_subject_id: SUBJECT_ID,
              archinex_decision_id: DECISION_ID,
              archinex_decision_revision: 2,
              oob_ip: '10.50.0.11/24'
            }
          }
        ]
      }),
      now: () => tSuccess
    });

    const cleanOverview = await getProjectDriftOverview(PROJECT_ID, {
      now: new Date('2026-11-21T10:12:00.000Z')
    });
    expect(cleanOverview.posture).toBe('no_drift');
    expect(cleanOverview.reconciliation.lastSuccessAt).toBe(tSuccess.toISOString());

    // Panne Nautobot à T=10:15
    const outageRes = await reconcileProject(PROJECT_ID, {
      trigger: 'scheduled',
      fetchImpl: createSimulatedNautobotFetch({ reachable: false }),
      now: () => new Date('2026-11-21T10:15:00.000Z')
    });
    expect(outageRes.status).toBe('unverified');

    const degradedOverview = await getProjectDriftOverview(PROJECT_ID, {
      now: new Date('2026-11-21T10:16:00.000Z')
    });
    expect(degradedOverview.posture).toBe('unverified');
    // lastSuccessAt est conservé !
    expect(degradedOverview.reconciliation.lastSuccessAt).toBe(tSuccess.toISOString());
    // Aucun objet ne reste « réalisé prouvé » quand la posture est non vérifiée
    expect(degradedOverview.realization.summary.realized_proven).toBe(0);
    expect(degradedOverview.realization.summary.unverified).toBe(2);
  });

  it('permet de configurer l’intervalle par projet et exécute uniquement les projets échus via le scheduler', async () => {
    await configureProjectReconciliation(PROJECT_ID, {
      enabled: true,
      intervalSeconds: 120,
      staleThresholdSeconds: 600
    });

    const state = await prisma.projectReconciliationState.findUnique({
      where: { projectId: PROJECT_ID }
    });
    expect(state?.intervalSeconds).toBe(120);
    expect(state?.staleThresholdSeconds).toBe(600);

    const scheduler = new ReconciliationScheduler({
      fetchImpl: createSimulatedNautobotFetch({ reachable: false }),
      now: () => new Date('2026-11-21T10:15:30.000Z') // seulement 30 s après 10:15:00 (< 120 s)
    });
    const earlyResults = await scheduler.runDueProjects();
    expect(earlyResults.some((r) => r.projectId === PROJECT_ID)).toBe(false);
  });

  it('envoie le filtre Nautobot 2.x `tags` (jamais `tag`) quand le tag projet existe, et reste sain si le tag est absent', async () => {
    const urlsWithTag: string[] = [];
    const runWithTag = await reconcileProject(PROJECT_ID, {
      trigger: 'manual',
      fetchImpl: createSimulatedNautobotFetch({
        reachable: true,
        existingTags: [
          {
            name: `project-${SCOPE}`,
            content_types: ['tenancy.tenant', 'dcim.device', 'ipam.prefix']
          }
        ],
        devices: [],
        capturedUrls: urlsWithTag
      }),
      now: () => new Date('2026-11-21T10:20:00.000Z')
    });
    expect(runWithTag.status).toBe('succeeded');
    expect(urlsWithTag.some((u) => u.includes('/api/dcim/devices/?limit=200&tags=project-rec379'))).toBe(true);
    expect(urlsWithTag.some((u) => u.includes('/api/ipam/vlans/?limit=200&tags='))).toBe(false);
    expect(urlsWithTag.some((u) => u.includes('&tag='))).toBe(false);

    const urlsWithoutTag: string[] = [];
    const runWithoutTag = await reconcileProject(PROJECT_ID, {
      trigger: 'manual',
      fetchImpl: createSimulatedNautobotFetch({
        reachable: true,
        existingTags: [],
        devices: [],
        capturedUrls: urlsWithoutTag
      }),
      now: () => new Date('2026-11-21T10:25:00.000Z')
    });
    expect(runWithoutTag.status).toBe('succeeded');
    expect(urlsWithoutTag.some((u) => u.includes('/api/dcim/devices/?limit=200'))).toBe(true);
    expect(urlsWithoutTag.some((u) => u.includes('&tags='))).toBe(false);
    expect(urlsWithoutTag.some((u) => u.includes('&tag='))).toBe(false);
  });
});
