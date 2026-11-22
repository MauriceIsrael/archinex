import { describe, it, expect, beforeEach } from 'vitest';
import {
  FIELD_OWNERSHIP_REGISTRY,
  classifyField,
  evaluateStatusObservation,
  evaluateStatusTransition,
  guardIntentPush,
  normalizeStatus,
  ownedTypeFromListPath
} from '../../src/lib/domain/edp/fieldOwnership.js';
import { isStatusRegression } from '../../src/lib/server/edp/driftService.js';
import { loadOntologyCatalog, resetRuntimeOntologyOverlay } from '../../src/lib/server/edp/ontologyClient.js';
import { composeMultiAxisHydration, type MultiAxisHydratedInventory } from '../../src/lib/server/edp/refinementCoverage.js';
import { syncHydratedInventoryToNautobot, pullLiveInventoryFromNautobot } from '../../src/lib/server/edp/nautobotSync.js';

/**
 * Propriété des champs et cycle de vie des statuts (ADR-017, issue #398).
 * Archinex crée en Planned ; les connecteurs font évoluer ; Archinex lit et ne force jamais un statut « réalisé ».
 */

describe('Registre de propriété des champs (#398)', () => {
  it('classe intention / réalisé / opérationnel ; inconnu = opérationnel ; archinex_* = intention', () => {
    expect(classifyField('dcim.device', 'device_type')).toBe('intent');
    expect(classifyField('dcim.device', 'status')).toBe('realized');
    expect(classifyField('dcim.device', 'serial')).toBe('realized');
    expect(classifyField('dcim.device', 'asset_tag')).toBe('operational');
    expect(classifyField('dcim.device', 'champ_inconnu')).toBe('operational');
    expect(classifyField('dcim.device', 'archinex_intent_hash')).toBe('intent');
    expect(classifyField('dcim.device', 'realized_status')).toBe('realized');
    expect(classifyField('type.inconnu', 'status')).toBe('operational');
  });

  it('le statut est réalisé pour chaque type de la tranche minimale qui en porte un (un Tenant n\'en a pas)', () => {
    for (const type of Object.keys(FIELD_OWNERSHIP_REGISTRY).filter((t) => t !== 'tenancy.tenant')) {
      expect(classifyField(type, 'status')).toBe('realized');
    }
    expect(classifyField('tenancy.tenant', 'status')).toBe('operational');
  });

  it('déduit le type du chemin de liste Nautobot ; hors tranche minimale = null', () => {
    expect(ownedTypeFromListPath('/api/dcim/devices/')).toBe('dcim.device');
    expect(ownedTypeFromListPath('/api/ipam/prefixes/?limit=5')).toBe('ipam.prefix');
    expect(ownedTypeFromListPath('/api/circuits/circuits/')).toBeNull();
    expect(ownedTypeFromListPath('/api/vpn/vpn-tunnels/')).toBeNull();
  });
});

