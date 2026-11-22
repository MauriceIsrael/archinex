import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import {
  loadOntologyCatalog,
  resetRuntimeOntologyOverlay,
  type OntologyCatalog
} from '../../src/lib/server/edp/ontologyClient.js';
import {
  composeMultiAxisHydration,
  evaluateMultiAxisOracle
} from '../../src/lib/server/edp/refinementCoverage.js';
import {
  composeReconciliationGraph,
  isReconciliationGraphEmpty,
  validateReconciliationInstances,
  ReconciliationIntegrityError,
  RECONCILIATION_ARRAY_KEYS,
  type ReconciliationGraphModel,
  type ReconciliationInstancesInput,
  type ReconciliationObjectGraph
} from '../../src/lib/server/edp/reconciliationGraph.js';
import { checkIntentionPurity } from '../../src/lib/domain/edp/intentionPurity.js';

const HDS_MODEL_LEAF = 'urn:test:health:interco:hds_partner_exchange';
const HDS_LEGACY_LEAF = 'urn:test:health:interco:hds_partner_exchange_legacy';
const IPSEC_LEAF = 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256';

const HDS_MODEL: ReconciliationGraphModel = {
  required_classes: [
    'partner_organizations',
    'external_shadow_nodes',
    'internal_mediation_nodes',
    'ip_underlay_links',
    'ipsec_tunnels',
    'service_mediation_flows',
    'sla_and_monitoring_contracts'
  ],
  require_pivot: true,
  standards_applied: [
    'Référentiel HDS (Hébergement de Données de Santé)',
    'IHE XDS / DICOM TLS-IPsec Inter-Établissements'
  ],
  required_relations: [
    {
      from_class: 'service_mediation_flows',
      field: 'mandatory_mediation_hops',
      target_classes: ['internal_mediation_nodes'],
      required: true,
      is_array: true
    },
    {
      from_class: 'sla_and_monitoring_contracts',
      field: 'covered_flow_ref',
      target_classes: ['service_mediation_flows'],
      required: true
    }
  ]
};

function makeHdsInstances(): ReconciliationInstancesInput {
  return {
    source: 'project:chu-imagerie-hds',
    pivot_tenant_id: 'org-labo-radiologie-nord',
    partner_organizations: [
      {
        id: 'org-labo-radiologie-nord',
        name: "Laboratoire d'Imagerie Médicale du Nord",
        noc_contact: 'astreinte-si@labo-nord.example.org'
      }
    ],
    external_shadow_nodes: [
      {
        id: 'ext-pacs-labo-01',
        tenant_ref: 'org-labo-radiologie-nord',
        zone: 'ZONE-PARTENAIRE-IMAGERIE'
      }
    ],
    internal_mediation_nodes: [
      {
        id: 'gw-hds-dmz-01',
        role: 'Passerelle VPN HDS DMZ',
        zone: 'ZONE-DMZ-HDS',
        tenant_ref: 'org-labo-radiologie-nord',
        peer_shadow_ref: 'ext-pacs-labo-01'
      },
      {
        id: 'broker-hl7-01',
        role: 'Médiateur applicatif HL7/DICOM avec pseudonymisation',
        zone: 'ZONE-MEDIATION-SANTE',
        tenant_ref: 'org-labo-radiologie-nord',
        allowed_upstream_ref: 'gw-hds-dmz-01'
      },
      {
        id: 'pacs-core-chu-01',
        role: 'Archiveur PACS central du CHU',
        zone: 'ZONE-COEUR-HDS',
        allowed_upstream_ref: 'broker-hl7-01'
      }
    ],
    ip_underlay_links: [
      {
        id: 'link-wan-hds-labo-01',
        tenant_ref: 'org-labo-radiologie-nord',
        endpoint_a: 'ext-pacs-labo-01',
        endpoint_z: 'gw-hds-dmz-01',
        subnet: '198.51.100.4/30',
        vlan_id: 3102
      }
    ],
    ipsec_tunnels: [
      {
        id: 'tun-hds-labo-01',
        tenant_ref: 'org-labo-radiologie-nord',
        underlay_link_ref: 'link-wan-hds-labo-01',
        termination_a: 'ext-pacs-labo-01',
        termination_z: 'gw-hds-dmz-01',
        cipher_suite: 'AES-256-GCM',
        pfs_dh_group: 'DH-20-ECP384'
      }
    ],
    service_mediation_flows: [
      {
        id: 'flow-dicom-labo-to-chu',
        tenant_ref: 'org-labo-radiologie-nord',
        source_shadow_ref: 'ext-pacs-labo-01',
        ipsec_tunnel_ref: 'tun-hds-labo-01',
        mandatory_mediation_hops: ['gw-hds-dmz-01', 'broker-hl7-01'],
        destination_core_ref: 'pacs-core-chu-01',
        direct_bypass_allowed: false
      }
    ],
    sla_and_monitoring_contracts: [
      {
        id: 'sla-hds-imagerie-01',
        tenant_ref: 'org-labo-radiologie-nord',
        covered_flow_ref: 'flow-dicom-labo-to-chu',
        covered_tunnel_ref: 'tun-hds-labo-01',
        monitored_targets: ['link-wan-hds-labo-01', 'tun-hds-labo-01', 'broker-hl7-01']
      }
    ]
  };
}

