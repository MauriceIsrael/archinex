/**
 * Graphe de réconciliation multi-objets : le Hub (feuille d'ontologie) porte le MODÈLE,
 * le projet (LLD projet / Nautobot) porte les INSTANCES.
 *
 * Principe (AGENTS.md §1, issues #388, #413, #414) :
 * - Le moteur ne connaît AUCUN scénario de projet.
 * - Une feuille d'ontologie déclare le **modèle** dans `hydration_template.reconciliation_model`
 *   (classes d'objets attendues, relations exigées, standards normatifs) et ses règles dans `projections` / `oracle_rules`,
 *   sans jamais embarquer d'identifiants concrets de projet (pureté d'intention).
 * - Le projet fournit les **instances** concrètes via `overrides.instances` (LLD projet ou pull Nautobot).
 * - Composition : `modèle (feuille) × instances (projet) → ReconciliationObjectGraph`, avec validation
 *   d'intégrité stricte (identifiants uniques, références résolues, pivot existant).
 * - Compatibilité : le fragment historique `hydration_template.reconciliation_graph` reste accepté
 *   pour les fixtures de test lorsque aucune instance projet n'est fournie.
 * - Garde anti-vacuité : si une feuille liée déclare un `reconciliation_model` ou des `oracle_rules`
 *   exigeant le graphe et qu'aucune instance n'est fournie, l'oracle retourne `insufficient_input`
 *   (jamais « conforme » par vacuité).
 */
import type { OntologyBindingItem, OntologyCatalog } from './ontologyClient';

export const RECONCILIATION_ARRAY_KEYS = [
  'partner_organizations',
  'external_shadow_nodes',
  'internal_mediation_nodes',
  'ip_underlay_links',
  'ipsec_tunnels',
  'service_mediation_flows',
  'sla_and_monitoring_contracts'
] as const;

export type ReconciliationClassKey = (typeof RECONCILIATION_ARRAY_KEYS)[number];

/** Règle de relation référentielle exigée ou vérifiée entre deux classes du graphe. */
export interface ReconciliationRelationRule {
  /** Classe source portant le champ de référence. */
  from_class: ReconciliationClassKey;
  /** Nom du champ (identifiant unique ou tableau d'identifiants). */
  field: string;
  /** Classes cibles dans lesquelles chaque identifiant référencé doit exister. */
  target_classes: ReconciliationClassKey[];
  /** Si true, le champ doit être présent et non vide sur chaque instance de `from_class`. */
  required?: boolean;
  /** Si true, le champ est un tableau d'identifiants (ex. `mandatory_mediation_hops`). */
  is_array?: boolean;
}

/**
 * Modèle déclaratif porté par une feuille d'ontologie (`hydration_template.reconciliation_model`).
 * Ne contient aucun identifiant concret d'organisation, de nœud, de sous-réseau ou de VLAN.
 */
export interface ReconciliationGraphModel {
  /** Classes d'objets attendues (doivent contenir au moins une instance côté projet). */
  required_classes?: ReconciliationClassKey[];
  /** Indique si `pivot_tenant_id` est obligatoire (défaut : true dès qu'il existe des objets ou un modèle). */
  require_pivot?: boolean;
  /** Standards normatifs portés par la doctrine de la feuille. */
  standards_applied?: string[];
  /** Relations référentielles supplémentaires ou renforcées (ex. champs obligatoires) exigées par la feuille. */
  required_relations?: ReconciliationRelationRule[];
}

/** Instances concrètes fournies par le projet (LLD projet / surcharges EDP / Nautobot). */
export interface ReconciliationInstancesInput {
  /** Identifiant de provenance côté projet (ex. `project:proj-123` ou `nautobot:proj-123`). */
  source?: string;
  pivot_tenant_id?: string;
  standards_applied?: string[];
  partner_organizations?: Array<Record<string, unknown>>;
  external_shadow_nodes?: Array<Record<string, unknown>>;
  internal_mediation_nodes?: Array<Record<string, unknown>>;
  ip_underlay_links?: Array<Record<string, unknown>>;
  ipsec_tunnels?: Array<Record<string, unknown>>;
  service_mediation_flows?: Array<Record<string, unknown>>;
  sla_and_monitoring_contracts?: Array<Record<string, unknown>>;
}

