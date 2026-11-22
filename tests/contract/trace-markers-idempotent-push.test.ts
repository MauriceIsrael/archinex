import { describe, it, expect, beforeEach } from 'vitest';
import { loadOntologyCatalog, resetRuntimeOntologyOverlay } from '../../src/lib/server/edp/ontologyClient.js';
import { composeMultiAxisHydration, type MultiAxisHydratedInventory } from '../../src/lib/server/edp/refinementCoverage.js';
import { syncHydratedInventoryToNautobot, payloadAlreadyApplied } from '../../src/lib/server/edp/nautobotSync.js';
import {
  INTENT_HASH_VERSION,
  TRACE_FIELD_KEYS,
  buildTraceCustomFields,
  computeObjectIntentHash,
  planIntentWrite,
  summarizeSyncPlan
} from '../../src/lib/server/edp/traceMarkers.js';

/**
 * Marquage de traçabilité et push idempotent (ADR-017, issue #376).
 * Deux pushes successifs de la même décision ne produisent aucune écriture ; un objet non marqué n'est jamais touché.
 */

const OWNED_PATHS = ['/api/tenancy/tenants/', '/api/dcim/devices/', '/api/ipam/prefixes/', '/api/ipam/vlans/', '/api/ipam/ip-addresses/'];

describe('Empreinte d\'intention et plan d\'écriture (fonctions pures, #376)', () => {
  const dev = { name: 'srv-01', device_type: 'dt', role: 'r', status: 'st', serial: 'SN', tags: [{ name: 'x' }], custom_fields: { a: 1 }, comments: 'OOB : 1' };

  it('l\'empreinte porte la version et ne couvre que l\'INTENTION (pas statut, réalisé, tags, custom_fields)', () => {
    const h = computeObjectIntentHash('dcim.device', dev);
    expect(h.startsWith(`${INTENT_HASH_VERSION}:`)).toBe(true);
    expect(computeObjectIntentHash('dcim.device', { ...dev, status: 'autre', serial: 'AUTRE', tags: [], custom_fields: {} })).toBe(h);
    expect(computeObjectIntentHash('dcim.device', { ...dev, device_type: 'autre' })).not.toBe(h);
    expect(computeObjectIntentHash('dcim.device', { ...dev, comments: 'OOB : 2' })).not.toBe(h);
    // le type entre dans l'empreinte
    expect(computeObjectIntentHash('ipam.vlan', { name: 'srv-01' })).not.toBe(computeObjectIntentHash('tenancy.tenant', { name: 'srv-01' }));
  });

  it('plan : création / inchangé / mise à jour / non marqué ignoré / adoption', () => {
    expect(planIntentWrite({ exists: false, existingHash: undefined, desiredHash: 'v1:a' }).action).toBe('create');
    expect(planIntentWrite({ exists: true, existingHash: 'v1:a', desiredHash: 'v1:a' }).action).toBe('noop');
    expect(planIntentWrite({ exists: true, existingHash: 'v1:a', desiredHash: 'v1:b' }).action).toBe('update');
    expect(planIntentWrite({ exists: true, existingHash: undefined, desiredHash: 'v1:b' }).action).toBe('skip_unmarked');
    expect(planIntentWrite({ exists: true, existingHash: undefined, desiredHash: 'v1:b', adoptUnmarked: true }).action).toBe('adopt');
  });

  it('marqueurs : seuls les champs renseignés sont émis ; projet de repli sur le scope', () => {
    const cf = buildTraceCustomFields({ decisionId: 'dec-1', decisionRevision: 3, clauseRefs: ['b', 'a'] }, 'proj-x', 'v1:h');
    expect(cf[TRACE_FIELD_KEYS.project]).toBe('proj-x');
    expect(cf[TRACE_FIELD_KEYS.decision]).toBe('dec-1');
    expect(cf[TRACE_FIELD_KEYS.decisionRevision]).toBe(3);
    expect(cf[TRACE_FIELD_KEYS.clauseRefs]).toBe('["a","b"]');
    expect(cf[TRACE_FIELD_KEYS.subject]).toBeUndefined();
    expect(cf[TRACE_FIELD_KEYS.intentHash]).toBe('v1:h');
  });

  it('résumé lisible du plan', () => {
    const txt = summarizeSyncPlan([
      { kind: 'intent', action: 'create', type: 'dcim.device', name: 'a', reason: '' },
      { kind: 'intent', action: 'noop', type: 'dcim.device', name: 'b', reason: '' },
      { kind: 'write', method: 'POST', path: '/api/extras/roles/' }
    ]);
    expect(txt).toContain('1 création(s)');
    expect(txt).toContain('1 inchangé(s)');
    expect(txt).toContain("1 écriture(s) d'objets de support");
  });

  it('payloadAlreadyApplied : égalité prudente (relations imbriquées, tags, custom_fields) ; doute = faux', () => {
    const existing = { name: 'n', role: { id: 'r1', name: 'worker' }, tags: [{ name: 't1' }, { name: 't2' }], custom_fields: { k: 'v', z: 1 }, port: 80 };
    expect(payloadAlreadyApplied(existing, { name: 'n', role: 'r1', tags: [{ name: 't1' }], custom_fields: { k: 'v' }, port: '80' })).toBe(true);
    expect(payloadAlreadyApplied(existing, { role: 'r2' })).toBe(false);
    expect(payloadAlreadyApplied(existing, { tags: [{ name: 'absent' }] })).toBe(false);
    expect(payloadAlreadyApplied(existing, { custom_fields: { k: 'autre' } })).toBe(false);
    expect(payloadAlreadyApplied(existing, { inconnu: 'x' })).toBe(false);
  });
});

