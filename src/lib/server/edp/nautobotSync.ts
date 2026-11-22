import { evaluateStatusObservation, guardIntentPush, ownedTypeFromListPath } from '../../domain/edp/fieldOwnership.js';
import {
  TRACE_CONTENT_TYPES,
  TRACE_CUSTOM_FIELD_DEFINITIONS,
  buildTraceCustomFields,
  computeObjectIntentHash,
  planIntentWrite,
  readIntentHash,
  summarizeSyncPlan,
  type IntentWriteAction,
  type SyncPlanEntry,
  type TraceContext
} from './traceMarkers.js';
import type { MultiAxisHydratedInventory } from './refinementCoverage.js';
import type { DriftFindingDraft } from './driftTypes.js';
import { extractArchinexMarkers, hasTraceabilityMarkers } from './driftService.js';

const DEFAULT_NAUTOBOT_URL = process.env.NAUTOBOT_URL || 'http://localhost:8080';
const DEFAULT_NAUTOBOT_TOKEN =
  process.env.NAUTOBOT_TOKEN || '0123456789abcdef0123456789abcdef01234567';

export interface NautobotSyncSummary {
  reachable: boolean;
  baseUrl?: string;
  projectScope?: string;
  tenantsSynced: number;
  circuitsSynced: number;
  prefixesSynced: number;
  vlansSynced: number;
  devicesSynced: number;
  vpnTunnelsSynced: number;
  tagsSynced: number;
  vrfsSynced: number;
  interfacesSynced: number;
  ipAddressesSynced: number;
  urls: {
    circuits: string;
    tenants: string;
    devices: string;
    prefixes: string;
    vpnTunnels: string;
    vrfs: string;
    ipAddresses: string;
  };
  errors: string[];
  /** Vrai si aucune écriture n'a été envoyée (simulation). */
  dryRun?: boolean;
  /** Plan de la synchronisation : actions sur les objets d'intention et écritures d'objets de support (#376). */
  plan?: SyncPlanEntry[];
  /** Résumé lisible du plan. */
  planSummary?: string;
}

export interface NautobotLivePullResult {
  reachable: boolean;
  source: 'nautobot_live' | 'local_fallback';
  projectScope?: string;
  inventory: MultiAxisHydratedInventory;
  observedCounts: {
    devices: number;
    circuits: number;
    tenants: number;
    vpnTunnels: number;
  };
  /** Écarts typés et structurés prêts à persister dans `drift_findings` (Issue #377). */
  findings: DriftFindingDraft[];
  /** Résumés textuels conservés pour rétrocompatibilité d'affichage. */
  detectedDrifts: string[];
  errors: string[];
}

export interface NautobotDriftContext {
  projectId?: string;
  subjectId?: string | null;
  decisionId?: string | null;
  clauseRefs?: string[];
  sourceEvent?: string;
}

export interface NautobotClientOptions {
  baseUrl?: string;
  token?: string;
  /** Scope logique d'isolation par projet (Namespace, Tag, préfixage réversible des noms) sur un Nautobot partagé. */
  projectScope?: string;
  /** Contexte de gouvernance optionnel pour qualifier les `DriftFindingDraft` produits lors du pull. */
  driftContext?: NautobotDriftContext;
  /** Marquage de traçabilité `archinex_*` écrit sur chaque objet de la tranche minimale (#376). */
  trace?: TraceContext;
  /** Simulation : aucune écriture n'est envoyée à Nautobot ; le plan est renvoyé dans le résumé (#376). */
  dryRun?: boolean;
  /** Adopte explicitement les objets existants NON marqués (sinon ils ne sont jamais modifiés) (#376). */
  adoptUnmarked?: boolean;
  /** Collecteur interne du plan de synchronisation. */
  planSink?: SyncPlanEntry[];
  fetchImpl?: typeof fetch;
}

export function normalizeProjectScope(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
  return cleaned || 'default';
}

export function projectTagName(scope: string): string {
  return `project-${normalizeProjectScope(scope)}`;
}

export function scopedNautobotName(baseName: string, scope?: string, maxLen = 64): string {
  const raw = String(baseName || '').trim();
  if (!scope) return raw;
  const norm = normalizeProjectScope(scope);
  const prefix = `${norm}--`;
  if (raw.startsWith(prefix)) return raw.slice(0, maxLen);
  return `${prefix}${raw}`.slice(0, maxLen);
}

export function unscopeNautobotName(nautobotName: string, scope?: string): string {
  const raw = String(nautobotName || '').trim();
  if (!scope) return raw;
  const prefix = `${normalizeProjectScope(scope)}--`;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

export function belongsToProjectScope(nautobotName: string, scope?: string): boolean {
  if (!scope) return true;
  const prefix = `${normalizeProjectScope(scope)}--`;
  return String(nautobotName || '').trim().startsWith(prefix);
}

export function resolveProjectNautobotOptions(
  project?: {
    id?: string;
    shortName?: string | null;
    strategy?: string | Record<string, any> | null;
  } | null,
  overrideOpts: Partial<NautobotClientOptions> = {}
): NautobotClientOptions {
  let strategyObj: Record<string, any> = {};
  if (project?.strategy) {
    if (typeof project.strategy === 'string') {
      try {
        strategyObj = JSON.parse(project.strategy);
      } catch {
        strategyObj = {};
      }
    } else if (typeof project.strategy === 'object') {
      strategyObj = project.strategy;
    }
  }

  const nbCfg = (strategyObj.nautobot || {}) as {
    url?: string;
    token?: string;
    isolationPrefix?: string;
    isolateByProject?: boolean;
  };

  const baseUrl = overrideOpts.baseUrl || nbCfg.url?.trim() || undefined;
  const token = overrideOpts.token || nbCfg.token?.trim() || undefined;
  const hasDedicatedInstance = Boolean(baseUrl && baseUrl !== DEFAULT_NAUTOBOT_URL);
  const shouldIsolate =
    typeof nbCfg.isolateByProject === 'boolean' ? nbCfg.isolateByProject : !hasDedicatedInstance;

  let projectScope = overrideOpts.projectScope;
  if (!projectScope && shouldIsolate && (nbCfg.isolationPrefix || project?.shortName || project?.id)) {
    projectScope = normalizeProjectScope(
      nbCfg.isolationPrefix?.trim() || project?.shortName?.trim() || project?.id || 'default'
    );
  }

  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(token ? { token } : {}),
    ...(projectScope ? { projectScope } : {}),
    ...(overrideOpts.driftContext ? { driftContext: overrideOpts.driftContext } : {}),
    ...(overrideOpts.fetchImpl ? { fetchImpl: overrideOpts.fetchImpl } : {})
  };
}

