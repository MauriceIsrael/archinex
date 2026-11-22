import { describe, it, expect } from 'vitest';
import {
  BatfishAdapter,
  OpenBaoAdapter,
  KeycloakAdapter,
  OciSupplyChainAdapter,
  DdiDnsAdapter,
  GitopsForgeAdapter
} from '../../connectors/index.js';

const LIVE_MODE = process.env.SYLVA_STACK_LIVE === '1';

describe('EDP Sylva Docker Stack Integration (deploy/integrator-tools/compose.yml)', () => {
  it('dégrade proprement sans exception lorsque les ports locaux sont fermés', async () => {
    // Port fermé déterministe pour valider le mode dégradé même si Docker tourne par ailleurs
    const closedUrl = 'http://127.0.0.1:59999';
    const timeoutMs = 400;

    const [bf, bao, kc, oci, dns, forge] = await Promise.all([
      new BatfishAdapter({ baseUrl: closedUrl, timeoutMs }).checkHealth(),
      new OpenBaoAdapter({ baseUrl: closedUrl, timeoutMs }).checkHealth(),
      new KeycloakAdapter({ baseUrl: closedUrl, timeoutMs }).checkHealth(),
      new OciSupplyChainAdapter({ zotUrl: closedUrl, trivyUrl: closedUrl, timeoutMs }).checkHealth(),
      new DdiDnsAdapter({ baseUrl: closedUrl, timeoutMs }).checkHealth(),
      new GitopsForgeAdapter({ baseUrl: closedUrl, timeoutMs }).checkHealth()
    ]);

    for (const res of [bf, bao, kc, oci, dns, forge]) {
      expect(res.reachable).toBe(false);
      expect(res.mode).toBe('degraded');
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  const liveIt = LIVE_MODE ? it : it.skip;

  liveIt('valide la connectivité et les opérations live contre compose.yml (SYLVA_STACK_LIVE=1)', async () => {
    const batfish = new BatfishAdapter();
    const openbao = new OpenBaoAdapter();
    const keycloak = new KeycloakAdapter();
    const oci = new OciSupplyChainAdapter();
    const dns = new DdiDnsAdapter();
    const forgejo = new GitopsForgeAdapter();

    const [bfHealth, baoHealth, kcHealth, ociHealth, dnsHealth, forgeHealth] = await Promise.all([
      batfish.checkHealth(),
      openbao.checkHealth(),
      keycloak.checkHealth(),
      oci.checkHealth(),
      dns.checkHealth(),
      forgejo.checkHealth()
    ]);

    expect(bfHealth.reachable).toBe(true);
    expect(baoHealth.reachable).toBe(true);
    expect(kcHealth.reachable).toBe(true);
    expect(ociHealth.zot.reachable).toBe(true);
    expect(ociHealth.trivy.reachable).toBe(true);
    expect(dnsHealth.reachable).toBe(true);
    expect(forgeHealth.reachable).toBe(true);

    // Vérification KV + PKI sur OpenBao dev
    const kvRes = await openbao.ensureKvPaths({
      mount: 'secret',
      provision: true,
      paths: [
        {
          path: 'archinex/smoke-test',
          requiredKeys: ['probe'],
          seedData: { probe: 'ok' }
        }
      ]
    });
    expect(kvRes.compliant).toBe(true);

    // Vérification zone DNS sur Technitium
    const dnsRes = await dns.ensureZones({
      zones: ['archinex.local'],
      provision: true
    });
    expect(dnsRes.compliant).toBe(true);
  });
});
