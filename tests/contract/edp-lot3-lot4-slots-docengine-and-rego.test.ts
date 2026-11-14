import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExtractedClause } from '$lib/domain/corpus';
import {
  COMPLETE_COMPONENT_CATALOG,
  type LogicalComponent
} from '$lib/domain/edp/componentCatalog';
import {
  batchRatifyProjectType2Slots,
  buildProjectCompletenessLedger,
  generateArchitectureLockManifest,
  getProjectArchitectureLock,
  promoteSlotToDeliberationSubject,
  resetProjectSlotRegistry
} from '$lib/server/edp/decisionSlotRegistry';
import { InvariantViolationError, UnauthorizedRoleError } from '$lib/server/edp/edpRepository';
import type { OntologyCatalog } from '$lib/server/edp/ontologyClient';
import { detectDuplicateLiterals } from '$lib/server/edp/projectionCompiler';
import {
  composeMultiAxisHydration,
  evaluateMultiAxisOracle
} from '$lib/server/edp/refinementCoverage';
import {
  applyClassificationInvariants,
  buildAuditReport
} from '$lib/server/ingest/arckitRequirementsPipeline';
import { buildDocumentEnginePayload } from '$lib/server/projects/documentEngineBridge';
import type { ProjectHldDossier } from '$lib/server/projects/hldFragmentDb';

const fixtureCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json'), 'utf8')
) as OntologyCatalog;

const TEST_PROJECT_ID = 'proj-lot3-lot4-contract';

const mockDossier: ProjectHldDossier = {
  projectId: TEST_PROJECT_ID,
  projectTitle: 'Socle Souverain Lot 3 & Lot 4',
  markdown: '# Dossier HLD',
  generatedAt: '2026-11-14T12:00:00Z',
  fragments: [
    {
      subjectId: 'subj-1',
      title: 'Cœur de Confiance Cryptographique',
      status: 'decided',
      statusLabel: 'Décidé',
      control: [{ label: 'Statut', value: 'Décidé' }],
      synthesis: {
        headline: 'Sécurisation des clés racines sur HSM dédié.',
        details: ['Root CA offline', 'Auto-unseal Vault via PKCS#11']
      },
      context: {
        problem: 'Protéger l’ensemble des secrets et certificats de la plateforme.',
        dependsOn: []
      },
      requirements: {
        items: [{ id: 'req-sec-01', clauseRef: 'REQ-SEC-01', title: 'Garde matérielle des clés', criticality: 'bloquant' }],
        unresolvedRefs: [],
        dossierPresent: true
      },
      drivers: [],
      options: [],
      decision: {
        retained: 'HSM Eviden Proteccio + Vault PKCS#11',
        rationale: 'Protection matérielle FIPS 140-3 imposée sur la chaîne de confiance.',
        yStatement:
          'Compte tenu des exigences souveraines, nous retenons le HSM matériel et OpenBao PKCS#11.',
        reversibility: 'Moyenne (migration PKCS#11 normalisée)'
      },
      consequences: {
        acceptedRisks: [],
        acceptedViolations: [],
        coverageWarnings: []
      },
      openPoints: [],
      provenance: {
        modelProposedOptions: 0,
        humanOptions: 1,
        modelEvaluations: 0,
        humanEvaluations: 1
      },
      generatedAt: '2026-11-14T12:00:00Z'
    }
  ]
};

