import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExtractedClause } from '$lib/domain/corpus';
import {
  COMPLETE_COMPONENT_CATALOG,
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_VALUE_CATALOGS,
  TRANSVERSE_COMPONENT_CATALOG,
  instantiateCatalogFromOntologyBindings,
  lintBaseComponentNoHardcodedEnv,
  validateComponentAgainstCatalogs
} from '$lib/domain/edp/componentCatalog';
import {
  resolveComponentInstance,
  verifyCatalogDanglingReferences
} from '$lib/domain/edp/refResolver';
import {
  TOGAF_DOMAINS,
  TOGAF_DOMAIN_ORDER,
  TOGAF_REFERENCE_BUILDING_BLOCKS,
  matchReferenceBuildingBlock,
  resolveTogafDomain,
  scanProjectArchitecturalBlindSpots
} from '$lib/domain/edp/togafTaxonomy';
import type { OntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
  composeMultiAxisHydration,
  computeRefinementCoverage,
  computeTransitivePrerequisiteAxes,
  evaluateMultiAxisOracle,
  loadImplementedRegoRuleNames,
  ratifyDefaultDecisionSlots
} from '$lib/server/edp/refinementCoverage';
import {
  applyClassificationInvariants,
  buildAuditReport
} from '$lib/server/ingest/arckitRequirementsPipeline';

const fixtureCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json'), 'utf8')
) as OntologyCatalog;

