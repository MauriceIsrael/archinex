import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadOntologyCatalog, resetRuntimeOntologyOverlay } from '../../src/lib/server/edp/ontologyClient.js';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration
} from '../../src/lib/server/edp/refinementCoverage.js';
import {
  validateSylvaWorkloadClusterSchema,
  evaluateSylvaGoldenRules
} from '../../src/lib/server/edp/sylvaValidation.js';
import {
  SUBJECT_ID,
  RETAINED_OPTION_TITLE,
  DETAILED_SPEC_MARKDOWN
} from '../../scripts/seed-demo.js';

describe('EDP Phase 4 : Sylva Integration Tests, JSON Schema Contract & OPA Golden Rules', () => {
  beforeEach(() => {
    resetRuntimeOntologyOverlay();
  });

  afterEach(() => {
    resetRuntimeOntologyOverlay();
  });

  const demoBindings = [
    { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
    { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 },
    { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
    { urn: 'urn:archinex:ontology:telecom:network:spine_leaf_evpn', revision: 1 },
    { urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256', revision: 1 },
    { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
    { urn: 'urn:archinex:ontology:security:zone:user_plane', revision: 1 },
    { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
    { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
  ];

  it('génère un SylvaWorkloadCluster à partir du cas d’usage seed:demo et valide le schéma JSON officiel', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

    const coverage = computeRefinementCoverage(
      {
        subjectId: SUBJECT_ID,
        title: '§14 · Hébergement Lots 2/3, RAN tiers et cellules mobiles : sécurité contre souplesse',
        problem:
          'Comment héberger et interconnecter les équipements des Lots 2/3 (MME tiers, RAN, cellules mobiles) tout en garantissant le chiffrement IPsec ESP, la médiation DEA S6a et la réconciliation SLA/NOC ?',
        decisionText: RETAINED_OPTION_TITLE,
        detailedSpec: DETAILED_SPEC_MARKDOWN,
        explicitBindings: demoBindings,
        autoBindFromText: true,
        selectedConceptUrn: 'AUTO'
      },
      catalog
    );

    const hydratedInventory = composeMultiAxisHydration(
      SUBJECT_ID,
      coverage.composedBindings,
      catalog,
      {}
    );

    expect(hydratedInventory.sylva_workload_cluster_values).toBeDefined();
    const sylvaManifest = hydratedInventory.sylva_workload_cluster_values!;

    // 1. Validation formelle face au schéma JSON de la CRD SylvaWorkloadCluster
    const schemaValidation = validateSylvaWorkloadClusterSchema(sylvaManifest);
    expect(schemaValidation.valid).toBe(true);
    expect(schemaValidation.errors).toHaveLength(0);

    // 2. Vérification des propriétés clés KRM / CAPI
    expect(sylvaManifest.apiVersion).toBe('workloadcluster.sylva.org/v1alpha1');
    expect(sylvaManifest.kind).toBe('SylvaWorkloadCluster');

    const spec = sylvaManifest.spec as any;
    expect(spec.capi_providers).toEqual({
      infra_provider: 'capm3',
      bootstrap_provider: 'cabpr'
    });
    expect(spec.k8s_version).toBe('v1.28.11+rke2r1');
    expect(spec.os_image_selector.hardened).toBe(true);
    expect(spec.units.cilium.enabled).toBe(true);
    expect(spec.units.multus.enabled).toBe(true);
    expect(spec.units.sriov.enabled).toBe(true);
    expect(spec.units['sriov-resources'].enabled).toBe(true);
    expect(spec.units.vault.enabled).toBe(true);
    expect(spec.units.kyverno.enabled).toBe(true);
    expect(spec.units.monitoring.enabled).toBe(true);
    expect(spec.units.metallb.enabled).toBe(true);

    // 3. Vérification des MachineDeployments (Pool NIS2 + Pool DPDK)
    const mds = spec.machine_deployments;
    expect(mds['md-sylva-standard-nis2']).toBeDefined();
    expect(mds['md-sylva-cnf-sriov-dpdk']).toBeDefined();

    const sriovMd = mds['md-sylva-cnf-sriov-dpdk'];
    expect(sriovMd.rke2.nodeLabels['sylva.org/dataplane']).toBe('sriov-dpdk-numa');
    expect(sriovMd.rke2.kubeletExtraArgs).toContain('--cpu-manager-policy=static');
    expect(sriovMd.rke2.kubeletExtraArgs).toContain('--topology-manager-policy=single-numa-node');
  });

  it('rejette les manifests non conformes au schéma JSON officiel Sylva', () => {
    // Cas 1 : Mauvaise apiVersion
    const badApiVersion = {
      apiVersion: 'v1',
      kind: 'SylvaWorkloadCluster',
      metadata: { name: 'test-cluster', namespace: 'default' },
      spec: {}
    };
    const res1 = validateSylvaWorkloadClusterSchema(badApiVersion);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.field === 'apiVersion' || e.keyword === 'const')).toBe(true);

    // Cas 2 : Nom Kubernetes invalide (majuscules)
    const badName = {
      apiVersion: 'workloadcluster.sylva.org/v1alpha1',
      kind: 'SylvaWorkloadCluster',
      metadata: { name: 'Cluster_With_Invalid_Case!', namespace: 'default' },
      spec: {
        capi_providers: { infra_provider: 'capm3', bootstrap_provider: 'cabpr' },
        k8s_version: 'v1.28.11+rke2r1',
        os_image_selector: { os: 'sle-micro', release: '5.5', hardened: true },
        units: { cilium: { enabled: true }, metallb: { enabled: true }, kyverno: { enabled: true }, monitoring: { enabled: true } },
        baremetal_hosts: {
          srv1: { bmc: { address: 'redfish://10.0.0.1', credentialsName: 'cred' }, bootMACAddress: '00:11:22:33:44:55' }
        },
        machine_deployments: {
          md1: {
            infra_provider: 'capm3',
            replicas: 1,
            machine_deployment_spec: { template: { spec: { hostSelector: { matchLabels: { 'host-group': 'grp' } } } } },
            rke2: { nodeLabels: { 'sylva.org/pool': 'grp', 'sylva.org/dataplane': 'cilium-nis2' } }
          }
        }
      }
    };
    const res2 = validateSylvaWorkloadClusterSchema(badName);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.path.includes('name') || e.keyword === 'pattern')).toBe(true);

    // Cas 3 : Fournisseur CAPI non supporté
    const badCapi = {
      ...badName,
      metadata: { name: 'valid-cluster', namespace: 'default' },
      spec: {
        ...badName.spec,
        capi_providers: { infra_provider: 'cap_unsupported', bootstrap_provider: 'cabpr' }
      }
    };
    const res3 = validateSylvaWorkloadClusterSchema(badCapi);
    expect(res3.valid).toBe(false);
    expect(res3.errors.some((e) => e.keyword === 'enum')).toBe(true);
  });

  it('évalue avec succès les 15 règles d’or d’enforcement Sylva via OPA sur l’hydratation seed:demo', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const coverage = computeRefinementCoverage(
      {
        subjectId: SUBJECT_ID,
        title: '§14 · Hébergement Lots 2/3, RAN tiers et cellules mobiles : sécurité contre souplesse',
        problem:
          'Comment héberger et interconnecter les équipements des Lots 2/3 tout en garantissant le chiffrement IPsec ESP ?',
        decisionText: RETAINED_OPTION_TITLE,
        detailedSpec: DETAILED_SPEC_MARKDOWN,
        explicitBindings: demoBindings,
        autoBindFromText: true,
        selectedConceptUrn: 'AUTO'
      },
      catalog
    );

    const hydratedInventory = composeMultiAxisHydration(
      SUBJECT_ID,
      coverage.composedBindings,
      catalog,
      {}
    );

    const sylvaManifest = hydratedInventory.sylva_workload_cluster_values!;
    const evalResult = await evaluateSylvaGoldenRules(sylvaManifest);

    expect(evalResult.verdict).toBe('compliant');
    expect(evalResult.violations).toHaveLength(0);
    expect(evalResult.ruleCount).toBe(15);
    expect(evalResult.passedRulesCount).toBe(15);
  });

  it('détecte et bloque chaque violation des règles d’or Sylva via OPA (Cilium, Vault NIS2, NUMA/SR-IOV, BMC)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const coverage = computeRefinementCoverage(
      {
        subjectId: SUBJECT_ID,
        title: '§14 · Test Dérives',
        problem: 'Problème de test',
        decisionText: RETAINED_OPTION_TITLE,
        detailedSpec: DETAILED_SPEC_MARKDOWN,
        explicitBindings: demoBindings,
        autoBindFromText: true,
        selectedConceptUrn: 'AUTO'
      },
      catalog
    );

    const baseline = composeMultiAxisHydration(
      SUBJECT_ID,
      coverage.composedBindings,
      catalog,
      {}
    ).sylva_workload_cluster_values!;

    // 1. Violation Règle 1 : CNI Cilium désactivé
    const driftCilium = JSON.parse(JSON.stringify(baseline));
    driftCilium.spec.units.cilium.enabled = false;
    const resCilium = await evaluateSylvaGoldenRules(driftCilium);
    expect(resCilium.verdict).toBe('violated');
    expect(resCilium.violations.some((v) => v.rule === 'sylva_rule_01_cni_cilium_mandatory')).toBe(true);

    // 2. Violation Règle 7 : Vault désactivé alors qu'un pool NIS2 est déployé
    const driftVault = JSON.parse(JSON.stringify(baseline));
    driftVault.spec.units.vault.enabled = false;
    const resVault = await evaluateSylvaGoldenRules(driftVault);
    expect(resVault.verdict).toBe('violated');
    expect(resVault.violations.some((v) => v.rule === 'sylva_rule_07_vault_mandatory_for_nis2')).toBe(true);

    // 3. Violation Règle 8 : Multus désactivé avec pool SR-IOV
    const driftMultus = JSON.parse(JSON.stringify(baseline));
    driftMultus.spec.units.multus.enabled = false;
    const resMultus = await evaluateSylvaGoldenRules(driftMultus);
    expect(resMultus.verdict).toBe('violated');
    expect(resMultus.violations.some((v) => v.rule === 'sylva_rule_08_multus_mandatory_with_sriov')).toBe(true);

    // 4. Violation Règle 13 : Single-NUMA node policy absente sur pool SR-IOV
    const driftNuma = JSON.parse(JSON.stringify(baseline));
    driftNuma.spec.machine_deployments['md-sylva-cnf-sriov-dpdk'].rke2.kubeletExtraArgs = [
      '--cpu-manager-policy=static'
      // Omission de --topology-manager-policy=single-numa-node
    ];
    const resNuma = await evaluateSylvaGoldenRules(driftNuma);
    expect(resNuma.verdict).toBe('violated');
    expect(resNuma.violations.some((v) => v.rule === 'sylva_rule_13_sriov_topology_manager_single_numa')).toBe(true);

    // 5. Violation Règle 14 : Adresse BMC non Redfish
    const driftBmc = JSON.parse(JSON.stringify(baseline));
    const firstHostKey = Object.keys(driftBmc.spec.baremetal_hosts)[0];
    const hostObj = driftBmc.spec.baremetal_hosts[firstHostKey];
    if (hostObj.bmh_spec?.bmc) {
      hostObj.bmh_spec.bmc.address = 'telnet://192.168.1.1:23';
    } else if (hostObj.bmc) {
      hostObj.bmc.address = 'telnet://192.168.1.1:23';
    }
    const resBmc = await evaluateSylvaGoldenRules(driftBmc);
    expect(resBmc.verdict).toBe('violated');
    expect(resBmc.violations.some((v) => v.rule === 'sylva_rule_14_baremetal_hosts_valid_bmc')).toBe(true);
  });

  it('garantit la réconciliation biunivoque entre l’inventaire Nautobot et les hôtes Sylva', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const coverage = computeRefinementCoverage(
      {
        subjectId: SUBJECT_ID,
        title: '§14 · Réconciliation Nautobot / Sylva',
        problem: 'Problème de test',
        decisionText: RETAINED_OPTION_TITLE,
        detailedSpec: DETAILED_SPEC_MARKDOWN,
        explicitBindings: demoBindings,
        autoBindFromText: true,
        selectedConceptUrn: 'AUTO'
      },
      catalog
    );

    const hydrated = composeMultiAxisHydration(
      SUBJECT_ID,
      coverage.composedBindings,
      catalog,
      {}
    );

    const sylvaHosts = Object.keys(
      ((hydrated.sylva_workload_cluster_values as any)?.spec?.baremetal_hosts as Record<string, unknown>) || {}
    );
    const nautobotDeviceNames = hydrated.nautobot_planned_devices.map((d: any) => d.name);

    // Chaque hôte bare-metal Sylva doit exister dans Nautobot avec le même nom
    expect(sylvaHosts.length).toBeGreaterThan(0);
    for (const host of sylvaHosts) {
      expect(nautobotDeviceNames).toContain(host);
    }
  });
});