async function nbFetch(
  path: string,
  options: RequestInit = {},
  clientOpts: NautobotClientOptions = {},
  planOptions: { record?: boolean } = {}
): Promise<any> {
  // Simulation (#376) : toute écriture est interceptée et consignée au plan ; rien n'est envoyé à Nautobot.
  const method = String(options.method || 'GET').toUpperCase();
  if (clientOpts.dryRun && method !== 'GET') {
    if (planOptions.record !== false) clientOpts.planSink?.push({ kind: 'write', method, path });
    let body: Record<string, unknown> = {};
    try {
      body = options.body ? JSON.parse(String(options.body)) : {};
    } catch {
      body = {};
    }
    return { id: `dryrun-${path.replace(/\W+/g, '-')}-${String(body.name ?? body.cid ?? body.prefix ?? body.address ?? body.vid ?? '')}`, ...body };
  }
  const baseUrl = clientOpts.baseUrl || DEFAULT_NAUTOBOT_URL;
  const token = clientOpts.token || DEFAULT_NAUTOBOT_TOKEN;
  const fetchFn = clientOpts.fetchImpl || fetch;

  const url = `${baseUrl}${path}`;
  const res = await fetchFn(url, {
    ...options,
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(4000)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Nautobot ${options.method || 'GET'} ${path} -> ${res.status}: ${errText}`);
  }
  return res.json();
}

/**
 * Vrai si l'objet existant porte DÉJÀ toutes les valeurs du payload (aucune écriture nécessaire).
 * Prudent par construction : au moindre doute (forme inconnue), renvoie false et l'écriture a lieu.
 *  - clé de relation : l'objet imbriqué `{id}` doit avoir l'identifiant du payload ;
 *  - `tags` : comparaison sur les noms ; `custom_fields` : sous-ensemble ;
 *  - scalaires : égalité stricte (nombres et chaînes numériques tolérés).
 */
export function payloadAlreadyApplied(existing: Record<string, any>, payload: Record<string, unknown>): boolean {
  const scalarEq = (a: unknown, b: unknown) => a === b || (a !== null && b !== null && typeof a !== 'object' && typeof b !== 'object' && String(a) === String(b));
  for (const [key, want] of Object.entries(payload)) {
    if (want === undefined) continue;
    const have = key === 'custom_fields' ? existing._custom_field_data ?? existing.custom_fields : existing[key];
    if (key === 'custom_fields') {
      if (!have || typeof have !== 'object') return false;
      for (const [ck, cv] of Object.entries(want as Record<string, unknown>)) {
        if (!scalarEq((have as Record<string, unknown>)[ck], cv)) return false;
      }
      continue;
    }
    if (key === 'tags') {
      if (!Array.isArray(want) || !Array.isArray(have)) return false;
      const names = new Set(have.map((t: any) => (t && typeof t === 'object' ? t.name : t)));
      if (!(want as any[]).every((t) => names.has(t && typeof t === 'object' ? t.name : t))) return false;
      continue;
    }
    if (have && typeof have === 'object' && !Array.isArray(have)) {
      const haveId = (have as Record<string, unknown>).id;
      if (typeof want === 'string' && haveId !== undefined && String(haveId) === want) continue;
      return false;
    }
    if (Array.isArray(want) || Array.isArray(have)) {
      if (JSON.stringify(want) !== JSON.stringify(have)) return false;
      continue;
    }
    if (!scalarEq(have, want)) return false;
  }
  return true;
}

/**
 * Écrit un objet de la tranche minimale avec marquage de traçabilité et push idempotent (#376, ADR-017).
 *  - absent → création (en Planned) avec marqueurs `archinex_*` ;
 *  - marqué, même empreinte d'intention → aucune écriture ;
 *  - marqué, empreinte différente → mise à jour des seuls champs d'intention (#398) ;
 *  - NON marqué → jamais modifié, sauf adoption explicite.
 */
/** Objets existants NON marqués que la synchronisation a laissés intacts : on ne leur rattache rien (#376). */
const skippedUnmarkedObjects = new WeakSet<object>();
function isSkippedUnmarked(obj: unknown): boolean {
  return Boolean(obj) && typeof obj === 'object' && skippedUnmarkedObjects.has(obj as object);
}

async function writeIntentObject(
  type: NonNullable<ReturnType<typeof ownedTypeFromListPath>>,
  listPath: string,
  existingItem: any | null,
  createPayload: Record<string, unknown>,
  patchOnExisting: boolean,
  clientOpts: NautobotClientOptions
): Promise<any> {
  const desiredHash = computeObjectIntentHash(type, createPayload);
  const markers = buildTraceCustomFields(
    clientOpts.trace,
    clientOpts.projectScope ? normalizeProjectScope(clientOpts.projectScope) : undefined,
    desiredHash
  );
  const payload: Record<string, unknown> = {
    ...createPayload,
    custom_fields: { ...((createPayload.custom_fields as Record<string, unknown>) || {}), ...markers }
  };
  const label = String(createPayload.name ?? createPayload.prefix ?? createPayload.address ?? createPayload.vid ?? '');
  const record = (action: IntentWriteAction, reason: string) =>
    clientOpts.planSink?.push({ kind: 'intent', action, type, name: label, reason });

  // Un appelant qui interdit la mise à jour (patchOnExisting = false) ne réécrit jamais un objet existant.
  const decision = planIntentWrite({
    exists: Boolean(existingItem),
    existingHash: readIntentHash(existingItem),
    desiredHash,
    adoptUnmarked: clientOpts.adoptUnmarked
  });
  if (existingItem && !patchOnExisting) {
    record('noop', 'Mise à jour non demandée par l\'appelant.');
    return existingItem;
  }
  record(decision.action, decision.reason);

  if (decision.action === 'create') {
    return nbFetch(listPath, { method: 'POST', body: JSON.stringify(payload) }, clientOpts, { record: false });
  }
  if (decision.action === 'skip_unmarked') {
    skippedUnmarkedObjects.add(existingItem);
    return existingItem;
  }
  if (decision.action === 'noop') return existingItem;

  // update | adopt : seuls les champs d'intention (et les marqueurs) sont réécrits (#398).
  const guarded = guardIntentPush(type, payload, true);
  if (!existingItem.id || Object.keys(guarded.payload).length === 0) return existingItem;
  try {
    return await nbFetch(
      `${listPath}${existingItem.id}/`,
      { method: 'PATCH', body: JSON.stringify(guarded.payload) },
      clientOpts,
      { record: false }
    );
  } catch {
    return existingItem;
  }
}

/**
 * Crée (idempotent) les champs personnalisés de traçabilité `archinex_*` sur les types de la tranche minimale.
 * Prérequis Nautobot : droit d'écriture sur `extras.customfield` pour le jeton utilisé.
 */
async function ensureTraceCustomFields(clientOpts: NautobotClientOptions): Promise<{ ensured: number; errors: string[] }> {
  let ensured = 0;
  const errors: string[] = [];
  for (const def of TRACE_CUSTOM_FIELD_DEFINITIONS) {
    try {
      const found = await nbFetch(`/api/extras/custom-fields/?key=${encodeURIComponent(def.key)}`, {}, clientOpts);
      if (found?.results && found.results.length > 0) continue;
      await nbFetch(
        '/api/extras/custom-fields/',
        {
          method: 'POST',
          body: JSON.stringify({
            key: def.key,
            label: def.label,
            type: def.type,
            required: false,
            content_types: TRACE_CONTENT_TYPES
          })
        },
        clientOpts
      );
      ensured++;
    } catch (e: any) {
      errors.push(`Champ personnalisé ${def.key}: ${e.message}`);
    }
  }
  return { ensured, errors };
}

async function getOrCreateByQuery(
  listPath: string,
  queryParam: string,
  createPayload: Record<string, unknown>,
  patchOnExisting = true,
  clientOpts: NautobotClientOptions = {}
): Promise<any> {
  const sep = listPath.includes('?') ? '&' : '?';
  const existing = await nbFetch(`${listPath}${sep}${queryParam}`, {}, clientOpts);
  const ownedType = ownedTypeFromListPath(listPath);
  if (ownedType) {
    return writeIntentObject(ownedType, listPath, existing?.results?.[0] ?? null, createPayload, patchOnExisting, clientOpts);
  }
  if (existing.results && existing.results.length > 0) {
    const item = existing.results[0];
    if (patchOnExisting && item.id && payloadAlreadyApplied(item, createPayload)) return item;
    if (patchOnExisting && item.id) {
      // Propriété des champs (ADR-017, #398) : sur un objet existant, seuls les champs d'INTENTION sont réécrits.
      // Jamais de statut ni de champ réalisé : un nouveau push ne fait pas régresser ce qu'un connecteur a réalisé.
      const guarded = guardIntentPush(ownedTypeFromListPath(listPath), createPayload, true);
      if (Object.keys(guarded.payload).length === 0) return item;
      try {
        return await nbFetch(
          `${listPath}${item.id}/`,
          {
            method: 'PATCH',
            body: JSON.stringify(guarded.payload)
          },
          clientOpts
        );
      } catch {
        return item;
      }
    }
    return item;
  }
  return nbFetch(
    listPath,
    {
      method: 'POST',
      body: JSON.stringify(createPayload)
    },
    clientOpts
  );
}

/**
 * Normalise un identifiant de zone vers la convention `zone-<nom>` attendue par IP Flow Manager (`nautobot_adapter.py`).
 */
function toZoneTagName(zoneId: string): string {
  const slug = zoneId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `zone-${slug || 'default'}`.slice(0, 100);
}

/**
 * Calcule le préfixe réseau IPv4 (ex. `10.20.0.10/24` -> `10.20.0.0/24`) pour alimenter IPAM.
 */
function cidrToNetworkPrefix(cidr: string): string | null {
  const match = cidr.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  const prefixLen = Number(match[5]);
  if (octets.some((o) => o < 0 || o > 255) || prefixLen < 0 || prefixLen > 32) return null;

  const ipInt = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
  const netInt = (ipInt & mask) >>> 0;

  return `${(netInt >>> 24) & 255}.${(netInt >>> 16) & 255}.${(netInt >>> 8) & 255}.${netInt & 255}/${prefixLen}`;
}

function mapNautobotInterfaceType(ifaceType: string): string {
  const norm = ifaceType.trim().toLowerCase();
  if (norm === 'management' || norm === 'oob') return '1000base-t';
  if (norm.includes('sriov') || norm.includes('dpdk') || norm === 'data' || norm.includes('10g')) {
    return '10gbase-x-sfpp';
  }
  if (norm.includes('virtual') || norm.includes('loopback') || norm.includes('tunnel')) {
    return 'virtual';
  }
  return '1000base-t';
}

/**
 * Noms logiques (avant préfixage de projet) des objets VPN natifs Nautobot associés à un tunnel du graphe.
 * Dérivés de l'identifiant du tunnel : partagés par la synchronisation (écriture) et la détection de dérive (lecture),
 * sans aucun nom de scénario.
 */
export function vpnObjectLogicalNames(tunnelId: string): {
  ikeProposal: string;
  ipsecProposal: string;
  profile: string;
} {
  return {
    ikeProposal: `ike-prop-${tunnelId}`,
    ipsecProposal: `ipsec-prop-${tunnelId}`,
    profile: `vpn-prof-${tunnelId}`
  };
}

/**
 * Synchronise de manière idempotente l'inventaire hydraté multi-axes et son graphe de réconciliation
 * (Tenants partenaires, Provider, CircuitType, Circuits, Terminaisons A/Z,
 * objets natifs du module VPN Nautobot 2.2+ : `vpn.IKEProposal`, `vpn.IPSecProposal`, `vpn.VPNProfile`, `vpn.VPNTunnel`,
 * VLAN et préfixes IP des liens, équipements externes et nœuds de médiation déclarés par le graphe,
 * et serveurs Bare-Metal Sylva) dans l'instance Nautobot 2.x active.
 * Un graphe de réconciliation vide (aucune feuille d'ontologie liée n'en déclare) ne produit aucun de ces objets.
 */
export async function syncHydratedInventoryToNautobot(
  hydrated: MultiAxisHydratedInventory,
  clientOptsInput: NautobotClientOptions = {}
): Promise<NautobotSyncSummary> {
  // Collecteur du plan (objets d'intention et écritures de support) ; partagé par tous les appels de cette synchronisation.
  const planSink: SyncPlanEntry[] = [];
  let clientOpts: NautobotClientOptions = { ...clientOptsInput, planSink };
  const baseUrl = clientOpts.baseUrl || DEFAULT_NAUTOBOT_URL;
  const scope = clientOpts.projectScope ? normalizeProjectScope(clientOpts.projectScope) : undefined;
  const summary: NautobotSyncSummary = {
    reachable: false,
    baseUrl,
    ...(scope ? { projectScope: scope } : {}),
    tenantsSynced: 0,
    circuitsSynced: 0,
    prefixesSynced: 0,
    vlansSynced: 0,
    devicesSynced: 0,
    vpnTunnelsSynced: 0,
    tagsSynced: 0,
    vrfsSynced: 0,
    interfacesSynced: 0,
    ipAddressesSynced: 0,
    urls: {
      circuits: `${baseUrl}/circuits/circuits/`,
      tenants: `${baseUrl}/tenancy/tenants/`,
      devices: `${baseUrl}/dcim/devices/`,
      prefixes: `${baseUrl}/ipam/prefixes/`,
      vpnTunnels: `${baseUrl}/vpn/vpn-tunnels/`,
      vrfs: `${baseUrl}/ipam/vrfs/`,
      ipAddresses: `${baseUrl}/ipam/ip-addresses/`
    },
    errors: [],
    ...(clientOpts.dryRun ? { dryRun: true } : {})
  };

  try {
    await nbFetch('/api/status/', {}, clientOpts);
    summary.reachable = true;
  } catch (err: any) {
    summary.errors.push(`Nautobot injoignable (${baseUrl}) : ${err?.message || String(err)}`);
    return summary;
  }

  // Extraction des clauses satisfaites pour les Custom Fields et Tags Nautobot (Issue #262)
  const satisfiedClauses = (Array.isArray(hydrated.satisfied_clauses) && hydrated.satisfied_clauses.length > 0)
    ? hydrated.satisfied_clauses
    : (typeof hydrated.sylva_workload_cluster_values?.metadata === 'object' &&
       (hydrated.sylva_workload_cluster_values.metadata as any)?.annotations?.['archinex.io/satisfied-clauses'])
      ? String((hydrated.sylva_workload_cluster_values.metadata as any).annotations['archinex.io/satisfied-clauses'])
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const satisfiedClausesStr = satisfiedClauses.join(', ');

  // Marquage de traçabilité : les clauses satisfaites de l'inventaire complètent le contexte fourni (#376).
  clientOpts = {
    ...clientOpts,
    trace: { ...clientOpts.trace, clauseRefs: clientOpts.trace?.clauseRefs ?? satisfiedClauses }
  };
  const ensuredFields = await ensureTraceCustomFields(clientOpts);
  summary.errors.push(...ensuredFields.errors);
  const clauseTags = satisfiedClauses.map((c) => ({
    name: c.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
    slug: c.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 100)
  }));

  try {
    // 0. Récupérer les référentiels de base Nautobot (Status Active/Planned, Location pop-valmondois, Namespace Global)
    const statusesRes = await nbFetch('/api/extras/statuses/?limit=50', {}, clientOpts);
    const statusPlannedObj = statusesRes.results?.find((s: any) => s.name === 'Planned');
    const statusPlanned = statusPlannedObj?.id || 'Planned';
    const statusActive =
      statusesRes.results?.find((s: any) => s.name === 'Active')?.id || 'Active';

    // S'assurer que le statut "Planned" autorise également ipam.vlan, ipam.prefix et ipam.ipaddress dans Nautobot 2.x
    if (statusPlannedObj?.id) {
      const existingStatusTypes: string[] = Array.isArray(statusPlannedObj.content_types)
        ? statusPlannedObj.content_types
        : [];
      const requiredStatusTypes = [
        'dcim.device',
        'dcim.interface',
        'circuits.circuit',
        'ipam.vlan',
        'ipam.prefix',
        'ipam.ipaddress',
        'vpn.vpntunnel'
      ];
      const mergedStatusTypes = Array.from(new Set([...existingStatusTypes, ...requiredStatusTypes]));
      if (mergedStatusTypes.length > existingStatusTypes.length) {
        try {
          await nbFetch(
            `/api/extras/statuses/${statusPlannedObj.id}/`,
            {
              method: 'PATCH',
              body: JSON.stringify({ content_types: mergedStatusTypes })
            },
            clientOpts
          );
        } catch {
          // Ignorer si le serveur mock ou l'instance Nautobot ne supporte pas le PATCH de status
        }
      }
    }

    const locationsRes = await nbFetch('/api/dcim/locations/?limit=10', {}, clientOpts);
    const defaultLocation = locationsRes.results?.[0];
    const defaultLocationId = defaultLocation?.id;

    // S'assurer que le LocationType "Site" autorise bien l'attachement des Devices, Terminaisons de Circuits, VLANs et Préfixes
    if (defaultLocation?.location_type?.id) {
      try {
        // Idempotent (#376) : on n'écrit que si un type de contenu manque, et on FUSIONNE avec l'existant
        // (un PATCH avec une liste fixe remplacerait, donc supprimerait, les types déjà autorisés).
        const required = ['dcim.device', 'circuits.circuittermination', 'ipam.vlan', 'ipam.prefix', 'dcim.rack'];
        const ltPath = `/api/dcim/location-types/${defaultLocation.location_type.id}/`;
        const currentLt = await nbFetch(ltPath, {}, clientOpts);
        const existingTypes: string[] = Array.isArray(currentLt?.content_types)
          ? currentLt.content_types.map((t: any) => (typeof t === 'string' ? t : t?.label ?? t?.model ?? '')).filter(Boolean)
          : [];
        const merged = Array.from(new Set([...existingTypes, ...required]));
        if (merged.length > existingTypes.length) {
          await nbFetch(ltPath, { method: 'PATCH', body: JSON.stringify({ content_types: merged }) }, clientOpts);
        }
      } catch {
        // Ignorer si déjà configuré ou non supporté par l'instance
      }
    }

    let defaultNamespaceId: string | undefined;
    if (scope) {
      const nsName = `archinex-${scope}`;
      try {
        const nsObj = await getOrCreateByQuery(
          '/api/ipam/namespaces/',
          `name=${encodeURIComponent(nsName)}`,
          {
            name: nsName,
            description: `Namespace IPAM isolé pour le projet ${scope}`
          },
          true,
          clientOpts
        );
        if (nsObj?.id) defaultNamespaceId = String(nsObj.id);
      } catch (e: any) {
        summary.errors.push(`Namespace ${nsName}: ${e.message}`);
      }
    }
    if (!defaultNamespaceId) {
      const namespacesRes = await nbFetch('/api/ipam/namespaces/?limit=10', {}, clientOpts);
      defaultNamespaceId = namespacesRes.results?.[0]?.id;
    }

    let projectVlanGroupId: string | undefined;
    if (scope) {
      const vgName = `vg-${scope}`;
      try {
        const vgObj = await getOrCreateByQuery(
          '/api/ipam/vlan-groups/',
          `name=${encodeURIComponent(vgName)}`,
          {
            name: vgName,
            ...(defaultLocationId ? { location: defaultLocationId } : {}),
            description: `VLAN Group isolé pour le projet ${scope}`
          },
          true,
          clientOpts
        );
        if (vgObj?.id) projectVlanGroupId = String(vgObj.id);
      } catch {
        // Optionnel selon la version/mock Nautobot
      }
    }

    let projectTag: { name: string } | null = null;
    if (scope) {
      const pTagName = projectTagName(scope);
      try {
        await getOrCreateByQuery(
          '/api/extras/tags/',
          `name=${encodeURIComponent(pTagName)}`,
          {
            name: pTagName,
            color: '3f51b5',
            content_types: [
              'dcim.device',
              'ipam.prefix',
              'ipam.vrf',
              'circuits.circuit',
              'tenancy.tenant',
              'vpn.vpntunnel'
            ],
            description: `Isolation logique Archinex pour le projet ${scope}`
          },
          true,
          clientOpts
        );
        projectTag = { name: pTagName };
        summary.tagsSynced++;
      } catch (e: any) {
        summary.errors.push(`Tag ${pTagName}: ${e.message}`);
      }
    }

    const withProjectTags = (tags: Array<{ name: string }> = []): Array<{ name: string }> =>
      projectTag ? [...tags, projectTag] : tags;

    const rg = hydrated.reconciliation_graph;
    const tenantIdMap = new Map<string, string>();

    // 1. Synchronisation des Organisations Partenaires (tenancy.Tenant)
    for (const org of rg?.partner_organizations || []) {
      try {
        const orgSlug = String(org.id);
        const scopedTenantName = scopedNautobotName(orgSlug, scope, 100);
        const tenantPayload: Record<string, unknown> = {
          name: scopedTenantName,
          description: `${org.name} — Démarcation : ${org.demarcation_point || 'non renseigné'}`,
          comments: `Modèle TM Forum SID : ${org.tmf_sid_class || 'PartyRole'}\nContact NOC : ${org.noc_contact || 'N/A'}`
        };
        if (projectTag) tenantPayload.tags = [projectTag];

        const tenantObj = await getOrCreateByQuery(
          '/api/tenancy/tenants/',
          `name=${encodeURIComponent(scopedTenantName)}`,
          tenantPayload,
          true,
          clientOpts
        );
        if (tenantObj?.id) {
          tenantIdMap.set(orgSlug, tenantObj.id);
          summary.tenantsSynced++;
        }
      } catch (e: any) {
        summary.errors.push(`Tenant ${org.id}: ${e.message}`);
      }
    }

    const pivotTenantUuid = rg?.pivot_tenant_id ? tenantIdMap.get(rg.pivot_tenant_id) || null : null;

    // 1bis. Tags `zone-<nom>` (/api/extras/tags/), Plateformes (/api/dcim/platforms/) et VRFs (/api/ipam/vrfs/)
    //       pour alimenter le tirage en lecture seule d'IP Flow Manager (`nautobot_adapter.py`).
    const zoneTagCache = new Map<string, { name: string; id?: string }>();
    const ensureZoneTag = async (zoneId: string): Promise<{ name: string; id?: string } | null> => {
      const tagName = toZoneTagName(zoneId);
      if (zoneTagCache.has(tagName)) return zoneTagCache.get(tagName)!;
      try {
        const tagObj = await getOrCreateByQuery(
          '/api/extras/tags/',
          `name=${encodeURIComponent(tagName)}`,
          {
            name: tagName,
            color: '009688',
            content_types: ['dcim.device', 'ipam.prefix', 'ipam.vrf', 'circuits.circuit'],
            description: `Zone de sécurité Archinex (${zoneId})`
          },
          true,
          clientOpts
        );
        const entry = tagObj?.id ? { id: String(tagObj.id), name: tagName } : { name: tagName };
        zoneTagCache.set(tagName, entry);
        summary.tagsSynced++;
        return entry;
      } catch (e: any) {
        summary.errors.push(`Tag ${tagName}: ${e.message}`);
        return null;
      }
    };

    const platformCache = new Map<string, string>();
    const ensurePlatform = async (name: string, description: string): Promise<string | null> => {
      if (platformCache.has(name)) return platformCache.get(name)!;
      try {
        const platObj = await getOrCreateByQuery(
          '/api/dcim/platforms/',
          `name=${encodeURIComponent(name)}`,
          { name, description },
          true,
          clientOpts
        );
        if (platObj?.id) {
          platformCache.set(name, String(platObj.id));
          return String(platObj.id);
        }
      } catch (e: any) {
        summary.errors.push(`Platform ${name}: ${e.message}`);
      }
      return null;
    };

    const vrfIdMap = new Map<string, string>();
    const syncedPrefixes = new Set<string>();
    const securityZones = Array.isArray(hydrated.security_zones) ? hydrated.security_zones : [];
    for (let zIdx = 0; zIdx < securityZones.length; zIdx++) {
      const zone = securityZones[zIdx];
      const zoneId = String(zone.zone_id || `zone-${zIdx + 1}`);
      const zTag = await ensureZoneTag(zoneId);
      const zoneSlug = zoneId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      const vrfName = scopedNautobotName(`vrf-${zoneSlug}`, scope, 100);
      try {
        const vrfPayload: Record<string, unknown> = {
          name: vrfName,
          rd: `65001:${100 + zIdx}`,
          description: `VRF Zone ${zoneId} | Isolation : ${zone.isolation_level || 'strict'} | Bastion : ${zone.bastion_required ? 'requis' : 'direct'}`
        };
        if (defaultNamespaceId) vrfPayload.namespace = defaultNamespaceId;
        if (pivotTenantUuid) vrfPayload.tenant = pivotTenantUuid;
        const vrfTags = withProjectTags(zTag ? [{ name: zTag.name }] : []);
        if (vrfTags.length > 0) vrfPayload.tags = vrfTags;

        const vrfQuery =
          scope && defaultNamespaceId
            ? `name=${encodeURIComponent(vrfName)}&namespace=${encodeURIComponent(defaultNamespaceId)}`
            : `name=${encodeURIComponent(vrfName)}`;
        const vrfObj = await getOrCreateByQuery(
          '/api/ipam/vrfs/',
          vrfQuery,
          vrfPayload,
          true,
          clientOpts
        );
        if (vrfObj?.id) {
          vrfIdMap.set(zoneSlug, String(vrfObj.id));
          summary.vrfsSynced++;
        }
      } catch (e: any) {
        summary.errors.push(`VRF ${vrfName}: ${e.message}`);
      }
    }

    // 2. Synchronisation du Provider, CircuitType, Circuit & CircuitTerminations A/Z (objets déclarés par le graphe)
    if (rg?.ip_underlay_links && rg.ip_underlay_links.length > 0) {
      try {
        // Fournisseur et contact NOC dérivés de l'organisation pivot déclarée par le graphe (aucune constante).
        const pivotOrg = (rg.partner_organizations || []).find((o) => String(o.id) === rg.pivot_tenant_id);
        const providerName = `provider-${rg.pivot_tenant_id || 'interco'}`;
        const provider = await getOrCreateByQuery(
          '/api/circuits/providers/',
          `name=${encodeURIComponent(providerName)}`,
          {
            name: providerName,
            ...(pivotOrg?.noc_contact ? { noc_contact: String(pivotOrg.noc_contact) } : {}),
            comments: `Fournisseur des liaisons d'interconnexion du graphe de réconciliation${
              pivotOrg?.name ? ` (organisation partenaire « ${String(pivotOrg.name)} »)` : ''
            }.`
          },
          true,
          clientOpts
        );

        const circuitType = await getOrCreateByQuery(
          '/api/circuits/circuit-types/',
          `name=${encodeURIComponent('Interco-WAN')}`,
          {
            name: 'Interco-WAN',
            description: "Liaison d'interconnexion portant un tunnel chiffré et un flux médiatisé"
          },
          true,
          clientOpts
        );

        const tunnelInfo = rg.ipsec_tunnels?.[0];
        const flowInfo = rg.service_mediation_flows?.[0];
        const slaInfo = rg.sla_and_monitoring_contracts?.[0];
        const probeInfo = rg.sla_and_monitoring_contracts?.[1];

        for (const link of rg.ip_underlay_links) {
          const logicalCid = String(link.id);
          const cid = scopedNautobotName(logicalCid, scope, 100);
          const circuitPayload: Record<string, unknown> = {
            cid,
            provider: provider.id,
            circuit_type: circuitType.id,
            status: statusPlanned,
            commit_rate: 1000000,
            description: `Underlay ${link.subnet} (VLAN ${link.vlan_id}) | Tunnel ${tunnelInfo?.id || 'n/a'} (${tunnelInfo?.cipher_suite || 'n/a'}) | Flux ${flowInfo?.id || 'n/a'}`,
            comments: [
              `### Réconciliation multi-domaine Archinex`,
              `- **Pivot Tenant** : \`${link.tenant_ref}\``,
              `- **Extrémité A (nœud externe)** : \`${link.endpoint_a}\``,
              `- **Extrémité Z (nœud interne)** : \`${link.endpoint_z}\``,
              `- **Tunnel IPsec ESP** : \`${tunnelInfo?.id}\` (${tunnelInfo?.protocol} · ${tunnelInfo?.cipher_suite} · ${tunnelInfo?.pfs_dh_group})`,
              `- **Flux médiatisé** : \`${flowInfo?.id}\` (Hops obligatoires : ${(flowInfo?.mandatory_mediation_hops as string[] || []).join(' → ')})`,
              `- **Contrat SLA associé** : \`${slaInfo?.id || 'N/A'}\` (${slaInfo?.requirement_ref || 'n/a'})`,
              `- **Sonde NOC associée** : \`${probeInfo?.id || 'N/A'}\` (${probeInfo?.requirement_ref || 'n/a'})`
            ].join('\n')
          };
          if (pivotTenantUuid) {
            circuitPayload.tenant = pivotTenantUuid;
          }
          if (satisfiedClauses.length > 0) {
            circuitPayload.custom_fields = { satisfied_clauses: satisfiedClausesStr };
          }
          const circuitTags = withProjectTags(satisfiedClauses.length > 0 ? clauseTags : []);
          if (circuitTags.length > 0) {
            circuitPayload.tags = circuitTags;
          }

          const circuitObj = await getOrCreateByQuery(
            '/api/circuits/circuits/',
            `cid=${encodeURIComponent(cid)}`,
            circuitPayload,
            true,
            clientOpts
          );

          if (circuitObj?.id) {
            summary.circuitsSynced++;
            if (defaultLocationId) {
              // Terminaison Z (extrémité interne du lien)
              await getOrCreateByQuery(
                '/api/circuits/circuit-terminations/',
                `circuit=${circuitObj.id}&term_side=Z`,
                {
                  circuit: circuitObj.id,
                  term_side: 'Z',
                  location: defaultLocationId,
                  port_speed: 10000000,
                  description: `Terminaison Z : ${link.endpoint_z}`
                },
                true,
                clientOpts
              );
              // Terminaison A (extrémité externe du lien)
              await getOrCreateByQuery(
                '/api/circuits/circuit-terminations/',
                `circuit=${circuitObj.id}&term_side=A`,
                {
                  circuit: circuitObj.id,
                  term_side: 'A',
                  location: defaultLocationId,
                  port_speed: 10000000,
                  description: `Terminaison A : ${link.endpoint_a}`
                },
                true,
                clientOpts
              );
            }
          }

          // 3. Synchronisation du VLAN et du préfixe IP du lien dans IPAM
          let vlanUuid: string | null = null;
          if (link.vlan_id) {
            try {
              const vlanName = scopedNautobotName(`vlan-${link.vlan_id}-${String(link.id)}`, scope, 64);
              const vlanPayload: Record<string, unknown> = {
                vid: Number(link.vlan_id),
                name: vlanName,
                status: statusPlanned,
                description: `VLAN d'interconnexion Underlay ${cid} (${link.endpoint_a} <-> ${link.endpoint_z})`
              };
              if (pivotTenantUuid) vlanPayload.tenant = pivotTenantUuid;
              if (projectVlanGroupId) {
                vlanPayload.vlan_group = projectVlanGroupId;
              } else if (defaultLocationId) {
                vlanPayload.location = defaultLocationId;
              }

              const vlanQuery = projectVlanGroupId
                ? `vid=${link.vlan_id}&vlan_group=${encodeURIComponent(projectVlanGroupId)}`
                : scope
                  ? `vid=${link.vlan_id}&name=${encodeURIComponent(vlanName)}`
                  : `vid=${link.vlan_id}`;
              const vlanObj = await getOrCreateByQuery(
                '/api/ipam/vlans/',
                vlanQuery,
                vlanPayload,
                true,
                clientOpts
              );
              if (vlanObj?.id) {
                vlanUuid = vlanObj.id;
                summary.vlansSynced++;
              }
            } catch (e: any) {
              summary.errors.push(`VLAN ${link.vlan_id}: ${e.message}`);
            }
          }

          if (link.subnet) {
            try {
              const prefixPayload: Record<string, unknown> = {
                prefix: String(link.subnet),
                status: statusPlanned,
                description: `Interco Underlay ${cid} | Tunnel ${tunnelInfo?.id || 'IPsec-ESP'} (${link.endpoint_a} <-> ${link.endpoint_z})`
              };
              if (defaultNamespaceId) prefixPayload.namespace = defaultNamespaceId;
              if (pivotTenantUuid) prefixPayload.tenant = pivotTenantUuid;
              if (vlanUuid) prefixPayload.vlan = vlanUuid;
              if (projectTag) prefixPayload.tags = [projectTag];

              const pfxQuery =
                scope && defaultNamespaceId
                  ? `prefix=${encodeURIComponent(String(link.subnet))}&namespace=${encodeURIComponent(defaultNamespaceId)}`
                  : `prefix=${encodeURIComponent(String(link.subnet))}`;
              const pfxObj = await getOrCreateByQuery(
                '/api/ipam/prefixes/',
                pfxQuery,
                prefixPayload,
                true,
                clientOpts
              );
              if (pfxObj?.id) {
                syncedPrefixes.add(String(link.subnet));
                summary.prefixesSynced++;
              }
            } catch (e: any) {
              summary.errors.push(`Prefix ${link.subnet}: ${e.message}`);
            }
          }
        }
      } catch (e: any) {
        summary.errors.push(`Circuit sync: ${e.message}`);
      }
    }

    // 4. Synchronisation des Équipements DCIM :
    //    - Serveurs Bare-Metal Sylva (Pools sylva-cnf-sriov-dpdk & sylva-standard-nis2)
    //    - Nœuds Externes Fictifs 3GPP NRM (ext-mme-lot3-01, ext-ran-cell-mobile-01)
    //    - Nœuds Internes de Médiation & Cœur Lot 1 (secgw-lot1-01, dea-lot1-01, hss-lot1-01)
    const deviceIdMap = new Map<string, string>();
    if (defaultLocationId) {
      const mfrDell = await getOrCreateByQuery(
        '/api/dcim/manufacturers/',
        'name=Dell',
        {
          name: 'Dell',
          description: 'Dell Technologies'
        },
        true,
        clientOpts
      );
      const mfrHpe = await getOrCreateByQuery(
        '/api/dcim/manufacturers/',
        'name=HPE',
        {
          name: 'HPE',
          description: 'Hewlett Packard Enterprise'
        },
        true,
        clientOpts
      );
      const mfr3gpp = await getOrCreateByQuery(
        '/api/dcim/manufacturers/',
        `name=${encodeURIComponent('3GPP-Telco-NRM')}`,
        {
          name: '3GPP-Telco-NRM',
          description: '3GPP TS 28.620 / 28.541 Network Resource Model Functions'
        },
        true,
        clientOpts
      );

      const dtR750 = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('PowerEdge R750')}`,
        {
          manufacturer: mfrDell.id,
          model: 'PowerEdge R750',
          part_number: 'R750-TELCO-SRIOV-DPDK'
        },
        true,
        clientOpts
      );
      const dtDl380 = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('ProLiant DL380')}`,
        {
          manufacturer: mfrHpe.id,
          model: 'ProLiant DL380',
          part_number: 'DL380-SYLVA-NIS2'
        },
        true,
        clientOpts
      );
      const dt3gppShadow = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('ExternalFunction-3GPP-Shadow')}`,
        {
          manufacturer: mfr3gpp.id,
          model: 'ExternalFunction-3GPP-Shadow',
          part_number: '3GPP-TS28620-EXT'
        },
        true,
        clientOpts
      );
      const dtMediationCnf = await getOrCreateByQuery(
        '/api/dcim/device-types/',
        `model=${encodeURIComponent('Sylva-CNF-Appliance')}`,
        {
          manufacturer: mfr3gpp.id,
          model: 'Sylva-CNF-Appliance',
          part_number: 'SYLVA-CNF-L1'
        },
        true,
        clientOpts
      );

      const roleWorker = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('telco-baremetal-worker')}`,
        {
          name: 'telco-baremetal-worker',
          color: '2196f3',
          content_types: ['dcim.device'],
          description: 'Nœud Bare-Metal Sylva (CAPM3 / RKE2)'
        },
        true,
        clientOpts
      );
      const roleShadow = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('external-3gpp-shadow')}`,
        {
          name: 'external-3gpp-shadow',
          color: 'ff9800',
          content_types: ['dcim.device'],
          description: 'Équipement Tiers Externe (Shadow Object 3GPP TS 28.620 ExternalFunction)'
        },
        true,
        clientOpts
      );
      const roleMediation = await getOrCreateByQuery(
        '/api/extras/roles/',
        `name=${encodeURIComponent('mediation-core-cnf')}`,
        {
          name: 'mediation-core-cnf',
          color: '4caf50',
          content_types: ['dcim.device'],
          description: 'Fonction réseau interne du graphe de réconciliation (passerelle, médiation, cœur)'
        },
        true,
        clientOpts
      );

      const platSylva = await ensurePlatform('sylva-capm3-rke2', 'Plateforme Bare-Metal Sylva (CAPM3 / RKE2)');
      const platShadow = await ensurePlatform('3gpp-external-nrm', 'Équipement Tiers Externe 3GPP TS 28.620');
      const platMediation = await ensurePlatform('sylva-cnf-mediation', 'Fonction Réseau CNF Médiation & Cœur');

      const syncDeviceInterfacesAndIps = async (
        deviceId: string,
        deviceName: string,
        ifaces: Array<{ name: string; type: string; ip?: string }>,
        zoneHints: string[],
        profileLabel: string
      ): Promise<void> => {
        let primaryIp4Id: string | null = null;
        const matchedZoneSlug = zoneHints[0]?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
        const zoneVrfId = matchedZoneSlug ? vrfIdMap.get(matchedZoneSlug) : undefined;

        for (const iface of ifaces) {
          try {
            const ifaceName = String(iface.name);
            const ifaceType = String(iface.type || 'data');
            const isMgmt = ifaceType.toLowerCase() === 'management' || ifaceType.toLowerCase() === 'oob';
            const ifaceObj = await getOrCreateByQuery(
              '/api/dcim/interfaces/',
              `device_id=${deviceId}&name=${encodeURIComponent(ifaceName)}`,
              {
                device: deviceId,
                name: ifaceName,
                type: mapNautobotInterfaceType(ifaceType),
                mgmt_only: isMgmt,
                enabled: true,
                status: statusPlanned,
                description: `Interface ${ifaceType} (${profileLabel})`
              },
              true,
              clientOpts
            );
            if (ifaceObj?.id) {
              summary.interfacesSynced++;
            }

            if (iface.ip) {
              const rawIp = String(iface.ip).trim();
              const ipCidr = rawIp.includes('/') ? rawIp : `${rawIp}/24`;
              const netPrefix = cidrToNetworkPrefix(ipCidr);
              if (netPrefix && !syncedPrefixes.has(netPrefix)) {
                const pfxPayload: Record<string, unknown> = {
                  prefix: netPrefix,
                  status: statusPlanned,
                  description: `Préfixe ${ifaceType} (${deviceName}:${ifaceName})`
                };
                if (defaultNamespaceId) pfxPayload.namespace = defaultNamespaceId;
                if (pivotTenantUuid) pfxPayload.tenant = pivotTenantUuid;
                if (!isMgmt && zoneVrfId) pfxPayload.vrf = zoneVrfId;
                if (projectTag) pfxPayload.tags = [projectTag];

                const devPfxQuery =
                  scope && defaultNamespaceId
                    ? `prefix=${encodeURIComponent(netPrefix)}&namespace=${encodeURIComponent(defaultNamespaceId)}`
                    : `prefix=${encodeURIComponent(netPrefix)}`;
                const pfxObj = await getOrCreateByQuery(
                  '/api/ipam/prefixes/',
                  devPfxQuery,
                  pfxPayload,
                  true,
                  clientOpts
                );
                if (pfxObj?.id) {
                  syncedPrefixes.add(netPrefix);
                  summary.prefixesSynced++;
                }
              }

              const ipPayload: Record<string, unknown> = {
                address: ipCidr,
                status: statusPlanned,
                dns_name: `${deviceName}.${ifaceName}.local`.toLowerCase(),
                description: `Adresse ${ifaceType} sur ${deviceName}:${ifaceName}`
              };
              if (defaultNamespaceId) ipPayload.namespace = defaultNamespaceId;

              const ipQuery =
                scope && defaultNamespaceId
                  ? `address=${encodeURIComponent(ipCidr)}&namespace=${encodeURIComponent(defaultNamespaceId)}`
                  : `address=${encodeURIComponent(ipCidr)}`;
              const ipObj = await getOrCreateByQuery(
                '/api/ipam/ip-addresses/',
                ipQuery,
                ipPayload,
                true,
                clientOpts
              );
              if (ipObj?.id) {
                summary.ipAddressesSynced++;
                if (ifaceObj?.id) {
                  try {
                    await getOrCreateByQuery(
                      '/api/ipam/ip-address-to-interface/',
                      `ip_address=${ipObj.id}&interface=${ifaceObj.id}`,
                      { ip_address: ipObj.id, interface: ifaceObj.id },
                      false,
                      clientOpts
                    );
                  } catch {
                    // Ignorer si l'association IP ↔ Interface n'est pas supportée par l'instance cible
                  }
                }
                if (isMgmt && !primaryIp4Id) {
                  primaryIp4Id = String(ipObj.id);
                }
              }
            }
          } catch (e: any) {
            summary.errors.push(`Interface ${deviceName}:${iface.name}: ${e.message}`);
          }
        }

        if (primaryIp4Id) {
          try {
            // Idempotent (#376) : aucune écriture si l'IP primaire est déjà celle attendue.
            const currentDev = await nbFetch(`/api/dcim/devices/${deviceId}/`, {}, clientOpts).catch(() => null);
            const currentPrimary = currentDev?.primary_ip4?.id ?? currentDev?.primary_ip4;
            if (currentPrimary === undefined || String(currentPrimary ?? '') !== String(primaryIp4Id)) {
              await nbFetch(
                `/api/dcim/devices/${deviceId}/`,
                { method: 'PATCH', body: JSON.stringify({ primary_ip4: primaryIp4Id }) },
                clientOpts
              );
            }
          } catch {
            // Ignorer si primary_ip4 ne peut être posé sur cette version/mock
          }
        }
      };

      // 4a. Serveurs Bare-Metal Sylva
      for (const dev of hydrated.nautobot_planned_devices || []) {
        try {
          const isHpe = String(dev.device_type).toLowerCase().includes('dl380');
          const devZoneIds = Array.isArray(dev.security_zones) ? dev.security_zones.map(String) : [];
          const devZoneTags: Array<{ name: string }> = [];
          for (const zId of devZoneIds) {
            const zTag = await ensureZoneTag(zId);
            if (zTag) devZoneTags.push({ name: zTag.name });
          }

          const scopedDevName = scopedNautobotName(String(dev.name), scope, 64);
          const devPayload: Record<string, unknown> = {
            name: scopedDevName,
            device_type: isHpe ? dtDl380.id : dtR750.id,
            role: roleWorker.id,
            location: defaultLocationId,
            status: statusPlanned,
            comments: `Pool Sylva : ${dev.cluster_pool || 'sylva-default'} | Profil : ${dev.dataplane_profile || 'Standard'} | OOB : ${dev.oob_ip} | PDU : ${(dev.power_feeds as string[] || []).join(' + ')}`
          };
          if (platSylva) devPayload.platform = platSylva;
          if (satisfiedClauses.length > 0) {
            devPayload.custom_fields = { satisfied_clauses: satisfiedClausesStr };
          }
          const combinedTags = withProjectTags([...clauseTags, ...devZoneTags]);
          if (combinedTags.length > 0) {
            devPayload.tags = combinedTags;
          }

          const devObj = await getOrCreateByQuery(
            '/api/dcim/devices/',
            `name=${encodeURIComponent(scopedDevName)}`,
            devPayload,
            true,
            clientOpts
          );
          if (devObj?.id) {
            deviceIdMap.set(String(dev.name), devObj.id);
            summary.devicesSynced++;

            const rawIfaces = Array.isArray(dev.interfaces)
              ? (dev.interfaces as Array<{ name: string; type: string; ip?: string }>)
              : [];
            const ifacesToSync = [...rawIfaces];
            if (dev.oob_ip && !ifacesToSync.some((i) => i.type === 'management' || i.name === 'oob0')) {
              ifacesToSync.unshift({ name: 'oob0', type: 'management', ip: `${dev.oob_ip}/24` });
            }
            // Un équipement existant non marqué n'est jamais modifié : on ne lui rattache ni interface, ni IP (#376).
            if (!isSkippedUnmarked(devObj)) await syncDeviceInterfacesAndIps(
              String(devObj.id),
              scopedDevName,
              ifacesToSync,
              devZoneIds,
              String(dev.dataplane_profile || 'Sylva')
            );
          }
        } catch (e: any) {
          summary.errors.push(`Device ${dev.name}: ${e.message}`);
        }
      }

      const underlayEndpoints = new Set<string>();
      for (const link of rg?.ip_underlay_links || []) {
        if (link.endpoint_a) underlayEndpoints.add(String(link.endpoint_a));
        if (link.endpoint_z) underlayEndpoints.add(String(link.endpoint_z));
      }

      // 4b. Équipements externes (objets fantômes 3GPP NRM) déclarés par le graphe
      for (const ext of rg?.external_shadow_nodes || []) {
        try {
          const extTenantUuid = tenantIdMap.get(String(ext.tenant_ref)) || pivotTenantUuid;
          const extZoneTags: Array<{ name: string }> = [];
          if (ext.zone) {
            const zTag = await ensureZoneTag(String(ext.zone));
            if (zTag) extZoneTags.push({ name: zTag.name });
          }

          const scopedExtName = scopedNautobotName(String(ext.id), scope, 64);
          const payload: Record<string, unknown> = {
            name: scopedExtName,
            device_type: dt3gppShadow.id,
            role: roleShadow.id,
            location: defaultLocationId,
            status: statusPlanned,
            comments: `3GPP TS 28.620 ${ext.nrm_3gpp_class} (Shadow Object hors contrôle du projet) | Zone : ${ext.zone} | Tenant : ${ext.tenant_ref}`
          };
          if (platShadow) payload.platform = platShadow;
          if (extTenantUuid) payload.tenant = extTenantUuid;
          const allExtTags = withProjectTags(extZoneTags);
          if (allExtTags.length > 0) payload.tags = allExtTags;

          const extObj = await getOrCreateByQuery(
            '/api/dcim/devices/',
            `name=${encodeURIComponent(scopedExtName)}`,
            payload,
            true,
            clientOpts
          );
          if (extObj?.id) {
            deviceIdMap.set(String(ext.id), extObj.id);
            summary.devicesSynced++;
            if (underlayEndpoints.has(String(ext.id))) {
              // Un équipement existant non marqué n'est jamais modifié : on ne lui rattache ni interface, ni IP (#376).
              if (!isSkippedUnmarked(extObj)) await syncDeviceInterfacesAndIps(
                String(extObj.id),
                scopedExtName,
                [{ name: 'eth-interco', type: 'data' }],
                ext.zone ? [String(ext.zone)] : [],
                '3GPP External Interco'
              );
            }
          }
        } catch (e: any) {
          summary.errors.push(`Shadow node ${ext.id}: ${e.message}`);
        }
      }

      // 4c. Nœuds internes de médiation et de cœur déclarés par le graphe
      for (const node of rg?.internal_mediation_nodes || []) {
        try {
          const nodeZoneTags: Array<{ name: string }> = [];
          if (node.zone) {
            const zTag = await ensureZoneTag(String(node.zone));
            if (zTag) nodeZoneTags.push({ name: zTag.name });
          }

          const scopedNodeName = scopedNautobotName(String(node.id), scope, 64);
          const payload: Record<string, unknown> = {
            name: scopedNodeName,
            device_type: dtMediationCnf.id,
            role: roleMediation.id,
            location: defaultLocationId,
            status: statusPlanned,
            comments: `3GPP ${node.nrm_3gpp_class} — ${node.role} | Zone : ${node.zone}`
          };
          if (platMediation) payload.platform = platMediation;
          const nodeTenantUuid = node.tenant_ref ? tenantIdMap.get(String(node.tenant_ref)) || null : null;
          if (nodeTenantUuid) {
            payload.tenant = nodeTenantUuid;
          }
          const allNodeTags = withProjectTags(nodeZoneTags);
          if (allNodeTags.length > 0) payload.tags = allNodeTags;

          const nodeObj = await getOrCreateByQuery(
            '/api/dcim/devices/',
            `name=${encodeURIComponent(scopedNodeName)}`,
            payload,
            true,
            clientOpts
          );
          if (nodeObj?.id) {
            deviceIdMap.set(String(node.id), nodeObj.id);
            summary.devicesSynced++;
            if (underlayEndpoints.has(String(node.id))) {
              // Un équipement existant non marqué n'est jamais modifié : on ne lui rattache ni interface, ni IP (#376).
              if (!isSkippedUnmarked(nodeObj)) await syncDeviceInterfacesAndIps(
                String(nodeObj.id),
                scopedNodeName,
                [{ name: 'eth-interco', type: 'data' }],
                node.zone ? [String(node.zone)] : [],
                String(node.role || 'Mediation CNF')
              );
            }
          }
        } catch (e: any) {
          summary.errors.push(`Mediation node ${node.id}: ${e.message}`);
        }
      }
    }

    // 5. Module VPN Natif Nautobot 2.2+ (Issue #240) :
    //    Instanciation idempotente de vpn.IKEProposal, vpn.IPSecProposal, vpn.VPNProfile et vpn.VPNTunnel
    if (rg?.ipsec_tunnels && rg.ipsec_tunnels.length > 0) {
      for (const tun of rg.ipsec_tunnels) {
        try {
          if (!tun.id) continue; // un tunnel sans identifiant ne peut être ni nommé ni réconcilié
          const logicalTunId = String(tun.id);
          const tunId = scopedNautobotName(logicalTunId, scope, 100);
          const vpnNames = vpnObjectLogicalNames(logicalTunId);
          const ikePropName = scopedNautobotName(vpnNames.ikeProposal, scope, 100);
          const ipsecPropName = scopedNautobotName(vpnNames.ipsecProposal, scope, 100);
          const vpnProfName = scopedNautobotName(vpnNames.profile, scope, 100);
          const cipherSuite = String(tun.cipher_suite || 'unspecified');
          const dhGroup = String(tun.pfs_dh_group || 'unspecified');

          // 5a. vpn.IKEProposal
          const ikeProposal = await getOrCreateByQuery(
            '/api/vpn/ike-proposals/',
            `name=${encodeURIComponent(ikePropName)}`,
            {
              name: ikePropName,
              authentication_method: 'Certificate',
              encryption_algorithm: cipherSuite,
              authentication_algorithm: 'HMAC-SHA2-384',
              group: '20',
              sa_lifetime: 28800,
              description: `IKEv2 Proposal du tunnel ${logicalTunId} — ${cipherSuite} / ${dhGroup}`
            },
            true,
            clientOpts
          );

          // 5b. vpn.IPSecProposal
          const ipsecProposal = await getOrCreateByQuery(
            '/api/vpn/ipsec-proposals/',
            `name=${encodeURIComponent(ipsecPropName)}`,
            {
              name: ipsecPropName,
              protocol: 'ESP',
              encryption_algorithm: cipherSuite,
              authentication_algorithm: 'HMAC-SHA2-384',
              sa_lifetime_seconds: 3600,
              description: `IPsec ESP Proposal du tunnel ${logicalTunId} — ${cipherSuite}`
            },
            true,
            clientOpts
          );

          // 5c. vpn.VPNProfile
          const vpnProfilePayload: Record<string, unknown> = {
            name: vpnProfName,
            description: `Profil VPN du tunnel ${logicalTunId} (${cipherSuite}, PFS ${dhGroup})`,
            keepalive_enabled: true,
            keepalive_interval: Number(tun.dpd_timeout_sec || 10),
            keepalive_retries: 3
          };
          if (ikeProposal?.id) {
            vpnProfilePayload.ike_proposals = [ikeProposal.id];
          }
          if (ipsecProposal?.id) {
            vpnProfilePayload.ipsec_proposals = [ipsecProposal.id];
          }
          if (pivotTenantUuid) {
            vpnProfilePayload.tenant = pivotTenantUuid;
          }

          const vpnProfile = await getOrCreateByQuery(
            '/api/vpn/vpn-profiles/',
            `name=${encodeURIComponent(vpnProfName)}`,
            vpnProfilePayload,
            true,
            clientOpts
          );

          // 5d. vpn.VPNTunnel
          const tunnelPayload: Record<string, unknown> = {
            name: tunId,
            tunnel_id: tunId,
            status: statusPlanned,
            encapsulation: 'IPsec-Transport',
            description: `Tunnel IPsec ESP (${tun.termination_a} <-> ${tun.termination_z}) | Suite : ${cipherSuite} | Underlay : ${tun.underlay_link_ref}`
          };
          if (vpnProfile?.id) {
            tunnelPayload.vpn_profile = vpnProfile.id;
          }
          if (pivotTenantUuid) {
            tunnelPayload.tenant = pivotTenantUuid;
          }
          if (projectTag) {
            tunnelPayload.tags = [projectTag];
          }

          const vpnTunnelObj = await getOrCreateByQuery(
            '/api/vpn/vpn-tunnels/',
            `name=${encodeURIComponent(tunId)}`,
            tunnelPayload,
            true,
            clientOpts
          );

          if (vpnTunnelObj?.id) {
            summary.vpnTunnelsSynced++;
          }
        } catch (e: any) {
          summary.errors.push(`VPN Tunnel ${tun.id}: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    summary.errors.push(e.message);
  }

  summary.plan = planSink;
  summary.planSummary = summarizeSyncPlan(planSink);
  return summary;
}

