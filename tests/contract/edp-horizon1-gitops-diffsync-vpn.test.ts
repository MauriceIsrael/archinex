import { describe, it, expect, beforeEach } from 'vitest';
import { loadOntologyCatalog, resetRuntimeOntologyOverlay } from '../../src/lib/server/edp/ontologyClient.js';
import {
  composeMultiAxisHydration,
  evaluateMultiAxisOracle
} from '../../src/lib/server/edp/refinementCoverage.js';
import { exportSylvaWorkloadClusterGitops } from '../../src/lib/server/edp/sylvaGitopsExport.js';
import {
  syncHydratedInventoryToNautobot,
  pullLiveInventoryFromNautobot
} from '../../src/lib/server/edp/nautobotSync.js';

describe('EDP Horizon 1 (#241) : GitOps Sylva Natif (#238), Collecte Live Nautobot -> OPA (#239) & Module VPN 2.2+ (#240)', () => {
  beforeEach(() => {
    resetRuntimeOntologyOverlay();
  });

  const fullBindings = [
    { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
    { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 },
    { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
    { urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256', revision: 1 },
    { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
    { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
    { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
  ];

  it('#238 — génère workload-clusters/<cluster>/values.yaml assaini sans secret et ouvre une PR GitOps vers sylva-core', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const hydrated = composeMultiAxisHydration('sub_lot1_sylva', fullBindings, catalog);

    // Injecter un secret factice dans sylva_workload_cluster_values pour vérifier que sanitizeManifests le filtre
    (hydrated.sylva_workload_cluster_values as any).spec.bmc_password = 'super-secret-password-123';

    const recordedRequests: Array<{ url: string; method: string; body?: any }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      recordedRequests.push({ url, method, body });

      if (url.includes('/git/ref/heads/main')) {
        return new Response(JSON.stringify({ object: { sha: 'abc1234567890def' } }), {
          status: 200
        });
      }
      if (url.includes('/git/refs') && method === 'POST') {
        return new Response(JSON.stringify({ ref: body.ref }), { status: 201 });
      }
      if (url.includes('/contents/workload-clusters/') && method === 'PUT') {
        return new Response(JSON.stringify({ content: { path: body.branch } }), { status: 201 });
      }
      if (url.includes('/pulls') && method === 'POST') {
        return new Response(
          JSON.stringify({
            number: 42,
            html_url: 'https://github.com/sylva-projects/sylva-core/pull/42'
          }),
          { status: 201 }
        );
      }
      return new Response('{}', { status: 200 });
    };

    const res = await exportSylvaWorkloadClusterGitops({
      edpId: 'EDP-SUB_LOT1_SYLVA',
      subjectId: 'sub_lot1_sylva',
      revision: 3,
      ontologyFingerprint: 'sha256:ontology-fp-test',
      opaVerdict: 'compliant',
      hydratedInventory: hydrated,
      repoUrl: 'https://github.com/sylva-projects/sylva-core.git',
      baseBranch: 'main',
      gitToken: 'ghp_mock_token',
      fetchImpl: mockFetch
    });

    expect(res.mode).toBe('github_pr');
    expect(res.pullRequestNumber).toBe(42);
    expect(res.pullRequestUrl).toBe('https://github.com/sylva-projects/sylva-core/pull/42');
    expect(res.targetPath).toMatch(/^workload-clusters\/wc-.*\/values\.yaml$/);
    expect(res.valuesYaml).toContain('capi_providers:');
    expect(res.valuesYaml).toContain('infra_provider: capm3');
    expect(res.valuesYaml).toContain('bootstrap_provider: cabpr');
    expect(res.valuesYaml).toContain('baremetal_hosts:');
    expect(res.valuesYaml).toContain('machine_deployments:');
    expect(res.valuesYaml).not.toContain('super-secret-password-123');
    expect(res.workloadClusterManifestYaml).toContain('[REDACTED_SECRET]');
    expect(recordedRequests.some((r) => r.url.includes('/pulls') && r.method === 'POST')).toBe(
      true
    );
  });

  it('#238 — refuse formellement (HTTP 409) l’export GitOps Sylva si le verdict de l’Oracle OPA est violated', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const hydrated = composeMultiAxisHydration('sub_lot1_sylva', fullBindings, catalog);

    await expect(
      exportSylvaWorkloadClusterGitops({
        edpId: 'EDP-SUB_LOT1_SYLVA',
        subjectId: 'sub_lot1_sylva',
        revision: 1,
        ontologyFingerprint: 'sha256:ontology-fp-test',
        opaVerdict: 'violated',
        hydratedInventory: hydrated
      })
    ).rejects.toThrow(/Export GitOps Sylva refusé/);
  });

  it('#240 — instancie de manière idempotente les objets natifs du module VPN Nautobot 2.2+ (IKEProposal, IPSecProposal, VPNProfile, VPNTunnel)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const hydrated = composeMultiAxisHydration('sub_lot3_interco', fullBindings, catalog);

    const calledEndpoints: Array<{ path: string; method: string; body?: any }> = [];
    const mockNautobotFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const path = url.pathname + url.search;
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calledEndpoints.push({ path, method, body });

      if (url.pathname === '/api/status/') {
        return new Response(JSON.stringify({ 'nautobot-version': '2.2.4' }), { status: 200 });
      }
      if (url.pathname === '/api/extras/statuses/') {
        return new Response(
          JSON.stringify({
            results: [
              { id: 'uuid-status-planned', name: 'Planned' },
              { id: 'uuid-status-active', name: 'Active' }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/dcim/locations/') {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'uuid-loc-valmondois',
                name: 'pop-valmondois',
                location_type: { id: 'uuid-loctype-site' }
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/ipam/namespaces/') {
        return new Response(JSON.stringify({ results: [{ id: 'uuid-ns-global' }] }), {
          status: 200
        });
      }
      if (method === 'GET') {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (method === 'POST' || method === 'PATCH') {
        return new Response(
          JSON.stringify({
            id: `uuid-${url.pathname.replace(/\W+/g, '-')}`,
            ...(body || {})
          }),
          { status: method === 'POST' ? 201 : 200 }
        );
      }
      return new Response('{}', { status: 200 });
    };

    const summary = await syncHydratedInventoryToNautobot(hydrated, {
      baseUrl: 'http://localhost:8080',
      token: 'mock-token',
      fetchImpl: mockNautobotFetch
    });

    expect(summary.reachable).toBe(true);
    expect(summary.errors).toEqual([]);
    expect(summary.circuitsSynced).toBe(1);
    expect(summary.vpnTunnelsSynced).toBe(1);
    expect(summary.urls.vpnTunnels).toBe('http://localhost:8080/vpn/vpn-tunnels/');

    const ikePost = calledEndpoints.find(
      (c) => c.path === '/api/vpn/ike-proposals/' && c.method === 'POST'
    );
    expect(ikePost).toBeDefined();
    expect(ikePost?.body.name).toBe('ike-prop-tun-ipsec-esp-lot3-secgw1'); // dérivé de l'identifiant du tunnel (vpnObjectLogicalNames)
    expect(ikePost?.body.encryption_algorithm).toBe('AES-256-GCM');

    const ipsecPost = calledEndpoints.find(
      (c) => c.path === '/api/vpn/ipsec-proposals/' && c.method === 'POST'
    );
    expect(ipsecPost).toBeDefined();
    expect(ipsecPost?.body.name).toBe('ipsec-prop-tun-ipsec-esp-lot3-secgw1');
    expect(ipsecPost?.body.protocol).toBe('ESP');
    expect(ipsecPost?.body.encryption_algorithm).toBe('AES-256-GCM');

    const profilePost = calledEndpoints.find(
      (c) => c.path === '/api/vpn/vpn-profiles/' && c.method === 'POST'
    );
    expect(profilePost).toBeDefined();
    expect(profilePost?.body.name).toBe('vpn-prof-tun-ipsec-esp-lot3-secgw1');

    const tunnelPost = calledEndpoints.find(
      (c) => c.path === '/api/vpn/vpn-tunnels/' && c.method === 'POST'
    );
    expect(tunnelPost).toBeDefined();
    expect(tunnelPost?.body.name).toBe('tun-ipsec-esp-lot3-secgw1');
    expect(tunnelPost?.body.tunnel_id).toBe('tun-ipsec-esp-lot3-secgw1');
  });

  it('#239 & #240 — collecte en direct (Pull SSoT) l’état courant de Nautobot 2.x et déclenche immédiatement VIOLATED dans l’Oracle OPA sur dérive manuelle opérateur (Device, Tenant, Circuit ou Cipher VPN)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const baseline = composeMultiAxisHydration('sub_lot3_live', fullBindings, catalog);
    const primaryDeviceName = String(baseline.nautobot_planned_devices[0].name);

    // Simuler une instance Nautobot dans laquelle un opérateur a effectué 3 modifications sauvages :
    // 1. Remplacement du serveur Dell PowerEdge R750 par un serveur Whitebox non homologué
    // 2. Suppression du tenant partenaire 'org-lot3-mno' (seul 'org-lot2-ran' subsiste)
    // 3. Dégradation de la proposition IPsec 'ipsec-prop-tun-ipsec-esp-lot3-secgw1' vers '3DES-CBC'
    const mockDriftedNautobotFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/status/') {
        return new Response(JSON.stringify({ 'nautobot-version': '2.2.4' }), { status: 200 });
      }
      if (url.pathname === '/api/tenancy/tenants/') {
        return new Response(
          JSON.stringify({
            results: [{ id: 'uuid-lot2', name: 'org-lot2-ran' }]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/dcim/devices/') {
        return new Response(
          JSON.stringify({
            results: [
              {
                name: primaryDeviceName,
                device_type: { model: 'Supermicro-Whitebox-ManualEdit' },
                status: { name: 'Planned' }
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/circuits/circuits/') {
        return new Response(
          JSON.stringify({
            results: [
              {
                cid: 'link-ip-lot3-secgw1',
                tenant: null
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/vpn/ipsec-proposals/') {
        return new Response(
          JSON.stringify({
            results: [
              {
                name: 'ipsec-prop-tun-ipsec-esp-lot3-secgw1',
                encryption_algorithm: '3DES-CBC'
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/vpn/vpn-tunnels/') {
        return new Response(
          JSON.stringify({
            results: [{ name: 'tun-ipsec-esp-lot3-secgw1' }]
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const livePull = await pullLiveInventoryFromNautobot(baseline, {
      baseUrl: 'http://localhost:8080',
      token: 'mock-token',
      fetchImpl: mockDriftedNautobotFetch
    });

    expect(livePull.reachable).toBe(true);
    expect(livePull.source).toBe('nautobot_live');
    expect(livePull.detectedDrifts.length).toBeGreaterThanOrEqual(3);

    // Évaluation réelle par le binaire OPA sur l'inventaire collecté depuis Nautobot
    const opaResult = await evaluateMultiAxisOracle(livePull.inventory, fullBindings, catalog);
    expect(opaResult.verdict).toBe('violated');

    const triggeredRules = opaResult.violations.map((v) => v.rule);
    expect(triggeredRules).toEqual(
      expect.arrayContaining([
        'data.archinex.edp.multiaxis.deny_unapproved_hardware_profile',
        'data.archinex.edp.multiaxis.deny_unreconciled_partner_objects',
        'data.archinex.edp.multiaxis.deny_weak_wan_cipher'
      ])
    );
  });

  it('pousse les tags zone-<nom>, plateformes, VRF par zone, interfaces, préfixes et IP (exploitables par IP Flow Manager) dans Nautobot', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const hydrated = composeMultiAxisHydration('sub_ifm_sync', fullBindings, catalog);

    const calledEndpoints: Array<{ path: string; method: string; body: any }> = [];

    const mockNautobotFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calledEndpoints.push({ path: url.pathname, method, body });

      if (url.pathname === '/api/status/') {
        return new Response(JSON.stringify({ 'nautobot-version': '2.2.4' }), { status: 200 });
      }
      if (url.pathname === '/api/extras/statuses/') {
        return new Response(
          JSON.stringify({
            results: [
              { id: 'uuid-status-planned', name: 'Planned' },
              { id: 'uuid-status-active', name: 'Active' }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/dcim/locations/') {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'uuid-loc-valmondois',
                name: 'pop-valmondois',
                location_type: { id: 'uuid-loctype-site' }
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.pathname === '/api/ipam/namespaces/') {
        return new Response(JSON.stringify({ results: [{ id: 'uuid-ns-global' }] }), {
          status: 200
        });
      }
      if (method === 'GET') {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (method === 'POST' || method === 'PATCH') {
        return new Response(
          JSON.stringify({
            id: `uuid-${url.pathname.replace(/\W+/g, '-')}-${calledEndpoints.length}`,
            ...(body || {})
          }),
          { status: method === 'POST' ? 201 : 200 }
        );
      }
      return new Response('{}', { status: 200 });
    };

    const summary = await syncHydratedInventoryToNautobot(hydrated, {
      baseUrl: 'http://localhost:8080',
      token: 'mock-token',
      fetchImpl: mockNautobotFetch
    });

    expect(summary.reachable).toBe(true);
    expect(summary.errors).toEqual([]);
    expect(summary.tagsSynced).toBeGreaterThanOrEqual(1);
    expect(summary.vrfsSynced).toBeGreaterThanOrEqual(1);
    expect(summary.interfacesSynced).toBeGreaterThanOrEqual(2);
    expect(summary.ipAddressesSynced).toBeGreaterThanOrEqual(2);
    expect(summary.prefixesSynced).toBeGreaterThanOrEqual(2);

    const tagPosts = calledEndpoints.filter(
      (c) => c.path === '/api/extras/tags/' && c.method === 'POST'
    );
    expect(tagPosts.some((t) => String(t.body.name).startsWith('zone-'))).toBe(true);

    const vrfPosts = calledEndpoints.filter(
      (c) => c.path === '/api/ipam/vrfs/' && c.method === 'POST'
    );
    expect(vrfPosts.some((v) => String(v.body.name).startsWith('vrf-'))).toBe(true);

    const platformPosts = calledEndpoints.filter(
      (c) => c.path === '/api/dcim/platforms/' && c.method === 'POST'
    );
    expect(platformPosts.some((p) => p.body.name === 'sylva-capm3-rke2')).toBe(true);

    const ifacePosts = calledEndpoints.filter(
      (c) => c.path === '/api/dcim/interfaces/' && c.method === 'POST'
    );
    expect(ifacePosts.some((i) => i.body.name === 'oob0' && i.body.mgmt_only === true)).toBe(true);
    expect(ifacePosts.some((i) => i.body.name === 'eth0')).toBe(true);

    const ipPosts = calledEndpoints.filter(
      (c) => c.path === '/api/ipam/ip-addresses/' && c.method === 'POST'
    );
    expect(ipPosts.some((ip) => ip.body.address === '192.0.2.10/24')).toBe(true);
    expect(ipPosts.some((ip) => ip.body.address === '10.20.0.10/24')).toBe(true);

    const prefixPosts = calledEndpoints.filter(
      (c) => c.path === '/api/ipam/prefixes/' && c.method === 'POST'
    );
    expect(prefixPosts.some((p) => p.body.prefix === '192.0.2.0/24')).toBe(true);
    expect(prefixPosts.some((p) => p.body.prefix === '10.20.0.0/24')).toBe(true);

    const ipToIfacePosts = calledEndpoints.filter(
      (c) => c.path === '/api/ipam/ip-address-to-interface/' && c.method === 'POST'
    );
    expect(ipToIfacePosts.length).toBeGreaterThanOrEqual(2);

    const primaryIpPatch = calledEndpoints.find(
      (c) => c.path.startsWith('/api/dcim/devices/') && c.method === 'PATCH' && c.body?.primary_ip4
    );
    expect(primaryIpPatch).toBeDefined();
  });
});
