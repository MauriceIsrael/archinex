import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_VALUE_CATALOGS,
  type LogicalComponent
} from '../../src/lib/domain/edp/componentCatalog.js';
import {
  buildReferenceGraph,
  deduceFirewallPath,
  generateImplicitFlows,
  validateComponentFirewallPaths,
  validateIpFabricAndBgp
} from '../../src/lib/domain/edp/refResolver.js';

describe('IMP V2 Lot 2 (#304) : Déduction de chemin pare-feu, IP Fabric/BGP & Flux implicites étendus', () => {
  it('déduit le chemin ordonné des pare-feu (interzone + external) et rejette une paire de zones non protégée (§3.5.1)', () => {
    const sameZone = deduceFirewallPath('app', 'app', DEFAULT_VALUE_CATALOGS);
    expect(sameZone.firewalls).toEqual([]);
    expect(sameZone.error).toBeUndefined();

    const appToDmz = deduceFirewallPath('app', 'dmz', DEFAULT_VALUE_CATALOGS);
    expect(appToDmz.firewalls.map((f) => f.name)).toEqual(['fw-interzone-core']);

    const appToExternal = deduceFirewallPath('app', 'untrusted-external', DEFAULT_VALUE_CATALOGS);
    expect(appToExternal.firewalls.map((f) => f.name)).toEqual(['fw-interzone-core', 'fw-external']);

    const unprotected = deduceFirewallPath('app', 'isolated-unknown-zone', DEFAULT_VALUE_CATALOGS);
    expect(unprotected.error).toContain('non protégé');
    expect(unprotected.error).toContain('app -> isolated-unknown-zone');
  });

  it('valide les chemins pare-feu sur les règles d’un composant via validateComponentFirewallPaths', () => {
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG[2]); // composant interne avec subnet app
    const extComp: LogicalComponent = {
      ...structuredClone(DEFAULT_COMPONENT_CATALOG[0]),
      metadata: {
        ...DEFAULT_COMPONENT_CATALOG[0].metadata,
        name: 'ext-partner',
        external: true
      },
      spec: {
        class: 'external',
        network: { addresses: [{ name: 'pool', cidr: '198.51.100.0/24', family: 'ipv4' }] },
        firewall: {
          policy: 'deny-by-default',
          groups: [{ name: 'ext-partner-grp', membersRef: 'ref(network.addresses)' }],
          rules: []
        }
      }
    };

    const modName = base.spec.compute!.modules[0].name;
    base.spec.firewall = {
      policy: 'deny-by-default',
      groups: [
        { name: 'app-svc', membersRef: `ref(compute.modules[${modName}].instances[*].nics[class=business].ip)` }
      ],
      rules: [
        {
          id: 'r-ext-01',
          from: 'group:app-svc',
          to: 'group:ext-partner-grp',
          proto: 'tcp',
          ports: [443],
          action: 'allow'
        }
      ]
    };

    const res = validateComponentFirewallPaths(base, [base, extComp], DEFAULT_VALUE_CATALOGS);
    expect(res.errors).toEqual([]);
    expect(res.deductions).toHaveLength(1);
    expect(res.deductions[0].firewalls.map((f) => f.name)).toEqual(['fw-interzone-core', 'fw-external']);
  });

  it('valide les whitelists IP Fabric, la symétrie RT, anycastFrom >= 2 et fabric.security (§3.2.8)', () => {
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG[0]);
    const fabricComp: LogicalComponent = {
      ...base,
      spec: {
        ...base.spec,
        network: {
          vrfs: [
            {
              name: 'vrf-a',
              domain: 'a.example.io',
              fabric: {
                routePropagation: [
                  { to: 'vrf-b', prefixes: ['ref(network.subnets[sn-a])', 'ref(network.reserved[vip-a])'], action: 'allow' }
                ],
                bgpPropagation: [
                  {
                    to: 'vrf-b',
                    prefixes: ['ref(network.reserved[vip-a])'],
                    announce: { via: 'evpn', anycastFrom: ['leaf-1', 'leaf-2'] }
                  }
                ]
              }
            },
            {
              name: 'vrf-b',
              domain: 'b.example.io',
              fabric: {
                routePropagation: [
                  { to: 'vrf-a', prefixes: ['ref(network.subnets[sn-a])'], action: 'allow' }
                ]
              }
            }
          ],
          routes: [
            {
              name: 'rt-a-b',
              type: 'leaked',
              from: 'vrf-a',
              to: { vrf: 'vrf-b', prefix: 'ref(network.subnets[sn-a])' },
              nextHop: 'ref(network.reserved[vip-gw])'
            }
          ],
          fabric: {
            underlay: {
              protocol: 'evpn-vxlan',
              bgpAsn: 65001,
              peers: [{ name: 't0-1', model: 'm1', role: 't0' }]
            },
            vniPool: 'ref(catalog.vni-pools[app])',
            leafs: [{ name: 'leaf-1', zone: 'app' }, { name: 'leaf-2', zone: 'app' }],
            security: {
              bgpSessions: { authentication: { method: 'tcp-ao', secret: 'ref(secrets[bgp-t0])' } }
            }
          }
        }
      }
    };

    const ok = validateIpFabricAndBgp(fabricComp);
    expect(ok.errors).toEqual([]);
    expect(ok.warnings).toEqual([]);

    // Cas invalides : suppression de fabric.security + route non whitelistée + VIP single-leaf
    const broken = structuredClone(fabricComp);
    delete broken.spec.network!.fabric!.security;
    broken.spec.network!.routes!.push({
      name: 'rt-unlisted',
      type: 'leaked',
      from: 'vrf-a',
      to: { vrf: 'vrf-c', prefix: 'ref(network.subnets[sn-x])' },
      nextHop: 'ref(network.reserved[vip-gw])'
    });
    broken.spec.network!.vrfs![0].fabric!.bgpPropagation![0].announce = {
      via: 'evpn',
      anycastFrom: ['leaf-1']
    };

    const ko = validateIpFabricAndBgp(broken);
    expect(ko.errors.some((e) => e.includes('fabric.security'))).toBe(true);
    expect(ko.errors.some((e) => e.includes('rt-unlisted'))).toBe(true);
    expect(ko.errors.some((e) => e.includes('au moins 2 leafs'))).toBe(true);
  });

  it('génère les flux implicites étendus (VPN, S3, exposure, AV/EDR) et trace generatedFrom dans ReferenceGraph (§3.5.4)', () => {
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG[0]);
    const comp: LogicalComponent = {
      ...base,
      spec: {
        ...base.spec,
        network: {
          ...base.spec.network,
          tunnels: [
            {
              name: 'vpn-partner',
              type: 'site-to-site',
              endpoints: { local: 'ref(network.reserved[vip-vpn])', remote: 'ref(component:ext.network.addresses)' },
              auth: { method: 'certificate' }
            }
          ]
        },
        storage: {
          ...base.spec.storage,
          objectStores: [
            {
              name: 'ob-data',
              buckets: [
                {
                  name: 'bkt',
                  versioning: true,
                  encryption: { atRest: 'aes256', kms: 'ref(component:kms.keys[k1])' },
                  quota: '1Ti',
                  access: [{ grant: 'group:workers', rights: ['get', 'put'] }]
                }
              ]
            }
          ]
        },
        security: {
          ...base.spec.security,
          endpoint: {
            av: { agent: 'ref(catalog.security-agents[av])', dailyUpdate: true }
          }
        },
        exposure: {
          entryPoints: [
            {
              name: 'ep-api',
              type: 'reverse-proxy',
              hostname: 'api.example.io',
              vip: 'ref(network.reserved[vip-api])',
              certificates: ['ref(certificates[c1])'],
              tls: { minVersion: 'tls1.3', termination: 'on-proxy' },
              routes: [{ path: '/v1', backend: 'ref(network.loadBalancers[lb].listeners[https])' }]
            }
          ],
          fileTransfers: [
            {
              name: 'ft-out',
              direction: 'outbound',
              protocol: 'sftp',
              partners: ['ref(component:partner-a)'],
              localPath: 'ref(storage.svms[svm])',
              schedule: '0 3 * * *'
            }
          ],
          email: [
            {
              name: 'mail-out',
              direction: 'outbound',
              relay: 'ref(component:mta.endpoints[env])',
              sender: 'noreply@example.io',
              security: { transport: 'starttls' }
            }
          ]
        },
        firewall: {
          policy: 'deny-by-default',
          groups: [],
          rules: [
            {
              id: 'r-manual-generated',
              from: 'group:a',
              to: 'group:b',
              proto: 'tcp',
              ports: [443],
              action: 'allow',
              category: 'auto-generated',
              generatedFrom: `${base.metadata.name}.exposure.entryPoints[ep-api]`
            }
          ]
        }
      }
    };

    const implicit = generateImplicitFlows(comp, comp.spec.firewall!.rules);
    expect(implicit.some((r) => r.id.startsWith('auto-vpn-'))).toBe(true);
    expect(implicit.some((r) => r.id.startsWith('auto-s3-'))).toBe(true);
    expect(implicit.some((r) => r.id.startsWith('auto-exp-'))).toBe(true);
    expect(implicit.some((r) => r.id.startsWith('auto-mft-') && r.ports.includes(22))).toBe(true);
    expect(implicit.some((r) => r.id.startsWith('auto-mta-') && r.ports.includes(587))).toBe(true);
    expect(implicit.some((r) => r.id.startsWith('auto-endpoint-sec-'))).toBe(true);

    const graph = buildReferenceGraph([comp]);
    expect(graph.edges.some((e) => e.kind === 'generatedFrom' && e.to.includes('exposure.entryPoints[ep-api]'))).toBe(true);
  });
});