export interface ReconciliationObjectGraph {
  /** Tenant pivot du graphe ; chaîne vide si aucune donnée n'est fournie. */
  pivot_tenant_id: string;
  standards_applied: string[];
  partner_organizations: Array<Record<string, unknown>>;
  external_shadow_nodes: Array<Record<string, unknown>>;
  internal_mediation_nodes: Array<Record<string, unknown>>;
  ip_underlay_links: Array<Record<string, unknown>>;
  ipsec_tunnels: Array<Record<string, unknown>>;
  service_mediation_flows: Array<Record<string, unknown>>;
  sla_and_monitoring_contracts: Array<Record<string, unknown>>;
  /** Provenance des fragments / modèles / instances ayant produit ce graphe (vide = aucune donnée à vérifier). */
  sources?: string[];
}

/** Surcharges de simulation de dérive et source projet d'instances. */
export interface ReconciliationOverrides {
  /** Simule le contournement du dernier bond de médiation obligatoire de chaque flux. */
  s6aDirectBypassDea?: boolean;
  /** Simule la disparition de l'organisation partenaire et de ses contrats associés. */
  orphanPartnerTenant?: boolean;
  /** Instances concrètes fournies par le projet pour hydrater le modèle des feuilles liées. */
  instances?: ReconciliationInstancesInput;
}

export type ReconciliationValidationIssueCode =
  | 'missing_id'
  | 'duplicate_id'
  | 'missing_pivot'
  | 'unresolved_pivot'
  | 'missing_required_class'
  | 'missing_required_ref'
  | 'unresolved_ref';

export interface ReconciliationValidationIssue {
  code: ReconciliationValidationIssueCode;
  objectClass?: ReconciliationClassKey | 'pivot_tenant_id';
  objectId?: string;
  field?: string;
  targetRef?: string;
  message: string;
}

export interface ReconciliationValidationResult {
  valid: boolean;
  issues: ReconciliationValidationIssue[];
}

export class ReconciliationIntegrityError extends Error {
  readonly issues: ReconciliationValidationIssue[];

  constructor(issues: ReconciliationValidationIssue[]) {
    super(
      `Intégrité du graphe de réconciliation invalide (${issues.length} erreur(s)) : ` +
        issues.map((i) => i.message).join(' ; ')
    );
    this.name = 'ReconciliationIntegrityError';
    this.issues = issues;
  }
}

/**
 * Règles Rego de `multi_axis_refinement.rego` qui itèrent sur `input.reconciliation_graph`
 * et produiraient un faux positif « conforme » par vacuité si le graphe est vide.
 */
export const RECONCILIATION_GRAPH_ORACLE_RULES: ReadonlySet<string> = new Set([
  'data.archinex.edp.multiaxis.deny_weak_wan_cipher',
  'data.archinex.edp.multiaxis.deny_unmediated_s6a_direct_flow',
  'data.archinex.edp.multiaxis.deny_unreconciled_partner_objects'
]);

export interface ReconciliationRequirementMatch {
  urn: string;
  reasons: Array<'reconciliation_model' | 'oracle_rules'>;
  rules: string[];
  requiredClasses: ReconciliationClassKey[];
}

const VALID_CLASS_SET: ReadonlySet<string> = new Set(RECONCILIATION_ARRAY_KEYS);