describe('Cycle de vie des statuts (#398)', () => {
  it('une avancée nominale posée par un connecteur est une PROGRESSION, pas un écart', () => {
    expect(evaluateStatusObservation('planned', 'active').verdict).toBe('progress');
    expect(evaluateStatusObservation('Planned', { value: 'Staged' }).verdict).toBe('progress');
    expect(evaluateStatusObservation('planned', 'planned').verdict).toBe('unchanged');
  });

  it('un recul, une panne ou un retrait sont des RÉGRESSIONS', () => {
    expect(evaluateStatusObservation('active', 'planned').verdict).toBe('regression');
    expect(evaluateStatusObservation('active', 'staged').verdict).toBe('regression');
    expect(evaluateStatusObservation('active', 'failed').verdict).toBe('regression');
    expect(evaluateStatusObservation('planned', 'decommissioning').verdict).toBe('regression');
    expect(evaluateStatusObservation('active', 'offline').verdict).toBe('regression');
  });

  it('un statut inconnu est signalé « inattendu » (jamais ignoré)', () => {
    expect(evaluateStatusObservation('planned', 'inventory-x').verdict).toBe('unexpected');
  });

  it('isStatusRegression délègue au registre (définition unique)', () => {
    expect(isStatusRegression('active', 'planned')).toBe(true);
    expect(isStatusRegression('planned', 'active')).toBe(false);
    expect(isStatusRegression('planned', 'mystère')).toBe(false);
  });

  it('Archinex ne crée qu\'en planned et ne force jamais un statut réalisé', () => {
    expect(evaluateStatusTransition(null, 'planned', 'archinex').allowed).toBe(true);
    expect(evaluateStatusTransition('planned', 'active', 'archinex').allowed).toBe(false);
    expect(evaluateStatusTransition('active', 'planned', 'archinex').allowed).toBe(false);
    const decom = evaluateStatusTransition('active', 'decommissioning', 'archinex');
    expect(decom.allowed).toBe(true);
    expect(decom.requiresDecision).toBe(true);
  });

  it('un connecteur progresse, signale une panne, mais ne fait pas reculer sans panne', () => {
    expect(evaluateStatusTransition('planned', 'staged', 'connector').allowed).toBe(true);
    expect(evaluateStatusTransition('staged', 'active', 'connector').allowed).toBe(true);
    expect(evaluateStatusTransition('active', 'failed', 'connector').allowed).toBe(true);
    expect(evaluateStatusTransition('active', 'planned', 'connector').allowed).toBe(false);
    expect(evaluateStatusTransition('planned', 'zzz', 'connector').allowed).toBe(false);
  });

  it('normalise les statuts Nautobot (objet ou chaîne, casse)', () => {
    expect(normalizeStatus({ value: 'Active' })).toBe('active');
    expect(normalizeStatus({ name: 'Planned' })).toBe('planned');
    expect(normalizeStatus(undefined)).toBe('');
  });
});

describe('Protection du push d\'intention (#398)', () => {
  const payload = { name: 'srv-01', device_type: 'dt', status: 'uuid-planned', serial: 'X', comments: 'OOB : 192.0.2.1', asset_tag: 'A1', tags: [{ name: 't' }] };

  it('création : payload inchangé (création en planned incluse)', () => {
    const r = guardIntentPush('dcim.device', payload, false);
    expect(r.payload).toEqual(payload);
    expect(r.removed).toEqual([]);
  });

  it('mise à jour : seuls les champs d\'intention sont conservés (jamais statut, réalisé, opérationnel)', () => {
    const r = guardIntentPush('dcim.device', payload, true);
    expect(Object.keys(r.payload).sort()).toEqual(['comments', 'device_type', 'name', 'tags']);
    expect(r.removed.sort()).toEqual(['asset_tag', 'serial', 'status']);
  });

  it('type hors registre : comportement historique inchangé', () => {
    const r = guardIntentPush('circuits.circuit', payload, true);
    expect(r.payload).toEqual(payload);
  });
});

/** Faux Nautobot : état initial paramétrable, enregistre les appels. */
function fakeNautobot(opts: { devices?: any[] } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const ok = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.pathname === '/api/status/') return ok({ 'nautobot-version': '2.2.4' });
    if (url.pathname === '/api/extras/statuses/') return ok({ results: [{ id: 'st-planned', name: 'Planned' }, { id: 'st-active', name: 'Active' }] });
    if (url.pathname === '/api/dcim/locations/') return ok({ results: [{ id: 'loc', name: 'site', location_type: { id: 'lt' } }] });
    if (url.pathname === '/api/ipam/namespaces/') return ok({ results: [{ id: 'ns' }] });
    if (method === 'GET' && url.pathname === '/api/dcim/devices/') {
      const name = url.searchParams.get('name');
      const all = opts.devices || [];
      return ok({ results: name ? all.filter((d) => d.name === name) : all });
    }
    if (method === 'GET') return ok({ results: [] });
    return ok({ id: `uuid-${url.pathname.replace(/\W+/g, '-')}`, ...(body || {}) }, method === 'POST' ? 201 : 200);
  };
  return { calls, fetchImpl };
}

