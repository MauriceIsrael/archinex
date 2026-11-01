import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import {
  loadOntologyCatalog,
  checkOntologyBindings
} from '../../src/lib/server/edp/ontologyClient.js';
import {
  compileOntologyProjections,
  detectDuplicateLiterals
} from '../../src/lib/server/edp/projectionCompiler.js';
import {
  saveEdpPackage,
  getEdpPackage,
  transitionEdpStatus,
  retractEdpOnAntecedentChange,
  isEdpFeatureEnabled,
  InvariantViolationError,
  UnauthorizedRoleError,
  FeatureDisabledError
} from '../../src/lib/server/edp/edpRepository.js';

describe('EDP Ontology, Projections & Persistence Contract (#173, #181, #174, #177)', () => {
  const originalEnv = process.env.ARCHINEX_EXPERIMENTAL_EDP;
  const fixturePath = resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json');

  beforeEach(() => {
    process.env.ARCHINEX_EXPERIMENTAL_EDP = '1';
  });

  afterEach(() => {
    process.env.ARCHINEX_EXPERIMENTAL_EDP = originalEnv;
  });

  describe('Client d’Ontologie & Contrôle des Liaisons (Issue #173)', () => {
    it('charge le catalogue depuis la fixture locale hors-ligne', async () => {
      const catalog = await loadOntologyCatalog({ fixturePath });
      expect(catalog.catalog_version).toBe('1.0');
      expect(catalog.entities['urn:archinex:ontology:infrastructure:server:baremetal']).toBeDefined();
    });

    it('valide avec succès des liaisons ontologiques conformes', async () => {
      const catalog = await loadOntologyCatalog({ fixturePath });
      const bindings = [
        { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
        { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 }
      ];

      const result = checkOntologyBindings(bindings, catalog);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('signale une erreur explicite pour une URN inconnue', async () => {
      const catalog = await loadOntologyCatalog({ fixturePath });
      const bindings = [{ urn: 'urn:archinex:ontology:inconnue', revision: 1 }];

      const result = checkOntologyBindings(bindings, catalog);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('urn_not_found');
      expect(result.errors[0].message).toContain('inconnue');
    });

    it('signale un avertissement stale_binding si la liaison est sur une ancienne révision', async () => {
      const catalog = await loadOntologyCatalog({ fixturePath });
      // L'URN oam est en révision 2 dans le catalogue
      const bindings = [{ urn: 'urn:archinex:ontology:security:zone:oam', revision: 1 }];

      const result = checkOntologyBindings(bindings, catalog);
      expect(result.valid).toBe(true); // non bloquant mais avertissement
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('stale_binding');
      expect(result.warnings[0].message).toContain('périmée');
    });

    it('lève une erreur explicite sans rien inventer si le Hub est inaccessible', async () => {
      await expect(
        loadOntologyCatalog({ hubUrl: 'http://127.0.0.1:54321/hub-down' })
      ).rejects.toThrow('Knowledge Hub indisponible');
    });
  });

  describe('Compilateur de Projections & Détection de Doublons (Issue #181)', () => {
    it('compile un document data.ontology déterministe avec empreinte SHA-256', async () => {
      const catalog = await loadOntologyCatalog({ fixturePath });
      const bindings = [
        { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
        { urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 }
      ];

      const comp1 = compileOntologyProjections(bindings, catalog);
      const comp2 = compileOntologyProjections(bindings, catalog);

      expect(comp1.fingerprint).toBe(comp2.fingerprint);
      expect(comp1.ontology).toEqual(comp2.ontology);
      expect(typeof comp1.fingerprint).toBe('string');
      expect(comp1.fingerprint).toHaveLength(64);
    });

    it('modifie l’empreinte de façon déterministe si une valeur d’ontologie change', async () => {
      const catalog = await loadOntologyCatalog({ fixturePath });
      const bindings = [{ urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 }];

      const comp1 = compileOntologyProjections(bindings, catalog);

      // Simulation d'une nouvelle révision de l'entité
      const modifiedCatalog = JSON.parse(JSON.stringify(catalog));
      modifiedCatalog.entities['urn:archinex:ontology:infrastructure:server:baremetal'].projections.allowed_roles.push('storage-node');
      const comp2 = compileOntologyProjections(bindings, modifiedCatalog);

      expect(comp1.fingerprint).not.toBe(comp2.fingerprint);
    });

    it('détecte les littéraux codés en dur dans une politique Rego (Linter)', () => {
      const policySnippet = `
        package test
        deny_role if {
          input.role == "control-plane"
        }
      `;

      const projections = {
        roles: ['control-plane', 'worker']
      };

      const warnings = detectDuplicateLiterals(policySnippet, projections);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].literal).toBe('control-plane');
      expect(warnings[0].message).toContain('data.ontology');
    });
  });

  describe('Persistance des EDP & Invariant II (Issue #174)', () => {
    const testEdpId = `EDP-TEST-${Date.now()}`;

    it('crée et persiste un EDP proposé', async () => {
      const pkg = await saveEdpPackage({
        id: testEdpId,
        decisionId: 'ADR-TEST-01',
        subjectId: 'SUBJ-TEST-01',
        revision: 1,
        status: 'proposed',
        content: { title: 'Test EDP' },
        policyHash: '0000000000000000000000000000000000000000000000000000000000000000',
        productionMode: 'llm-derived'
      });

      expect(pkg.id).toBe(testEdpId);
      expect(pkg.status).toBe('proposed');

      const retrieved = await getEdpPackage(testEdpId);
      expect(retrieved?.id).toBe(testEdpId);
      expect(retrieved?.decisionId).toBe('ADR-TEST-01');
    });

    it('refuse formellement de valider un EDP llm-derived sans validateur humain (Invariant II)', async () => {
      await expect(
        transitionEdpStatus({
          id: testEdpId,
          newStatus: 'validated'
          // Pas d'utilisateur ni de rôle
        })
      ).rejects.toThrow(InvariantViolationError);
    });

    it('refuse la validation si le rôle n’est pas habilité (Invariant VII)', async () => {
      await expect(
        transitionEdpStatus({
          id: testEdpId,
          newStatus: 'validated',
          userId: 'USR-GUEST',
          userRole: 'Guest Observer'
        })
      ).rejects.toThrow(UnauthorizedRoleError);
    });

    it('valide avec succès l’EDP par un Lead Architect habilité', async () => {
      const updated = await transitionEdpStatus({
        id: testEdpId,
        newStatus: 'validated',
        userId: 'USR-LEAD-01',
        userRole: 'Lead Architect'
      });

      expect(updated.status).toBe('validated');
      expect(updated.validatorRole).toBe('Lead Architect');
      expect(updated.validatorId).toBe('USR-LEAD-01');
      expect(updated.validatedAt).toBeDefined();
    });

    it('bloque les opérations si le drapeau ARCHINEX_EXPERIMENTAL_EDP est absent', async () => {
      delete process.env.ARCHINEX_EXPERIMENTAL_EDP;
      expect(isEdpFeatureEnabled()).toBe(false);

      await expect(getEdpPackage(testEdpId)).rejects.toThrow(FeatureDisabledError);
    });
  });

  describe('Rétractation & Maintenance de Vérité (Invariant VI - Issue #177)', () => {
    const testEdpId = `EDP-STALE-TEST-${Date.now()}`;

    it('passe un EDP à "stale" lors de la caducité de sa décision source', async () => {
      await saveEdpPackage({
        id: testEdpId,
        decisionId: 'ADR-CADUC-01',
        subjectId: 'SUBJ-TEST-02',
        revision: 1,
        status: 'validated',
        content: { title: 'EDP actif' },
        policyHash: '0000000000000000000000000000000000000000000000000000000000000000',
        productionMode: 'human-authored',
        ontologyRefs: [{ urn: 'urn:archinex:ontology:telecom:network:oob', revision: 1 }]
      });

      // Caducité de la décision ADR-CADUC-01
      const result = await retractEdpOnAntecedentChange('ADR-CADUC-01');
      expect(result.affectedCount).toBeGreaterThanOrEqual(1);

      const refreshed = await getEdpPackage(testEdpId);
      expect(refreshed?.status).toBe('stale');
      expect(refreshed?.staleReason).toContain('rétractée ou révisée');
    });

    it('passe un EDP à "stale" lors de la mise à jour d’une URN d’ontologie liée', async () => {
      const edpUrnTestId = `EDP-URN-TEST-${Date.now()}`;
      await saveEdpPackage({
        id: edpUrnTestId,
        decisionId: 'ADR-SOME-02',
        subjectId: 'SUBJ-TEST-03',
        revision: 1,
        status: 'validated',
        content: { title: 'EDP actif lié' },
        policyHash: '0000000000000000000000000000000000000000000000000000000000000000',
        productionMode: 'human-authored',
        ontologyRefs: [{ urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 }]
      });

      // L'URN évolue vers la révision 2
      const result = await retractEdpOnAntecedentChange(
        'urn:archinex:ontology:infrastructure:server:baremetal',
        { oldRevision: 1, newRevision: 2 }
      );
      expect(result.affectedCount).toBeGreaterThanOrEqual(1);

      const refreshed = await getEdpPackage(edpUrnTestId);
      expect(refreshed?.status).toBe('stale');
      expect(refreshed?.staleReason).toContain('évolué vers la révision 2');
    });
  });
});
