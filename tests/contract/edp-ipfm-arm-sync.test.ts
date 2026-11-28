import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import { composeMultiAxisHydration } from '$lib/server/edp/refinementCoverage';
import {
  buildArmEnvelopeFromHydrated,
  canonicalJson,
  checkIpFlowManagerHealth,
  computeArmChecksum,
  pushArmToIpFlowManager
} from '$lib/server/edp/ipfmSync';

const FORBIDDEN_NETWORK_KEYS = new Set([
  'ip',
  'ips',
  'ipaddress',
  'ipaddresses',
  'ipv4',
  'ipv6',
  'managementip',
  'cidr',
  'cidrs',
  'subnet',
  'subnets',
  'subnetmask',
  'netmask',
  'mask',
  'prefix',
  'prefixlength',
  'gateway',
  'defaultgateway',
  'nexthop',
  'macaddress',
  'mac',
  'fqdn',
  'vlan',
  'vlanid',
  'vlans',
  'vrf',
  'vrfid',
  'vrfname',
  'vrfs',
  'acl',
  'acls',
  'aclrule',
  'aclrules',
  'nat',
  'natrule',
  'natrules',
  'route',
  'routes',
  'routingentry',
  'routingentries',
  'routingtable',
  'firewallrule',
  'firewallrules',
  'interfacename',
  'networkinterface',
  'networkinterfaces',
  'asn',
  'peering'
]);

function collectKeys(obj: unknown, acc: string[] = []): string[] {
  if (Array.isArray(obj)) {
    for (const item of obj) collectKeys(item, acc);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      acc.push(k.toLowerCase().replace(/[^a-z0-9]/g, ''));
      collectKeys(v, acc);
    }
  }
  return acc;
}

const sampleBindings: Parameters<typeof composeMultiAxisHydration>[1] = [
  {
    urn: 'urn:archinex:ontology:compute:cnf_sriov_dpdk',
    revision: 1
  },
  {
    urn: 'urn:archinex:ontology:security:zone:oam',
    revision: 1
  },
  {
    urn: 'urn:archinex:ontology:security:zone:user_plane',
    revision: 1
  }
];

describe('IP Flow Manager — Export ARM 1.6 & Supervision', () => {
  it('construit une enveloppe ARM 1.6 conforme au contrat IFM (checksum canonique, clause G2 sans clé réseau interdite, références uniques)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const hydrated = composeMultiAxisHydration('sub_arm_test', sampleBindings, catalog);

    const envelope = buildArmEnvelopeFromHydrated(hydrated, {
      projectId: 'proj-1',
      subjectId: 'sub_arm_test',
      revision: 3
    });

    expect(envelope.sourceSystem).toBe('architecture-studio');
    expect(envelope.schemaVersion).toBe('1.6');
    expect(envelope.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(envelope.sensitivity).toBe('public');
    expect(envelope.data.sensitivity).toBe('public');

    const expectedSha = `sha256:${createHash('sha256').update(canonicalJson(envelope.data), 'utf8').digest('hex')}`;
    expect(envelope.checksum).toBe(expectedSha);
    expect(computeArmChecksum(envelope.data)).toBe(expectedSha);

    // Garde-fou G2 : aucune clé réseau opérationnelle interdite dans data
    const normalizedKeys = collectKeys(envelope.data);
    const forbiddenFound = normalizedKeys.filter((k) => FORBIDDEN_NETWORK_KEYS.has(k));
    expect(forbiddenFound).toEqual([]);

    // Vérifier la présence des datasets attendus par IFM
    const data = envelope.data as Record<string, any[]>;
    expect(data.environments.length).toBeGreaterThanOrEqual(1);
    expect(data.sites.length).toBeGreaterThanOrEqual(2);
    expect(data.equipment.length).toBeGreaterThanOrEqual(1);
    expect(data.zones.length).toBeGreaterThanOrEqual(1);

    // Vérifier l'unicité des architectureRef sur les datasets matérialisés
    const materializedRefs: string[] = [];
    for (const ds of ['environments', 'sites', 'equipment', 'applications', 'serviceEndpoints', 'zones']) {
      for (const item of data[ds] || []) {
        materializedRefs.push(item.architectureRef);
      }
    }
    expect(new Set(materializedRefs).size).toBe(materializedRefs.length);
  });

  it('pousse l’ARM vers POST /catalog/import-manifest et déclenche POST /netbox/sync de façon synchrone', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const hydrated = composeMultiAxisHydration('sub_arm_push', sampleBindings, catalog);
    const envelope = buildArmEnvelopeFromHydrated(hydrated, { subjectId: 'sub_arm_push' });

    const calls: Array<{ url: string; method: string; body?: any }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });

      if (url.endsWith('/catalog/import-manifest')) {
        return new Response(
          JSON.stringify({ created: 4, updated: 1, totalChanges: 5 }),
          { status: 200 }
        );
      }
      if (url.endsWith('/netbox/sync')) {
        return new Response(JSON.stringify({ status: 'SUCCESS' }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    };

    const summary = await pushArmToIpFlowManager(envelope, {
      baseUrl: 'http://localhost:8001',
      fetchImpl: mockFetch,
      triggerNautobotSync: true
    });

    expect(summary.reachable).toBe(true);
    expect(summary.armImported).toBe(true);
    expect(summary.nautobotSyncTriggered).toBe(true);
    expect(summary.created).toBe(4);
    expect(summary.updated).toBe(1);
    expect(summary.totalChanges).toBe(5);
    expect(summary.errors).toEqual([]);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'POST /catalog/import-manifest',
      'POST /netbox/sync'
    ]);
  });

  it('vérifie la disponibilité d’IP Flow Manager via checkIpFlowManagerHealth', async () => {
    const okFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ status: 'ok', version: '0.28.3' }), { status: 200 });
    const ok = await checkIpFlowManagerHealth(1000, okFetch, 'http://localhost:8001');
    expect(ok).toEqual({ available: true, url: 'http://localhost:8001', version: '0.28.3' });

    const failFetch: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const down = await checkIpFlowManagerHealth(1000, failFetch, 'http://localhost:8001');
    expect(down.available).toBe(false);
    expect(down.url).toBe('http://localhost:8001');
  });
});