/**
 * Collecte en temps réel (Pull SSoT — Issue #239) l'état courant des objets dans Nautobot 2.x
 * (`GET /api/dcim/devices/`, `/api/circuits/circuits/`, `/api/tenancy/tenants/`, `/api/vpn/`)
 * lors de l'exécution de l'Oracle OPA, afin que toute modification manuelle effectuée par un opérateur
 * dans l'interface web de Nautobot (`http://localhost:8080`) soit immédiatement reflétée dans
 * l'inventaire évalué par `multi_axis_refinement.rego`.
 */
export async function pullLiveInventoryFromNautobot(
  baselineHydrated: MultiAxisHydratedInventory,
  clientOpts: NautobotClientOptions = {}
): Promise<NautobotLivePullResult> {
  const scope = clientOpts.projectScope ? normalizeProjectScope(clientOpts.projectScope) : undefined;
  const tagFilter = scope ? `&tag=${encodeURIComponent(projectTagName(scope))}` : '';
  const cloned: MultiAxisHydratedInventory = JSON.parse(JSON.stringify(baselineHydrated));
  const driftCtx = clientOpts.driftContext || {};
  const findingProjectId = driftCtx.projectId || scope || 'default';
  const findingSourceEvent = driftCtx.sourceEvent || `nautobot_pull:${new Date().toISOString()}`;
  const buildFindingBase = (liveObj?: Record<string, any> | null) => {
    const markers = extractArchinexMarkers(liveObj);
    const hasMarkers = hasTraceabilityMarkers(markers);
    const subjectId = markers.subjectId ?? driftCtx.subjectId ?? null;
    const decisionId = markers.decisionId ?? driftCtx.decisionId ?? null;
    const clauseRefs =
      markers.clauseRefs.length > 0 ? markers.clauseRefs : driftCtx.clauseRefs || [];
    const outOfDecision = !hasMarkers && !decisionId && !subjectId;
    return {
      projectId: markers.projectId || findingProjectId,
      subjectId,
      decisionId,
      clauseRefs,
      outOfDecision,
      sourceEvent: findingSourceEvent
    };
  };
  const result: NautobotLivePullResult = {
    reachable: false,
    source: 'local_fallback',
    ...(scope ? { projectScope: scope } : {}),
    inventory: cloned,
    observedCounts: {
      devices: 0,
      circuits: 0,
      tenants: 0,
      vpnTunnels: 0
    },
    findings: [],
    detectedDrifts: [],
    errors: []
  };

  try {
    await nbFetch('/api/status/', {}, clientOpts);
    result.reachable = true;
    result.source = 'nautobot_live';
  } catch (err: any) {
    const baseUrl = clientOpts.baseUrl || DEFAULT_NAUTOBOT_URL;
    result.errors.push(`Nautobot injoignable (${baseUrl}) : ${err?.message || String(err)}`);
    return result;
  }

  try {
    // 1. Lecture en direct des Tenants (/api/tenancy/tenants/)
    const tenantsRes = await nbFetch(`/api/tenancy/tenants/?limit=100${tagFilter}`, {}, clientOpts);
    const rawTenants: any[] = Array.isArray(tenantsRes?.results) ? tenantsRes.results : [];
    const liveTenants = scope
      ? rawTenants.filter((t) => belongsToProjectScope(String(t?.name || ''), scope))
      : rawTenants;
    result.observedCounts.tenants = liveTenants.length;

        if (liveTenants.length > 0 && cloned.reconciliation_graph) {
      const liveTenantNames = new Set(
        liveTenants.map((t) => unscopeNautobotName(String(t.name), scope))
      );
      const filteredOrgs = (cloned.reconciliation_graph.partner_organizations || []).filter((org) =>
        liveTenantNames.has(String(org.id))
      );
      const missingOrgs = (cloned.reconciliation_graph.partner_organizations || []).filter(
        (org) => !liveTenantNames.has(String(org.id))
      );
      if (
        filteredOrgs.length < (cloned.reconciliation_graph.partner_organizations || []).length
      ) {
        result.detectedDrifts.push(
          `Tenant partenaire '${missingOrgs.map((o) => String(o.id)).join("', '")}' absent ou supprimé dans Nautobot (/api/tenancy/tenants/)`
        );
        for (const missingOrg of missingOrgs) {
          result.findings.push({
            ...buildFindingBase(null),
            objectRef: {
              type: 'tenancy.tenant',
              id: String(missingOrg.id),
              name: String(missingOrg.id)
            },
            kind: 'missing',
            attributeKey: 'tenant_missing',
            expected: { id: missingOrg.id, name: missingOrg.id },
            observed: null,
            severity: 'high'
          });
        }
      }
      cloned.reconciliation_graph.partner_organizations = filteredOrgs;
    }

    // 2. Lecture en direct des Équipements DCIM (/api/dcim/devices/)
    const devicesRes = await nbFetch(`/api/dcim/devices/?limit=100${tagFilter}`, {}, clientOpts);
    const rawDevices: any[] = Array.isArray(devicesRes?.results) ? devicesRes.results : [];
    const liveDevices = scope
      ? rawDevices.filter((d) => belongsToProjectScope(String(d?.name || ''), scope))
      : rawDevices;
    result.observedCounts.devices = liveDevices.length;

    const liveDeviceByName = new Map<string, any>();
    for (const d of liveDevices) {
      if (d?.name) {
        liveDeviceByName.set(unscopeNautobotName(String(d.name), scope), d);
      }
    }

    const plannedDeviceNames = new Set<string>();
    for (const plannedDev of cloned.nautobot_planned_devices || []) {
      const devName = String(plannedDev.name);
      plannedDeviceNames.add(devName);
      const liveDev = liveDeviceByName.get(devName);
      if (!liveDev) continue;
      const devRef = {
        type: 'dcim.device',
        id: String(liveDev.id || devName),
        name: devName
      };
      const base = buildFindingBase(liveDev);

      // Modèle matériel (device_type)
      const liveModel =
        liveDev.device_type?.model ||
        liveDev.device_type?.display ||
        (typeof liveDev.device_type === 'string' ? liveDev.device_type : undefined);
      if (liveModel) {
        const normalizedModel = String(liveModel).toLowerCase();
        let mappedType = String(liveModel);
        if (normalizedModel.includes('r750')) {
          mappedType = 'Dell-PowerEdge-R750-Telco';
        } else if (normalizedModel.includes('dl380')) {
          mappedType = 'HPE-ProLiant-DL380-Gen11';
        }
        if (mappedType !== plannedDev.device_type) {
          result.detectedDrifts.push(
            `Device '${devName}' modifié dans Nautobot : device_type='${mappedType}' (attendu: '${plannedDev.device_type}')`
          );
          result.findings.push({
            ...base,
            objectRef: devRef,
            kind: 'attribute_mismatch',
            attributeKey: 'device_type',
            expected: plannedDev.device_type,
            observed: mappedType,
            severity: 'high'
          });
          plannedDev.device_type = mappedType;
        }
      }

      // Statut Nautobot (Planned vs Active/Offline/Decommissioning...)
      const liveStatus =
        liveDev.status?.value ||
        liveDev.status?.name ||
        (typeof liveDev.status === 'string' ? liveDev.status : undefined);
      if (liveStatus) {
        // Le statut est un champ RÉALISÉ (#398) : une progression légitime posée par un connecteur n'est pas un écart ;
        // un recul ou une panne est une régression ; un statut inconnu reste signalé (jamais ignoré).
        const observation = evaluateStatusObservation(plannedDev.status, liveStatus);
        if (observation.verdict !== 'unchanged') {
          if (observation.verdict !== 'progress') {
            const regression = observation.verdict === 'regression';
            result.detectedDrifts.push(
              `Device '${devName}' modifié dans Nautobot : status='${observation.observed}' (attendu: '${observation.expected}') : ${observation.reason}`
            );
            result.findings.push({
              ...base,
              objectRef: devRef,
              kind: regression ? 'status_regression' : 'attribute_mismatch',
              attributeKey: 'status',
              expected: observation.expected,
              observed: observation.observed,
              severity: regression ? 'high' : 'medium'
            });
          }
          plannedDev.status = observation.observed;
        }
      }

      // Inspection des métadonnées OOB et PDU éventuellement surchargées dans comments ou custom_fields
      const cf = liveDev._custom_field_data || liveDev.custom_fields || {};
      if (typeof cf.oob_ip === 'string') {
        if (cf.oob_ip !== plannedDev.oob_ip) {
          result.detectedDrifts.push(
            `Device '${devName}' modifié dans Nautobot : oob_ip='${cf.oob_ip}'`
          );
          result.findings.push({
            ...base,
            objectRef: devRef,
            kind: 'attribute_mismatch',
            attributeKey: 'oob_ip',
            expected: plannedDev.oob_ip,
            observed: cf.oob_ip,
            severity: 'high'
          });
          plannedDev.oob_ip = cf.oob_ip;
        }
      } else if (typeof liveDev.comments === 'string') {
        const oobMatch = liveDev.comments.match(/OOB\s*:\s*([^\s|]+)/i);
        if (oobMatch && oobMatch[1]) {
          const parsedOob = oobMatch[1].trim();
          const finalOob =
            parsedOob.toLowerCase() === 'none' || parsedOob.toLowerCase() === 'aucune'
              ? ''
              : parsedOob;
          if (finalOob !== plannedDev.oob_ip) {
            result.detectedDrifts.push(
              `Device '${devName}' modifié dans Nautobot (comments OOB) : oob_ip='${finalOob}'`
            );
            result.findings.push({
              ...base,
              objectRef: devRef,
              kind: 'attribute_mismatch',
              attributeKey: 'oob_ip',
              expected: plannedDev.oob_ip,
              observed: finalOob,
              severity: 'high'
            });
            plannedDev.oob_ip = finalOob;
          }
        }
        const pduMatch = liveDev.comments.match(/PDU\s*:\s*([^|\n]+)/i);
        if (pduMatch && pduMatch[1]) {
          const feeds = pduMatch[1]
            .split('+')
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (feeds.length > 0 && feeds.length !== (plannedDev.power_feeds as any[])?.length) {
            result.detectedDrifts.push(
              `Device '${devName}' modifié dans Nautobot (comments PDU) : ${feeds.length} alimentation(s)`
            );
            result.findings.push({
              ...base,
              objectRef: devRef,
              kind: 'attribute_mismatch',
              attributeKey: 'power_feeds',
              expected: plannedDev.power_feeds,
              observed: feeds,
              severity: 'medium'
            });
            plannedDev.power_feeds = feeds;
          }
        }
      }
    }

    // Détecter les équipements présents dans Nautobot mais absents de l'intention planifiée
    for (const [devName, liveDev] of liveDeviceByName.entries()) {
      if (plannedDeviceNames.has(devName)) continue;
      const markers = extractArchinexMarkers(liveDev);
      const unmarked = !hasTraceabilityMarkers(markers);
      if (unmarked) {
        result.findings.push({
          projectId: markers.projectId || findingProjectId,
          subjectId: null,
          decisionId: null,
          clauseRefs: [],
          objectRef: {
            type: 'dcim.device',
            id: String(liveDev.id || devName),
            name: devName
          },
          kind: 'unexpected',
          attributeKey: 'out_of_decision',
          outOfDecision: true,
          expected: null,
          observed: { name: devName, status: liveDev.status?.value || liveDev.status || null },
          severity: 'medium',
          sourceEvent: findingSourceEvent
        });
      }
    }

    // Vérifier aussi si un bond de médiation obligatoire du flux a été désactivé / décommissionné dans Nautobot
    const firstFlow = cloned.reconciliation_graph?.service_mediation_flows?.[0];
    if (firstFlow) {
      const declaredHops = Array.isArray(firstFlow.mandatory_mediation_hops)
        ? (firstFlow.mandatory_mediation_hops as string[])
        : [];
      const failedHops = new Set<string>();
      for (const hop of declaredHops) {
        const liveHop = liveDeviceByName.get(String(hop));
        if (!liveHop) continue;
        const hopStatus = String(
          liveHop.status?.value || liveHop.status?.name || liveHop.status || ''
        ).toLowerCase();
        if (['offline', 'decommissioning', 'retired', 'failed'].includes(hopStatus)) {
          failedHops.add(String(hop));
          result.detectedDrifts.push(
            `Nœud de médiation '${hop}' marqué '${hopStatus}' dans Nautobot -> contournement de la médiation détecté`
          );
        }
      }
      if (failedHops.size > 0) {
        firstFlow.mandatory_mediation_hops = declaredHops.filter((h) => !failedHops.has(String(h)));
      }
    }

    // 3. Lecture en direct des Circuits (/api/circuits/circuits/)
    const circuitsRes = await nbFetch(`/api/circuits/circuits/?limit=100${tagFilter}`, {}, clientOpts);
    const rawCircuits: any[] = Array.isArray(circuitsRes?.results) ? circuitsRes.results : [];
    const liveCircuits = scope
      ? rawCircuits.filter((c) => belongsToProjectScope(String(c?.cid || ''), scope))
      : rawCircuits;
    result.observedCounts.circuits = liveCircuits.length;

    if (liveCircuits.length > 0 && cloned.reconciliation_graph?.ip_underlay_links?.[0]) {
      const targetCid = String(cloned.reconciliation_graph.ip_underlay_links[0].id);
      const liveCircuit = liveCircuits.find(
        (c) => unscopeNautobotName(String(c.cid), scope) === targetCid
      );
      if (liveCircuit) {
        // Si un opérateur a détaché le Tenant du circuit dans Nautobot
        const circuitTenantName =
          liveCircuit.tenant?.name ||
          liveCircuit.tenant?.display ||
          (typeof liveCircuit.tenant === 'string' ? liveCircuit.tenant : null);
        if (!circuitTenantName) {
          result.detectedDrifts.push(
            `Circuit '${targetCid}' orphelin de Tenant dans Nautobot (/api/circuits/circuits/)`
          );
          if (cloned.reconciliation_graph.service_mediation_flows?.[0]) {
            cloned.reconciliation_graph.service_mediation_flows[0].tenant_ref = 'ORPHAN_NO_TENANT';
          }
        }
        // Si les commentaires du circuit mentionnent un bypass DEA
        if (
          typeof liveCircuit.comments === 'string' &&
          /bypass|contournement/i.test(liveCircuit.comments) &&
          cloned.reconciliation_graph.service_mediation_flows?.[0]
        ) {
          result.detectedDrifts.push(
            `Circuit '${targetCid}' modifié dans Nautobot : contournement de la médiation déclaré`
          );
          const hopsBefore = cloned.reconciliation_graph.service_mediation_flows[0].mandatory_mediation_hops;
          cloned.reconciliation_graph.service_mediation_flows[0].mandatory_mediation_hops = Array.isArray(hopsBefore)
            ? hopsBefore.slice(0, -1)
            : [];
        }
      }
    }

    // 4. Lecture en direct du Module VPN Nautobot 2.2+ (/api/vpn/ipsec-proposals/ & /api/vpn/vpn-tunnels/)
    try {
      const ipsecPropsRes = await nbFetch('/api/vpn/ipsec-proposals/?limit=50', {}, clientOpts);
      const liveIpsecProps: any[] = Array.isArray(ipsecPropsRes?.results)
        ? ipsecPropsRes.results
        : [];
      const firstTunnel = cloned.reconciliation_graph?.ipsec_tunnels?.[0];
      const expectedIpsecPropName = firstTunnel?.id
        ? vpnObjectLogicalNames(String(firstTunnel.id)).ipsecProposal
        : null;
      const targetProp = expectedIpsecPropName
        ? liveIpsecProps.find(
            (p) =>
              belongsToProjectScope(String(p.name || ''), scope) &&
              unscopeNautobotName(String(p.name), scope) === expectedIpsecPropName
          )
        : undefined;
      if (targetProp && cloned.reconciliation_graph?.ipsec_tunnels?.[0]) {
        const liveAlgo =
          targetProp.encryption_algorithm?.value ||
          targetProp.encryption_algorithm?.name ||
          targetProp.encryption_algorithm;
        const expectedAlgo = String(cloned.reconciliation_graph.ipsec_tunnels[0].cipher_suite || '');
        if (liveAlgo && expectedAlgo && String(liveAlgo).toUpperCase() !== expectedAlgo.toUpperCase()) {
          result.detectedDrifts.push(
            `Proposition IPsec '${targetProp.name}' dégradée dans Nautobot : encryption_algorithm='${liveAlgo}' (attendu: '${expectedAlgo}')`
          );
          cloned.reconciliation_graph.ipsec_tunnels[0].cipher_suite = String(liveAlgo);
        }
      }

      const vpnTunnelsRes = await nbFetch(
        `/api/vpn/vpn-tunnels/?limit=50${tagFilter}`,
        {},
        clientOpts
      );
      const rawVpnTunnels: any[] = Array.isArray(vpnTunnelsRes?.results)
        ? vpnTunnelsRes.results
        : [];
      const liveVpnTunnels = scope
        ? rawVpnTunnels.filter((t) => belongsToProjectScope(String(t?.name || ''), scope))
        : rawVpnTunnels;
      result.observedCounts.vpnTunnels = liveVpnTunnels.length;
    } catch {
      // Module VPN optionnel si instance < 2.2
    }
  } catch (e: any) {
    result.errors.push(e.message);
  }

  return result;
}
