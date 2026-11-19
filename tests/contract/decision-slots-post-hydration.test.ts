import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProjectSlotRegistry } from '../../src/lib/server/edp/decisionSlotRegistry';

const TEST_PROJECT_ID = 'contract-decision-slots-post-hydration';

vi.mock('$lib/server/projects/projectAccess', () => ({
  authorizeProjectAccess: vi.fn(async (_event: unknown, projectId: string) => ({
    project: { id: projectId, title: 'Projet Test Hydratation Phase 5' },
    session: {
      user: {
        id: 'architect-1',
        email: 'architect@archinex.local',
        role: 'lead_architect'
      }
    }
  }))
}));

vi.mock('$lib/server/edp/projectHydrationContext', () => ({
  loadProjectHydrationContextFromDb: vi.fn(async () => ({
    projectTitle: 'Projet Test Hydratation Phase 5',
    title: 'Projet Test Hydratation Phase 5',
    problem: '[REQ-GIS-01] Déployer un serveur cartographique SIG / WMS / PostGIS hors-ligne.',
    commoditySlots: [
      {
        slotId: 'slot:urn:archinex:ontology:axis:gis_tile_engine',
        axisUrn: 'urn:archinex:ontology:axis:gis_tile_engine',
        title: 'Moteur de rendu cartographique & tuiles SIG',
        togafDomain: 'application' as const,
        documentEngineLayer: 'application',
        defaultLeafUrn: 'urn:archinex:ontology:application:gis:geoserver_postgis_offline',
        logicalComponentName: 'gis-server',
        coveredClauseIds: ['REQ-GIS-01'],
        coveredRawRefs: ['REQ-GIS-01'],
        status: 'default_proposed' as const
      }
    ],
    activeTogafDomains: ['application' as const],
    autoBindFromText: true
  }))
}));

import { GET, POST } from '../../src/routes/api/projects/[projectId]/decision-slots/+server';

function makeEvent<T extends typeof GET | typeof POST>(method: 'GET' | 'POST', body?: unknown): Parameters<T>[0] {
  const url = new URL(`http://localhost/api/projects/${TEST_PROJECT_ID}/decision-slots`);
  const request = new Request(url.toString(), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return {
    params: { projectId: TEST_PROJECT_ID },
    url,
    request
  } as unknown as Parameters<T>[0];
}

describe('POST /api/projects/[projectId]/decision-slots — hydratation DB sans coverageInput', () => {
  beforeEach(() => {
    resetProjectSlotRegistry(TEST_PROJECT_ID);
  });

  afterEach(() => {
    resetProjectSlotRegistry(TEST_PROJECT_ID);
  });

  it('ratifie un emplacement unitaire (sourceSlotIds[0]) hydraté depuis Prisma sans coverageInput dans le POST', async () => {
    const getRes = await GET(makeEvent('GET'));
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();

    const gisComp = getData.liveLockSnapshot.components.find(
      (c: { name: string }) => c.name === 'gis-server'
    );
    expect(gisComp).toBeDefined();
    expect(gisComp.lockStatus).toBe('default_proposed');
    expect(gisComp.sourceSlotIds.length).toBeGreaterThan(0);

    const targetSlotId = gisComp.sourceSlotIds[0];

    const postRes = await POST(
      makeEvent('POST', {
        action: 'ratify_batch',
        actorRole: 'lead_architect',
        slotIds: [targetSlotId],
        rationale: "Ratification unitaire explicite de l'emplacement depuis la Vue Architecture Lockée."
      })
    );
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.status).toBe('ok');
    expect(postData.receipt.ratifiedSlotIds).toContain(targetSlotId);

    const updatedGisComp = postData.liveLockSnapshot.components.find(
      (c: { name: string }) => c.name === 'gis-server'
    );
    expect(updatedGisComp).toBeDefined();
    expect(updatedGisComp.lockStatus).toBe('locked');
  });

  it('ratifie en lot (sans slotIds ni coverageInput) puis révoque un emplacement hydraté depuis Prisma', async () => {
    const batchRes = await POST(
      makeEvent('POST', {
        action: 'ratify_batch',
        actorRole: 'lead_architect',
        rationale: 'Ratification explicite des emplacements de commodité Type 2 en Phase 5.'
      })
    );
    expect(batchRes.status).toBe(200);
    const batchData = await batchRes.json();
    expect(batchData.status).toBe('ok');
    expect(batchData.receipt.ratifiedSlotIds).toContain(
      'slot:urn:archinex:ontology:axis:gis_tile_engine'
    );

    const unratifyRes = await POST(
      makeEvent('POST', {
        action: 'unratify_slot',
        actorRole: 'lead_architect',
        slotId: 'slot:urn:archinex:ontology:axis:gis_tile_engine',
        reason: 'Réouverture pour réévaluation.'
      })
    );
    expect(unratifyRes.status).toBe(200);
    const unratifyData = await unratifyRes.json();
    expect(unratifyData.status).toBe('ok');

    const reopenedGis = unratifyData.liveLockSnapshot.components.find(
      (c: { name: string }) => c.name === 'gis-server'
    );
    expect(reopenedGis).toBeDefined();
    expect(reopenedGis.lockStatus).toBe('default_proposed');
  });
});