const BUILTIN_RELATION_RULES: ReadonlyArray<ReconciliationRelationRule> = [
  { from_class: 'external_shadow_nodes', field: 'tenant_ref', target_classes: ['partner_organizations'] },
  { from_class: 'internal_mediation_nodes', field: 'tenant_ref', target_classes: ['partner_organizations'] },
  { from_class: 'internal_mediation_nodes', field: 'peer_shadow_ref', target_classes: ['external_shadow_nodes'] },
  { from_class: 'internal_mediation_nodes', field: 'upstream_secgw_ref', target_classes: ['internal_mediation_nodes'] },
  { from_class: 'internal_mediation_nodes', field: 'allowed_upstream_ref', target_classes: ['internal_mediation_nodes'] },
  { from_class: 'ip_underlay_links', field: 'tenant_ref', target_classes: ['partner_organizations'] },
  {
    from_class: 'ip_underlay_links',
    field: 'endpoint_a',
    target_classes: ['external_shadow_nodes', 'internal_mediation_nodes']
  },
  {
    from_class: 'ip_underlay_links',
    field: 'endpoint_z',
    target_classes: ['external_shadow_nodes', 'internal_mediation_nodes']
  },
  { from_class: 'ipsec_tunnels', field: 'tenant_ref', target_classes: ['partner_organizations'] },
  { from_class: 'ipsec_tunnels', field: 'underlay_link_ref', target_classes: ['ip_underlay_links'] },
  {
    from_class: 'ipsec_tunnels',
    field: 'termination_a',
    target_classes: ['external_shadow_nodes', 'internal_mediation_nodes']
  },
  {
    from_class: 'ipsec_tunnels',
    field: 'termination_z',
    target_classes: ['external_shadow_nodes', 'internal_mediation_nodes']
  },
  { from_class: 'service_mediation_flows', field: 'tenant_ref', target_classes: ['partner_organizations'] },
  {
    from_class: 'service_mediation_flows',
    field: 'source_shadow_ref',
    target_classes: ['external_shadow_nodes', 'internal_mediation_nodes']
  },
  {
    from_class: 'service_mediation_flows',
    field: 'destination_core_ref',
    target_classes: ['internal_mediation_nodes', 'external_shadow_nodes']
  },
  { from_class: 'service_mediation_flows', field: 'ipsec_tunnel_ref', target_classes: ['ipsec_tunnels'] },
  {
    from_class: 'service_mediation_flows',
    field: 'mandatory_mediation_hops',
    target_classes: ['internal_mediation_nodes'],
    is_array: true
  },
  { from_class: 'sla_and_monitoring_contracts', field: 'tenant_ref', target_classes: ['partner_organizations'] },
  { from_class: 'sla_and_monitoring_contracts', field: 'covered_flow_ref', target_classes: ['service_mediation_flows'] },
  { from_class: 'sla_and_monitoring_contracts', field: 'covered_tunnel_ref', target_classes: ['ipsec_tunnels'] },
  {
    from_class: 'sla_and_monitoring_contracts',
    field: 'monitored_targets',
    target_classes: [
      'partner_organizations',
      'external_shadow_nodes',
      'internal_mediation_nodes',
      'ip_underlay_links',
      'ipsec_tunnels',
      'service_mediation_flows'
    ],
    is_array: true
  }
];

export function emptyReconciliationGraph(): ReconciliationObjectGraph {
  return {
    pivot_tenant_id: '',
    standards_applied: [],
    partner_organizations: [],
    external_shadow_nodes: [],
    internal_mediation_nodes: [],
    ip_underlay_links: [],
    ipsec_tunnels: [],
    service_mediation_flows: [],
    sla_and_monitoring_contracts: [],
    sources: []
  };
}

