import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_VALUE_CATALOGS,
  deriveOrganizationBubble,
  lintBaseComponentNoHardcodedEnv,
  validateCertificateProfilesAndRgs,
  validateComponentAgainstCatalogs,
  validateDriverCapabilities,
  validateOrganization,
  type LogicalComponent,
  type OrganizationSpec
} from '../../src/lib/domain/edp/componentCatalog.js';

describe('IMP V2 Lot 1 (#303) : Catalogues étendus, Organization, Certificats RGS & Drivers', () => {
  it('expose les nouveaux catalogues IMP V2 (NIC storage/backup/oob, QoS, VLAN/VNI pools, firewalls, certificateProfiles, drivers)', () => {
    expect(DEFAULT_VALUE_CATALOGS.nicClasses).toEqual(
      expect.arrayContaining(['admin', 'business', 'events', 'internal', 'storage', 'backup', 'oob'])
    );
    expect(DEFAULT_VALUE_CATALOGS.qosClasses?.map((q) => q.name)).toContain('ef');
    expect(DEFAULT_VALUE_CATALOGS.vlanPools?.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_VALUE_CATALOGS.vniPools?.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_VALUE_CATALOGS.firewalls?.map((f) => f.usage)).toEqual(
      expect.arrayContaining(['interzone', 'external', 'operator-link'])
    );
    expect(DEFAULT_VALUE_CATALOGS.certificateProfiles?.map((p) => p.name)).toContain('tls-server-std');
    expect(DEFAULT_VALUE_CATALOGS.drivers?.every((d) => d.supportsPlan)).toBe(true);
  });

  it('valide une Organization (§5.1) et dérive sa bulle réseau/DNS/APN dédiée', () => {
    const org: OrganizationSpec = {
      apiVersion: 'imp.example.io/v1',
      kind: 'Organization',
      metadata: {
        name: 'org-alpha',
        displayName: 'Alpha Agency',
        status: 'active',
        version: '1.0.0',
        manifestVersion: 1
      },
      spec: {
        type: 'customer',
        dnsDomains: ['alpha.example.io'],
        apns: ['ref(network.apns[apn-alpha])'],
        consumes: ['ref(component:api-gateway)', 'ref(component:media-service)'],
        contacts: { owner: 'alpha-liaison@example.io', oncall: 'ops-alpha' }
      }
    };

    expect(validateOrganization(org)).toEqual([]);
    const bubble = deriveOrganizationBubble(org);
    expect(bubble.tenant).toBe('tenant-org-alpha');
    expect(bubble.vrf).toBe('vrf-org-alpha');
    expect(bubble.dnsDomain).toBe('alpha.example.io');
    expect(bubble.apns).toEqual(['ref(network.apns[apn-alpha])']);
  });

  it('rejette une Organization portant compute, firewall ou exposure (§5.1 règle 1)', () => {
    const invalidOrg: OrganizationSpec = {
      apiVersion: 'imp.example.io/v1',
      kind: 'Organization',
      metadata: {
        name: 'org-invalid',
        displayName: 'Invalid Org',
        status: 'active',
        version: '1.0.0',
        manifestVersion: 1
      },
      spec: {
        type: 'customer',
        dnsDomains: [],
        apns: [],
        consumes: [],
        contacts: { owner: 'owner@example.io', oncall: 'ops' },
        compute: { modules: [] },
        firewall: { policy: 'deny-by-default' }
      }
    };

    const issues = validateOrganization(invalidOrg);
    expect(issues.some((i) => i.path === 'spec.compute')).toBe(true);
    expect(issues.some((i) => i.path === 'spec.firewall')).toBe(true);
    expect(issues.some((i) => i.path === 'spec.dnsDomains')).toBe(true);
  });

  it('valide les certificats par profil partagé et rejette les propriétés X.509 inline ou RSA < 3072 (§3.6.2)', () => {
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG[0]);
    const validComp: LogicalComponent = {
      ...base,
      spec: {
        ...base.spec,
        security: {
          certificates: [
            {
              name: 'api-cert',
              type: 'server',
              profile: 'ref(certificateProfiles[tls-server-std])',
              cn: 'api.example.io',
              issuanceMethod: 'acme'
            }
          ]
        }
      }
    };
    expect(validateCertificateProfilesAndRgs(validComp, DEFAULT_VALUE_CATALOGS)).toEqual([]);

    const inlineBadComp: LogicalComponent = {
      ...base,
      spec: {
        ...base.spec,
        security: {
          certificateProfiles: [
            {
              name: 'weak-rsa',
              type: 'server',
              validityDays: 90,
              keySize: 2048,
              algorithm: 'rsa',
              extendedKeyUsage: ['serverAuth'],
              keyUsage: ['digitalSignature'],
              keyType: { private: 'nonExportable', storage: 'vault' }
            }
          ],
          certificates: [
            {
              name: 'inline-cert',
              type: 'server',
              profile: 'ref(certificateProfiles[weak-rsa])',
              cn: 'weak.example.io',
              validityDays: 90,
              issuanceMethod: 'internal-ca'
            }
          ]
        }
      }
    };

    const issues = validateCertificateProfilesAndRgs(inlineBadComp, DEFAULT_VALUE_CATALOGS);
    expect(issues.some((i) => i.message.includes('inline'))).toBe(true);
    expect(issues.some((i) => i.message.includes('RGS'))).toBe(true);
  });

  it('supporte les nouveaux blocs IMP V2 (fabric, namespaces, hardware, S3, exposure, observability, data, supplyChain, lifecycle) sans casser le lint base', () => {
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG[0]);
    const v2Comp: LogicalComponent = {
      ...base,
      spec: {
        ...base.spec,
        network: {
          ...base.spec.network,
          fabric: {
            underlay: {
              protocol: 'evpn-vxlan',
              bgpAsn: 'ref(param.fabric.asn)',
              peers: [{ name: 't0-core', model: 'ref(catalog.network-device-models[t0])', role: 't0' }]
            },
            vniPool: 'ref(catalog.vni-pools[app])',
            leafs: [{ name: 'leaf-app-01', zone: 'app' }],
            security: {
              bgpSessions: {
                authentication: { method: 'tcp-ao', secret: 'ref(secrets[bgp-t0])' },
                gtsm: { ttl: 255 },
                maxPrefix: { limit: 1000, threshold: '85%', action: 'warn' }
              },
              vtep: { allowedPeers: ['ref(network.fabric.leafs[leaf-app-01])'], vniLeaking: 'deny' },
              ingressFiltering: [{ rule: 'bogons', action: 'deny' }]
            }
          }
        },
        compute: {
          ...base.spec.compute!,
          namespaces: [
            {
              name: 'ns-service-api',
              zone: 'ref(catalog.zones[app])',
              quotas: { cpu: 8, memory: '16Gi', persistentVolumeClaims: 10 },
              ingress: { ipPool: 'ref(network.subnets[sn-ingress])' },
              egress: { ipPool: 'ref(network.subnets[sn-egress])', qos: { dscp: 'af31' } }
            }
          ],
          hardware: [
            {
              name: 'bm-node-01',
              model: 'ref(catalog.hardware-models[dl380-g11])',
              role: 'k8s-worker',
              cpu: { sockets: 2, cores: 24 },
              memory: '256Gi',
              nics: [{ class: 'business', model: 'ref(catalog.nic-models[broadcom])', ports: 2 }],
              firmware: {
                bios: { version: '2.14', baseline: 'ref(catalog.firmware-baselines[2024q3])' },
                bmc: { version: '1.9.2', protocol: 'redfish' }
              },
              oob: { class: 'oob', address: 'ref(network.reserved[oob-bm-node-01])' }
            }
          ]
        },
        storage: {
          ...base.spec.storage,
          objectStores: [
            {
              name: 'ob-backups',
              buckets: [
                {
                  name: 'backups',
                  versioning: true,
                  encryption: { atRest: 'aes256', kms: 'ref(component:kms-service.keys[storage])' },
                  quota: '5Ti',
                  access: [{ grant: 'group:app-jobs', rights: ['put', 'list'] }]
                }
              ]
            }
          ]
        },
        exposure: {
          entryPoints: [
            {
              name: 'ep-api',
              type: 'api-gateway',
              hostname: 'api.example.io',
              vip: 'ref(network.reserved[vip-api])',
              certificates: ['ref(certificates[api-cert])'],
              tls: { minVersion: 'tls1.2', termination: 'on-proxy', backendTls: 'mtls' },
              routes: [{ path: '/v1', backend: 'ref(network.loadBalancers[lb-api].listeners[https])' }]
            }
          ]
        },
        observability: {
          logs: { metadata: 'ref(component:logs-service.dictionary[std])', sources: [] },
          kpis: [{ name: 'api-latency-p95', type: 'latency', target: '200ms', window: '5m' }]
        },
        data: {
          databases: [
            {
              name: 'db-main',
              engine: 'ref(catalog.db-engines[postgresql-16])',
              ha: { mode: 'patroni', replicas: 3, method: 'synchronous', failover: 'automatic' },
              sizing: { storage: { size: '100Gi', tier: 'hot' }, connections: 200 },
              backup: { policy: 'daily', pitr: true, retentionDays: 30 },
              access: [{ grant: 'group:api', rights: 'rw' }],
              endpoints: { service: 'ref(network.aliases[db-main])', port: 5432 }
            }
          ]
        },
        supplyChain: {
          pipelines: [
            {
              name: 'build-app',
              scope: 'component',
              source: 'ref(supplyChain.repositories[app-repo])',
              trust: { signedPackagesOnly: true }
            }
          ]
        },
        lifecycle: {
          bootstrap: { staticIp: true, reclaim: true },
          rollback: { strategy: 'redeploy' }
        }
      }
    };

    expect(lintBaseComponentNoHardcodedEnv(v2Comp)).toEqual([]);
    expect(validateComponentAgainstCatalogs(v2Comp, DEFAULT_VALUE_CATALOGS)).toEqual([]);
  });

  it('valide les capacités requises contre la CapabilityMatrix des drivers (§7.2 règle 4)', () => {
    expect(validateDriverCapabilities(['createTenant', 'applyFirewall', 'applyBgpPropagation'], DEFAULT_VALUE_CATALOGS)).toEqual([]);
    const missing = validateDriverCapabilities(['nonExistentDriverOp'], DEFAULT_VALUE_CATALOGS);
    expect(missing).toHaveLength(1);
    expect(missing[0].code).toBe('missing-driver-capability');
  });
});