describe('Taxonomie TOGAF unifiée, routage commodités, conscientisation & chaîne de confiance', () => {
  it('unifie les taxonomies hétérogènes vers 7 domaines TOGAF canoniques et détecte les angles morts', () => {
    expect(TOGAF_DOMAIN_ORDER).toHaveLength(7);
    for (const domainId of TOGAF_DOMAIN_ORDER) {
      expect(TOGAF_DOMAINS[domainId]).toBeDefined();
      expect(['application', 'component', 'infrastructure', 'iaas']).toContain(
        TOGAF_DOMAINS[domainId].documentEngineLayer
      );
    }

    expect(resolveTogafDomain('security')).toBe('security-trust');
    expect(resolveTogafDomain('telco-core')).toBe('network-connectivity');
    expect(resolveTogafDomain('cloud-platform')).toBe('platform-compute');
    expect(resolveTogafDomain('DR')).toBe('data-persistence');
    expect(resolveTogafDomain('observability')).toBe('operations-observability');
    expect(resolveTogafDomain('timing-sync')).toBe('facilities-sovereignty');
    expect(resolveTogafDomain('gis-services')).toBe('application-business');

    expect(TOGAF_REFERENCE_BUILDING_BLOCKS.length).toBeGreaterThanOrEqual(25);
    expect(matchReferenceBuildingBlock('Coffre de secrets OpenBao auto-unseal PKCS#11')?.id).toBe(
      'vault-unseal-mode'
    );
    expect(matchReferenceBuildingBlock('Bastion d administration PAM avec enregistrement session')?.id).toBe(
      'pam-admin-bastion'
    );
    expect(matchReferenceBuildingBlock('Serveur cartographique SIG GeoServer PostGIS hors-ligne')?.id).toBe(
      'gis-tile-engine'
    );

    const emptyScan = scanProjectArchitecturalBlindSpots([]);
    expect(emptyScan.coveredCount).toBe(0);
    expect(emptyScan.missingBlocks).toHaveLength(TOGAF_REFERENCE_BUILDING_BLOCKS.length);

    const securityScan = scanProjectArchitecturalBlindSpots(
      ['urn:archinex:ontology:axis:pki_hierarchy', 'urn:archinex:ontology:axis:hsm_key_custody'],
      ['security-trust']
    );
    expect(securityScan.coveredCount).toBe(2);
    expect(
      securityScan.missingByDomain['security-trust'].some((b) => b.id === 'vault-unseal-mode')
    ).toBe(true);
  });

  it('route les clauses commodités évacuées vers des emplacements de décision suivis sans les réinjecter en débat', () => {
    const clauses: ExtractedClause[] = [
      {
        id: 'c-1',
        clauseRef: 'REQ-COM-01',
        title: 'HSM matériel',
        text: 'Les clés racines PKI sont protégées dans un HSM matériel certifié PKCS#11.',
        criticality: 'info'
      },
      {
        id: 'c-2',
        clauseRef: 'REQ-COM-02',
        title: 'PKI interne',
        text: 'Une autorité de certification PKI interne délivre les certificats X.509 via CRL et OCSP.',
        criticality: 'majeur'
      },
      {
        id: 'c-3',
        clauseRef: 'REQ-COM-03',
        title: 'Bastion PAM',
        text: 'L administration des nœuds passe par un bastion PAM SSH et RDP.',
        criticality: 'info'
      },
      {
        id: 'c-4',
        clauseRef: 'REQ-COM-04',
        title: 'Serveur cartographique SIG',
        text: 'Le serveur cartographique SIG diffuse des fonds de carte WMS et WMTS depuis GeoServer.',
        criticality: 'info'
      },
      {
        id: 'c-5',
        clauseRef: 'REQ-COM-05',
        title: 'Proxy sortant',
        text: 'Un proxy sortant explicite filtre les flux vers Internet par liste blanche FQDN.',
        criticality: 'info'
      },
      {
        id: 'c-6',
        clauseRef: 'REQ-COM-06',
        title: 'Synchronisation temporelle',
        text: 'Une horloge Stratum-1 assure la synchronisation NTP et IEEE 1588v2 du cœur.',
        criticality: 'info'
      }
    ];

    const audited = applyClassificationInvariants(
      clauses,
      clauses.map((c) => ({
        ref: c.clauseRef,
        category: c.clauseRef === 'REQ-COM-06' ? 'FAC' : 'NFR',
        disposition: 'commodity',
        reason: 'Composant d infrastructure standard à hydrater via les choix par défaut.'
      }))
    );

    expect(audited.every((r) => r.disposition === 'evacuated')).toBe(true);
    expect(audited.every((r) => Boolean(r.togafDomain))).toBe(true);
    expect(audited.every((r) => Boolean(r.commoditySlotId && r.commodityAxisUrn))).toBe(true);

    const report = buildAuditReport(audited, []);
    expect(report.evacuatedCount).toBe(6);
    expect(report.deliberatedCount).toBe(0);
    expect(report.commoditySlots?.length).toBeGreaterThanOrEqual(5);
    expect(
      report.commoditySlots?.some(
        (s) => s.slotId === 'pki-hierarchy' && s.togafDomain === 'security-trust'
      )
    ).toBe(true);
    expect(
      report.commoditySlots?.some(
        (s) => s.slotId === 'gis-tile-engine' && s.togafDomain === 'application-business'
      )
    ).toBe(true);
  });

  it('distingue défaut proposé vs décision ratifiée et exige une ratification humaine explicite', () => {
    const initialReport = computeRefinementCoverage(
      {
        subjectId: 'subj-iam-trust',
        title: 'Socle IAM Zero-Trust et Secrets',
        problem: 'Sécurisation des secrets dynamiques, mTLS et zone d administration OAM.',
        decisionText: 'Déploiement bastion OAM et gestion des certificats workloads.',
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        autoBindFromText: true
      },
      fixtureCatalog
    );

    expect(initialReport.metrics.totalMandatoryAxes).toBeGreaterThanOrEqual(4);
    expect(initialReport.decisionSlots?.length).toBeGreaterThan(
      initialReport.metrics.totalMandatoryAxes
    );

    const defaultProposedSlots = (initialReport.decisionSlots || []).filter(
      (s) => s.status === 'default_proposed'
    );
    expect(defaultProposedSlots.length).toBeGreaterThan(0);
    expect(initialReport.axes.some((a) => a.requiresRatification === true)).toBe(true);
    expect(initialReport.conscientiousMetrics?.isConscientiouslyComplete).toBe(false);
    expect(initialReport.conscientiousMetrics?.humanRatifiedRatio).toBeLessThan(1);

    // Ratification humaine des défauts proposés
    const ratifiedBindings = ratifyDefaultDecisionSlots(initialReport);
    expect(ratifiedBindings.length).toBeGreaterThanOrEqual(defaultProposedSlots.length);

    const ratifiedReport = computeRefinementCoverage(
      {
        subjectId: 'subj-iam-trust',
        title: 'Socle IAM Zero-Trust et Secrets',
        problem: 'Sécurisation des secrets dynamiques, mTLS et zone d administration OAM.',
        decisionText: 'Déploiement bastion OAM et gestion des certificats workloads.',
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        explicitBindings: ratifiedBindings,
        autoBindFromText: true
      },
      fixtureCatalog
    );

    expect(ratifiedReport.conscientiousMetrics?.defaultProposedSlots).toBe(0);
    expect(ratifiedReport.conscientiousMetrics?.humanRatifiedRatio).toBe(1);
    expect(ratifiedReport.conscientiousMetrics?.boundVerifiedSlots).toBeGreaterThan(0);
    expect(
      ratifiedReport.axes.every((a) => a.bindingOrigin === 'explicit' && !a.requiresRatification)
    ).toBe(true);
  });

  it('détecte zéro oracle fantôme sur le catalogue scellé et identifie une règle synthétique non implémentée', () => {
    const implemented = loadImplementedRegoRuleNames();
    expect(implemented.has('data.archinex.edp.multiaxis.deny_software_root_ca_key')).toBe(true);
    expect(implemented.has('data.archinex.edp.multiaxis.deny_unsealed_vault_without_hsm')).toBe(
      true
    );
    expect(implemented.has('data.archinex.edp.multiaxis.deny_direct_oam_without_bastion')).toBe(
      true
    );
    expect(implemented.has('data.archinex.edp.multiaxis.deny_unfiltered_internet_egress')).toBe(
      true
    );
    expect(implemented.has('data.archinex.edp.multiaxis.deny_plaintext_interservice_flow')).toBe(
      true
    );
    expect(implemented.has('data.archinex.edp.multiaxis.deny_static_secret_in_git')).toBe(true);
    expect(implemented.has('data.archinex.edp.multiaxis.deny_unsigned_oci_image')).toBe(true);

    // Zéro oracle fantôme sur le catalogue de référence scellé après ratification explicite
    const fullCleanReport = computeRefinementCoverage(
      {
        subjectId: 'subj-all-clean',
        title: 'Audit complet zéro oracle fantôme',
        problem: 'Vérification exhaustive de toutes les règles Rego.',
        selectedConceptUrn: 'ALL',
        explicitBindings: [],
        autoBindFromText: true
      },
      fixtureCatalog
    );
    expect(fullCleanReport.conscientiousMetrics?.phantomOracleCount).toBe(0);

    const ratifiedAllBindings = ratifyDefaultDecisionSlots(fullCleanReport);
    const fullRatifiedReport = computeRefinementCoverage(
      {
        subjectId: 'subj-all-clean',
        title: 'Audit complet zéro oracle fantôme',
        problem: 'Vérification exhaustive de toutes les règles Rego.',
        selectedConceptUrn: 'ALL',
        explicitBindings: ratifiedAllBindings,
        autoBindFromText: true
      },
      fixtureCatalog
    );
    expect(fullRatifiedReport.conscientiousMetrics?.phantomOracleCount).toBe(0);
    expect(fullRatifiedReport.conscientiousMetrics?.openSlots).toBe(0);
    expect(fullRatifiedReport.conscientiousMetrics?.defaultProposedSlots).toBe(0);
    expect(fullRatifiedReport.conscientiousMetrics?.humanRatifiedRatio).toBe(1);

    // Vérification stricte de complétude conscientisée sur le domaine IAM / Chaîne de confiance
    const iamInitial = computeRefinementCoverage(
      {
        subjectId: 'subj-iam-complete',
        title: 'IAM mTLS et coffre dynamique',
        problem: 'Sécurisation complète IAM mTLS Vault.',
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        explicitBindings: [],
        autoBindFromText: true
      },
      fixtureCatalog
    );
    const iamRatified = computeRefinementCoverage(
      {
        subjectId: 'subj-iam-complete',
        title: 'IAM mTLS et coffre dynamique',
        problem: 'Sécurisation complète IAM mTLS Vault.',
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        explicitBindings: ratifyDefaultDecisionSlots(iamInitial),
        autoBindFromText: true
      },
      fixtureCatalog
    );
    expect(iamRatified.conscientiousMetrics?.phantomOracleCount).toBe(0);
    expect(iamRatified.conscientiousMetrics?.isConscientiouslyComplete).toBe(true);

    // Détection d'une règle fantôme sur catalogue synthétique cloné
    const syntheticCatalog = structuredClone(fixtureCatalog);
    syntheticCatalog.entities[
      'urn:archinex:ontology:security:secrets:vault_dynamic_leases'
    ].oracle_rules = [
      'data.archinex.edp.multiaxis.deny_static_secret_in_git',
      'data.archinex.edp.multiaxis.deny_synthetic_unimplemented_oracle'
    ];

    const syntheticReport = computeRefinementCoverage(
      {
        subjectId: 'subj-iam-phantom',
        title: 'Gestion secrets Vault et mTLS',
        problem: 'Coffre secrets dynamique.',
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        explicitBindings: [
          { urn: 'urn:archinex:ontology:security:secrets:vault_dynamic_leases', revision: 1 }
        ],
        autoBindFromText: true
      },
      syntheticCatalog
    );

    const secretsAxis = syntheticReport.axes.find(
      (a) => a.axisUrn === 'urn:archinex:ontology:axis:secrets_vault_management'
    );
    expect(secretsAxis?.hasPhantomOracle).toBe(true);
    expect(secretsAxis?.phantomOracleRules).toContain(
      'data.archinex.edp.multiaxis.deny_synthetic_unimplemented_oracle'
    );
    expect(syntheticReport.conscientiousMetrics?.phantomOracleCount).toBeGreaterThan(0);
    expect(syntheticReport.conscientiousMetrics?.isConscientiouslyComplete).toBe(false);
  });

  it('calcule la fermeture transitive des prérequis (IPsec -> PKI -> HSM, OAM -> Bastion -> IAM, LUKS2 -> Vault -> HSM)', () => {
    const ipsecChain = computeTransitivePrerequisiteAxes(
      ['urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256'],
      fixtureCatalog
    );
    expect(ipsecChain.has('urn:archinex:ontology:axis:pki_3gpp_ndsaf')).toBe(true);
    expect(ipsecChain.has('urn:archinex:ontology:axis:pki_hierarchy')).toBe(true);
    expect(ipsecChain.has('urn:archinex:ontology:axis:hsm_key_custody')).toBe(true);

    const oamChain = computeTransitivePrerequisiteAxes(
      ['urn:archinex:ontology:security:zone:oam'],
      fixtureCatalog
    );
    expect(oamChain.has('urn:archinex:ontology:axis:pam_admin_bastion')).toBe(true);
    expect(oamChain.has('urn:archinex:ontology:axis:iam_federation_mfa')).toBe(true);

    const luksChain = computeTransitivePrerequisiteAxes(
      ['urn:archinex:ontology:security:crypto:luks2_kms_hsm'],
      fixtureCatalog
    );
    expect(luksChain.has('urn:archinex:ontology:axis:vault_unseal_mode')).toBe(true);
    expect(luksChain.has('urn:archinex:ontology:axis:hsm_key_custody')).toBe(true);

    const baremetalChain = computeTransitivePrerequisiteAxes(
      ['urn:archinex:ontology:infrastructure:server:baremetal'],
      fixtureCatalog
    );
    expect(baremetalChain.has('urn:archinex:ontology:axis:dns_dhcp_ipam')).toBe(true);
    expect(baremetalChain.has('urn:archinex:ontology:axis:timing_sync_ntp')).toBe(true);
  });

  it('hydrate la chaîne de confiance dans composeMultiAxisHydration et applique les 4 règles OPA de l Axe 8', async () => {
    const trustBindings = [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
      { urn: 'urn:archinex:ontology:security:zone:oam', revision: 1 },
      { urn: 'urn:archinex:ontology:delivery:env:three_tiers', revision: 1 },
      { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 },
      { urn: 'urn:archinex:ontology:security:hsm:eviden_proteccio', revision: 1 },
      { urn: 'urn:archinex:ontology:security:pki:root_offline_airgap', revision: 1 },
      { urn: 'urn:archinex:ontology:security:vault:openbao_pkcs11_hsm', revision: 1 },
      { urn: 'urn:archinex:ontology:security:bastion:wallix_pam', revision: 1 },
      { urn: 'urn:archinex:ontology:network:proxy:squid_explicit_fqdn', revision: 1 },
      { urn: 'urn:archinex:ontology:observability:soc:siem_syslog_tls_nis2', revision: 1 }
    ];

    const nominal = composeMultiAxisHydration('subj-trust-chain', trustBindings, fixtureCatalog);
    expect(nominal.trust_chain).toBeDefined();
    expect(nominal.trust_chain?.oam_session_recording).toBe(true);
    expect(nominal.resolved_components?.some((c) => c.name === 'hsm-appliance')).toBe(true);
    expect(nominal.resolved_components?.some((c) => c.name === 'pki-ca')).toBe(true);
    expect(nominal.resolved_components?.some((c) => c.name === 'vault-cluster')).toBe(true);
    expect(nominal.resolved_components?.some((c) => c.name === 'admin-bastion')).toBe(true);
    expect(nominal.resolved_components?.some((c) => c.name === 'siem-soc')).toBe(true);
    expect(nominal.resolved_components?.some((c) => c.name === 'ingress-waf-proxy')).toBe(true);
    expect(nominal.dangling_references?.valid).toBe(true);
    expect(nominal.component_lint_issues).toEqual([]);

    const nominalVerdict = await evaluateMultiAxisOracle(nominal, trustBindings, fixtureCatalog);
    expect(nominalVerdict.verdict).toBe('compliant');
    expect(nominalVerdict.violations).toEqual([]);

    const overrideCases: Array<{
      override: Parameters<typeof composeMultiAxisHydration>[3];
      expectedRule: string;
    }> = [
      {
        override: { rootCaKeyCustody: 'software_filesystem' },
        expectedRule: 'data.archinex.edp.multiaxis.deny_software_root_ca_key'
      },
      {
        override: { vaultUnsealMode: 'shamir_manual' },
        expectedRule: 'data.archinex.edp.multiaxis.deny_unsealed_vault_without_hsm'
      },
      {
        override: { oamSessionRecording: false },
        expectedRule: 'data.archinex.edp.multiaxis.deny_direct_oam_without_bastion'
      },
      {
        override: { egressMode: 'direct_unfiltered' },
        expectedRule: 'data.archinex.edp.multiaxis.deny_unfiltered_internet_egress'
      }
    ];

    for (const c of overrideCases) {
      const broken = composeMultiAxisHydration(
        'subj-trust-chain',
        trustBindings,
        fixtureCatalog,
        c.override
      );
      const evalRes = await evaluateMultiAxisOracle(broken, trustBindings, fixtureCatalog);
      expect(evalRes.verdict).toBe('violated');
      expect(evalRes.violations.map((v) => v.rule)).toContain(c.expectedRule);
    }
  });

  it('audite les références pendantes et valide les 7 composants transverses sur prod/preprod/lab', () => {
    const legacyAudit = verifyCatalogDanglingReferences(DEFAULT_COMPONENT_CATALOG);
    expect(legacyAudit.valid).toBe(false);
    expect(legacyAudit.danglingFirewallGroups).toContain('pki-ca-endpoints');
    expect(legacyAudit.danglingFirewallGroups).toContain('siem-collectors');
    expect(legacyAudit.missingVaultComponent).toBe(true);

    const completeAudit = verifyCatalogDanglingReferences(COMPLETE_COMPONENT_CATALOG);
    expect(completeAudit.valid).toBe(true);
    expect(completeAudit.danglingFirewallGroups).toEqual([]);
    expect(completeAudit.missingDependencies).toEqual([]);
    expect(completeAudit.missingVaultComponent).toBe(false);

    expect(TRANSVERSE_COMPONENT_CATALOG).toHaveLength(7);

    const partialInstantiated = instantiateCatalogFromOntologyBindings(
      [
        'urn:archinex:ontology:security:pki:root_offline_airgap',
        'urn:archinex:ontology:security:hsm:eviden_proteccio'
      ],
      DEFAULT_COMPONENT_CATALOG
    );
    expect(partialInstantiated.some((c) => c.metadata.name === 'pki-ca')).toBe(true);
    expect(partialInstantiated.some((c) => c.metadata.name === 'hsm-appliance')).toBe(true);

    for (const comp of TRANSVERSE_COMPONENT_CATALOG) {
      expect(lintBaseComponentNoHardcodedEnv(comp)).toEqual([]);
      expect(validateComponentAgainstCatalogs(comp, DEFAULT_VALUE_CATALOGS)).toEqual([]);

      for (const overlay of DEFAULT_ENVIRONMENT_OVERLAYS) {
        const primaryDc = overlay.spec.datacenters[0] || 'dc1';
        const resolved = resolveComponentInstance(comp, overlay, primaryDc, DEFAULT_VALUE_CATALOGS);
        expect(resolved.unresolvedRefs).toEqual([]);
        expect(resolved.subnets.length).toBeGreaterThan(0);
      }
    }
  });
});
