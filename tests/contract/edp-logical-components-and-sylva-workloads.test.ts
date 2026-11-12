import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_VALUE_CATALOGS,
  lintBaseComponentNoHardcodedEnv,
  validateComponentAgainstCatalogs,
  type LogicalComponent
} from '../../src/lib/domain/edp/componentCatalog.js';
import {
  buildReferenceGraph,
  computeImpactRadius,
  generateImplicitFlows,
  resolveComponentInstance,
  simulateWhatIfDatacenters,
  verifyLogicalInterfaceContinuity
} from '../../src/lib/domain/edp/refResolver.js';
import {
  composeProjectLogicalTopology,
  summarizeWhatIfComparison
} from '../../src/lib/domain/edp/logicalViews.js';
import {
  buildSylvaTenantWorkloadManifests,
  exportSylvaWorkloadClusterGitops
} from '../../src/lib/server/edp/sylvaGitopsExport.js';
import { composeMultiAxisHydration } from '../../src/lib/server/edp/refinementCoverage.js';
import { loadOntologyCatalog } from '../../src/lib/server/edp/ontologyClient.js';

describe('Lots 1-5 : Composants Logiques, Base x Overlay x DC, What-If & Export Sylva-First', () => {
  it('Lot 1 : valide tous les composants de référence (core-network, ptt-server, gis-server, eir-proxy, gsma-eir)', () => {
    for (const comp of DEFAULT_COMPONENT_CATALOG) {
      const lint = lintBaseComponentNoHardcodedEnv(comp);
      const cat = validateComponentAgainstCatalogs(comp, DEFAULT_VALUE_CATALOGS);
      expect(lint, `Lint échoué sur ${comp.metadata.name}`).toEqual([]);
      expect(cat, `Validation catalogue échouée sur ${comp.metadata.name}`).toEqual([]);
    }
  });

  it('Lot 1 : rejette une Base contenant une IP en dur, un tag :latest ou un offset réservé (.0-.31)', () => {
    const badComp: LogicalComponent = structuredClone(DEFAULT_COMPONENT_CATALOG[2]); // gis-server
    badComp.spec.network!.subnets![0].cidr = '10.99.0.0/24';
    badComp.spec.compute!.modules[0].helm!.version = 'latest';
    badComp.spec.compute!.modules[0].nics[1].ip = { by: 'offset', value: 12 };

    const lint = lintBaseComponentNoHardcodedEnv(badComp);
    const cat = validateComponentAgainstCatalogs(badComp, DEFAULT_VALUE_CATALOGS);

    expect(lint.some((i) => i.code === 'hardcoded-env-value')).toBe(true);
    expect(lint.some((i) => i.message.includes('latest'))).toBe(true);
    expect(cat.some((i) => i.message.includes('Offset IP 12 interdit'))).toBe(true);
  });

  it('Lot 2 : résout Base x Overlay x DC, calcule les IPs par offset, le graphe ref() et les flux implicites', () => {
    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const gisBase = DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'gis-server')!;
    const resolvedDc1 = resolveComponentInstance(gisBase, prodOverlay, 'dc1', DEFAULT_VALUE_CATALOGS);
    const resolvedDc2 = resolveComponentInstance(gisBase, prodOverlay, 'dc2', DEFAULT_VALUE_CATALOGS);

    expect(resolvedDc1.unresolvedRefs).toEqual([]);
    expect(resolvedDc1.tenant).toBe('tenant-gis-server-prod');
    expect(resolvedDc1.modules[0].instances[0].nics[1].ip).toBe('10.42.10.40');
    expect(resolvedDc1.modules[0].instances[1].nics[1].ip).toBe('10.42.10.41');
    // Décalage inter-DC sur dc2 (+20)
    expect(resolvedDc2.modules[0].instances[0].nics[1].ip).toBe('10.42.10.60');

    // Flux implicites : NFS (tiles-archive), SIEM (events), PKI autoRenew
    expect(resolvedDc1.implicitRules.some((r) => r.ports.includes(2049))).toBe(true);
    expect(resolvedDc1.implicitRules.some((r) => r.ports.includes(6514))).toBe(true);
    expect(resolvedDc1.implicitRules.some((r) => r.id.startsWith('auto-pki-'))).toBe(true);
    expect(resolvedDc1.implicitRules.every((r) => r.category === 'auto-generated')).toBe(true);

    // Graphe de références & impact
    const graph = buildReferenceGraph(DEFAULT_COMPONENT_CATALOG);
    const impact = computeImpactRadius(graph, 'gis-server');
    expect(impact.dependents).toContain('ptt-server');
  });

  it('Lot 2 : détecte une discontinuité de segments sur une LogicalInterface', () => {
    const errors = verifyLogicalInterfaceContinuity([
      {
        name: 'S6a-broken',
        direction: 'bidirectional',
        description: 'Test rupture',
        flows: [
          { segment: 'seg-1', from: 'group:ext-mme', to: 'group:secgw', proto: 'sctp', port: 3868 },
          { segment: 'seg-2', from: 'group:wrong-hop', to: 'group:hss', proto: 'sctp', port: 3868 }
        ]
      }
    ]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Discontinuité');
  });

  it('Lot 3 : génère les 3 vues Mermaid synchronisées et compare What-If 2 vs 3 DCs', () => {
    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const scenarios = summarizeWhatIfComparison(
      simulateWhatIfDatacenters(DEFAULT_COMPONENT_CATALOG, prodOverlay, [2, 3], DEFAULT_VALUE_CATALOGS)
    );

    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].dcCount).toBe(2);
    expect(scenarios[1].dcCount).toBe(3);
    expect(scenarios[1].totalInstances).toBeGreaterThan(scenarios[0].totalInstances);
    expect(scenarios[1].estimatedBareMetalHosts).toBe(6);
    expect(scenarios[1].deploymentMermaid).toContain('dc3');

    const resolvedDc1 = DEFAULT_COMPONENT_CATALOG.filter((c) => !c.metadata.external).map((c) =>
      resolveComponentInstance(c, prodOverlay, 'dc1', DEFAULT_VALUE_CATALOGS)
    );
    const topo = composeProjectLogicalTopology(
      'proj-test',
      'prod',
      ['dc1', 'dc2'],
      DEFAULT_COMPONENT_CATALOG,
      resolvedDc1
    );

    expect(topo.mermaid.logicalView).toContain('gis_server');
    expect(topo.mermaid.logicalView).toContain('Rx-N5');
    expect(topo.mermaid.logicalView).toContain('WMS-WFS');
    expect(topo.mermaid.deploymentView).toContain('sylva-cnf-sriov-dpdk');
    expect(topo.mermaid.physicalCmdbView).toContain('10.42.10.40');
  });

  it('Lot 4 : vérifie la présence des règles Rego Axe 7 dans multi_axis_refinement.rego', () => {
    const rego = readFileSync(
      resolve(process.cwd(), 'edp/policies/multi_axis_refinement.rego'),
      'utf-8'
    );
    expect(rego).toContain('deny_component_substrate_mismatch');
    expect(rego).toContain('deny_logical_interface_discontinuity');
    expect(rego).toContain('deny_unresolved_component_refs');
    expect(rego).toContain('deny_component_lint_violation');
  });

  it('Lot 5 : génère le bundle GitOps Sylva léger (values.yaml + Namespace/CiliumNetworkPolicy/HelmRelease)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: false });
    const hydrated = composeMultiAxisHydration(
      'sub-telco-PTT-gis',
      [
        { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
        { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 }
      ],
      catalog
    );

    expect(hydrated.resolved_components?.length).toBeGreaterThanOrEqual(4);

    const exported = await exportSylvaWorkloadClusterGitops({
      edpId: 'EDP-test-01',
      subjectId: 'sub-telco-PTT-gis',
      revision: 1,
      ontologyFingerprint: 'sha256-test',
      opaVerdict: 'compliant',
      hydratedInventory: hydrated
    });

    expect(exported.valuesYaml).toContain('capi_providers:');
    expect(exported.tenantWorkloads.length).toBeGreaterThan(0);

    const gisNs = exported.tenantWorkloads.find((f) =>
      f.path.includes('workloads/gis-services/gis-server/prod/namespace.yaml')
    );
    const gisCnp = exported.tenantWorkloads.find((f) =>
      f.path.includes('workloads/gis-services/gis-server/prod/network-policies.yaml')
    );
    const gisHelm = exported.tenantWorkloads.find((f) =>
      f.path.includes('workloads/gis-services/gis-server/prod/helm-releases.yaml')
    );

    expect(gisNs?.yaml).toContain('kind: Namespace');
    expect(gisNs?.yaml).toContain('tenant-gis-server-prod');
    expect(gisCnp?.yaml).toContain('kind: CiliumNetworkPolicy');
    expect(gisHelm?.yaml).toContain('kind: HelmRelease');
    expect(gisHelm?.yaml).toContain('geoserver-postgis');

    // Vérification du cycle de vie staged / inactive sur HelmRelease
    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const stagedGis = structuredClone(
      DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'gis-server')!
    );
    stagedGis.spec.compute!.modules[0].status = 'staged';
    const resolvedStaged = resolveComponentInstance(stagedGis, prodOverlay, 'dc1');
    const stagedFiles = buildSylvaTenantWorkloadManifests(resolvedStaged);
    const stagedHelm = stagedFiles.find((f) => f.path.endsWith('helm-releases.yaml'));
    expect(stagedHelm?.yaml).toContain('"archinex.io/exposure": disabled');
  });
});
