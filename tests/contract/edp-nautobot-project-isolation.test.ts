import { describe, it, expect } from 'vitest';
import { loadOntologyCatalog } from '../../src/lib/server/edp/ontologyClient.js';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration
} from '../../src/lib/server/edp/refinementCoverage.js';
import {
  syncHydratedInventoryToNautobot,
  pullLiveInventoryFromNautobot,
  resolveProjectNautobotOptions,
  normalizeProjectScope,
  scopedNautobotName,
  unscopeNautobotName
} from '../../src/lib/server/edp/nautobotSync.js';

interface MockRecord {
  id: string;
  [key: string]: any;
}

function createInMemoryNautobotFetch() {
  const store: Record<string, MockRecord[]> = {
    '/api/extras/statuses/': [
      { id: 'st-planned', name: 'Planned' },
      { id: 'st-active', name: 'Active' }
    ],
    '/api/dcim/locations/': [
      { id: 'loc-1', name: 'pop-valmondois', location_type: { id: 'lt-site' } }
    ],
    '/api/ipam/namespaces/': [{ id: 'ns-global', name: 'Global' }],
    '/api/ipam/vlan-groups/': [],
    '/api/extras/tags/': [],
    '/api/extras/roles/': [],
    '/api/tenancy/tenants/': [],
    '/api/ipam/vrfs/': [],
    '/api/circuits/providers/': [],
    '/api/circuits/circuit-types/': [],
    '/api/circuits/circuits/': [],
    '/api/circuits/circuit-terminations/': [],
    '/api/ipam/vlans/': [],
    '/api/ipam/prefixes/': [],
    '/api/ipam/ip-addresses/': [],
    '/api/ipam/ip-address-to-interface/': [],
    '/api/dcim/manufacturers/': [],
    '/api/dcim/device-types/': [],
    '/api/dcim/platforms/': [],
    '/api/dcim/devices/': [],
    '/api/dcim/interfaces/': [],
    '/api/vpn/ike-proposals/': [],
    '/api/vpn/ipsec-proposals/': [],
    '/api/vpn/vpn-profiles/': [],
    '/api/vpn/vpn-tunnels/': []
  };

  let seq = 1;

  const fetchImpl: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const url = new URL(rawUrl);
    const path = url.pathname;
    const method = (init?.method || 'GET').toUpperCase();

    if (path === '/api/status/') {
      return new Response(JSON.stringify({ 'nautobot-version': '2.3.0' }), { status: 200 });
    }

    // PATCH /api/.../<id>/
    const patchMatch = path.match(/^(\/api\/[^/]+\/[^/]+\/)([^/]+)\/$/);
    if (method === 'PATCH' && patchMatch) {
      const collection = patchMatch[1];
      const id = patchMatch[2];
      const list = store[collection] || [];
      const idx = list.findIndex((r) => String(r.id) === id);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...body };
        return new Response(JSON.stringify(list[idx]), { status: 200 });
      }
      return new Response(JSON.stringify({ id, ...body }), { status: 200 });
    }

    const list = store[path] || (store[path] = []);

    if (method === 'GET') {
      let results = [...list];
      const tag = url.searchParams.get('tag');
      if (tag) {
        results = results.filter((r) =>
          Array.isArray(r.tags) && r.tags.some((t: any) => t?.name === tag || t === tag)
        );
      }
      for (const key of ['name', 'cid', 'model', 'vid', 'prefix', 'address', 'namespace', 'vlan_group', 'device_id', 'circuit', 'term_side']) {
        const val = url.searchParams.get(key);
        if (val !== null) {
          results = results.filter((r) => String(r[key]) === val);
        }
      }
      if (path === '/api/dcim/devices/') {
        results = results.map((r) => {
          const dt = store['/api/dcim/device-types/'].find((x) => x.id === r.device_type);
          const st = store['/api/extras/statuses/'].find((x) => x.id === r.status);
          return {
            ...r,
            device_type: dt ? { id: dt.id, model: dt.model } : r.device_type,
            status: st ? { id: st.id, value: st.name.toLowerCase(), name: st.name } : r.status
          };
        });
      }
      return new Response(JSON.stringify({ count: results.length, results }), { status: 200 });
    }

    if (method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const record: MockRecord = { id: `obj-${seq++}`, ...body };
      list.push(record);
      return new Response(JSON.stringify(record), { status: 201 });
    }

    return new Response('{}', { status: 200 });
  };

  return { store, fetchImpl };
}

