/**
 * Graphe de réconciliation multi-objets, composé à partir des feuilles d'ontologie liées au sujet.
 *
 * Principe (AGENTS.md §1) : le moteur ne connaît AUCUN scénario de projet. Les objets (organisations partenaires,
 * nœuds, liens, tunnels, flux, contrats) sont portés par la donnée : une feuille d'ontologie qui en a besoin les déclare
 * dans `hydration_template.reconciliation_graph`. Sans fragment déclaré par une feuille liée, le graphe est VIDE
 * (et rien n'est poussé vers Nautobot pour ces classes d'objets).
 *
 * ⚠️ Hors-cas : un graphe vide ne prouve aucune conformité. Les règles Rego qui itèrent sur ces tableaux sont alors
 * sans objet (aucune violation, aucune vérification). `sources` liste les feuilles qui ont fourni un fragment, pour que
 * l'appelant distingue « conforme » de « rien à vérifier » (voir #380 : provenance du verdict).
 */
import type { OntologyBindingItem, OntologyCatalog } from './ontologyClient';

export interface ReconciliationObjectGraph {
  /** Tenant pivot du graphe ; chaîne vide si aucune feuille liée n'en déclare. */
  pivot_tenant_id: string;
  standards_applied: string[];
  partner_organizations: Array<Record<string, unknown>>;
  external_shadow_nodes: Array<Record<string, unknown>>;
  internal_mediation_nodes: Array<Record<string, unknown>>;
  ip_underlay_links: Array<Record<string, unknown>>;
  ipsec_tunnels: Array<Record<string, unknown>>;
  service_mediation_flows: Array<Record<string, unknown>>;
  sla_and_monitoring_contracts: Array<Record<string, unknown>>;
  /** URN des feuilles d'ontologie qui ont fourni un fragment de graphe (vide = aucune donnée à vérifier). */
  sources?: string[];
}

/** Surcharges de simulation de dérive. Les noms sont historiques ; le comportement est générique. */
export interface ReconciliationOverrides {
  /** Simule le contournement du dernier bond de médiation obligatoire de chaque flux. */
  s6aDirectBypassDea?: boolean;
  /** Simule la disparition de l'organisation partenaire et de ses contrats associés. */
  orphanPartnerTenant?: boolean;
}

const ARRAY_KEYS = [
  'partner_organizations',
  'external_shadow_nodes',
  'internal_mediation_nodes',
  'ip_underlay_links',
  'ipsec_tunnels',
  'service_mediation_flows',
  'sla_and_monitoring_contracts'
] as const;

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
  return ARRAY_KEYS.every((k) => !Array.isArray(graph[k]) || graph[k].length === 0);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Compose le graphe en fusionnant les fragments déclarés par les feuilles liées (ordre des liaisons ;
 * à `id` égal, le premier fragment l'emporte), puis applique les surcharges de simulation.
 */
export function composeReconciliationGraph(
  bindings: ReadonlyArray<OntologyBindingItem>,
  catalog: OntologyCatalog,
  overrides: ReconciliationOverrides = {}
): ReconciliationObjectGraph {
  const graph = emptyReconciliationGraph();
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
    for (const key of ARRAY_KEYS) {
      for (const obj of fragment[key] || []) {
        const id = String((obj as Record<string, unknown>).id ?? '');
        const dedupKey = id ? `${key}:${id}` : '';
        if (dedupKey && seen.has(dedupKey)) continue;
        if (dedupKey) seen.add(dedupKey);
        graph[key].push(clone(obj));
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
