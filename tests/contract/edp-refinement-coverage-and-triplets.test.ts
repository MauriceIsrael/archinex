import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadOntologyCatalog,
  queryOntologyTriplets,
  addOntologyTriplet,
  removeOntologyTriplet,
  resetRuntimeOntologyOverlay
} from '../../src/lib/server/edp/ontologyClient.js';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration
} from '../../src/lib/server/edp/refinementCoverage.js';

describe('EDP Ontology Triplets, KAOS Refinement Coverage & Multi-Axis Composition', () => {
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

    expect(reqAxes.length).toBeGreaterThanOrEqual(5);
    expect(reqAxes.map((t) => t.object)).toContain('urn:archinex:ontology:axis:compute_substrate');
    expect(reqAxes.map((t) => t.object)).toContain('urn:archinex:ontology:axis:security_zoning');
    expect(reqAxes.map((t) => t.object)).toContain('urn:archinex:ontology:axis:env_fidelity');
  });

  it('détecte les sous-axes oubliés (missing_refinement) et les feuilles sans oracle (covered_no_oracle)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

    // Sujet qui ne lie explicitement que le substrat Bare-Metal et l'OOB (oubliant le zonage sécu, la parité env et l'alim 2N)
    const report = computeRefinementCoverage(
      {
        title: 'Plateforme Cluster Telco Cloud',
        decisionText: 'Serveurs Bare-Metal Dell R750 avec réseau OOB Redfish',
        explicitBindings: [
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
          { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 }
        ],
        autoBindFromText: false
      },
      catalog
    );

    expect(report.matchedConcepts[0].urn).toBe('urn:archinex:ontology:concept:telco_cloud_platform');
    expect(report.metrics.totalMandatoryAxes).toBe(5);
    expect(report.metrics.coveredExecutableAxes).toBe(2);
    expect(report.metrics.missingAxes).toBe(3);
    expect(report.metrics.isComplete).toBe(false);

    const secAxis = report.axes.find((a) => a.axisUrn === 'urn:archinex:ontology:axis:security_zoning');
    expect(secAxis?.status).toBe('missing_refinement');
    expect(secAxis?.candidateLeaves.map((l) => l.urn)).toContain('urn:archinex:ontology:security:zone:oam');

    // Si on lie l'axe alimentation 2N (qui n'a pas encore de règle Rego dans la fixture), son statut devient covered_no_oracle
    const reportWithPower = computeRefinementCoverage(
      {
        title: 'Plateforme Cluster Telco Cloud',
        explicitBindings: [
          { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
          { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 },
          { urn: 'urn:archinex:ontology:facilities:power:dual_feed_2n', revision: 1 }
        ],
        autoBindFromText: false
      },
      catalog
    );

    const powerAxis = reportWithPower.axes.find(
      (a) => a.axisUrn === 'urn:archinex:ontology:axis:power_cooling_resilience'
    );
    expect(powerAxis?.status).toBe('covered_no_oracle');
    expect(reportWithPower.metrics.coveredNoOracleAxes).toBe(1);
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

  it('compose dynamiquement les artefacts LLD multi-axes (Compute + OOB + Zonage Sécurité + Environnements)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

    const report = computeRefinementCoverage(
      {
        subjectId: 'sub_lulu_40',
        title: 'Environnements Plateforme Lulu & Sécurité OAM',
        decisionText:
          'Déploiement sur serveur bare-metal avec administration hors-bande OOB, isolation stricte de la zone OAM et 3 environnements dev, recette iso-prod et production.',
        autoBindFromText: true
      },
      catalog
    );

    expect(report.metrics.coveredExecutableAxes).toBeGreaterThanOrEqual(4);

    const hydrated = composeMultiAxisHydration('sub_lulu_40', report.composedBindings, catalog);
    expect(hydrated.nautobot_planned_devices).toHaveLength(1);
    expect(hydrated.k8s_manifests).toHaveLength(1);
    expect(hydrated.security_zones.length).toBeGreaterThanOrEqual(1);
    expect(hydrated.environments.length).toBeGreaterThanOrEqual(3);
    expect(hydrated.coveredDomains).toEqual(
      expect.arrayContaining(['infrastructure', 'telecom', 'security', 'platform'])
    );
  });

  it('permet d’ajouter et supprimer dynamiquement un triplet { Sujet, Verbe, Complément } qui étend immédiatement la matrice de couverture', async () => {
    // Ajout d'un 6ème sous-axe obligatoire sur le concept telco_cloud_platform via un triplet
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
    expect(
      coverageAfterAdd.axes.some(
        (a) => a.axisUrn === 'urn:archinex:ontology:axis:observability_traces'
      )
    ).toBe(true);

    // Suppression du triplet
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
});
