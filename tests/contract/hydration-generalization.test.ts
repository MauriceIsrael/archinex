import { describe, it, expect, beforeEach } from 'vitest';
import { loadOntologyCatalog, resetRuntimeOntologyOverlay, type OntologyCatalog } from '../../src/lib/server/edp/ontologyClient.js';
import { composeMultiAxisHydration } from '../../src/lib/server/edp/refinementCoverage.js';
import {
  composeReconciliationGraph,
  emptyReconciliationGraph,
  isReconciliationGraphEmpty
} from '../../src/lib/server/edp/reconciliationGraph.js';
import { exportSylvaWorkloadClusterGitops } from '../../src/lib/server/edp/sylvaGitopsExport.js';
import { syncHydratedInventoryToNautobot, vpnObjectLogicalNames } from '../../src/lib/server/edp/nautobotSync.js';

/**
 * Généralisation (AGENTS.md §1, issues #388 / #389) : le moteur ne connaît aucun scénario de projet.
 * Deux scénarios sans rapport (A = fixture d'ontologie existante, B = feuille synthétique d'un autre domaine)
 * doivent produire des objets issus UNIQUEMENT de leur propre donnée, et un sujet sans fragment de graphe
 * ne doit rien pousser vers Nautobot pour ces classes d'objets.
 */

const SCENARIO_A_LEAF = 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256';
const SCENARIO_B_LEAF = 'urn:test:scenario-b:edge-cdn-interco';
const SCENARIO_A_MARKERS = /lot[ _-]?[0-9]|lulu|org-lot|secgw|hss-|dea-|s6a/i;

function scenarioBCatalog(base: OntologyCatalog): OntologyCatalog {
  return {
    ...base,
    entities: {
      ...base.entities,
      [SCENARIO_B_LEAF]: {
        urn: SCENARIO_B_LEAF,
        revision: 1,
        kind: 'leaf',
        title: 'Interconnexion CDN en périphérie (scénario synthétique B)',
        domain: 'network',
        hydration_template: {
          reconciliation_graph: {
            pivot_tenant_id: 'org-acme-edge',
            standards_applied: ['Standard synthétique B'],
            partner_organizations: [
              { id: 'org-acme-edge', name: 'Acme Edge Networks', noc_contact: 'noc@acme-edge.test' }
            ],
            external_shadow_nodes: [{ id: 'ext-origin-01', tenant_ref: 'org-acme-edge', zone: 'ZONE-ORIGIN' }],
            internal_mediation_nodes: [
              { id: 'edge-gw-01', role: 'Passerelle de bordure', zone: 'ZONE-EDGE', tenant_ref: 'org-acme-edge' },
              { id: 'cache-core-01', role: 'Cache de cœur', zone: 'ZONE-CORE' }
            ],
            ip_underlay_links: [
              {
                id: 'link-cdn-01',
                tenant_ref: 'org-acme-edge',
                endpoint_a: 'ext-origin-01',
                endpoint_z: 'edge-gw-01',
                subnet: '198.51.100.0/30',
                vlan_id: 2101
              }
            ],
            ipsec_tunnels: [
              {
                id: 'tun-wg-edge-01',
                tenant_ref: 'org-acme-edge',
                underlay_link_ref: 'link-cdn-01',
                termination_a: 'ext-origin-01',
                termination_z: 'edge-gw-01',
                cipher_suite: 'CHACHA20-POLY1305',
                pfs_dh_group: 'X25519'
              }
            ],
            service_mediation_flows: [
              {
                id: 'flow-cdn-origin-to-cache',
                tenant_ref: 'org-acme-edge',
                mandatory_mediation_hops: ['edge-gw-01', 'cache-core-01'],
                destination_core_ref: 'cache-core-01'
              }
            ],
            sla_and_monitoring_contracts: []
          }
        }
      } as never
    }
  };
}