describe('Lots 3 & 4 — Registre d’emplacements, scellement architecture.lock, Document Engine & Axe 9 OPA', () => {
  beforeEach(() => {
    resetProjectSlotRegistry(TEST_PROJECT_ID);
  });

  afterEach(() => {
    resetProjectSlotRegistry(TEST_PROJECT_ID);
  });

  it('consolide le registre de complétude (files Type 1/Type 2, commodités ArcKit et angles morts TOGAF)', async () => {
    const clauses: ExtractedClause[] = [
      {
        id: 'CL-PKI-1',
        clauseRef: 'REQ-SEC-PKI-01',
        title: 'Hiérarchie PKI et Root CA hors ligne',
        text: 'Autorité de certification racine airgap sur HSM avec EJBCA CMPv2 pour les certificats internes.',
        criticality: 'majeur'
      },
      {
        id: 'CL-VAULT-1',
        clauseRef: 'REQ-SEC-VAULT-01',
        title: 'Coffre de secrets avec auto-unseal HSM',
        text: 'OpenBao haute disponibilité déverrouillé automatiquement via PKCS#11 sur HSM.',
        criticality: 'majeur'
      }
    ];

    const audited = applyClassificationInvariants(clauses, [
      {
        ref: 'REQ-SEC-PKI-01',
        disposition: 'commodity',
        category: 'NFR',
        reason: 'Brique standard PKI et HSM transverse évacuée du débat contradictoire.'
      },
      {
        ref: 'REQ-SEC-VAULT-01',
        disposition: 'commodity',
        category: 'NFR',
        reason: 'Coffre de secrets standard transverse rattaché aux commodités sécurité.'
      }
    ]);
    const auditReport = buildAuditReport(audited);
    expect(auditReport.commoditySlots?.length).toBeGreaterThanOrEqual(1);

    const ledger = await buildProjectCompletenessLedger(
      {
        projectId: TEST_PROJECT_ID,
        projectTitle: 'Projet Lot 3',
        title: 'Socle sécurité IAM, PKI, HSM et Vault',
        problem: 'Protection des identités, certificats mTLS et secrets.',
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        commoditySlots: auditReport.commoditySlots
      },
      fixtureCatalog
    );

    expect(ledger.slots.length).toBeGreaterThanOrEqual(4);
    expect(ledger.type1DeliberationQueue.length).toBeGreaterThanOrEqual(1);
    expect(ledger.type2RatificationQueue.length).toBeGreaterThanOrEqual(3);
    expect(ledger.conscientiousMetrics.defaultProposedSlots).toBeGreaterThan(0);
    expect(ledger.readyForArchitectureLock).toBe(false);
    expect(ledger.lockBlockers.length).toBeGreaterThan(0);
    expect(ledger.blindSpots.totalReferenceBlocks).toBeGreaterThanOrEqual(25);

    const pkiOrVaultSlot = ledger.slots.find((s) => s.coveredRequirementRefs.length > 0);
    expect(pkiOrVaultSlot).toBeDefined();
  });

  it('applique le contrôle de rôle, ratifie en lot les commodités Type 2 et persiste les composants transverses', async () => {
    const structuralBindings = [{ urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 }];

    await expect(
      batchRatifyProjectType2Slots(
        {
          projectId: TEST_PROJECT_ID,
          actorId: 'viewer@archinex.test',
          actorRole: 'viewer',
          rationale: 'Tentative non autorisée'
        },
        {
          selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
          title: 'IAM Zero-Trust',
          problem: 'IAM, PKI, Vault',
          explicitBindings: structuralBindings
        },
        fixtureCatalog
      )
    ).rejects.toThrow(UnauthorizedRoleError);

    await expect(
      batchRatifyProjectType2Slots(
        {
          projectId: TEST_PROJECT_ID,
          actorId: 'sec@archinex.test',
          actorRole: 'security_architect',
          rationale: '   '
        },
        {
          selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
          title: 'IAM Zero-Trust',
          problem: 'IAM, PKI, Vault',
          explicitBindings: structuralBindings
        },
        fixtureCatalog
      )
    ).rejects.toThrow(InvariantViolationError);

    const result = await batchRatifyProjectType2Slots(
      {
        projectId: TEST_PROJECT_ID,
        actorId: 'sec@archinex.test',
        actorRole: 'security_architect',
        rationale: 'Ratification des standards de sécurité transverse TOGAF'
      },
      {
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        title: 'IAM mTLS et coffre dynamique',
        problem: 'Sécurisation IAM, mTLS et secrets dynamiques',
        explicitBindings: structuralBindings
      },
      fixtureCatalog
    );

    expect(result.receipt.ratifiedSlotIds.length).toBeGreaterThanOrEqual(7);
    expect(result.updatedLedger.type2RatificationQueue).toHaveLength(0);
    expect(result.updatedLedger.conscientiousMetrics.defaultProposedSlots).toBe(0);
    expect(result.updatedLedger.conscientiousMetrics.openSlots).toBe(0);
    expect(result.updatedLedger.danglingReferences.valid).toBe(true);
    expect(result.instantiatedComponents).toContain('hsm-appliance');
    expect(result.instantiatedComponents).toContain('pki-ca');
    expect(result.instantiatedComponents).toContain('vault-cluster');
    expect(result.instantiatedComponents).toContain('iam-keycloak');
    expect(result.updatedLedger.readyForArchitectureLock).toBe(true);
  });

  it('promeut un emplacement Type 2 en sujet de délibération Type 1 et bloque le verrouillage tant qu’il reste en attente', async () => {
    const initial = await buildProjectCompletenessLedger(
      {
        projectId: TEST_PROJECT_ID,
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        title: 'IAM et gestion de secrets',
        problem: 'Sélection coffre de secrets.'
      },
      fixtureCatalog
    );

    const targetSlot = initial.type2RatificationQueue[0];
    expect(targetSlot).toBeDefined();

    const promoted = await promoteSlotToDeliberationSubject(
      {
        projectId: TEST_PROJECT_ID,
        slotId: targetSlot.slotId,
        actorId: 'lead@archinex.test',
        actorRole: 'lead_architect',
        reason: 'Arbitrage multi-critères requis sur les options de l’axe.'
      },
      fixtureCatalog
    );

    expect(promoted.subjectId).toBeTruthy();
    expect(promoted.candidateOptions.length).toBeGreaterThanOrEqual(1);

    // Ratifier tous les autres emplacements Type 2 ne doit PAS court-circuiter le sujet promu Type 1
    const afterBatch = await batchRatifyProjectType2Slots(
      {
        projectId: TEST_PROJECT_ID,
        actorId: 'lead@archinex.test',
        actorRole: 'lead_architect',
        rationale: 'Ratification des autres commodités non promues.'
      },
      {
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        title: 'IAM et gestion de secrets',
        problem: 'Sélection coffre de secrets.'
      },
      fixtureCatalog
    );

    expect(afterBatch.updatedLedger.type1DeliberationQueue.map((s) => s.slotId)).toContain(
      targetSlot.slotId
    );
    expect(afterBatch.updatedLedger.type2RatificationQueue.map((s) => s.slotId)).not.toContain(
      targetSlot.slotId
    );
    expect(afterBatch.updatedLedger.readyForArchitectureLock).toBe(false);

    await expect(
      generateArchitectureLockManifest(
        {
          projectId: TEST_PROJECT_ID,
          sealedBy: 'lead@archinex.test',
          sealedByRole: 'lead_architect'
        },
        fixtureCatalog
      )
    ).rejects.toThrow(InvariantViolationError);
  });

  it('refuse architecture.lock en cas de violation OPA puis scelle un manifeste SHA-256 une fois conforme', async () => {
    const structuralBindings = [{ urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 }];

    await batchRatifyProjectType2Slots(
      {
        projectId: TEST_PROJECT_ID,
        actorId: 'lead@archinex.test',
        actorRole: 'lead_architect',
        rationale: 'Validation socle zéro-trust.'
      },
      {
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        title: 'IAM, mTLS et secrets',
        problem: 'Infrastructure IAM et secrets dynamiques',
        explicitBindings: structuralBindings
      },
      fixtureCatalog
    );

    // Dérive volontaire sur secrets dynamiques Vault -> refus OPA
    await expect(
      generateArchitectureLockManifest(
        {
          projectId: TEST_PROJECT_ID,
          sealedBy: 'lead@archinex.test',
          sealedByRole: 'lead_architect',
          coverageInput: {
            selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
            title: 'IAM, mTLS et secrets',
            problem: 'Infrastructure IAM et secrets dynamiques',
            explicitBindings: structuralBindings,
            lldOverrides: {
              allowStaticK8sSecrets: true
            }
          }
        },
        fixtureCatalog
      )
    ).rejects.toThrow(InvariantViolationError);

    const manifest = await generateArchitectureLockManifest(
      {
        projectId: TEST_PROJECT_ID,
        sealedBy: 'lead@archinex.test',
        sealedByRole: 'lead_architect',
        coverageInput: {
          selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
          title: 'IAM, mTLS et secrets',
          problem: 'Infrastructure IAM et secrets dynamiques',
          explicitBindings: structuralBindings
        }
      },
      fixtureCatalog
    );

    expect(manifest.oracleVerdict).toBe('compliant');
    expect(manifest.phantomOracleCount).toBe(0);
    expect(manifest.danglingReferences.valid).toBe(true);
    expect(manifest.integritySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(getProjectArchitectureLock(TEST_PROJECT_ID)?.integritySha256).toBe(
      manifest.integritySha256
    );
  });

  it('projette le socle transverse et architecture.lock vers Document Engine sans casser l’existant', async () => {
    const baseline = buildDocumentEnginePayload(mockDossier);
    expect(baseline.blueprint.sections).toHaveLength(2);
    expect(baseline.projectedGraph.views).toHaveLength(1);

    const structuralBindings = [{ urn: 'urn:archinex:ontology:security:zone:oam', revision: 2 }];

    const batch = await batchRatifyProjectType2Slots(
      {
        projectId: TEST_PROJECT_ID,
        actorId: 'lead@archinex.test',
        actorRole: 'lead_architect',
        rationale: 'Ratification pour export HLD Document Engine'
      },
      {
        selectedConceptUrn: 'urn:archinex:ontology:concept:iam_security_zerotrust',
        title: 'IAM Zero-Trust',
        problem: 'IAM, PKI, Vault',
        explicitBindings: structuralBindings
      },
      fixtureCatalog
    );

    const manifest = await generateArchitectureLockManifest(
      {
        projectId: TEST_PROJECT_ID,
        sealedBy: 'lead@archinex.test',
        sealedByRole: 'lead_architect'
      },
      fixtureCatalog
    );

    const enrichedComponents: LogicalComponent[] = COMPLETE_COMPONENT_CATALOG.filter((c) =>
      batch.instantiatedComponents.includes(c.metadata.name)
    );

    const enriched = buildDocumentEnginePayload(mockDossier, {
      transverseEnrichment: {
        components: enrichedComponents,
        ratifiedSlots: batch.updatedLedger.slots,
        architectureLock: manifest
      }
    });

    const transverseSection = enriched.blueprint.sections.find(
      (s) => s.id === 'sec-socle-transverse-togaf'
    );
    expect(transverseSection).toBeDefined();
    expect(
      enriched.projectedGraph.views?.some((v) => v.id === 'view-socle-transverse')
    ).toBe(true);
    expect(
      enriched.projectedGraph.items.some((i) => i.attributes.name === 'hsm-appliance')
    ).toBe(true);
    expect(
      enriched.projectedGraph.items.some((i) => i.attributes.name === 'pki-ca')
    ).toBe(true);
    expect(
      enriched.projectedGraph.items.some((i) => i.attributes.name === 'vault-cluster')
    ).toBe(true);
    expect(
      enriched.projectedGraph.relations.some(
        (r) => r.targetId === 'transverse-comp-hsm-appliance' && r.provenance === 'fact'
      )
    ).toBe(true);

    const lockTable = transverseSection?.blocks.find(
      (b) => b.type === 'authored-table' && String(b.caption).includes('architecture.lock')
    ) as { rows?: string[][] } | undefined;
    expect(lockTable).toBeDefined();
    expect(JSON.stringify(lockTable?.rows)).toContain(manifest.integritySha256);
  });

  it('évalue réellement via OPA les 18 règles de l’Axe 9 (conforme + dérives) sans littéraux dupliqués', async () => {
    const axe9LeafUrns = [
      'urn:archinex:ontology:telecom:network:spine_leaf_evpn',
      'urn:archinex:ontology:security:zone:user_plane',
      'urn:archinex:ontology:storage:csi:ceph_rbd_3replicas',
      'urn:archinex:ontology:storage:s3:object_erasure_coding',
      'urn:archinex:ontology:security:crypto:luks2_kms_hsm',
      'urn:archinex:ontology:storage:backup:s3_object_lock_worm',
      'urn:archinex:ontology:security:iam:oidc_fido2_rbac',
      'urn:archinex:ontology:security:pki:cert_manager_spiffe_mtls',
      'urn:archinex:ontology:security:secrets:vault_dynamic_leases',
      'urn:archinex:ontology:observability:telemetry:otel_prometheus_loki',
      'urn:archinex:ontology:observability:soc:siem_syslog_tls_nis2',
      'urn:archinex:ontology:observability:noc:alertmanager_slo_burnrate',
      'urn:archinex:ontology:resilience:drp:active_active_stretched',
      'urn:archinex:ontology:resilience:drp:active_passive_warm_standby',
      'urn:archinex:ontology:resilience:testing:automated_gameday_quarterly',
      'urn:archinex:ontology:platform:registry:harbor_cosign_trivy'
    ];

    const bindings = axe9LeafUrns.map((urn) => ({
      urn,
      revision: fixtureCatalog.entities[urn]?.revision ?? 1
    }));

    // Vérifier l'absence de littéraux chaîne dupliqués par rapport aux projections ontologiques Axe 9
    const policyText = readFileSync(
      resolve(process.cwd(), 'edp/policies/multi_axis_refinement.rego'),
      'utf8'
    );
    const stringProjections: Record<string, Record<string, string>> = {};
    for (const urn of axe9LeafUrns) {
      const proj = fixtureCatalog.entities[urn]?.projections || {};
      const strOnly: Record<string, string> = {};
      for (const [k, v] of Object.entries(proj)) {
        if (typeof v === 'string') strOnly[k] = v;
      }
      stringProjections[urn] = strOnly;
    }
    expect(detectDuplicateLiterals(policyText, stringProjections)).toHaveLength(0);

    // 1. État nominal 100% conforme sur les 16 feuilles (18 règles OPA)
    const nominalInventory = composeMultiAxisHydration(TEST_PROJECT_ID, bindings, fixtureCatalog);
    const nominalEval = await evaluateMultiAxisOracle(nominalInventory, bindings, fixtureCatalog);
    expect(nominalEval.verdict).toBe('compliant');
    expect(nominalEval.violations).toHaveLength(0);

    // 2. Déclenchement simultané des 18 règles par surcharge de dérive LLD
    const driftInventory = composeMultiAxisHydration(TEST_PROJECT_ID, bindings, fixtureCatalog, {
      torUplinksPerRack: 1,
      fabricOverlayProtocol: 'flat-vlan',
      userPlaneIsolationLevel: 'shared-mgmt',
      storageReplicationFactor: 1,
      objectVersioningEnabled: false,
      storageEncryptionCipher: 'none-cleartext',
      backupImmutabilityMode: 'MUTABLE',
      iamAllowClusterAdminGroup: true,
      iamMfaLevel: 'password-only',
      workloadMtlsMode: 'PERMISSIVE',
      allowStaticK8sSecrets: true,
      telemetryCollectorStandard: 'proprietary-agent',
      siemTransport: 'udp-cleartext',
      alertRequireRunbookAnnotation: false,
      drpWitnessSitePresent: false,
      drpRpoSeconds: 3600,
      drpMaxDaysBetweenDrills: 365,
      registryCosignVerification: false
    });

    const driftEval = await evaluateMultiAxisOracle(driftInventory, bindings, fixtureCatalog);
    expect(driftEval.verdict).toBe('violated');
    const triggeredRules = new Set(driftEval.violations.map((v) => v.rule));

    const expectedAll18Rules = [
      'data.archinex.edp.multiaxis.deny_single_tor_uplink',
      'data.archinex.edp.multiaxis.deny_non_evpn_fabric',
      'data.archinex.edp.adr015.deny_user_plane_management_leak',
      'data.archinex.edp.multiaxis.deny_insufficient_storage_replicas',
      'data.archinex.edp.multiaxis.deny_unprotected_s3_bucket',
      'data.archinex.edp.multiaxis.deny_unencrypted_storage_volume',
      'data.archinex.edp.multiaxis.deny_mutable_backup_repository',
      'data.archinex.edp.multiaxis.deny_wildcard_cluster_admin_rbac',
      'data.archinex.edp.multiaxis.deny_missing_mfa_enforcement',
      'data.archinex.edp.multiaxis.deny_plaintext_interservice_flow',
      'data.archinex.edp.multiaxis.deny_static_secret_in_git',
      'data.archinex.edp.multiaxis.deny_unmonitored_workload',
      'data.archinex.edp.multiaxis.deny_missing_siem_audit_sink',
      'data.archinex.edp.multiaxis.deny_alert_without_runbook_url',
      'data.archinex.edp.multiaxis.deny_missing_quorum_witness_site',
      'data.archinex.edp.multiaxis.deny_rpo_exceeding_threshold',
      'data.archinex.edp.multiaxis.deny_untested_drp_plan',
      'data.archinex.edp.multiaxis.deny_unsigned_oci_image'
    ];

    for (const rule of expectedAll18Rules) {
      expect(triggeredRules.has(rule)).toBe(true);
    }
  });
});