/** Faux Nautobot avec ÉTAT : crée, filtre, met à jour ; enregistre tous les appels. */
function statefulNautobot(preload: Array<{ list: string; obj: Record<string, any> }> = []) {
  const store = new Map<string, Array<Record<string, any>>>();
  let seq = 0;
  let statusCT: string[] = [];
  let locationTypeCT: string[] = [];
  for (const { list, obj } of preload) store.set(list, [...(store.get(list) || []), { id: `pre-${++seq}`, ...obj }]);
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const ok = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const list = url.pathname.replace(/[0-9a-z-]+\/$/, (m) => (/^(pre|uuid)-/.test(m.slice(0, -1)) ? '' : m));
    if (url.pathname === '/api/status/') return ok({ 'nautobot-version': '2.2.4' });
    if (url.pathname === '/api/extras/statuses/') return ok({ results: [{ id: 'st-planned', name: 'Planned', content_types: statusCT }, { id: 'st-active', name: 'Active' }] });
    if (url.pathname === '/api/extras/statuses/st-planned/' && method === 'PATCH') { statusCT = body.content_types; return ok({ id: 'st-planned' }); }
    if (url.pathname === '/api/dcim/locations/') return ok({ results: [{ id: 'loc', name: 'site', location_type: { id: 'lt' } }] });
    if (url.pathname === '/api/dcim/location-types/lt/') {
      if (method === 'PATCH') { locationTypeCT = body.content_types; return ok({ id: 'lt' }); }
      return ok({ id: 'lt', content_types: locationTypeCT });
    }
    if (url.pathname === '/api/ipam/namespaces/') return ok({ results: [{ id: 'ns' }] });
    if (method === 'GET') {
      // Lecture d'un objet par son identifiant (`/api/dcim/devices/<id>/`) : renvoie l'objet lui-même.
      const detail = url.pathname.match(/^(.*\/)([^/]+)\/$/);
      const detailRow = detail ? (store.get(detail[1]) || []).find((r) => r.id === detail[2]) : undefined;
      if (detailRow) return ok(detailRow);
      const rows = store.get(url.pathname) || [];
      // `device_id` est le nom du filtre de l'API ; l'objet stocké porte `device`.
      const alias: Record<string, string> = { device_id: 'device' };
      const filtered = rows.filter((r) =>
        [...url.searchParams.entries()].every(([k0, v]) => {
          const k = alias[k0] || k0;
          return !(k in r) || String(r[k]) === v;
        })
      );
      return ok({ results: filtered });
    }
    if (method === 'POST') {
      const obj = { id: `uuid-${++seq}`, ...body };
      store.set(url.pathname, [...(store.get(url.pathname) || []), obj]);
      return ok(obj, 201);
    }
    if (method === 'PATCH') {
      const idMatch = url.pathname.match(/^(.*\/)([^/]+)\/$/)!;
      const rows = store.get(idMatch[1]) || [];
      const row = rows.find((r) => r.id === idMatch[2]);
      if (row) Object.assign(row, body);
      return ok(row || {});
    }
    return ok({});
  };
  return { calls, store, fetchImpl, list: (p: string) => store.get(p) || [] };
}

