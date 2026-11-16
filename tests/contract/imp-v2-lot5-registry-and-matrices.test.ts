import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_VALUE_CATALOGS,
  type LogicalComponent
} from '../../src/lib/domain/edp/componentCatalog.js';
import { resolveComponentInstance } from '../../src/lib/domain/edp/refResolver.js';
import {
  buildBgpRoutingAnnexV2,
  buildCertificateMatrixV2,
  buildExposureMatrixV2,
  buildFirewallMatrixV2,
  createEmptyStateRegistry,
  diffResolvedAgainstSnapshot,
  exportCmdbRecords,
  listGcEligibleEntities,
  placeEntityInQuarantine,
  recordRegistryOperation
} from '../../src/lib/domain/edp/stateRegistry.js';

describe('IMP V2 Lot 5 (#307) : State Registry (snapshots/quarantaine/CMDB) & Matrices documentaires V2', () => {
  it('enregistre une opération immutable, détecte les dérives vs snapshot et exporte vers la CMDB (§8.3)', () => {
    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const gisBase = DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'gis-server')!;
    const resolved = resolveComponentInstance(gisBase, prodOverlay, 'dc1', DEFAULT_VALUE_CATALOGS);

    let registry = createEmptyStateRegistry();
    registry = recordRegistryOperation(registry, {
      operationId: 'op-001',
      script: 'imp deploy gis-server --env prod --dc dc1',
      user: 'ops@example.io',
      timestamp: '2026-11-16T20:00:00.000Z',
      resolved
    });

    expect(registry.operations).toHaveLength(1);
    expect(registry.snapshots[resolved.instanceKey]).toBeDefined();
    expect(diffResolvedAgainstSnapshot(registry, resolved)).toEqual([]);

    // Simulation d'une dérive de réplicas / IP par rapport au snapshot enregistré
    const drifted = structuredClone(resolved);
    drifted.modules[0].replicas += 1;
    drifted.modules[0].instances[0].nics[0].ip = '10.99.99.99';
    const diffs = diffResolvedAgainstSnapshot(registry, drifted);
    expect(diffs.some((d) => d.field.endsWith('.replicas'))).toBe(true);
    expect(diffs.some((d) => d.field.includes('.nics['))).toBe(true);

    // Export CMDB unidirectionnel (§8.3 règle 7)
    const cis = exportCmdbRecords(registry, [
      { entityFamily: 'component', ciClass: 'cmdb_ci_service', attributes: {} },
      { entityFamily: 'module', ciClass: 'cmdb_ci_appl', attributes: {} }
    ]);
    expect(cis.some((c) => c.ciClass === 'cmdb_ci_service' && c.ciId === resolved.instanceKey)).toBe(true);
    expect(cis.some((c) => c.ciClass === 'cmdb_ci_appl')).toBe(true);
  });

  it('gère la quarantaine avant suppression GC en respectant les délais de grâce et retainProtected (§7.4, §8.7)', () => {
    let registry = createEmptyStateRegistry();
    registry = placeEntityInQuarantine(registry, {
      entityId: 'vrf-legacy',
      entityKind: 'vrf',
      reason: 'decommission',
      quarantinedAt: '2026-11-01T00:00:00.000Z',
      graceDays: 7,
      retainProtected: false
    });
    registry = placeEntityInQuarantine(registry, {
      entityId: 'pvc-audit-archive',
      entityKind: 'storage',
      reason: 'decommission',
      quarantinedAt: '2026-11-01T00:00:00.000Z',
      graceDays: 7,
      retainProtected: true
    });

    // Avant expiration (5 jours) -> aucun éligible
    expect(listGcEligibleEntities(registry, '2026-11-06T00:00:00.000Z')).toEqual([]);

    // Après expiration (10 jours) -> vrf-legacy éligible, pvc-audit-archive protégé par retain
    const eligible = listGcEligibleEntities(registry, '2026-11-11T00:00:00.000Z');
    expect(eligible.map((e) => e.entityId)).toEqual(['vrf-legacy']);
  });

  it('génère les 4 matrices documentaires V2 (Certificats, Pare-feu/Chemin, BGP/Routage, Exposition) (§9)', () => {
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG[0]);
    const comp: LogicalComponent = {
      ...base,
      spec: {
        ...base.spec,
        network: {
          ...base.spec.network,
          vrfs: [
            {
              name: 'vrf-a',
              domain: 'a.example.io',
              fabric: {
                routePropagation: [{ to: 'vrf-b', prefixes: ['10.10.0.0/24'], action: 'allow' }],
                bgpPropagation: [
                  {
                    to: 'vrf-b',
                    prefixes: ['10.10.0.0/24'],
                    announce: { via: 'evpn', anycastFrom: ['leaf-1', 'leaf-2'] }
                  }
                ]
              }
            }
          ]
        },
        security: {
          ...base.spec.security,
          certificates: [
            {
              name: 'api-tls',
              type: 'server',
              profile: 'ref(certificateProfiles[tls-server-std])',
              cn: 'api.example.io',
              issuanceMethod: 'acme',
              boundToVip: 'vip-api',
              sslTermination: 'on-proxy'
            }
          ]
        },
        firewall: {
          policy: 'deny-by-default',
          groups: [],
          rules: [
            {
              id: 'r-zone-01',
              from: 'zone:app',
              to: 'zone:untrusted-external',
              proto: 'tcp',
              ports: [443],
              action: 'allow',
              functionalFlow: 'SGi'
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
              certificates: ['ref(certificates[api-tls])'],
              tls: { minVersion: 'tls1.3', termination: 'on-proxy' },
              routes: [{ path: '/v1', backend: 'ref(network.loadBalancers[lb].listeners[https])' }]
            }
          ],
          fileTransfers: [
            {
              name: 'ft-reports',
              direction: 'outbound',
              protocol: 'sftp',
              partners: ['ref(component:partner)'],
              localPath: 'ref(storage.svms[svm])',
              schedule: '0 3 * * *'
            }
          ],
          email: [
            {
              name: 'mail-alerts',
              direction: 'outbound',
              relay: 'ref(component:mta)',
              sender: 'noreply@example.io',
              security: { transport: 'starttls', signing: 'smime' }
            }
          ]
        }
      }
    };

    const certMatrix = buildCertificateMatrixV2([comp], DEFAULT_VALUE_CATALOGS);
    expect(certMatrix).toHaveLength(1);
    expect(certMatrix[0].profile).toBe('tls-server-std');
    expect(certMatrix[0].keySize).toBe(3072);
    expect(certMatrix[0].algorithm).toBe('rsa');

    const fwMatrix = buildFirewallMatrixV2([comp], DEFAULT_VALUE_CATALOGS);
    const zoneRule = fwMatrix.find((r) => r.ruleId === 'r-zone-01')!;
    expect(zoneRule.firewallPath).toEqual(['fw-interzone-core', 'fw-external']);
    expect(zoneRule.functionalFlow).toBe('SGi');

    const bgpAnnex = buildBgpRoutingAnnexV2([comp]);
    expect(bgpAnnex.some((b) => b.kind === 'bgpPropagation' && b.anycastFrom?.length === 2)).toBe(true);

    const expMatrix = buildExposureMatrixV2([comp]);
    expect(expMatrix.map((e) => e.kind)).toEqual(['entryPoint', 'fileTransfer', 'email']);
  });
});
