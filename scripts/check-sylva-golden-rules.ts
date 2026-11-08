#!/usr/bin/env tsx
/**
 * Script de vérification CI/Local d'Enforcement Sylva Telco Cloud
 * Valide le schéma KRM de SylvaWorkloadCluster et évalue les 15 règles d'or OPA Rego
 */

import { loadOntologyCatalog } from '../src/lib/server/edp/ontologyClient.js';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration
} from '../src/lib/server/edp/refinementCoverage.js';
import {
  validateSylvaWorkloadClusterSchema,
  evaluateSylvaGoldenRules
} from '../src/lib/server/edp/sylvaValidation.js';
import {
  SUBJECT_ID,
  RETAINED_OPTION_TITLE,
  DETAILED_SPEC_MARKDOWN
} from './seed-demo.js';

async function main() {
  console.log('=== Sylva Workload Cluster & OPA Golden Rules Check ===\n');

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

  const hydrated = composeMultiAxisHydration(
    SUBJECT_ID,
    coverage.composedBindings,
    catalog,
    {}
  );

  const manifest = hydrated.sylva_workload_cluster_values;
  if (!manifest) {
    console.error('❌ Erreur: sylva_workload_cluster_values introuvable dans l’inventaire hydraté.');
    process.exit(1);
  }

  // 1. Validation de schéma JSON
  const schemaResult = validateSylvaWorkloadClusterSchema(manifest);
  if (!schemaResult.valid) {
    console.error('❌ Échec de validation du schéma JSON SylvaWorkloadCluster:');
    for (const err of schemaResult.errors) {
      console.error(`   - ${err.path}: ${err.message} (${err.keyword})`);
    }
    process.exit(1);
  }
  console.log('✅ Schéma JSON SylvaWorkloadCluster validé avec succès (workloadcluster.sylva.org/v1alpha1).');

  // 2. Évaluation des 15 règles d'or OPA
  const evalResult = await evaluateSylvaGoldenRules(manifest);
  if (evalResult.verdict !== 'compliant') {
    console.error(`❌ Violation des règles d’or d’enforcement Sylva (${evalResult.violations.length} violation(s)):`);
    for (const v of evalResult.violations) {
      console.error(`   - [${v.rule}] ${v.message}`);
    }
    process.exit(1);
  }

  console.log(`✅ Oracle OPA Sylva : COMPLIANT (${evalResult.passedRulesCount}/${evalResult.ruleCount} règles satisfaites en ${evalResult.durationMs}ms) :`);
  console.log('   ✓ Règle 1  : CNI Cilium actif (spec.units.cilium.enabled = true)');
  console.log('   ✓ Règle 2  : Fournisseurs CAPI capm3 (Baremetal) + cabpr (RKE2)');
  console.log('   ✓ Règle 3  : Image OS durcie (SLE Micro RT 5.5)');
  console.log('   ✓ Règle 4  : Admission Controller Kyverno activé');
  console.log('   ✓ Règle 5  : Pile de monitoring & observabilité telco activée');
  console.log('   ✓ Règle 6  : Load-balancer MetalLB activé pour VIP');
  console.log('   ✓ Règle 7  : HashiCorp Vault actif (exigé par les pools NIS2)');
  console.log('   ✓ Règle 8  : Méta-CNI Multus actif (exigé par le pool DPDK)');
  console.log('   ✓ Règle 9  : Opérateurs SR-IOV & sriov-resources actifs');
  console.log('   ✓ Règle 10 : MachineDeployment hostSelector matchLabels host-group');
  console.log('   ✓ Règle 11 : MachineDeployment nodeLabels (sylva.org/pool & dataplane)');
  console.log('   ✓ Règle 12 : CPU Manager statique pour pools CNF DPDK');
  console.log('   ✓ Règle 13 : Topology Manager single-numa-node pour alignement NUMA');
  console.log('   ✓ Règle 14 : Adresses BMC Redfish virtuelles conformes');
  console.log('   ✓ Règle 15 : Adresses MAC de boot présentes et valides\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Exception inattendue lors de la vérification Sylva:', err);
  process.exit(1);
});