async function inventory(subject = 'sub_tm'): Promise<MultiAxisHydratedInventory> {
  const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
  return composeMultiAxisHydration(
    subject,
    [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 }
    ],
    catalog
  );
}

const opts = (fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) => ({
  baseUrl: 'http://localhost:8080',
  token: 't',
  fetchImpl,
  trace: { projectId: 'proj-a', subjectId: 'sub_tm', decisionId: 'dec-1', decisionRevision: 2 },
  ...extra
});

describe('Push idempotent et marquage sur un Nautobot à état (#376)', () => {
  beforeEach(() => resetRuntimeOntologyOverlay());

  it('1er push : crée les champs de traçabilité et marque chaque objet de la tranche minimale', async () => {
    const inv = await inventory();
    const nb = statefulNautobot();
    const summary = await syncHydratedInventoryToNautobot(inv, opts(nb.fetchImpl));
    expect(summary.errors).toEqual([]);

    const cfPosts = nb.calls.filter((c) => c.method === 'POST' && c.path === '/api/extras/custom-fields/');
    expect(cfPosts.map((c) => c.body.key).sort()).toEqual(Object.values(TRACE_FIELD_KEYS).sort());
    expect(cfPosts[0].body.content_types).toEqual(expect.arrayContaining(['dcim.device', 'tenancy.tenant', 'ipam.prefix', 'ipam.vlan', 'ipam.ipaddress']));

    const owned = nb.calls.filter((c) => c.method === 'POST' && OWNED_PATHS.includes(c.path));
    expect(owned.length).toBeGreaterThan(0);
    for (const c of owned) {
      const cf = c.body.custom_fields;
      expect(cf[TRACE_FIELD_KEYS.intentHash]).toMatch(/^v1:[0-9a-f]{64}$/);
      expect(cf[TRACE_FIELD_KEYS.project]).toBe('proj-a');
      expect(cf[TRACE_FIELD_KEYS.decision]).toBe('dec-1');
      expect(cf[TRACE_FIELD_KEYS.decisionRevision]).toBe(2);
    }
  });

  it('2e push de la même décision : AUCUNE écriture (ni POST, ni PATCH, ni DELETE)', async () => {
    const inv = await inventory();
    const nb = statefulNautobot();
    await syncHydratedInventoryToNautobot(inv, opts(nb.fetchImpl));
    const before = nb.calls.length;

    const second = await syncHydratedInventoryToNautobot(inv, opts(nb.fetchImpl));
    const writes = nb.calls.slice(before).filter((c) => c.method !== 'GET');
    expect(writes).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(second.plan!.filter((p) => p.kind === 'intent' && p.action === 'create')).toEqual([]);
    expect(second.plan!.some((p) => p.kind === 'intent' && p.action === 'noop')).toBe(true);
  });

  it('une intention modifiée met à jour l\'objet concerné, sans toucher au statut ni aux champs réalisés', async () => {
    const inv = await inventory();
    const nb = statefulNautobot();
    await syncHydratedInventoryToNautobot(inv, opts(nb.fetchImpl));
    // Un connecteur a promu l'équipement et posé un champ réalisé.
    const dev = nb.list('/api/dcim/devices/')[0];
    dev.status = 'st-active';
    dev.serial = 'SN-REEL';

    const changed = structuredClone(inv);
    changed.nautobot_planned_devices[0].oob_ip = '198.51.100.99';
    const before = nb.calls.length;
    await syncHydratedInventoryToNautobot(changed, opts(nb.fetchImpl));
    const patches = nb.calls.slice(before).filter((c) => c.method === 'PATCH' && c.path.startsWith('/api/dcim/devices/'));
    expect(patches).toHaveLength(1);
    expect(patches[0].body).not.toHaveProperty('status');
    expect(patches[0].body).not.toHaveProperty('serial');
    expect(dev.status).toBe('st-active');
    expect(dev.serial).toBe('SN-REEL');
  });

  it('un objet existant NON marqué n\'est jamais modifié ni supprimé ; adoption seulement si demandée', async () => {
    const inv = await inventory();
    const name = String(inv.nautobot_planned_devices[0].name);
    const preload = [{ list: '/api/dcim/devices/', obj: { name, status: 'st-active', comments: 'créé à la main' } }];

    const nb = statefulNautobot(preload);
    const res = await syncHydratedInventoryToNautobot(inv, opts(nb.fetchImpl));
    expect(nb.calls.filter((c) => c.method === 'DELETE')).toEqual([]);
    expect(nb.calls.filter((c) => c.method === 'PATCH' && c.path.includes('/api/dcim/devices/pre-1/'))).toEqual([]);
    expect(nb.list('/api/dcim/devices/')[0].comments).toBe('créé à la main');
    expect(res.plan!.some((p) => p.kind === 'intent' && p.action === 'skip_unmarked' && p.name === name)).toBe(true);

    const nb2 = statefulNautobot(preload);
    await syncHydratedInventoryToNautobot(inv, opts(nb2.fetchImpl, { adoptUnmarked: true }));
    const adopted = nb2.list('/api/dcim/devices/')[0];
    expect((adopted.custom_fields || {})[TRACE_FIELD_KEYS.intentHash]).toMatch(/^v1:/);
    expect(adopted.status).toBe('st-active'); // le statut réalisé n'est jamais écrasé
  });

  it('dry-run : aucune écriture envoyée, plan lisible (JSON + résumé)', async () => {
    const inv = await inventory();
    const nb = statefulNautobot();
    const res = await syncHydratedInventoryToNautobot(inv, opts(nb.fetchImpl, { dryRun: true }));
    expect(nb.calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(res.dryRun).toBe(true);
    expect(res.plan!.filter((p) => p.kind === 'intent' && p.action === 'create').length).toBeGreaterThan(0);
    expect(res.planSummary).toMatch(/création\(s\)/);
    expect(() => JSON.stringify(res.plan)).not.toThrow();
  });

  it('deux projets sur un même Nautobot : marqueurs de projet distincts, aucune écriture croisée', async () => {
    const invA = await inventory('sub_a');
    const invB = await inventory('sub_b');
    const nb = statefulNautobot();
    await syncHydratedInventoryToNautobot(invA, opts(nb.fetchImpl, { projectScope: 'proj-a', trace: { projectId: 'proj-a', decisionId: 'dec-a' } }));
    const afterA = nb.calls.length;
    await syncHydratedInventoryToNautobot(invB, opts(nb.fetchImpl, { projectScope: 'proj-b', trace: { projectId: 'proj-b', decisionId: 'dec-b' } }));

    const devices = nb.list('/api/dcim/devices/');
    const projects = new Set(devices.map((d) => (d.custom_fields || {})[TRACE_FIELD_KEYS.project]));
    expect(projects).toEqual(new Set(['proj-a', 'proj-b']));
    // Le 2e projet ne modifie aucun objet marqué du 1er.
    const patchesOnA = nb.calls.slice(afterA).filter((c) => c.method === 'PATCH' && OWNED_PATHS.some((p) => c.path.startsWith(p)) && (c.body?.custom_fields?.[TRACE_FIELD_KEYS.project] === 'proj-a'));
    expect(patchesOnA).toEqual([]);
  });
});