function catalogWithHdsLeaves(base: OntologyCatalog): OntologyCatalog {
  const hdsInstances = makeHdsInstances();
  return {
    ...base,
    entities: {
      ...base.entities,
      [HDS_MODEL_LEAF]: {
        urn: HDS_MODEL_LEAF,
        revision: 1,
        kind: 'leaf',
        title: 'Interconnexion partenaire HDS chiffrée et médiée (modèle seul)',
        domain: 'security',
        oracle_rules: [
          'data.archinex.edp.multiaxis.deny_weak_wan_cipher',
          'data.archinex.edp.multiaxis.deny_unreconciled_partner_objects'
        ],
        hydration_template: {
          reconciliation_model: HDS_MODEL
        },
        projections: {
          cipher_suite: 'AES-256-GCM',
          require_partner_sla_reconciliation: true
        }
      } as never,
      [HDS_LEGACY_LEAF]: {
        urn: HDS_LEGACY_LEAF,
        revision: 1,
        kind: 'leaf',
        title: 'Interconnexion partenaire HDS (fragment historique équivalent)',
        domain: 'security',
        oracle_rules: [
          'data.archinex.edp.multiaxis.deny_weak_wan_cipher',
          'data.archinex.edp.multiaxis.deny_unreconciled_partner_objects'
        ],
        hydration_template: {
          reconciliation_graph: {
            pivot_tenant_id: hdsInstances.pivot_tenant_id,
            standards_applied: HDS_MODEL.standards_applied,
            partner_organizations: hdsInstances.partner_organizations,
            external_shadow_nodes: hdsInstances.external_shadow_nodes,
            internal_mediation_nodes: hdsInstances.internal_mediation_nodes,
            ip_underlay_links: hdsInstances.ip_underlay_links,
            ipsec_tunnels: hdsInstances.ipsec_tunnels,
            service_mediation_flows: hdsInstances.service_mediation_flows,
            sla_and_monitoring_contracts: hdsInstances.sla_and_monitoring_contracts
          }
        },
        projections: {
          cipher_suite: 'AES-256-GCM',
          require_partner_sla_reconciliation: true
        }
      } as never
    }
  };
}

function stripGraphContent(g: ReconciliationObjectGraph): Omit<ReconciliationObjectGraph, 'sources'> {
  const { sources: _sources, ...rest } = g;
  return rest;
}

