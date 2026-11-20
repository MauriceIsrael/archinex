import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COMPONENT_CATALOG,
  TRANSVERSE_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_VALUE_CATALOGS,
  createEmergentLogicalComponent,
  type EntityLifecycleStatus
} from '../../src/lib/domain/edp/componentCatalog';
import {
  resolveComponentInstance,
  verifyCatalogDanglingReferences,
  verifyResolvedIpUniqueness
} from '../../src/lib/domain/edp/refResolver';
import { deriveProjectHydrationContextFromEntries } from '../../src/lib/server/edp/projectHydrationContext';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration
} from '../../src/lib/server/edp/refinementCoverage';
import { loadOntologyCatalog } from '../../src/lib/server/edp/ontologyClient';
import { buildSylvaTenantWorkloadManifests } from '../../src/lib/server/edp/sylvaGitopsExport';
import { buildHldFragment } from '../../src/lib/domain/hldFragment';
import {
  buildProjectCompletenessLedger,
  promoteSlotToDeliberationSubject
} from '../../src/lib/server/edp/decisionSlotRegistry';

describe('Continuité Bout-en-Bout RFP -> HLD -> LLD Pré-hydraté "planned" & Cohérence Inter-Objets (#344)', () => {
  it('supporte le statut "planned" dans EntityLifecycleStatus et résout core-network sans groupe firewall pendant (#346, #347)', () => {
    const plannedStatus: EntityLifecycleStatus = 'planned';
    expect(plannedStatus).toBe('planned');

    const report = verifyCatalogDanglingReferences([
      ...DEFAULT_COMPONENT_CATALOG,
      ...TRANSVERSE_COMPONENT_CATALOG
    ]);
    expect(report.valid).toBe(true);
    expect(report.danglingFirewallGroups).toEqual([]);
    expect(report.danglingSvmRefs).toEqual([]);
    expect(report.danglingLogicalInterfaceGroups).toEqual([]);
  });

  it('attribue des offsets IPv4 distincts à plusieurs composants émergents et garantit 0 collision IPv4 (#347)', () => {
    const compA = createEmergentLogicalComponent('telemetry-collector');
    const compB = createEmergentLogicalComponent('fleet-dispatcher');
    const compC = createEmergentLogicalComponent('edge-orchestrator');

    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const resolved = [...DEFAULT_COMPONENT_CATALOG, compA, compB, compC]
      .filter((c) => !c.metadata.external)
      .map((c) => resolveComponentInstance(c, prodOverlay, 'dc1', DEFAULT_VALUE_CATALOGS));

    const collisions = verifyResolvedIpUniqueness(resolved);
    expect(collisions).toEqual([]);
  });

  it('préserve les exigences évacuées et détecte les besoins émergents lors de la dérivation Prisma Phase 1 -> Phase 5 (#345)', async () => {
    const ctx = await deriveProjectHydrationContextFromEntries([
      {
        ref: 'REQ-01',
        text: 'Fourniture d’un système cartographique SIG WMS/WFS pour la géolocalisation temps réel des équipes.',
        categoryOrDomain: 'application',
        disposition: 'deliberated'
      },
      {
        ref: 'REQ-02',
        text: 'Exigence commodité standard de conformité documentaire.',
        categoryOrDomain: 'security',
        disposition: 'evacuated'
      }
    ]);

    expect(ctx.commoditySlots).toBeDefined();
    expect(ctx.commoditySlots!.length).toBeGreaterThanOrEqual(2);
    const coveredRefs = ctx.commoditySlots!.flatMap((s) => s.coveredRawRefs);
    expect(coveredRefs).toContain('REQ-01');
    expect(coveredRefs).toContain('REQ-02');
  });

  it('pré-hydrate plusieurs serveurs Bare-Metal en statut "planned" avec des IPv4 uniques par interface et propage les clauses du sujet (#346)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const coverage = computeRefinementCoverage(
      {
        subjectId: 'subj-e2e-coherence',
        title: 'Substrat Serveur & Réseau Cœur',
        problem: 'Double pool Bare-Metal SR-IOV et Standard NIS2 avec isolation OAM.',
        decisionText:
          'Retenir les pools Bare-Metal SR-IOV DPDK et Standard NIS2 avec double alimentation 2N et bastion OAM.',
        structuredFacts: [
          {
            id: 'REQ-E2E-101',
            category: 'NFR',
            statement: 'Le cluster doit disposer de deux pools Bare-Metal distincts en statut planned.'
          }
        ],
        explicitBindings: [
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal_standard_nis2', revision: 1 },
          { urn: 'urn:archinex:ontology:security:zone:oam', revision: 1 }
        ],
        autoBindFromText: true
      },
      catalog
    );

    expect(coverage.clauses.some((c) => c.source === 'k18_fact')).toBe(true);

    const hydrated = composeMultiAxisHydration(
      'subj-e2e-coherence',
      coverage.composedBindings,
      catalog,
      { projectRequirementRefs: ['REQ-E2E-101'] }
    );

    expect(hydrated.nautobot_planned_devices.length).toBeGreaterThanOrEqual(2);
    for (const dev of hydrated.nautobot_planned_devices) {
      expect(dev.status).toBe('planned');
    }

    // Unicité des adresses IP des interfaces entre les nœuds Bare-Metal pré-hydratés
    const dataIps = hydrated.nautobot_planned_devices.map((d: any) => {
      const eth0 = (d.interfaces || []).find((i: any) => i.name === 'eth0');
      return eth0?.ip;
    });
    expect(new Set(dataIps).size).toBe(dataIps.length);

    // Présence de la clause projet et de la résolution multi-datacenter
    expect(hydrated.satisfied_clauses).toContain('REQ-E2E-101');
    expect(hydrated.resolved_components_by_dc).toBeDefined();
    expect(Object.keys(hydrated.resolved_components_by_dc || {}).length).toBeGreaterThanOrEqual(2);
  });

  it('projette les flux from/to et les sélecteurs toEndpoints dans les CiliumNetworkPolicy générées (#347)', () => {
    const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
    const coreComp = DEFAULT_COMPONENT_CATALOG.find((c) => c.metadata.name === 'core-network')!;
    const resolvedCore = resolveComponentInstance(coreComp, prodOverlay, 'dc1', DEFAULT_VALUE_CATALOGS);
    const files = buildSylvaTenantWorkloadManifests(resolvedCore);

    const netpolFile = files.find((f) => f.path.endsWith('/network-policies.yaml'));
    expect(netpolFile).toBeDefined();
    expect(netpolFile!.yaml).toContain('"archinex.io/from": "group:ext-mme-lot3"');
    expect(netpolFile!.yaml).toContain('"archinex.io/to": "group:secgw-lot1"');
    expect(netpolFile!.yaml).toContain('"archinex.io/firewall-group": secgw-lot1');
  });

  it('enrichit le fragment HLD avec les emplacements de décision, composants logiques et énoncés (#348)', () => {
    const fragment = buildHldFragment({
      subject: {
        id: 'subj-hld-e2e',
        sectionRef: '§3.1',
        name: 'Architecture Réseau & Sécurité Transverse',
        problemStatement: 'Garantir le cloisonnement multi-VRF et la chaîne de confiance PKI/Vault.',
        maturityLevel: 'L3_decided',
        deliberationStatus: 'arbitrated'
      },
      dependsOn: [],
      requirementRefs: ['REQ-301'],
      requirements: [
        { id: 'REQ-301', clauseRef: 'Art. 3.1', title: 'Cloisonnement multi-VRF', criticality: 'bloquant' }
      ],
      requirementsDossierPresent: true,
      criteria: [
        {
          id: 'crit-1',
          subjectId: 'subj-hld-e2e',
          name: 'Sécurité',
          description: 'Isolation stricte',
          kind: 'compliance',
          weight: 5,
          author: 'lead',
          role: 'lead_architect',
          productionMode: 'human-authored',
          version: 1
        }
      ],
      options: [
        {
          id: 'opt-1',
          subjectId: 'subj-hld-e2e',
          title: 'Architecture Multi-VRF avec PKI & Vault',
          summary: 'Segmentation par VRF et certificats auto-renouvelés',
          origin: 'human',
          kbRefs: [],
          status: 'retained',
          author: 'lead',
          role: 'lead_architect',
          productionMode: 'human-authored',
          version: 1
        }
      ],
      evaluations: [],
      arguments: [],
      decision: {
        id: 'dec-1',
        subjectId: 'subj-hld-e2e',
        retainedOptionId: 'opt-1',
        rejected: [],
        rationale: 'Conforme aux exigences de cloisonnement',
        reversibility: 'costly',
        acceptedViolations: [],
        kbCandidateIds: [],
        arbiterId: 'lead@archinex.io',
        arbiterRole: 'lead_architect',
        decidedAt: '2026-11-19T10:00:00.000Z',
        version: 1
      },
      catalogComponents: [
        {
          name: 'pki-ca',
          title: 'Autorité PKI Interne',
          domain: 'security',
          kind: 'infrastructure',
          dependsOn: []
        },
        {
          name: 'vault-cluster',
          title: 'Cluster Coffre-Fort Secrets',
          domain: 'security',
          kind: 'infrastructure',
          dependsOn: ['pki-ca']
        }
      ],
      generatedAt: '2026-11-19T12:00:00.000Z'
    });

    expect(fragment.targetArchitectureMermaid).toBeDefined();
    expect(fragment.targetArchitectureMermaid).toContain('Autorité PKI Interne');
    expect(fragment.targetArchitectureMermaid).toContain('Cluster Coffre-Fort Secrets');
    expect(fragment.targetArchitectureMermaid).toContain('COMP_1_vault_cluster -->|"dépend de"| COMP_0_pki_ca');
  });

  it('promeut un emplacement Type 2 en sujet de délibération Type 1 avec ses options candidates (#345)', async () => {
    const projectId = `test-e2e-promote-${Date.now()}`;
    const ledger = await buildProjectCompletenessLedger({
      projectId,
      problem: 'Déploiement serveur Bare-Metal avec bastion OAM.'
    });
    const targetSlot = ledger.slots[0];
    expect(targetSlot).toBeDefined();

    const promoted = await promoteSlotToDeliberationSubject({
      projectId,
      slotId: targetSlot.slotId,
      actorId: 'lead@archinex.io',
      actorRole: 'lead_architect',
      reason: 'Nécessite un arbitrage contradictoire entre deux variantes matérielles.'
    });

    expect(promoted.subjectId).toContain('subj-');
    expect(promoted.candidateOptions.length).toBeGreaterThan(0);
  });
});