describe('EDP Nautobot 2.x Multi-Project Isolation & Per-Project Configuration', () => {
  it('résout le scope logique sur instance partagée et le désactive par défaut sur instance dédiée', () => {
    const shared = resolveProjectNautobotOptions({
      id: 'proj_abc123',
      shortName: 'Projet Alpha!',
      strategy: '{}'
    });
    expect(shared.baseUrl).toBeUndefined();
    expect(shared.projectScope).toBe('projet-alpha');

    const dedicated = resolveProjectNautobotOptions({
      id: 'proj_prod',
      shortName: 'Prod',
      strategy: JSON.stringify({
        nautobot: {
          url: 'https://nautobot-prod.example.internal',
          token: 'prod-token-123'
        }
      })
    });
    expect(dedicated.baseUrl).toBe('https://nautobot-prod.example.internal');
    expect(dedicated.token).toBe('prod-token-123');
    expect(dedicated.projectScope).toBeUndefined();

    const dedicatedWithForceIsolation = resolveProjectNautobotOptions({
      id: 'proj_prod2',
      shortName: 'Prod 2',
      strategy: {
        nautobot: {
          url: 'https://nautobot-shared-staging.internal',
          isolateByProject: true,
          isolationPrefix: 'Custom_Scope'
        }
      }
    });
    expect(dedicatedWithForceIsolation.projectScope).toBe('custom-scope');

    expect(normalizeProjectScope('  Mon Projet #1  ')).toBe('mon-projet-1');
    expect(scopedNautobotName('dea-lot1-01', 'alpha')).toBe('alpha--dea-lot1-01');
    expect(unscopeNautobotName('alpha--dea-lot1-01', 'alpha')).toBe('dea-lot1-01');
  });

  it('isole deux projets poussant vers le même Nautobot sans écrasement ni fuite de drift au pull', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const coverage = computeRefinementCoverage(
      {
        subjectId: 'sub_test_iso',
        title: 'Interconnexion IPsec & Médiation S6a',
        problem: 'Sécuriser interconnexion tiers',
        decisionText: 'Substrat Bare-Metal Sylva, OOB Redfish, chiffrement IPsec ESP AES-256-GCM',
        autoBindFromText: true
      },
      catalog
    );
    const hydrated = composeMultiAxisHydration('sub_test_iso', coverage.composedBindings, catalog, {});

    const { store, fetchImpl } = createInMemoryNautobotFetch();

    const summaryA = await syncHydratedInventoryToNautobot(hydrated, {
      baseUrl: 'http://localhost:8080',
      token: 'tok',
      projectScope: 'proj-alpha',
      fetchImpl
    });
    const summaryB = await syncHydratedInventoryToNautobot(hydrated, {
      baseUrl: 'http://localhost:8080',
      token: 'tok',
      projectScope: 'proj-beta',
      fetchImpl
    });

    expect(summaryA.reachable).toBe(true);
    expect(summaryA.projectScope).toBe('proj-alpha');
    expect(summaryB.reachable).toBe(true);
    expect(summaryB.projectScope).toBe('proj-beta');

    // Namespaces IPAM isolés
    const nsNames = store['/api/ipam/namespaces/'].map((n) => n.name);
    expect(nsNames).toContain('archinex-proj-alpha');
    expect(nsNames).toContain('archinex-proj-beta');

    // VLAN Groups isolés (permettant le même VID sur la même Location)
    const vgNames = store['/api/ipam/vlan-groups/'].map((v) => v.name);
    expect(vgNames).toContain('vg-proj-alpha');
    expect(vgNames).toContain('vg-proj-beta');

    // Tenants, Circuits, Devices distincts et préfixés
    const tenantNames = store['/api/tenancy/tenants/'].map((t) => t.name);
    expect(tenantNames).toContain('proj-alpha--org-lot3-mno');
    expect(tenantNames).toContain('proj-beta--org-lot3-mno');

    const circuitCids = store['/api/circuits/circuits/'].map((c) => c.cid);
    expect(circuitCids).toContain('proj-alpha--link-ip-lot3-secgw1');
    expect(circuitCids).toContain('proj-beta--link-ip-lot3-secgw1');

    const deviceNames = store['/api/dcim/devices/'].map((d) => d.name);
    expect(deviceNames).toContain('proj-alpha--dea-lot1-01');
    expect(deviceNames).toContain('proj-beta--dea-lot1-01');

    // Simuler un drift uniquement sur le circuit du projet Alpha (détachement du Tenant)
    const alphaCircuit = store['/api/circuits/circuits/'].find(
      (c) => c.cid === 'proj-alpha--link-ip-lot3-secgw1'
    );
    expect(alphaCircuit).toBeDefined();
    alphaCircuit!.tenant = null;

    // Pull sur Alpha : détecte le drift ORPHAN_NO_TENANT
    const pullAlpha = await pullLiveInventoryFromNautobot(hydrated, {
      baseUrl: 'http://localhost:8080',
      token: 'tok',
      projectScope: 'proj-alpha',
      fetchImpl
    });
    expect(pullAlpha.reachable).toBe(true);
    expect(pullAlpha.projectScope).toBe('proj-alpha');
    expect(pullAlpha.detectedDrifts.some((d) => d.includes('orphelin de Tenant'))).toBe(true);
    expect(pullAlpha.inventory.reconciliation_graph?.service_mediation_flows?.[0]?.tenant_ref).toBe(
      'ORPHAN_NO_TENANT'
    );

    // Pull sur Beta : aucun drift de réconciliation / circuit, le circuit Beta reste sain
    const pullBeta = await pullLiveInventoryFromNautobot(hydrated, {
      baseUrl: 'http://localhost:8080',
      token: 'tok',
      projectScope: 'proj-beta',
      fetchImpl
    });
    expect(pullBeta.reachable).toBe(true);
    expect(pullBeta.projectScope).toBe('proj-beta');
    expect(pullBeta.detectedDrifts.some((d) => d.includes('orphelin de Tenant'))).toBe(false);
    expect(pullBeta.inventory.reconciliation_graph?.service_mediation_flows?.[0]?.tenant_ref).not.toBe(
      'ORPHAN_NO_TENANT'
    );
  });
});