async function baselineInventory(): Promise<MultiAxisHydratedInventory> {
  const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
  return composeMultiAxisHydration(
    'sub_own',
    [
      { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
      { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 }
    ],
    catalog
  );
}

describe('Intégration Nautobot : le push ne régresse pas la réalité, la progression n\'est pas une dérive (#398)', () => {
  beforeEach(() => resetRuntimeOntologyOverlay());

  it('un 2e push sur un équipement déjà promu « Active » ne renvoie ni statut ni champ réalisé', async () => {
    const inv = await baselineInventory();
    const first = inv.nautobot_planned_devices[0];
    const name = String(first.name);
    // Équipement MARQUÉ (empreinte périmée) : la mise à jour est exercée, et ne doit jamais renvoyer statut ni champ réalisé.
    const live = [{ id: 'dev-1', name, status: { value: 'active' }, serial: 'SN-123', custom_fields: { archinex_intent_hash: 'v1:perimee' } }];
    const { calls, fetchImpl } = fakeNautobot({ devices: live });

    await syncHydratedInventoryToNautobot(inv, { baseUrl: 'http://localhost:8080', token: 't', fetchImpl });

    const patches = calls.filter((c) => c.method === 'PATCH' && c.path.startsWith('/api/dcim/devices/dev-1'));
    expect(patches.length).toBeGreaterThan(0); // le chemin de mise à jour est bien exercé
    for (const p of patches) {
      expect(p.body).not.toHaveProperty('status');
      expect(p.body).not.toHaveProperty('serial');
    }
    // Aucune requête d'écriture ne remet l'équipement à Planned.
    const demotions = calls.filter((c) => c.method !== 'GET' && c.path.includes('/api/dcim/devices/dev-1') && c.body?.status !== undefined);
    expect(demotions).toEqual([]);
  });

  it('la création d\'un équipement absent reste en Planned', async () => {
    const inv = await baselineInventory();
    const { calls, fetchImpl } = fakeNautobot({ devices: [] });
    await syncHydratedInventoryToNautobot(inv, { baseUrl: 'http://localhost:8080', token: 't', fetchImpl });
    const posts = calls.filter((c) => c.method === 'POST' && c.path === '/api/dcim/devices/');
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) expect(p.body.status).toBe('st-planned');
  });

  it('pull : planned → active posé par un connecteur ne produit AUCUN écart ; active → failed produit status_regression', async () => {
    const inv = await baselineInventory();
    const name = String(inv.nautobot_planned_devices[0].name);

    const progress = fakeNautobot({ devices: [{ id: 'd1', name, status: { value: 'active' } }] });
    const rProgress = await pullLiveInventoryFromNautobot(inv, { baseUrl: 'http://localhost:8080', token: 't', fetchImpl: progress.fetchImpl });
    expect(rProgress.findings.filter((f) => f.attributeKey === 'status')).toEqual([]);

    const failed = fakeNautobot({ devices: [{ id: 'd1', name, status: { value: 'failed' } }] });
    const rFailed = await pullLiveInventoryFromNautobot(inv, { baseUrl: 'http://localhost:8080', token: 't', fetchImpl: failed.fetchImpl });
    const statusFindings = rFailed.findings.filter((f) => f.attributeKey === 'status');
    expect(statusFindings).toHaveLength(1);
    expect(statusFindings[0].kind).toBe('status_regression');

    const unknown = fakeNautobot({ devices: [{ id: 'd1', name, status: { value: 'mystère' } }] });
    const rUnknown = await pullLiveInventoryFromNautobot(inv, { baseUrl: 'http://localhost:8080', token: 't', fetchImpl: unknown.fetchImpl });
    const u = rUnknown.findings.filter((f) => f.attributeKey === 'status');
    expect(u).toHaveLength(1);
    expect(u[0].kind).toBe('attribute_mismatch');
  });
});