describe('Source projet du graphe de réconciliation : Modèle (Hub) × Instances (Projet) (#414)', () => {
  beforeEach(() => resetRuntimeOntologyOverlay());

  it('1. Garde anti-vacuité : un projet sans instance lié à une feuille exigeant un graphe obtient insufficient_input (jamais compliant)', async () => {
    const base = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const catalog = catalogWithHdsLeaves(base);

    // Cas A : feuille déclarant `reconciliation_model` sans aucune instance projet fournie
    const bindingsModel = [{ urn: HDS_MODEL_LEAF, revision: 1 }];
    const emptyInv = composeMultiAxisHydration('sub_chu_vide', bindingsModel, catalog);
    expect(isReconciliationGraphEmpty(emptyInv.reconciliation_graph)).toBe(true);

    const evalModel = await evaluateMultiAxisOracle(emptyInv, bindingsModel, catalog);
    expect(evalModel.verdict).toBe('insufficient_input');
    expect(evalModel.insufficientInputReasons?.length).toBeGreaterThan(0);
    expect(evalModel.insufficientInputReasons?.join(' ')).toContain(HDS_MODEL_LEAF);

    // Cas B : feuille IPsec de production sans fragment concret (Hub propre), uniquement `oracle_rules` + `projections`
    const ipsecEntity = base.entities[IPSEC_LEAF];
    const cleanHubCatalog: OntologyCatalog = {
      ...base,
      entities: {
        ...base.entities,
        [IPSEC_LEAF]: {
          ...ipsecEntity,
          hydration_template: {
            crypto_profile: 'IKEv2-AES256-GCM-DH20',
            reconciliation_model: {
              required_classes: ['partner_organizations', 'ipsec_tunnels', 'service_mediation_flows'],
              require_pivot: true
            }
          }
        }
      }
    };
    const ipsecBindings = [{ urn: IPSEC_LEAF, revision: 1 }];
    const emptyIpsecInv = composeMultiAxisHydration('sub_wan_sans_instance', ipsecBindings, cleanHubCatalog);
    expect(isReconciliationGraphEmpty(emptyIpsecInv.reconciliation_graph)).toBe(true);

    const evalIpsec = await evaluateMultiAxisOracle(emptyIpsecInv, ipsecBindings, cleanHubCatalog);
    expect(evalIpsec.verdict).toBe('insufficient_input');
    expect(evalIpsec.insufficientInputReasons?.length).toBeGreaterThan(0);
  });

  it('2. Test d’équivalence : modèle (feuille) × instances (projet) produit exactement le même graphe qu’un fragment de feuille équivalent', async () => {
    const base = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const catalog = catalogWithHdsLeaves(base);
    const instances = makeHdsInstances();

    const invFromProject = composeMultiAxisHydration(
      'sub_chu_projet',
      [{ urn: HDS_MODEL_LEAF, revision: 1 }],
      catalog,
      { reconciliationInstances: instances }
    );
    const invFromLegacyLeaf = composeMultiAxisHydration(
      'sub_chu_legacy',
      [{ urn: HDS_LEGACY_LEAF, revision: 1 }],
      catalog
    );

    expect(stripGraphContent(invFromProject.reconciliation_graph)).toEqual(
      stripGraphContent(invFromLegacyLeaf.reconciliation_graph)
    );
    expect(invFromProject.reconciliation_graph.sources).toEqual([HDS_MODEL_LEAF, 'project:chu-imagerie-hds']);
    expect(invFromLegacyLeaf.reconciliation_graph.sources).toEqual([HDS_LEGACY_LEAF]);

    // Vérifier aussi l'équivalence sur le verdict OPA
    const evalProject = await evaluateMultiAxisOracle(
      invFromProject,
      [{ urn: HDS_MODEL_LEAF, revision: 1 }],
      catalog
    );
    const evalLegacy = await evaluateMultiAxisOracle(
      invFromLegacyLeaf,
      [{ urn: HDS_LEGACY_LEAF, revision: 1 }],
      catalog
    );
    expect(evalProject.verdict).toBe('compliant');
    expect(evalLegacy.verdict).toBe('compliant');
    expect(evalProject.violations).toEqual(evalLegacy.violations);
  });

  it('3. Validation d’intégrité : rejette doublons, pivot absent/introuvable et références non résolues avec des messages précis', async () => {
    const base = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const catalog = catalogWithHdsLeaves(base);

    // 3a. Instance valide → aucune erreur
    const validRes = validateReconciliationInstances(makeHdsInstances(), HDS_MODEL);
    expect(validRes.valid).toBe(true);
    expect(validRes.issues).toEqual([]);

    // 3b. Doublon d'identifiant dans une classe
    const dupInst = makeHdsInstances();
    dupInst.partner_organizations!.push({ id: 'org-labo-radiologie-nord', name: 'Doublon' });
    const dupRes = validateReconciliationInstances(dupInst, HDS_MODEL);
    expect(dupRes.valid).toBe(false);
    expect(dupRes.issues.some((i) => i.code === 'duplicate_id' && i.message.includes('org-labo-radiologie-nord'))).toBe(true);

    // 3c. Doublon d'identifiant entre nœuds externes et internes
    const crossDup = makeHdsInstances();
    crossDup.internal_mediation_nodes!.push({ id: 'ext-pacs-labo-01', role: 'Collision' });
    const crossDupRes = validateReconciliationInstances(crossDup, HDS_MODEL);
    expect(crossDupRes.valid).toBe(false);
    expect(crossDupRes.issues.some((i) => i.code === 'duplicate_id' && i.message.includes('ext-pacs-labo-01'))).toBe(true);

    // 3d. Pivot absent
    const noPivot = makeHdsInstances();
    noPivot.pivot_tenant_id = '';
    const noPivotRes = validateReconciliationInstances(noPivot, HDS_MODEL);
    expect(noPivotRes.valid).toBe(false);
    expect(noPivotRes.issues.some((i) => i.code === 'missing_pivot')).toBe(true);

    // 3e. Pivot non résolu dans partner_organizations
    const badPivot = makeHdsInstances();
    badPivot.pivot_tenant_id = 'org-inexistant';
    const badPivotRes = validateReconciliationInstances(badPivot, HDS_MODEL);
    expect(badPivotRes.valid).toBe(false);
    expect(badPivotRes.issues.some((i) => i.code === 'unresolved_pivot' && i.message.includes('org-inexistant'))).toBe(true);

    // 3f. Références non résolues (tenant_ref, endpoint_z, underlay_link_ref, mandatory_mediation_hops, covered_flow_ref)
    const brokenRefs = makeHdsInstances();
    brokenRefs.external_shadow_nodes![0].tenant_ref = 'org-fantome';
    brokenRefs.ip_underlay_links![0].endpoint_z = 'node-inconnu';
    brokenRefs.ipsec_tunnels![0].underlay_link_ref = 'link-inconnu';
    brokenRefs.service_mediation_flows![0].mandatory_mediation_hops = ['gw-hds-dmz-01', 'hop-inexistant'];
    brokenRefs.sla_and_monitoring_contracts![0].covered_flow_ref = 'flow-inexistant';

    const brokenRes = validateReconciliationInstances(brokenRefs, HDS_MODEL);
    expect(brokenRes.valid).toBe(false);
    const msgs = brokenRes.issues.map((i) => i.message).join('\n');
    expect(msgs).toContain('org-fantome');
    expect(msgs).toContain('node-inconnu');
    expect(msgs).toContain('link-inconnu');
    expect(msgs).toContain('hop-inexistant');
    expect(msgs).toContain('flow-inexistant');

    // 3g. Classe requise par le modèle absente
    const missingClass = makeHdsInstances();
    missingClass.sla_and_monitoring_contracts = [];
    const missingClassRes = validateReconciliationInstances(missingClass, HDS_MODEL);
    expect(missingClassRes.valid).toBe(false);
    expect(
      missingClassRes.issues.some(
        (i) => i.code === 'missing_required_class' && i.objectClass === 'sla_and_monitoring_contracts'
      )
    ).toBe(true);

    // 3h. Rejet effectif par ReconciliationIntegrityError lors de composeMultiAxisHydration / composeReconciliationGraph
    expect(() =>
      composeMultiAxisHydration('sub_chu_ko', [{ urn: HDS_MODEL_LEAF, revision: 1 }], catalog, {
        reconciliationInstances: brokenRefs
      })
    ).toThrow(ReconciliationIntegrityError);

    expect(() =>
      composeReconciliationGraph([{ urn: HDS_MODEL_LEAF, revision: 1 }], catalog, {
        instances: badPivot
      })
    ).toThrow(/org-inexistant/);
  });

  it('4. Contrat JSON Schema + pureté d’intention : le modèle HDS (hors télécom) ne contient aucun identifiant concret et valide le schéma', () => {
    const schemaPath = resolve(process.cwd(), 'src/lib/schemas/reconciliation-graph.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    const payload = {
      reconciliation_model: HDS_MODEL,
      reconciliation_instances: makeHdsInstances()
    };
    const ok = validate(payload);
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);

    // Pureté d'intention du modèle (aucune IP, CIDR, MAC ni hostname concret dans le modèle de feuille)
    const purity = checkIntentionPurity({ decision: JSON.stringify(HDS_MODEL) });
    expect(purity.pure).toBe(true);
    expect(purity.violations).toEqual([]);

    // Vérifier que les 7 classes canoniques sont bien couvertes par le schéma
    expect(schema.definitions.classKey.enum).toEqual([...RECONCILIATION_ARRAY_KEYS]);
  });
});
