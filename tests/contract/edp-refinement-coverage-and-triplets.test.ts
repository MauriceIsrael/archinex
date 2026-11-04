import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadOntologyCatalog,
  queryOntologyTriplets,
  addOntologyTriplet,
  removeOntologyTriplet,
  resetRuntimeOntologyOverlay
} from '../../src/lib/server/edp/ontologyClient.js';
import {
  compileOntologyProjections,
  detectDuplicateLiterals
} from '../../src/lib/server/edp/projectionCompiler.js';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration,
  evaluateMultiAxisOracle
} from '../../src/lib/server/edp/refinementCoverage.js';

describe('EDP Phase 4 : Ontology Triplets, KAOS Multi-Axis Coverage & Real OPA Drift Evaluation', () => {
  beforeEach(() => {
    resetRuntimeOntologyOverlay();
  });

  afterEach(() => {
    resetRuntimeOntologyOverlay();
  });

  it('requête les triplets { Sujet, Verbe, Complément } du graphe d’ontologie', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const reqAxes = queryOntologyTriplets(catalog, {
      subject: 'urn:archinex:ontology:concept:telco_cloud_platform',
      predicate: 'requires_aspect'
    });

    expect(reqAxes.length).toBe(5);
    expect(reqAxes.map((t) => t.object)).toEqual(
      expect.arrayContaining([
        'urn:archinex:ontology:axis:compute_substrate',
        'urn:archinex:ontology:axis:oob_management',
        'urn:archinex:ontology:axis:security_zoning',
        'urn:archinex:ontology:axis:env_fidelity',
        'urn:archinex:ontology:axis:power_cooling_resilience'
      ])
    );
  });

  it('distingue missing_refinement (🔴), covered_no_oracle (🟡) et covered_executable (🟢) jusqu’à 100% de complétude KAOS', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

    // 1. Seulement 2 axes liés -> 3 axes en missing_refinement
    const partialReport = computeRefinementCoverage(
      {
        title: 'Plateforme Cluster Telco Cloud',
        explicitBindings: [
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
          { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 }
        ],
        autoBindFromText: false
      },
      catalog
    );

    expect(partialReport.metrics.totalMandatoryAxes).toBe(5);
    expect(partialReport.metrics.coveredExecutableAxes).toBe(2);
    expect(partialReport.metrics.missingAxes).toBe(3);
    expect(partialReport.metrics.isComplete).toBe(false);

    // 2. Liaison de la feuille UPS sans règle Rego -> statut covered_no_oracle
    const noOracleReport = computeRefinementCoverage(
      {
        title: 'Plateforme Cluster Telco Cloud',
        explicitBindings: [
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
          { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
          { urn: 'urn:archinex:ontology:facilities:power:ups_battery_backup', revision: 1 }
        ],
        autoBindFromText: false
      },
      catalog
    );

    const powerAxis = noOracleReport.axes.find(
      (a) => a.axisUrn === 'urn:archinex:ontology:axis:power_cooling_resilience'
    );
    expect(powerAxis?.status).toBe('covered_no_oracle');
    expect(noOracleReport.metrics.coveredNoOracleAxes).toBe(1);

    // 3. Liaison des 5 axes avec feuilles exécutables -> 100% de complétude KAOS (isComplete === true)
    const fullReport = computeRefinementCoverage(
      {
        title: 'Plateforme Cluster Telco Cloud',
        explicitBindings: [
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
          { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
          { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
          { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
          { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
        ],
        autoBindFromText: false
      },
      catalog
    );

    expect(fullReport.metrics.coveredExecutableAxes).toBe(5);
    expect(fullReport.metrics.missingAxes).toBe(0);
    expect(fullReport.metrics.axisCoveragePercent).toBe(100);
    expect(fullReport.metrics.isComplete).toBe(true);
  });

  it('signale une alerte de dépendance inter-axes (depends_on) si Bare-Metal est lié sans le réseau OOB', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

    const report = computeRefinementCoverage(
      {
        title: 'Plateforme Bare-Metal',
        explicitBindings: [
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 }
        ],
        autoBindFromText: false
      },
      catalog
    );

    expect(report.dependencyIssues.length).toBeGreaterThanOrEqual(1);
    expect(report.dependencyIssues[0].predicate).toBe('depends_on');
    expect(report.dependencyIssues[0].targetUrn).toBe('urn:archinex:ontology:telecom:network:oob');
  });

  it('vérifie que multi_axis_refinement.rego ne contient aucun littéral métier en dur dupliquant data.ontology', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const domainProjections = {
      baremetal: catalog.entities['urn:archinex:ontology:infrastructure:server:baremetal'].projections,
      oam: catalog.entities['urn:archinex:ontology:security:zone:oam'].projections,
      env: catalog.entities['urn:archinex:ontology:platform:env:iso_prod_3tiers'].projections
    };
    const policyText = readFileSync(
      resolve(process.cwd(), 'edp/policies/multi_axis_refinement.rego'),
      'utf-8'
    );

    const warnings = detectDuplicateLiterals(policyText, domainProjections);
    expect(warnings).toHaveLength(0);
  });

  it('évalue réellement avec OPA les 5 axes et détecte toute dérive (Drift CMDB) axe par axe', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const bindings = [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
      { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
      { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
      { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
    ];

    // 1. État nominal conforme sur les 5 axes
    const cleanInventory = composeMultiAxisHydration('sub_lulu_40', bindings, catalog);
    const cleanEval = await evaluateMultiAxisOracle(cleanInventory, bindings, catalog);
    expect(cleanEval.verdict).toBe('compliant');
    expect(cleanEval.violations).toHaveLength(0);
    expect(cleanEval.evaluatedAxesCount).toBe(5);

    // 2. Drift Axe 1 (Serveur Whitebox non homologué)
    const driftHw = composeMultiAxisHydration('sub_lulu_40', bindings, catalog, {
      deviceType: 'Supermicro-Whitebox-NonHomologue'
    });
    const evalHw = await evaluateMultiAxisOracle(driftHw, bindings, catalog);
    expect(evalHw.verdict).toBe('violated');
    expect(evalHw.violations.some((v) => v.rule.includes('deny_unapproved_hardware_profile'))).toBe(true);

    // 3. Drift Axe 2 (Désalignement IP BMC vs OOB)
    const driftOob = composeMultiAxisHydration('sub_lulu_40', bindings, catalog, {
      bmcAddress: 'redfish+http://198.51.100.254/redfish/v1/Systems/1'
    });
    const evalOob = await evaluateMultiAxisOracle(driftOob, bindings, catalog);
    expect(evalOob.verdict).toBe('violated');
    expect(evalOob.violations.some((v) => v.rule.includes('deny_bmc_oob_drift'))).toBe(true);

    // 4. Drift Axe 3 (Suppression du Proxy Zone OAM)
    const driftOam = composeMultiAxisHydration('sub_lulu_40', bindings, catalog, {
      oamProxyRequired: false
    });
    const evalOam = await evaluateMultiAxisOracle(driftOam, bindings, catalog);
    expect(evalOam.verdict).toBe('violated');
    expect(evalOam.violations.some((v) => v.rule.includes('deny_unproxied_oam_access'))).toBe(true);

    // 5. Drift Axe 4 (Recette passée en non Iso-Prod)
    const driftEnv = composeMultiAxisHydration('sub_lulu_40', bindings, catalog, {
      stagingIsoprod: false
    });
    const evalEnv = await evaluateMultiAxisOracle(driftEnv, bindings, catalog);
    expect(evalEnv.verdict).toBe('violated');
    expect(evalEnv.violations.some((v) => v.rule.includes('deny_non_isoprod_staging'))).toBe(true);

    // 6. Drift Axe 5 (Perte d'une adduction PDU -> 1 seule PDU au lieu de 2N)
    const driftPower = composeMultiAxisHydration('sub_lulu_40', bindings, catalog, {
      powerFeedsCount: 1
    });
    const evalPower = await evaluateMultiAxisOracle(driftPower, bindings, catalog);
    expect(evalPower.verdict).toBe('violated');
    expect(evalPower.violations.some((v) => v.rule.includes('deny_single_power_feed'))).toBe(true);
  });

  it('permet d’ajouter et supprimer dynamiquement un triplet { Sujet, Verbe, Complément } qui étend immédiatement la matrice de couverture', async () => {
    const { triplet } = await addOntologyTriplet({
      subject: 'urn:archinex:ontology:concept:telco_cloud_platform',
      predicate: 'requires_aspect',
      object: 'urn:archinex:ontology:axis:observability_traces',
      objectTitle: 'Axe de Raffinement : Observabilité OpenTelemetry',
      rationale: 'Toute plateforme doit raffiner sa collecte de traces et métriques.'
    });

    const updatedCatalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const coverageAfterAdd = computeRefinementCoverage(
      {
        title: 'Plateforme Cluster Telco Cloud',
        autoBindFromText: true
      },
      updatedCatalog
    );

    expect(coverageAfterAdd.metrics.totalMandatoryAxes).toBe(6);

    const catalogAfterDelete = await removeOntologyTriplet(triplet.id);
    const coverageAfterDelete = computeRefinementCoverage(
      {
        title: 'Plateforme Cluster Telco Cloud',
        autoBindFromText: true
      },
      catalogAfterDelete
    );
    expect(coverageAfterDelete.metrics.totalMandatoryAxes).toBe(5);
  });

  it('couvre le socle complet des 6 grands concepts HLD SI/Telco (Compute/Cloud, Réseau, Stockage, IAM/Sécurité, Observabilité NOC/SOC, Résilience/PRA) et leurs sous-axes', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

    const expectedConcepts = [
      {
        urn: 'urn:archinex:ontology:concept:telco_cloud_platform',
        queryTitle: 'Plateforme Cluster Telco Cloud & Bare-Metal',
        expectedAxesCount: 5
      },
      {
        urn: 'urn:archinex:ontology:concept:interconnection_gateway',
        queryTitle: 'Interconnexion Réseau BGP EVPN VXLAN & Zonage',
        expectedAxesCount: 4
      },
      {
        urn: 'urn:archinex:ontology:concept:storage_data_persistence',
        queryTitle: 'Stockage Distribué Ceph NVMe, Sauvegarde S3 WORM & Chiffrement KMS',
        expectedAxesCount: 3
      },
      {
        urn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        queryTitle: 'Identité IAM Keycloak OIDC MFA, RBAC et PKI Vault mTLS Zero-Trust',
        expectedAxesCount: 4
      },
      {
        urn: 'urn:archinex:ontology:concept:observability_noc_soc',
        queryTitle: 'Observabilité Prometheus OpenTelemetry, Logs Loki et Alerting SIEM SOC NIS2',
        expectedAxesCount: 3
      },
      {
        urn: 'urn:archinex:ontology:concept:resilience_drp_continuity',
        queryTitle: 'Résilience Haute Disponibilité Multi-AZ, Plan de Reprise PRA/PCA et RPO RTO',
        expectedAxesCount: 4
      }
    ];

    for (const c of expectedConcepts) {
      expect(catalog.entities[c.urn]).toBeDefined();
      expect(catalog.entities[c.urn].kind).toBe('concept');

      const report = computeRefinementCoverage(
        {
          title: c.queryTitle,
          decisionText: c.queryTitle,
          autoBindFromText: true
        },
        catalog
      );

      expect(report.matchedConcepts[0].urn).toBe(c.urn);
      expect(report.metrics.totalMandatoryAxes).toBe(c.expectedAxesCount);
      expect(report.allConcepts?.length).toBe(6);
    }

    // Sélection combinée des 6 concepts ('ALL') -> 18 sous-axes distincts dans le graphe
    const allReport = computeRefinementCoverage(
      {
        title: 'Architecture Globale SI & Telco',
        selectedConceptUrn: 'ALL',
        autoBindFromText: false
      },
      catalog
    );
    expect(allReport.metrics.totalMandatoryAxes).toBe(18);
  });

  it('supporte le cumul de variantes sur un même axe (Cluster Sylva SR-IOV/DPDK CNF + Cluster Sylva Standard NIS2) et hydrate les 2 pools LLD distincts', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const cumulativeBindings = [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 },
      { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
      { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
      { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
      { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
    ];

    const report = computeRefinementCoverage(
      {
        title: 'Cœur de réseau 5G CNF et Middleware',
        explicitBindings: cumulativeBindings,
        autoBindFromText: false
      },
      catalog
    );

    const computeAxis = report.axes.find(
      (a) => a.axisUrn === 'urn:archinex:ontology:axis:compute_substrate'
    );
    expect(computeAxis?.boundLeaves).toHaveLength(2);

    const hydrated = composeMultiAxisHydration('sub_coeur_5g', cumulativeBindings, catalog);
    expect(hydrated.nautobot_planned_devices).toHaveLength(2);
    expect(hydrated.k8s_manifests).toHaveLength(2);
    expect(hydrated.nautobot_planned_devices.map((d) => d.cluster_pool)).toEqual([
      'sylva-cnf-sriov-dpdk',
      'sylva-standard-nis2'
    ]);

    const evalRes = await evaluateMultiAxisOracle(hydrated, cumulativeBindings, catalog);
    expect(evalRes.verdict).toBe('compliant');
    expect(evalRes.violations).toHaveLength(0);
  });

  it('modélise et réconcilie les 7 classes d’objets de §14 (Lot 3 ↔ Lot 1 : Organisation, MME Externe 3GPP, Lien IP, Tunnel IPsec ESP, Médiation SecGW/DEA, SLA & Sonde NOC) via OPA', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const lot3Bindings = [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
      { urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256', revision: 1 },
      { urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 },
      { urn: 'urn:archinex:ontology:platform:env:iso_prod_3tiers', revision: 1 },
      { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
    ];

    // 1. État nominal conforme : les 7 classes d'objets sont réconciliées sur tenant_ref = "org-lot3-mno"
    const nominalHydrated = composeMultiAxisHydration(
      'sub_lulu-avec-options-et-criteres-proposes_89',
      lot3Bindings,
      catalog
    );
    const rg = nominalHydrated.reconciliation_graph;
    expect(rg.pivot_tenant_id).toBe('org-lot3-mno');
    expect(rg.partner_organizations.some((o) => o.id === 'org-lot3-mno')).toBe(true);
    expect(rg.external_shadow_nodes.some((n) => n.id === 'ext-mme-lot3-01')).toBe(true);
    expect(rg.internal_mediation_nodes.map((n) => n.id)).toEqual([
      'secgw-lot1-01',
      'dea-lot1-01',
      'hss-lot1-01'
    ]);
    expect(rg.ip_underlay_links[0].id).toBe('link-ip-lot3-secgw1');
    expect(rg.ipsec_tunnels[0].id).toBe('tun-ipsec-esp-lot3-secgw1');
    expect(rg.service_mediation_flows[0].mandatory_mediation_hops).toEqual([
      'secgw-lot1-01',
      'dea-lot1-01'
    ]);
    expect(rg.sla_and_monitoring_contracts).toHaveLength(2);

    const nominalEval = await evaluateMultiAxisOracle(nominalHydrated, lot3Bindings, catalog);
    expect(nominalEval.verdict).toBe('compliant');
    expect(nominalEval.violations).toHaveLength(0);

    // 2. Violation §14 : Flux S6a direct MME-Lot3 -> HSS-Lot1 contournant le DEA-Lot1
    const bypassHydrated = composeMultiAxisHydration(
      'sub_lulu-avec-options-et-criteres-proposes_89',
      lot3Bindings,
      catalog,
      { s6aDirectBypassDea: true }
    );
    const bypassEval = await evaluateMultiAxisOracle(bypassHydrated, lot3Bindings, catalog);
    expect(bypassEval.verdict).toBe('violated');
    expect(
      bypassEval.violations.some((v) =>
        v.rule.includes('deny_unmediated_s6a_direct_flow')
      )
    ).toBe(true);

    // 3. Rupture de réconciliation inter-domaines : Flux/Tunnel Lot 3 non réconcilié avec Organisation / SLA / Sonde NOC
    const orphanHydrated = composeMultiAxisHydration(
      'sub_lulu-avec-options-et-criteres-proposes_89',
      lot3Bindings,
      catalog,
      { orphanPartnerTenant: true }
    );
    const orphanEval = await evaluateMultiAxisOracle(orphanHydrated, lot3Bindings, catalog);
    expect(orphanEval.verdict).toBe('violated');
    expect(
      orphanEval.violations.some((v) =>
        v.rule.includes('deny_unreconciled_partner_objects')
      )
    ).toBe(true);
  });
});