/** Vrai si le graphe ne porte aucun objet à synchroniser ou à vérifier. */
export function isReconciliationGraphEmpty(graph: ReconciliationObjectGraph | undefined | null): boolean {
  if (!graph) return true;
  return RECONCILIATION_ARRAY_KEYS.every((k) => !Array.isArray(graph[k]) || graph[k].length === 0);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Fusionne les modèles de réconciliation (`hydration_template.reconciliation_model`)
 * déclarés par les feuilles d'ontologie liées.
 */
export function extractReconciliationModel(
  bindings: ReadonlyArray<OntologyBindingItem>,
  catalog: OntologyCatalog
): { model: ReconciliationGraphModel | null; modelSources: string[] } {
  const requiredClasses: ReconciliationClassKey[] = [];
  const standardsApplied: string[] = [];
  const requiredRelations: ReconciliationRelationRule[] = [];
  const modelSources: string[] = [];
  let requirePivot: boolean | undefined;

  for (const b of bindings) {
    const entity = catalog.entities[b.urn];
    const tpl = (entity?.hydration_template || {}) as Record<string, unknown>;
    const rawModel = tpl.reconciliation_model as ReconciliationGraphModel | undefined;
    if (!rawModel || typeof rawModel !== 'object') continue;

    if (!modelSources.includes(b.urn)) modelSources.push(b.urn);

    if (typeof rawModel.require_pivot === 'boolean') {
      requirePivot = requirePivot === true || rawModel.require_pivot;
    }
    for (const cls of rawModel.required_classes || []) {
      if (VALID_CLASS_SET.has(cls) && !requiredClasses.includes(cls)) {
        requiredClasses.push(cls);
      }
    }
    for (const std of rawModel.standards_applied || []) {
      if (typeof std === 'string' && std.trim() && !standardsApplied.includes(std)) {
        standardsApplied.push(std);
      }
    }
    for (const rel of rawModel.required_relations || []) {
      if (rel && VALID_CLASS_SET.has(rel.from_class) && typeof rel.field === 'string' && rel.field.trim()) {
        requiredRelations.push(clone(rel));
      }
    }
  }

  if (modelSources.length === 0) {
    return { model: null, modelSources: [] };
  }

  return {
    model: {
      required_classes: requiredClasses,
      ...(requirePivot !== undefined ? { require_pivot: requirePivot } : {}),
      standards_applied: standardsApplied,
      required_relations: requiredRelations
    },
    modelSources
  };
}

/**
 * Identifie les feuilles liées qui exigent un graphe de réconciliation
 * (soit par déclaration d'un `reconciliation_model`, soit via des `oracle_rules` qui inspectent le graphe).
 */
export function findLeavesRequiringReconciliationGraph(
  bindings: ReadonlyArray<OntologyBindingItem>,
  catalog: OntologyCatalog
): ReconciliationRequirementMatch[] {
  const matches: ReconciliationRequirementMatch[] = [];
  const seen = new Set<string>();

  for (const b of bindings) {
    if (seen.has(b.urn)) continue;
    const entity = catalog.entities[b.urn];
    if (!entity) continue;

    const tpl = (entity.hydration_template || {}) as Record<string, unknown>;
    const rawModel = tpl.reconciliation_model as ReconciliationGraphModel | undefined;
    const hasModel = Boolean(rawModel && typeof rawModel === 'object');

    const matchingRules = (entity.oracle_rules || []).filter((r) => RECONCILIATION_GRAPH_ORACLE_RULES.has(r));
    const hasRules = matchingRules.length > 0;

    if (!hasModel && !hasRules) continue;
    seen.add(b.urn);

    const reasons: Array<'reconciliation_model' | 'oracle_rules'> = [];
    if (hasModel) reasons.push('reconciliation_model');
    if (hasRules) reasons.push('oracle_rules');

    const requiredClasses = (rawModel?.required_classes || []).filter((c): c is ReconciliationClassKey =>
      VALID_CLASS_SET.has(c)
    );

    matches.push({
      urn: b.urn,
      reasons,
      rules: matchingRules,
      requiredClasses
    });
  }

  return matches;
}

/**
 * Valide l'intégrité structurelle et référentielle des instances projet par rapport au modèle :
 * - identifiants `id` non vides et uniques (par classe et entre classes de nœuds) ;
 * - classes requises par le modèle présentes ;
 * - `pivot_tenant_id` présent (si requis) et résolu dans `partner_organizations` ;
 * - toutes les références résolues (`tenant_ref`, extrémités des liens, tunnels, bonds de médiation, contrats SLA, etc.).
 */
export function validateReconciliationInstances(
  instances: ReconciliationInstancesInput,
  model?: ReconciliationGraphModel | null
): ReconciliationValidationResult {
  const issues: ReconciliationValidationIssue[] = [];
  const idsByClass = {} as Record<ReconciliationClassKey, Set<string>>;

  for (const key of RECONCILIATION_ARRAY_KEYS) {
    idsByClass[key] = new Set<string>();
    const items = Array.isArray(instances[key]) ? instances[key]! : [];
    items.forEach((obj, idx) => {
      const rawId = obj && typeof obj === 'object' ? (obj as Record<string, unknown>).id : undefined;
      const id = typeof rawId === 'string' ? rawId.trim() : '';
      if (!id) {
        issues.push({
          code: 'missing_id',
          objectClass: key,
          field: 'id',
          message: `Instance sans identifiant 'id' non vide dans '${key}[${idx}]'.`
        });
        return;
      }
      if (idsByClass[key].has(id)) {
        issues.push({
          code: 'duplicate_id',
          objectClass: key,
          objectId: id,
          field: 'id',
          message: `Identifiant dupliqué '${id}' dans la classe '${key}'.`
        });
        return;
      }
      idsByClass[key].add(id);
    });
  }

  // Unicité des identifiants entre nœuds externes et nœuds de médiation internes
  for (const id of idsByClass.external_shadow_nodes) {
    if (idsByClass.internal_mediation_nodes.has(id)) {
      issues.push({
        code: 'duplicate_id',
        objectClass: 'internal_mediation_nodes',
        objectId: id,
        field: 'id',
        message: `Identifiant de nœud '${id}' dupliqué entre 'external_shadow_nodes' et 'internal_mediation_nodes'.`
      });
    }
  }

  // Classes requises par le modèle
  for (const reqClass of model?.required_classes || []) {
    if (!VALID_CLASS_SET.has(reqClass)) continue;
    const items = Array.isArray(instances[reqClass]) ? instances[reqClass]! : [];
    if (items.length === 0) {
      issues.push({
        code: 'missing_required_class',
        objectClass: reqClass,
        message: `Classe d'objets requise par le modèle absente ou vide : '${reqClass}'.`
      });
    }
  }

  // Pivot tenant
  const pivot = typeof instances.pivot_tenant_id === 'string' ? instances.pivot_tenant_id.trim() : '';
  const hasAnyObject = RECONCILIATION_ARRAY_KEYS.some(
    (k) => Array.isArray(instances[k]) && instances[k]!.length > 0
  );
  const requirePivot = model?.require_pivot ?? (hasAnyObject || Boolean(model));
  if (requirePivot && !pivot) {
    issues.push({
      code: 'missing_pivot',
      objectClass: 'pivot_tenant_id',
      field: 'pivot_tenant_id',
      message: `Tenant pivot 'pivot_tenant_id' absent alors que le modèle ou les instances l'exigent.`
    });
  } else if (pivot && !idsByClass.partner_organizations.has(pivot)) {
    issues.push({
      code: 'unresolved_pivot',
      objectClass: 'pivot_tenant_id',
      field: 'pivot_tenant_id',
      targetRef: pivot,
      message: `Tenant pivot '${pivot}' introuvable dans 'partner_organizations'.`
    });
  }

  // Fusion des règles référentielles natives + règles déclarées par le modèle
  const mergedRules = new Map<string, ReconciliationRelationRule>();
  for (const rule of BUILTIN_RELATION_RULES) {
    mergedRules.set(`${rule.from_class}:${rule.field}`, rule);
  }
  for (const rule of model?.required_relations || []) {
    const k = `${rule.from_class}:${rule.field}`;
    const existing = mergedRules.get(k);
    mergedRules.set(k, {
      from_class: rule.from_class,
      field: rule.field,
      target_classes: rule.target_classes.length > 0 ? rule.target_classes : existing?.target_classes || [],
      required: rule.required ?? existing?.required,
      is_array: rule.is_array ?? existing?.is_array
    });
  }

  for (const rule of mergedRules.values()) {
    const items = Array.isArray(instances[rule.from_class]) ? instances[rule.from_class]! : [];
    for (const obj of items) {
      const objId = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : '?';
      const raw = obj[rule.field];

      if (rule.is_array) {
        if (raw === undefined || raw === null) {
          if (rule.required) {
            issues.push({
              code: 'missing_required_ref',
              objectClass: rule.from_class,
              objectId: objId,
              field: rule.field,
              message: `Champ de références obligatoire '${rule.field}' absent sur ${rule.from_class}['${objId}'].`
            });
          }
          continue;
        }
        if (!Array.isArray(raw)) {
          issues.push({
            code: 'missing_required_ref',
            objectClass: rule.from_class,
            objectId: objId,
            field: rule.field,
            message: `Champ '${rule.field}' sur ${rule.from_class}['${objId}'] doit être un tableau d'identifiants.`
          });
          continue;
        }
        if (rule.required && raw.length === 0) {
          issues.push({
            code: 'missing_required_ref',
            objectClass: rule.from_class,
            objectId: objId,
            field: rule.field,
            message: `Champ de références obligatoire '${rule.field}' vide sur ${rule.from_class}['${objId}'].`
          });
          continue;
        }
        for (const item of raw) {
          const ref = typeof item === 'string' ? item.trim() : String(item ?? '').trim();
          const resolved = ref.length > 0 && rule.target_classes.some((tc) => idsByClass[tc].has(ref));
          if (!resolved) {
            issues.push({
              code: 'unresolved_ref',
              objectClass: rule.from_class,
              objectId: objId,
              field: rule.field,
              targetRef: ref,
              message: `Référence non résolue '${ref}' dans ${rule.from_class}['${objId}'].${rule.field} (attendu dans ${rule.target_classes.join(' | ')}).`
            });
          }
        }
      } else {
        const ref = typeof raw === 'string' ? raw.trim() : '';
        if (!ref) {
          if (rule.required) {
            issues.push({
              code: 'missing_required_ref',
              objectClass: rule.from_class,
              objectId: objId,
              field: rule.field,
              message: `Champ de référence obligatoire '${rule.field}' absent sur ${rule.from_class}['${objId}'].`
            });
          }
          continue;
        }
        const resolved = rule.target_classes.some((tc) => idsByClass[tc].has(ref));
        if (!resolved) {
          issues.push({
            code: 'unresolved_ref',
            objectClass: rule.from_class,
            objectId: objId,
            field: rule.field,
            targetRef: ref,
            message: `Référence non résolue '${ref}' dans ${rule.from_class}['${objId}'].${rule.field} (attendu dans ${rule.target_classes.join(' | ')}).`
          });
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Compose le graphe de réconciliation :
 * - Si `overrides.instances` est fourni (source projet), valide strictement les instances face au
 *   modèle déclaré par les feuilles liées (`hydration_template.reconciliation_model`) et compose
 *   `modèle × instances → ReconciliationObjectGraph` (rejette par `ReconciliationIntegrityError` si incohérent).
 * - Sinon, fusionne les fragments historiques `hydration_template.reconciliation_graph` des feuilles liées
 *   (compatibilité et fixtures de test ; ordre des liaisons, premier fragment gagnant à `id` égal).
 * - Applique ensuite les éventuelles surcharges de simulation de dérive.
 */
export function composeReconciliationGraph(
  bindings: ReadonlyArray<OntologyBindingItem>,
  catalog: OntologyCatalog,
  overrides: ReconciliationOverrides = {}
): ReconciliationObjectGraph {
  const graph = emptyReconciliationGraph();
  const { model, modelSources } = extractReconciliationModel(bindings, catalog);

  if (overrides.instances) {
    const validation = validateReconciliationInstances(overrides.instances, model);
    if (!validation.valid) {
      throw new ReconciliationIntegrityError(validation.issues);
    }

    const inst = overrides.instances;
    graph.pivot_tenant_id = typeof inst.pivot_tenant_id === 'string' ? inst.pivot_tenant_id.trim() : '';

    for (const std of model?.standards_applied || []) {
      if (!graph.standards_applied.includes(std)) graph.standards_applied.push(std);
    }
    for (const std of inst.standards_applied || []) {
      if (typeof std === 'string' && std.trim() && !graph.standards_applied.includes(std)) {
        graph.standards_applied.push(std);
      }
    }

    for (const key of RECONCILIATION_ARRAY_KEYS) {
      for (const obj of inst[key] || []) {
        graph[key].push(clone(obj));
      }
    }

    const projectSource = typeof inst.source === 'string' && inst.source.trim() ? inst.source.trim() : 'project:lld';
    graph.sources = Array.from(new Set([...modelSources, projectSource]));
  } else {
    const seen = new Set<string>();

    for (const b of bindings) {
      const entity = catalog.entities[b.urn];
      const tpl = (entity?.hydration_template || {}) as Record<string, unknown>;
      const fragment = tpl.reconciliation_graph as Partial<ReconciliationObjectGraph> | undefined;
      if (!fragment || typeof fragment !== 'object') continue;

      graph.sources!.push(b.urn);
      const pivot = fragment.pivot_tenant_id || (typeof tpl.partner_tenant_id === 'string' ? tpl.partner_tenant_id : '');
      if (!graph.pivot_tenant_id && pivot) graph.pivot_tenant_id = pivot;
      for (const std of fragment.standards_applied || []) {
        if (!graph.standards_applied.includes(std)) graph.standards_applied.push(std);
      }
      for (const key of RECONCILIATION_ARRAY_KEYS) {
        for (const obj of fragment[key] || []) {
          const id = String((obj as Record<string, unknown>).id ?? '');
          const dedupKey = id ? `${key}:${id}` : '';
          if (dedupKey && seen.has(dedupKey)) continue;
          if (dedupKey) seen.add(dedupKey);
          graph[key].push(clone(obj));
        }
      }
    }
  }

  if (overrides.orphanPartnerTenant) {
    graph.partner_organizations = [];
    graph.sla_and_monitoring_contracts = [];
  }
  if (overrides.s6aDirectBypassDea) {
    for (const flow of graph.service_mediation_flows) {
      const hops = Array.isArray(flow.mandatory_mediation_hops) ? (flow.mandatory_mediation_hops as unknown[]) : [];
      flow.mandatory_mediation_hops = hops.slice(0, -1);
      flow.direct_bypass_allowed = true;
    }
  }
  return graph;
}
