import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPONENT_CATALOG,
  instantiateCatalogFromOntologyBindings
} from '../../src/lib/domain/edp/componentCatalog';
import { loadProjectComponentCatalog } from '../../src/lib/server/edp/componentCatalogRepository';
import {
  buildLiveArchitectureLockSnapshot,
  recordExplicitProjectSlotRatification,
  resetProjectSlotRegistry
} from '../../src/lib/server/edp/decisionSlotRegistry';
import { deriveProjectHydrationContextFromEntries } from '../../src/lib/server/edp/projectHydrationContext';
import type { Encoder } from '../../src/lib/server/similarity/encoder';

describe('Portée et hydratation des vues d’architecture Phase 5 & Architecture Lockée', () => {
  it('démarre un nouveau projet avec un catalogue de composants vide par défaut (opt-in)', () => {
    const freshBundle = loadProjectComponentCatalog('unit-fresh-project-without-catalog');
    expect(freshBundle.components).toEqual([]);
    expect(freshBundle.overlays.length).toBeGreaterThan(0);
    expect(freshBundle.catalogs.datacenters.length).toBeGreaterThan(0);

    const referenceBundle = loadProjectComponentCatalog('unit-fresh-project-without-catalog', {
      includeDefaultComponents: true
    });
    expect(referenceBundle.components.length).toBe(DEFAULT_COMPONENT_CATALOG.length);
  });

  it('ne retient dans instantiateCatalogFromOntologyBindings que les composants liés et leurs dépendances transitives', () => {
    const instantiated = instantiateCatalogFromOntologyBindings(
      ['urn:archinex:ontology:application:emergent:new_tile_server'],
      DEFAULT_COMPONENT_CATALOG
    );
    const names = instantiated.map((c) => c.metadata.name);

    expect(names).toContain('tile-server');
    expect(names).toContain('pki-ca');
    expect(names).toContain('vault-cluster');
    expect(names).toContain('siem-soc');

    // Les composants tiers non liés ne doivent pas être injectés
    expect(names).not.toContain('core-network');
    expect(names).not.toContain('ptt-server');
    expect(names).not.toContain('mdm-emm');
  });

  it('préserve les composants déjà enregistrés dans le projet lorsque preserveBaseCatalog est activé', () => {
    const customCatalog = instantiateCatalogFromOntologyBindings(
      ['urn:archinex:ontology:application:emergent:new_custom_gateway'],
      DEFAULT_COMPONENT_CATALOG
    );
    const extended = instantiateCatalogFromOntologyBindings(
      ['urn:archinex:ontology:security:hsm:eviden_proteccio'],
      customCatalog,
      undefined,
      { preserveBaseCatalog: true }
    );
    const names = extended.map((c) => c.metadata.name);

    expect(names).toContain('custom-gateway');
    expect(names).toContain('hsm-appliance');
    expect(names).not.toContain('core-network');
  });

  it('n’expose que les composants hydratés dans buildLiveArchitectureLockSnapshot pour un projet mono-sujet', async () => {
    const projectId = 'unit-hydrated-scope-lock-test';
    resetProjectSlotRegistry(projectId);

    try {
      await recordExplicitProjectSlotRatification({
        projectId,
        axisUrn: 'urn:archinex:ontology:axis:emergent_component_allocation',
        leafUrn: 'urn:archinex:ontology:application:emergent:new_spatial_server',
        actorId: 'lead@archinex.local',
        actorRole: 'lead_architect',
        rationale: 'Allocation dédiée pour serveur spatial.'
      });

      const snap = await buildLiveArchitectureLockSnapshot({
        projectId,
        projectTitle: 'Projet Spatial Isolé',
        title: 'Serveur spatial autonome',
        problem: 'Déployer un serveur spatial autonome.',
        autoBindFromText: false
      });

      const names = snap.components.map((c) => c.name);
      expect(names).toContain('spatial-server');
      expect(names).not.toContain('core-network');
      expect(names).not.toContain('ptt-server');

      const spatial = snap.components.find((c) => c.name === 'spatial-server');
      expect(spatial?.isHydratedInProject).toBe(true);
      expect(spatial?.lockStatus).toBe('emergent_locked');
    } finally {
      resetProjectSlotRegistry(projectId);
    }
  });

  it('hydrate le composant applicatif correspondant depuis des exigences projet par matching sémantique et repli lexical', async () => {
    const projectId = 'unit-semantic-hydration-test';
    resetProjectSlotRegistry(projectId);

    // Encodeur sémantique de test : projette les textes liés aux tuiles/SIG sur l'axe [1, 0]
    const mockEncoder: Encoder = {
      model: 'mock-semantic-encoder',
      async version() {
        return '1';
      },
      async encode(text: string) {
        const lower = text.toLowerCase();
        if (/tuile|wms|wfs|geoserver|postgis|carto|sig|gis|map/.test(lower)) {
          return [1, 0];
        }
        return [0, 1];
      }
    };

    try {
      // 1. Avec encodeur sémantique actif (même sans mot-clé exact)
      const semanticCtx = await deriveProjectHydrationContextFromEntries(
        [
          {
            ref: 'REQ-MAP-01',
            text: 'Fournir un service de tuiles vectorielles et raster pour l’affichage carto hors-ligne.'
          }
        ],
        { projectTitle: 'Projet Carto', encoderOverride: mockEncoder }
      );

      expect(semanticCtx.commoditySlots?.some((s) => s.logicalComponentName === 'gis-server')).toBe(
        true
      );

      // 2. Avec repli lexical (sans encodeur actif)
      const lexicalCtx = await deriveProjectHydrationContextFromEntries(
        [
          {
            ref: 'REQ-CARTO-01',
            text: 'Déployer un serveur carto autonome avec tuiles hors-ligne.'
          }
        ],
        { projectTitle: 'Projet Carto' }
      );

      const snap = await buildLiveArchitectureLockSnapshot({
        ...lexicalCtx,
        projectId
      });

      const names = snap.components.map((c) => c.name);
      expect(names).toContain('gis-server');
      expect(names).not.toContain('core-network');
      expect(names).not.toContain('ptt-server');
      expect(names).not.toContain('mdm-emm');

      const gis = snap.components.find((c) => c.name === 'gis-server');
      expect(gis?.isHydratedInProject).toBe(true);
      expect(gis?.coveredRequirementRefs).toContain('REQ-CARTO-01');
    } finally {
      resetProjectSlotRegistry(projectId);
    }
  });
});