/** Faux Nautobot : enregistre chaque appel (méthode, chemin, corps). */
function recordingNautobot() {
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname + url.search, method, body });
    if (url.pathname === '/api/status/') return new Response(JSON.stringify({ 'nautobot-version': '2.2.4' }), { status: 200 });
    if (url.pathname === '/api/extras/statuses/')
      return new Response(JSON.stringify({ results: [{ id: 'st-planned', name: 'Planned' }, { id: 'st-active', name: 'Active' }] }), { status: 200 });
    if (url.pathname === '/api/dcim/locations/')
      return new Response(JSON.stringify({ results: [{ id: 'loc-1', name: 'site-1', location_type: { id: 'lt-1' } }] }), { status: 200 });
    if (url.pathname === '/api/ipam/namespaces/') return new Response(JSON.stringify({ results: [{ id: 'ns-1' }] }), { status: 200 });
    if (method === 'GET') return new Response(JSON.stringify({ results: [] }), { status: 200 });
    return new Response(JSON.stringify({ id: `uuid-${url.pathname.replace(/\W+/g, '-')}`, ...((body as object) || {}) }), {
      status: method === 'POST' ? 201 : 200
    });
  };
  return { calls, fetchImpl };
}

describe('Généralisation de l’hydratation : aucun scénario codé en dur (#388, #389)', () => {
  beforeEach(() => resetRuntimeOntologyOverlay());

  it('un sujet sans feuille déclarant un graphe obtient un graphe VIDE (aucun objet, aucun pivot, aucune source)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const inv = composeMultiAxisHydration(
      'sub_sans_interco',
      [{ urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 }],
      catalog
    );
    expect(isReconciliationGraphEmpty(inv.reconciliation_graph)).toBe(true);
    expect(inv.reconciliation_graph.pivot_tenant_id).toBe('');
    expect(inv.reconciliation_graph.sources).toEqual([]);
    expect(JSON.stringify(inv.reconciliation_graph)).not.toMatch(SCENARIO_A_MARKERS);
  });

  it('un sujet sans graphe ne pousse vers Nautobot ni fournisseur, ni circuit, ni tunnel, ni nœud de médiation', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const inv = composeMultiAxisHydration(
      'sub_sans_interco',
      [{ urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 }],
      catalog
    );
    const { calls, fetchImpl } = recordingNautobot();
    const summary = await syncHydratedInventoryToNautobot(inv, { baseUrl: 'http://localhost:8080', token: 't', fetchImpl });

    expect(summary.circuitsSynced).toBe(0);
    expect(summary.vpnTunnelsSynced).toBe(0);
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes.some((c) => /\/circuits\/|\/vpn\//.test(c.path))).toBe(false);
    // Aucun nom d'objet écrit ne porte un identifiant du scénario A. (Les clauses `satisfied_clauses` d'un objet viennent,
    // elles, de la donnée de la feuille liée : ce n'est pas du couplage du code.)
    const writtenNames = writes.map((c) => String((c.body as any)?.name ?? (c.body as any)?.cid ?? '')).filter(Boolean);
    expect(writtenNames.join(' ')).not.toMatch(SCENARIO_A_MARKERS);
  });

  it('l’export GitOps n’émet aucun pivot de réconciliation quand le graphe est vide (plus de repli statique)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const bind = (urns: string[]) => urns.map((urn) => ({ urn, revision: 1 }));
    const exportOf = async (urns: string[]) =>
      exportSylvaWorkloadClusterGitops({
        edpId: 'EDP-X',
        subjectId: 'sub_x',
        revision: 1,
        ontologyFingerprint: 'sha256:test',
        opaVerdict: 'compliant',
        hydratedInventory: composeMultiAxisHydration('sub_x', bind(urns), catalog)
      });

    const sans = await exportOf(['urn:archinex:ontology:infrastructure:server:baremetal']);
    expect(sans.valuesYaml).not.toContain('reconciliation_pivot');
    expect(sans.valuesYaml).not.toMatch(/org-lot|tun-ipsec/i);

    const avec = await exportOf(['urn:archinex:ontology:infrastructure:server:baremetal', SCENARIO_A_LEAF]);
    expect(avec.valuesYaml).toContain('reconciliation_pivot');
    expect(avec.valuesYaml).toContain('org-lot3-mno'); // vient de la donnée de la feuille, pas du code
  });

  it('scénario B (domaine sans rapport) : tous les objets Nautobot viennent de SA donnée, rien du scénario A', async () => {
    const base = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const catalog = scenarioBCatalog(base);
    const inv = composeMultiAxisHydration('sub_cdn', [{ urn: SCENARIO_B_LEAF, revision: 1 }], catalog);

    expect(inv.reconciliation_graph.pivot_tenant_id).toBe('org-acme-edge');
    expect(inv.reconciliation_graph.sources).toEqual([SCENARIO_B_LEAF]);

    const { calls, fetchImpl } = recordingNautobot();
    const summary = await syncHydratedInventoryToNautobot(inv, { baseUrl: 'http://localhost:8080', token: 't', fetchImpl });
    expect(summary.errors).toEqual([]);
    expect(summary.circuitsSynced).toBe(1);
    expect(summary.vpnTunnelsSynced).toBe(1);

    const writes = calls.filter((c) => c.method !== 'GET');
    const names = writes.map((c) => (c.body as any)?.name ?? (c.body as any)?.cid).filter(Boolean);
    const v = vpnObjectLogicalNames('tun-wg-edge-01');
    expect(names).toEqual(expect.arrayContaining(['provider-org-acme-edge', 'link-cdn-01', 'tun-wg-edge-01', v.ikeProposal, v.ipsecProposal, v.profile]));

    // Fuite : aucun identifiant ni libellé du scénario A dans une seule requête d'écriture.
    expect(JSON.stringify(writes)).not.toMatch(SCENARIO_A_MARKERS);
    // Le tenant d'un nœud interne vient de sa propre donnée : le cœur (sans tenant_ref) n'en reçoit pas.
    const coreNode = writes.find((c) => (c.body as any)?.name === 'cache-core-01');
    expect(coreNode).toBeDefined();
    expect((coreNode!.body as any).tenant).toBeUndefined();
    const edgeNode = writes.find((c) => (c.body as any)?.name === 'edge-gw-01');
    expect((edgeNode!.body as any).tenant).toBeDefined();
  });

  it('composeReconciliationGraph : fusion sans doublon, premier fragment gagnant, surcharges de simulation génériques', async () => {
    const base = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const catalog = scenarioBCatalog(base);
    const bindings = [
      { urn: SCENARIO_B_LEAF, revision: 1 },
      { urn: SCENARIO_B_LEAF, revision: 1 }
    ];
    const g = composeReconciliationGraph(bindings, catalog);
    expect(g.ip_underlay_links).toHaveLength(1);

    const bypass = composeReconciliationGraph(bindings, catalog, { s6aDirectBypassDea: true });
    expect(bypass.service_mediation_flows[0].mandatory_mediation_hops).toEqual(['edge-gw-01']);
    expect(bypass.service_mediation_flows[0].direct_bypass_allowed).toBe(true);

    const orphan = composeReconciliationGraph(bindings, catalog, { orphanPartnerTenant: true });
    expect(orphan.partner_organizations).toEqual([]);
    expect(orphan.sla_and_monitoring_contracts).toEqual([]);

    expect(isReconciliationGraphEmpty(emptyReconciliationGraph())).toBe(true);
  });

  it('scénario A : la fixture d’ontologie fournit toujours le graphe d’origine (non-régression des données déplacées)', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const inv = composeMultiAxisHydration('sub_a', [{ urn: SCENARIO_A_LEAF, revision: 1 }], catalog);
    const g = inv.reconciliation_graph;
    expect(g.sources).toEqual([SCENARIO_A_LEAF]);
    expect(g.pivot_tenant_id).toBe('org-lot3-mno');
    expect(g.ipsec_tunnels).toHaveLength(1);
    expect(g.service_mediation_flows[0].mandatory_mediation_hops).toEqual(['secgw-lot1-01', 'dea-lot1-01']);
  });
});
