import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_VALUE_CATALOGS,
  type LogicalComponent
} from '../../src/lib/domain/edp/componentCatalog.js';
import { resolveComponentInstance } from '../../src/lib/domain/edp/refResolver.js';
import {
  buildSylvaTwinModel,
  generateKwokNodeManifests,
  generateSushyEmulatorConfig
} from '../../src/lib/domain/edp/sylvaTwin.js';
import {
  buildSylvaTenantWorkloadManifests,
  planSylvaClusterDriver
} from '../../src/lib/server/edp/sylvaGitopsExport.js';

describe('IMP V2 Lot 4 (#306) : Convergence Sylva (Twin depuis compute.hardware/namespaces & ClusterDriver)', () => {
  it('alimente le Jumeau Sylva depuis compute.hardware (§3.3.2) et compute.namespaces (§3.3.1)', () => {
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG[0]);
    const compWithHwAndNs: LogicalComponent = {
      ...base,
      spec: {
        ...base.spec,
        compute: {
          ...base.spec.compute!,
          namespaces: [
            {
              name: 'ns-core-upf',
              zone: 'app',
              quotas: { cpu: 16, memory: '64Gi', persistentVolumeClaims: 4 }
            }
          ],
          hardware: [
            {
              name: 'bm-declared-sriov-01',
              model: 'HPE-ProLiant-DL380-Gen11',
              role: 'k8s-worker-sriov',
              cpu: { sockets: 2, cores: 32 },
              memory: '512Gi',
              nics: [{ class: 'business', model: 'broadcom-57416', ports: 2 }],
              firmware: {
                bios: { version: '2.14', baseline: '2024q3' },
                bmc: { version: '1.9.2', protocol: 'redfish' }
              },
              oob: { class: 'oob', address: 'ref(network.reserved[oob-bm-01])' }
            }
          ]
        }
      }
    };

    const twin = buildSylvaTwinModel({
      components: [compWithHwAndNs],
      overlay: DEFAULT_ENVIRONMENT_OVERLAYS[0],
      catalogs: DEFAULT_VALUE_CATALOGS,
      profileId: '3dc-active'
    });

    const declaredHost = twin.bareMetalHosts.find((h) => h.name === 'bm-declared-sriov-01');
    expect(declaredHost).toBeDefined();
    expect(declaredHost!.capacity.cpuCores).toBe(64);
    expect(declaredHost!.capacity.memoryGiB).toBe(512);
    expect(declaredHost!.pool).toBe('sylva-cnf-sriov-dpdk');
    expect(declaredHost!.bmcAddress).toContain('/redfish/v1/Systems/');

    expect(twin.declaredNamespaces).toHaveLength(1);
    expect(twin.declaredNamespaces![0].name).toBe('ns-core-upf');
    expect(twin.declaredNamespaces![0].quotas.cpu).toBe(16);

    const sushy = generateSushyEmulatorConfig(twin);
    expect(sushy.systems.some((s) => s.name === 'bm-declared-sriov-01')).toBe(true);

    const kwokNodes = generateKwokNodeManifests(twin);
    expect(kwokNodes.some((n) => (n.metadata as { name: string }).name === 'bm-declared-sriov-01')).toBe(true);
  });

  it('projette un composant résolu en plan ClusterDriver ordonné avec propagation des labels (§7.1-§7.3)', () => {
    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const gisBase = DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'gis-server')!;
    const resolved = resolveComponentInstance(gisBase, prodOverlay, 'dc1', DEFAULT_VALUE_CATALOGS);

    const plan = planSylvaClusterDriver(resolved);
    expect(plan.driver).toBe('cluster-rancher');
    expect(plan.supportsPlan).toBe(true);
    expect(plan.operations[0].operation).toBe('createTenant');
    expect(plan.operations[0].targetKind).toBe('Project');
    expect(plan.operations[1].operation).toBe('createComponent');
    expect(plan.operations.some((o) => o.operation === 'createModule' && o.targetKind === 'Namespace')).toBe(true);
    expect(plan.operations.some((o) => o.operation === 'deployWorkload' && o.targetKind === 'HelmRelease')).toBe(true);
    expect(plan.operations.some((o) => o.operation === 'applyFirewall' && o.targetKind === 'CiliumNetworkPolicy')).toBe(true);

    for (const op of plan.operations) {
      expect(op.labels.tenant).toBe(resolved.tenant);
      expect(op.labels.component).toBe(resolved.name);
      expect(op.labels.environment).toBe(resolved.environment);
    }
  });

  it('génère les manifests Multus NAD, CiliumEgressGatewayPolicy et CiliumBGP dans buildSylvaTenantWorkloadManifests', () => {
    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const base = structuredClone(DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'gis-server')!);
    base.spec.network = {
      ...base.spec.network,
      vrfs: [
        {
          name: 'vrf-gis',
          domain: 'gis.example.io',
          fabric: {
            bgpPropagation: [
              {
                to: 'vrf-core',
                prefixes: ['10.42.10.0/24'],
                announce: { via: 'evpn', anycastFrom: ['leaf-1', 'leaf-2'] }
              }
            ]
          }
        }
      ]
    };
    base.spec.compute = {
      ...base.spec.compute!,
      namespaces: [
        {
          name: 'ns-gis-egress',
          zone: 'app',
          quotas: { cpu: 4, memory: '8Gi' },
          egress: { ipPool: '10.42.10.240/28' }
        }
      ]
    };

    const resolved = resolveComponentInstance(base, prodOverlay, 'dc1', DEFAULT_VALUE_CATALOGS);
    const files = buildSylvaTenantWorkloadManifests(resolved, base);

    const nadFile = files.find((f) => f.path.endsWith('/multus-nads.yaml'));
    expect(nadFile).toBeDefined();
    expect(nadFile!.yaml).toContain('NetworkAttachmentDefinition');
    expect(nadFile!.yaml).toContain('whereabouts');

    const egressFile = files.find((f) => f.path.endsWith('/cilium-egress-gateway.yaml'));
    expect(egressFile).toBeDefined();
    expect(egressFile!.yaml).toContain('CiliumEgressGatewayPolicy');
    expect(egressFile!.yaml).toContain('10.42.10.240/28');

    const bgpFile = files.find((f) => f.path.endsWith('/cilium-bgp.yaml'));
    expect(bgpFile).toBeDefined();
    expect(bgpFile!.yaml).toContain('CiliumBGPAdvertisement');
    expect(bgpFile!.yaml).toContain('CiliumBGPClusterConfig');
  });
});
