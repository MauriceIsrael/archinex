import { describe, it, expect } from 'vitest';
import {
  BatfishAdapter,
  buildBatfishOpaInput,
  OpenBaoAdapter,
  KeycloakAdapter,
  OciSupplyChainAdapter,
  DdiDnsAdapter,
  GitopsForgeAdapter
} from '../../src/lib/server/edp/adapters/index.js';
import type { SylvaGitopsExportResult } from '../../src/lib/server/edp/sylvaGitopsExport.js';

function createFailingFetch(message = 'connect ECONNREFUSED 127.0.0.1'): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

function createMockResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const status = init.status ?? 200;
  const responseBody =
    status === 204 || status === 205 || status === 304
      ? null
      : typeof body === 'string'
        ? body
        : JSON.stringify(body);
  return new Response(responseBody, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

describe('EDP Sylva Stack Adapters Contract (Issue #362)', () => {
  describe('1. BatfishAdapter (#353)', () => {
    it('retourne un mode dégradé propre si Batfish est hors-ligne', async () => {
      const adapter = new BatfishAdapter({
        baseUrl: 'http://127.0.0.1:9997',
        fetchImpl: createFailingFetch('connect ECONNREFUSED 127.0.0.1:9997')
      });

      const health = await adapter.checkHealth();
      expect(health.reachable).toBe(false);
      expect(health.mode).toBe('degraded');
      expect(health.errors[0]).toContain('ECONNREFUSED');

      const verify = await adapter.verifyReachabilityAndAcls({
        networkName: 'net-a',
        snapshotName: 'snap-1',
        assertions: [
          {
            id: 'acl-1',
            sourceIps: '192.0.2.0/24',
            destinationIps: '198.51.100.10',
            protocol: 'tcp',
            dstPorts: '443',
            expected: 'deny'
          }
        ]
      });
      expect(verify.reachable).toBe(false);
      expect(verify.mode).toBe('degraded');
      expect(verify.verdict).toBe('unavailable');
    });

    it('soumet un snapshot et évalue les assertions reachability/ACL', async () => {
      const calls: Array<{ url: string; method: string }> = [];
      const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        calls.push({ url, method });

        if (url.endsWith('/v2/version')) {
          return createMockResponse({ version: '2024.10.0' });
        }
        if (url.includes('/v2/networks/net-telco/snapshots/snap-01/questions/reachability')) {
          const parsedBody = JSON.parse(String(init?.body || '{}'));
          const dst = parsedBody?.headers?.dstIps;
          const disposition = dst === '198.51.100.10' ? 'DENIED_IN' : 'ACCEPTED';
          return createMockResponse({
            answerElements: [{ rows: [{ Traces: [{ disposition }] }] }]
          });
        }
        if (url.includes('/v2/networks/net-telco/snapshots/snap-01')) {
          return createMockResponse({ status: 'ok' }, { status: 201 });
        }
        if (url.endsWith('/v2/networks/net-telco')) {
          return createMockResponse({ name: 'net-telco' }, { status: 200 });
        }
        return createMockResponse({}, { status: 404 });
      }) as unknown as typeof fetch;

      const adapter = new BatfishAdapter({ fetchImpl: mockFetch });
      const snap = await adapter.submitSnapshot({
        networkName: 'net-telco',
        snapshotName: 'snap-01',
        configs: { 'configs/gw-01.cfg': 'hostname gw-01\n!' }
      });
      expect(snap.reachable).toBe(true);
      expect(snap.created).toBe(true);
      expect(snap.submittedFilesCount).toBe(1);

      const res = await adapter.verifyReachabilityAndAcls({
        networkName: 'net-telco',
        snapshotName: 'snap-01',
        assertions: [
          {
            id: 'deny-untrusted-sctp',
            sourceIps: '192.0.2.0/24',
            destinationIps: '198.51.100.10',
            protocol: 'sctp',
            dstPorts: '3868',
            expected: 'deny'
          },
          {
            id: 'permit-oam-https',
            sourceIps: '203.0.113.0/24',
            destinationIps: '203.0.113.50',
            protocol: 'tcp',
            dstPorts: '443',
            expected: 'permit'
          }
        ]
      });

      expect(res.reachable).toBe(true);
      expect(res.mode).toBe('live');
      expect(res.verdict).toBe('compliant');
      expect(res.violationsCount).toBe(0);

      const opaInput = buildBatfishOpaInput(res);
      expect(opaInput.verdict).toBe('compliant');
      expect(opaInput.violations_count).toBe(0);
    });
  });

  describe('2. OpenBaoAdapter (#354)', () => {
    it('retourne un mode dégradé propre si OpenBao est hors-ligne', async () => {
      const adapter = new OpenBaoAdapter({
        fetchImpl: createFailingFetch('connect ECONNREFUSED 127.0.0.1:8200')
      });

      const health = await adapter.checkHealth();
      expect(health.reachable).toBe(false);
      expect(health.mode).toBe('degraded');

      const kv = await adapter.ensureKvPaths({
        paths: [{ path: 'app/oidc', requiredKeys: ['client_id'] }]
      });
      expect(kv.reachable).toBe(false);
      expect(kv.compliant).toBe(false);
    });

    it('valide et provisionne les montages KV v2 et rôles PKI X.509 sans exposer les secrets', async () => {
      const kvStore: Record<string, Record<string, string>> = {};
      const pkiRoles: Record<string, unknown> = {};
      const mounts: Record<string, unknown> = { 'secret/': { type: 'kv' } };

      const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.endsWith('/v1/sys/health')) {
          return createMockResponse({ version: '2.1.0', sealed: false, initialized: true });
        }
        if (url.endsWith('/v1/sys/mounts')) {
          return createMockResponse({ data: mounts });
        }
        if (url.includes('/v1/sys/mounts/')) {
          const mountName = url.split('/v1/sys/mounts/')[1];
          mounts[`${mountName}/`] = JSON.parse(String(init?.body || '{}'));
          return createMockResponse({}, { status: 204 });
        }
        if (url.includes('/v1/secret/data/')) {
          const path = url.split('/v1/secret/data/')[1];
          if (method === 'GET') {
            if (!kvStore[path]) return createMockResponse({ errors: [] }, { status: 404 });
            return createMockResponse({ data: { data: kvStore[path], metadata: { version: 1 } } });
          }
          if (method === 'POST') {
            const payload = JSON.parse(String(init?.body || '{}'));
            kvStore[path] = payload.data;
            return createMockResponse({ data: { version: 1 } });
          }
        }
        if (url.includes('/v1/pki/roles/')) {
          const role = url.split('/v1/pki/roles/')[1];
          if (method === 'GET') {
            if (!pkiRoles[role]) return createMockResponse({ errors: [] }, { status: 404 });
            return createMockResponse({ data: pkiRoles[role] });
          }
          if (method === 'POST') {
            pkiRoles[role] = JSON.parse(String(init?.body || '{}'));
            return createMockResponse({}, { status: 204 });
          }
        }
        return createMockResponse({}, { status: 404 });
      }) as unknown as typeof fetch;

      const adapter = new OpenBaoAdapter({ fetchImpl: mockFetch });
      const kvRes = await adapter.ensureKvPaths({
        mount: 'secret',
        provision: true,
        paths: [
          {
            path: 'cluster/tls',
            requiredKeys: ['ca_bundle', 'token'],
            seedData: { ca_bundle: 'PEM', token: 'SUPER_SECRET_VALUE' }
          }
        ]
      });

      expect(kvRes.reachable).toBe(true);
      expect(kvRes.compliant).toBe(true);
      expect(kvRes.paths[0].provisioned).toBe(true);
      expect(JSON.stringify(kvRes)).not.toContain('SUPER_SECRET_VALUE');

      const pkiRes = await adapter.ensurePkiRoles({
        mount: 'pki',
        provision: true,
        roles: [{ name: 'workload-mtls', allowedDomains: ['sylva.internal'] }]
      });

      expect(pkiRes.reachable).toBe(true);
      expect(pkiRes.mountReady).toBe(true);
      expect(pkiRes.compliant).toBe(true);
      expect(pkiRes.roles[0].provisioned).toBe(true);
    });
  });

  describe('3. KeycloakAdapter (#357)', () => {
    it('retourne un mode dégradé propre si Keycloak est hors-ligne', async () => {
      const adapter = new KeycloakAdapter({
        fetchImpl: createFailingFetch('connect ECONNREFUSED 127.0.0.1:8085')
      });

      const health = await adapter.checkHealth();
      expect(health.reachable).toBe(false);
      expect(health.mode).toBe('degraded');

      const oidc = await adapter.ensureRealmAndOidcClients({
        realm: 'archinex',
        clients: [{ clientId: 'rancher-oidc' }]
      });
      expect(oidc.reachable).toBe(false);
      expect(oidc.compliant).toBe(false);
    });

    it('valide et provisionne realm, clients OIDC, rôles et groupes', async () => {
      const realms = new Set<string>();
      const clients = new Map<string, { id: string; clientId: string }>();
      const roles = new Set<string>();
      const groups = new Set<string>();

      const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.endsWith('/realms/master')) {
          return createMockResponse({ realm: 'master' });
        }
        if (url.endsWith('/realms/master/protocol/openid-connect/token')) {
          return createMockResponse({ access_token: 'mock-kc-token' });
        }
        if (url.endsWith('/admin/realms/telco-iam') && method === 'GET') {
          return realms.has('telco-iam')
            ? createMockResponse({ realm: 'telco-iam' })
            : createMockResponse({}, { status: 404 });
        }
        if (url.endsWith('/admin/realms') && method === 'POST') {
          const body = JSON.parse(String(init?.body || '{}'));
          realms.add(body.realm);
          return createMockResponse({}, { status: 201 });
        }
        if (url.includes('/admin/realms/telco-iam/clients')) {
          if (method === 'GET') {
            const clientId = new URL(url).searchParams.get('clientId') || '';
            const found = clients.get(clientId);
            return createMockResponse(found ? [found] : []);
          }
          if (method === 'POST') {
            const body = JSON.parse(String(init?.body || '{}'));
            clients.set(body.clientId, { id: 'uuid-1', clientId: body.clientId });
            return createMockResponse({}, { status: 201 });
          }
        }
        if (url.includes('/admin/realms/telco-iam/roles')) {
          if (method === 'GET') {
            const name = url.split('/roles/')[1];
            return roles.has(name)
              ? createMockResponse({ name })
              : createMockResponse({}, { status: 404 });
          }
          if (method === 'POST') {
            const body = JSON.parse(String(init?.body || '{}'));
            roles.add(body.name);
            return createMockResponse({}, { status: 201 });
          }
        }
        if (url.includes('/admin/realms/telco-iam/groups')) {
          if (method === 'GET') {
            const search = new URL(url).searchParams.get('search') || '';
            return createMockResponse(groups.has(search) ? [{ name: search }] : []);
          }
          if (method === 'POST') {
            const body = JSON.parse(String(init?.body || '{}'));
            groups.add(body.name);
            return createMockResponse({}, { status: 201 });
          }
        }
        return createMockResponse({}, { status: 404 });
      }) as unknown as typeof fetch;

      const adapter = new KeycloakAdapter({ fetchImpl: mockFetch });
      const oidcRes = await adapter.ensureRealmAndOidcClients({
        realm: 'telco-iam',
        provision: true,
        clients: [{ clientId: 'argocd-sso', redirectUris: ['https://argocd.local/callback'] }]
      });
      expect(oidcRes.reachable).toBe(true);
      expect(oidcRes.realmExists).toBe(true);
      expect(oidcRes.compliant).toBe(true);
      expect(oidcRes.clients[0].provisioned).toBe(true);

      const rbacRes = await adapter.ensureRolesAndGroups({
        realm: 'telco-iam',
        provision: true,
        roles: [{ name: 'netops-admin' }],
        groups: [{ name: 'platform-admins' }]
      });
      expect(rbacRes.compliant).toBe(true);
      expect(rbacRes.roles[0].provisioned).toBe(true);
      expect(rbacRes.groups[0].provisioned).toBe(true);
    });
  });

  describe('4. OciSupplyChainAdapter (#355 — Zot + Trivy)', () => {
    it('retourne un mode dégradé propre si Zot et Trivy sont hors-ligne', async () => {
      const adapter = new OciSupplyChainAdapter({
        fetchImpl: createFailingFetch('connect ECONNREFUSED')
      });

      const health = await adapter.checkHealth();
      expect(health.reachable).toBe(false);
      expect(health.mode).toBe('degraded');
      expect(health.zot.reachable).toBe(false);
      expect(health.trivy.reachable).toBe(false);

      const scan = await adapter.scanArtifactCve({ imageRef: '127.0.0.1:5000/cnf/upf:1.0.0' });
      expect(scan.reachable).toBe(false);
      expect(scan.scanStatus).toBe('unavailable');
    });

    it('vérifie un artefact OCI signé (referrers) et évalue le rapport CVE Trivy', async () => {
      const digest = 'sha256:abcdef1234567890';
      const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.endsWith('/v2/')) {
          return createMockResponse({}, { headers: { 'Docker-Distribution-Api-Version': 'registry/2.0' } });
        }
        if (url.endsWith('/healthz')) {
          return createMockResponse('ok');
        }
        if (url.includes('/v2/sylva/workload/manifests/v1.0.0') && method === 'HEAD') {
          return createMockResponse('', { headers: { 'Docker-Content-Digest': digest } });
        }
        if (url.includes(`/v2/sylva/workload/referrers/${encodeURIComponent(digest)}`)) {
          return createMockResponse({
            manifests: [{ artifactType: 'application/vnd.dev.cosign.simplesigning.v1+json' }]
          });
        }
        return createMockResponse({}, { status: 404 });
      }) as unknown as typeof fetch;

      const adapter = new OciSupplyChainAdapter({
        fetchImpl: mockFetch,
        scanRunner: async () => ({
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            Results: [
              {
                Vulnerabilities: [
                  { Severity: 'HIGH' },
                  { Severity: 'LOW' }
                ]
              }
            ]
          })
        })
      });

      const artifact = await adapter.verifyArtifactAndSignature({
        repository: 'sylva/workload',
        reference: 'v1.0.0',
        requireSignature: true
      });
      expect(artifact.exists).toBe(true);
      expect(artifact.signed).toBe(true);
      expect(artifact.signatureMethod).toBe('oci_referrers');
      expect(artifact.compliant).toBe(true);

      const scanPass = await adapter.scanArtifactCve({
        imageRef: '127.0.0.1:5000/sylva/workload:v1.0.0',
        failOnSeverities: ['CRITICAL']
      });
      expect(scanPass.scanStatus).toBe('pass');
      expect(scanPass.summary.high).toBe(1);
      expect(scanPass.passedPolicy).toBe(true);

      const scanFail = await adapter.scanArtifactCve({
        imageRef: '127.0.0.1:5000/sylva/workload:v1.0.0',
        failOnSeverities: ['CRITICAL', 'HIGH']
      });
      expect(scanFail.scanStatus).toBe('fail');
      expect(scanFail.passedPolicy).toBe(false);
    });
  });

  describe('5. DdiDnsAdapter (#352 — Technitium DNS)', () => {
    it('retourne un mode dégradé propre si Technitium DNS est hors-ligne', async () => {
      const adapter = new DdiDnsAdapter({
        fetchImpl: createFailingFetch('connect ECONNREFUSED 127.0.0.1:5380')
      });

      const health = await adapter.checkHealth();
      expect(health.reachable).toBe(false);
      expect(health.mode).toBe('degraded');
    });

    it('provisionne et vérifie les zones DNS et enregistrements FQDN', async () => {
      const zones = new Set<string>();
      const records = new Map<string, { type: string; ipAddress: string }>();

      const mockFetch = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/user/login') {
          return createMockResponse({ status: 'ok', token: 'dns-tok-1' });
        }
        if (url.pathname === '/api/zones/list') {
          return createMockResponse({
            status: 'ok',
            response: { zones: Array.from(zones).map((name) => ({ name })) }
          });
        }
        if (url.pathname === '/api/zones/create') {
          const z = url.searchParams.get('zone') || '';
          zones.add(z);
          return createMockResponse({ status: 'ok', response: { domain: z } });
        }
        if (url.pathname === '/api/zones/records/get') {
          const domain = url.searchParams.get('domain') || '';
          const rec = records.get(domain);
          return createMockResponse({
            status: 'ok',
            response: {
              records: rec ? [{ name: domain, type: rec.type, rData: { ipAddress: rec.ipAddress } }] : []
            }
          });
        }
        if (url.pathname === '/api/zones/records/add') {
          const domain = url.searchParams.get('domain') || '';
          const type = url.searchParams.get('type') || 'A';
          const ipAddress = url.searchParams.get('ipAddress') || '';
          records.set(domain, { type, ipAddress });
          return createMockResponse({ status: 'ok', response: {} });
        }
        return createMockResponse({ status: 'error' }, { status: 404 });
      }) as unknown as typeof fetch;

      const adapter = new DdiDnsAdapter({ fetchImpl: mockFetch });
      const zonesRes = await adapter.ensureZones({
        zones: ['telco.example.internal'],
        provision: true
      });
      expect(zonesRes.compliant).toBe(true);
      expect(zonesRes.zones[0].provisioned).toBe(true);

      const recRes = await adapter.ensureFqdnRecords({
        provision: true,
        records: [
          {
            zone: 'telco.example.internal',
            fqdn: 'api.telco.example.internal',
            type: 'A',
            value: '192.0.2.50'
          }
        ]
      });
      expect(recRes.compliant).toBe(true);
      expect(recRes.records[0].provisioned).toBe(true);
    });
  });

  describe('6. GitopsForgeAdapter (#356 — Forgejo)', () => {
    const sampleBundle: SylvaGitopsExportResult = {
      clusterName: 'edge-cluster-01',
      branchName: 'edp/edge-cluster-01-rev1',
      baseBranch: 'main',
      targetPath: 'environment-values/workload-clusters/edge-cluster-01/values.yaml',
      workloadClusterManifestPath:
        'environment-values/workload-clusters/edge-cluster-01/workload-cluster.yaml',
      valuesYaml: 'cluster_virtual_ip: 192.0.2.100\n',
      workloadClusterManifestYaml: 'apiVersion: source.toolkit.fluxcd.io/v1\nkind: GitRepository\n',
      tenantWorkloads: [
        {
          path: 'workloads/core/dns/prod/namespace.yaml',
          yaml: 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: dns-prod\n'
        }
      ],
      sha256: '0123456789abcdef0123456789abcdef',
      mode: 'local_bundle',
      provenance: {
        edpId: 'edp-001',
        subjectId: 'subj-001',
        revision: 1,
        ontologyFingerprint: 'fp-abc',
        opaVerdict: 'compliant',
        exportedAt: '2026-11-20T08:00:00Z'
      }
    };

    it('retourne un mode dégradé propre si Forgejo est hors-ligne', async () => {
      const adapter = new GitopsForgeAdapter({
        token: 'forge-tok',
        fetchImpl: createFailingFetch('connect ECONNREFUSED 127.0.0.1:3001')
      });

      const health = await adapter.checkHealth();
      expect(health.reachable).toBe(false);
      expect(health.mode).toBe('degraded');

      const push = await adapter.pushSylvaExportAndOpenPr({
        owner: 'archinex',
        repo: 'sylva-gitops',
        bundle: sampleBundle
      });
      expect(push.reachable).toBe(false);
      expect(push.mode).toBe('degraded');
    });

    it('crée une branche, pousse le bundle Sylva et ouvre une PR sur Forgejo', async () => {
      const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.endsWith('/api/v1/version')) {
          return createMockResponse({ version: '10.0.0' });
        }
        if (url.endsWith('/api/v1/repos/archinex/sylva-gitops') && method === 'GET') {
          return createMockResponse({ html_url: 'http://127.0.0.1:3001/archinex/sylva-gitops' });
        }
        if (url.endsWith('/branches') && method === 'POST') {
          return createMockResponse({ name: sampleBundle.branchName }, { status: 201 });
        }
        if (url.includes('/contents/') && method === 'GET') {
          return createMockResponse({}, { status: 404 });
        }
        if (url.includes('/contents/') && method === 'POST') {
          return createMockResponse({ content: { sha: 'file-sha' } }, { status: 201 });
        }
        if (url.endsWith('/pulls') && method === 'POST') {
          return createMockResponse(
            {
              number: 7,
              html_url: 'http://127.0.0.1:3001/archinex/sylva-gitops/pulls/7'
            },
            { status: 201 }
          );
        }
        return createMockResponse({}, { status: 404 });
      }) as unknown as typeof fetch;

      const adapter = new GitopsForgeAdapter({
        token: 'forge-tok',
        fetchImpl: mockFetch
      });

      const res = await adapter.pushSylvaExportAndOpenPr({
        owner: 'archinex',
        repo: 'sylva-gitops',
        bundle: sampleBundle
      });

      expect(res.reachable).toBe(true);
      expect(res.mode).toBe('forgejo_pr');
      expect(res.branchCreated).toBe(true);
      expect(res.pushedFiles).toHaveLength(3);
      expect(res.pullRequestNumber).toBe(7);
      expect(res.pullRequestUrl).toBe('http://127.0.0.1:3001/archinex/sylva-gitops/pulls/7');
    });
  });
});
