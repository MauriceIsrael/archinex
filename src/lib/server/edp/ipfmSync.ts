import { createHash } from 'node:crypto';
import type { MultiAxisHydratedInventory } from './refinementCoverage.js';

const DEFAULT_IPFM_URL = process.env.IPFM_URL || 'http://localhost:8001';

export interface IpFlowManagerClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ArmBuildOptions {
  projectId?: string;
  subjectId: string;
  revision?: number | string;
  sensitivity?: 'public' | 'dr';
}

export interface ArmEnvelope {
  snapshotId: string;
  sourceSystem: 'architecture-studio';
  schemaVersion: '1.6';
  createdAt: string;
  checksum: string;
  sensitivity: string;
  sensitivityLabel: string;
  data: Record<string, unknown>;
}

export interface IpfmSyncSummary {
  reachable: boolean;
  baseUrl: string;
  armImported: boolean;
  nautobotSyncTriggered: boolean;
  snapshotId: string;
  checksum: string;
  created: number;
  updated: number;
  totalChanges: number;
  datasetsCounts: {
    environments: number;
    sites: number;
    equipment: number;
    zones: number;
    zonePolicies: number;
    applications: number;
    serviceEndpoints: number;
    flows: number;
    redundancyGroups: number;
  };
  errors: string[];
}

export interface IpfmHealthResult {
  available: boolean;
  url: string;
  version?: string;
  error?: string;
}

export function getIpFlowManagerUrl(): string {
  return (process.env.IPFM_URL || DEFAULT_IPFM_URL).replace(/\/+$/, '');
}

/**
 * Sérialisation canonique conforme au profil `contracts/canonical-json.md` v1 :
 * clés triées par unités de code UTF-16 (`Array.prototype.sort()`), `null` conservé,
 * `undefined` omis dans les objets, nombres formatés via `JSON.stringify`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('CANONICAL_NON_FINITE_NUMBER');
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new Error(`CANONICAL_UNSUPPORTED_TYPE: ${typeof value}`);
}

export function computeArmChecksum(data: Record<string, unknown>): string {
  const hash = createHash('sha256').update(canonicalJson(data), 'utf8').digest('hex');
  return `sha256:${hash}`;
}

function toSlug(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default'
  );
}

function mapSecurityLevel(isolationLevel: unknown): 'untrusted' | 'low' | 'medium' | 'high' {
  const val = String(isolationLevel || '').trim().toLowerCase();
  if (val.includes('untrust') || val.includes('external') || val.includes('public')) return 'untrusted';
  if (val.includes('low') || val.includes('dmz') || val.includes('partner')) return 'low';
  if (val.includes('medium') || val.includes('standard')) return 'medium';
  return 'high';
}

function mapEnvironmentType(code: string): string {
  const upper = code.toUpperCase();
  if (upper.includes('PROD') && !upper.includes('PRE') && !upper.includes('PPROD')) return 'production';
  if (upper.includes('PPROD') || upper.includes('PREPROD') || upper.includes('STAG') || upper.includes('RECETTE')) {
    return 'preproduction';
  }
  if (upper.includes('DEV')) return 'development';
  return 'lab';
}

function inferEquipmentKind(name: string, role: string): string {
  const text = `${name} ${role}`.toLowerCase();
  if (text.includes('secgw') || text.includes('fw') || text.includes('firewall')) return 'firewall';
  if (text.includes('dea') || text.includes('dra') || text.includes('router')) return 'routing-function';
  if (text.includes('lb') || text.includes('load')) return 'load-balancer';
  if (text.includes('sw') || text.includes('switch') || text.includes('tor')) return 'switch';
  return 'server';
}

/**
 * Construit une enveloppe ARM 1.6 (`ExternalSnapshotEnvelope<ArchitectureResourceManifest>`)
 * à partir de l'inventaire hydraté multi-axes d'Archinex, sans aucune clé réseau opérationnelle
 * interdite par la clause G2 d'IP Flow Manager (`arch_sync.FORBIDDEN_NETWORK_KEYS`).
 */
export function buildArmEnvelopeFromHydrated(
  hydrated: MultiAxisHydratedInventory,
  options: ArmBuildOptions
): ArmEnvelope {
  const nowUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const subjectSlug = toSlug(options.subjectId);
  const sensitivity = options.sensitivity || 'public';
  const sensitivityLabel =
    sensitivity === 'dr' ? 'DR — Diffusion Restreinte' : 'Public — Non classifié';

  const seenMaterializedRefs = new Set<string>();
  const claimRef = (ref: string): string => {
    let candidate = ref;
    let idx = 2;
    while (seenMaterializedRefs.has(candidate)) {
      candidate = `${ref}-${idx++}`;
    }
    seenMaterializedRefs.add(candidate);
    return candidate;
  };

  // 1. Environments
  const rawEnvs = Array.isArray(hydrated.environments) ? hydrated.environments : [];
  const envCodesSeen = new Set<string>();
  const environments: Array<Record<string, unknown>> = [];
  for (const env of rawEnvs) {
    const rawCode = String(env.env || env.code || 'PROD').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!rawCode || envCodesSeen.has(rawCode)) continue;
    envCodesSeen.add(rawCode);
    environments.push({
      architectureRef: claimRef(`environment:${rawCode}`),
      code: rawCode,
      name: String(env.name || rawCode),
      type: mapEnvironmentType(rawCode)
    });
  }
  if (environments.length === 0) {
    envCodesSeen.add('PROD');
    environments.push({
      architectureRef: claimRef('environment:PROD'),
      code: 'PROD',
      name: 'Production',
      type: 'production'
    });
  }
  const primaryEnvCodes = Array.from(envCodesSeen);

  // 2. Sites (Physical hierarchy)
  const siteRef = claimRef(`item:site-${subjectSlug}`);
  const dcRef = claimRef(`item:dc-${subjectSlug}`);
  const sites: Array<Record<string, unknown>> = [
    {
      architectureRef: siteRef,
      name: `Site ${options.subjectId}`,
      kind: 'site',
      parentRef: null
    },
    {
      architectureRef: dcRef,
      name: `DC ${options.subjectId}`,
      kind: 'datacenter',
      parentRef: siteRef,
      tier: 'III'
    }
  ];

  // 3. Zones (Security Zones)
  const zoneRefByKey = new Map<string, string>();
  const zones: Array<Record<string, unknown>> = [];
  for (const z of hydrated.security_zones || []) {
    const rawId = String(z.zone_id || z.title || 'default');
    const slug = toSlug(rawId);
    if (zoneRefByKey.has(slug)) continue;
    const zRef = claimRef(`item:zone-${slug}`);
    zoneRefByKey.set(slug, zRef);
    zones.push({
      architectureRef: zRef,
      name: String(z.title || rawId),
      zoneType: 'logical',
      cardinality: 'shared',
      securityLevel: mapSecurityLevel(z.isolation_level),
      purpose: `Zone ${rawId} (isolation: ${String(z.isolation_level || 'strict')})`,
      externalRefs: [
        {
          system: 'nautobot',
          ref: `tag:zone-${slug}`
        }
      ]
    });
  }

  // Ensure zones referenced by reconciliation_graph nodes exist in `zones[]`
  const rg = hydrated.reconciliation_graph;
  const externalShadowZones = new Set<string>(
    (rg?.external_shadow_nodes || [])
      .map((ext) => (ext.zone ? toSlug(String(ext.zone)) : ''))
      .filter(Boolean)
  );
  const ensureZoneRef = (zoneName: string): string => {
    const slug = toSlug(zoneName);
    const existing = zoneRefByKey.get(slug);
    if (existing) return existing;
    const zRef = claimRef(`item:zone-${slug}`);
    zoneRefByKey.set(slug, zRef);
    const isExternal = externalShadowZones.has(slug) || slug.includes('ext') || slug.includes('partner');
    zones.push({
      architectureRef: zRef,
      name: zoneName,
      zoneType: 'logical',
      cardinality: 'shared',
      securityLevel: isExternal ? 'untrusted' : 'medium',
      purpose: `Zone dérivée du graphe de réconciliation (${zoneName})`,
      externalRefs: [
        {
          system: 'nautobot',
          ref: `tag:zone-${slug}`
        }
      ]
    });
    return zRef;
  };

  // 4. Zone Policies (dérivées des zones & exigences d'isolation / proxy)
  const zonePolicies: Array<Record<string, unknown>> = [];
  const zoneList = Array.from(zoneRefByKey.entries());
  for (let i = 0; i < zoneList.length; i++) {
    const [slugA, refA] = zoneList[i];
    for (let j = i + 1; j < zoneList.length; j++) {
      const [slugB, refB] = zoneList[j];
      const isOamPair = slugA.includes('oam') || slugB.includes('oam') || slugA.includes('mgmt') || slugB.includes('mgmt');
      const isExternalPair =
        externalShadowZones.has(slugA) ||
        externalShadowZones.has(slugB) ||
        slugA.includes('ext') ||
        slugB.includes('ext');
      if (isOamPair) {
        zonePolicies.push({
          architectureRef: `zone-policy:zp-${slugA}-${slugB}-user`,
          sourceZoneRef: refA,
          targetZoneRef: refB,
          ruling: 'forbidden',
          plane: 'user'
        });
        zonePolicies.push({
          architectureRef: `zone-policy:zp-${slugA}-${slugB}-mgmt`,
          sourceZoneRef: refA,
          targetZoneRef: refB,
          ruling: 'conditional',
          plane: 'management',
          condition: 'Sous réserve de médiation bastion et journalisation OAM'
        });
      } else if (isExternalPair) {
        zonePolicies.push({
          architectureRef: `zone-policy:zp-${slugA}-${slugB}-cond`,
          sourceZoneRef: refA,
          targetZoneRef: refB,
          ruling: 'conditional',
          plane: 'signalling',
          condition: 'Médiation obligatoire via SecGW / DEA'
        });
      }
    }
  }

  // 5. Equipment (sans champs réseau interdits par G2 : pas d'oob_ip, pas d'interfaces IP/VLAN/VRF)
  const equipment: Array<Record<string, unknown>> = [];
  const equipmentRefByName = new Map<string, string>();

  for (const dev of hydrated.nautobot_planned_devices || []) {
    const devName = String(dev.name);
    const eqRef = claimRef(`item:${toSlug(devName)}`);
    equipmentRefByName.set(devName, eqRef);
    const devZoneRefs = Array.isArray(dev.security_zones)
      ? dev.security_zones.map((z) => ensureZoneRef(String(z)))
      : [];

    const entry: Record<string, unknown> = {
      architectureRef: eqRef,
      name: devName,
      kind: inferEquipmentKind(devName, String(dev.role || 'worker')),
      layer: 'iaas',
      vendor: String(dev.device_type || '').toLowerCase().includes('dl380') ? 'HPE' : 'Dell',
      model: String(dev.device_type || 'PowerEdge R750'),
      locationRef: dcRef,
      realizesRefs: [],
      environmentCodes: primaryEnvCodes,
      criticality: 'high',
      lifecycle: 'planned'
    };
    if (devZoneRefs.length > 0) {
      entry.zoneRefs = devZoneRefs;
    }
    equipment.push(entry);
  }

  for (const node of rg?.internal_mediation_nodes || []) {
    const nodeName = String(node.id);
    if (equipmentRefByName.has(nodeName)) continue;
    const eqRef = claimRef(`item:${toSlug(nodeName)}`);
    equipmentRefByName.set(nodeName, eqRef);
    const zRef = node.zone ? ensureZoneRef(String(node.zone)) : null;
    const entry: Record<string, unknown> = {
      architectureRef: eqRef,
      name: nodeName,
      kind: inferEquipmentKind(nodeName, String(node.role || '')),
      layer: 'infrastructure',
      vendor: 'Sylva',
      model: String(node.nrm_3gpp_class || 'Sylva-CNF-Appliance'),
      locationRef: dcRef,
      realizesRefs: [],
      environmentCodes: primaryEnvCodes,
      criticality: 'critical',
      lifecycle: 'planned'
    };
    if (zRef) entry.zoneRefs = [zRef];
    equipment.push(entry);
  }

  for (const ext of rg?.external_shadow_nodes || []) {
    const extName = String(ext.id);
    if (equipmentRefByName.has(extName)) continue;
    const eqRef = claimRef(`item:${toSlug(extName)}`);
    equipmentRefByName.set(extName, eqRef);
    const zRef = ext.zone ? ensureZoneRef(String(ext.zone)) : null;
    const entry: Record<string, unknown> = {
      architectureRef: eqRef,
      name: extName,
      kind: inferEquipmentKind(extName, String(ext.nrm_3gpp_class || '')),
      layer: 'infrastructure',
      vendor: '3GPP-External',
      model: String(ext.nrm_3gpp_class || 'ExternalFunction'),
      locationRef: null,
      realizesRefs: [],
      environmentCodes: primaryEnvCodes,
      criticality: 'high',
      lifecycle: 'active'
    };
    if (zRef) entry.zoneRefs = [zRef];
    equipment.push(entry);
  }

  // 6. Applications & ServiceEndpoints (dérivés des composants résolus / nœuds de médiation)
  const applications: Array<Record<string, unknown>> = [];
  const serviceEndpoints: Array<Record<string, unknown>> = [];
  const appRefById = new Map<string, string>();

  for (const comp of hydrated.resolved_components || []) {
    const compName = String(comp.name || 'component');
    const appRef = claimRef(`item:app-${toSlug(compName)}`);
    appRefById.set(compName, appRef);
    applications.push({
      architectureRef: appRef,
      name: compName,
      kind: 'microservice',
      environmentCodes: primaryEnvCodes,
      criticality: 'high',
      lifecycle: 'planned'
    });
  }

  // 7. Flows (squelettes d'intention dérivés des flux de médiation et liens d'interconnexion)
  const flows: Array<Record<string, unknown>> = [];
  const seenFlowRefs = new Set<string>();
  const addFlow = (
    rawId: string,
    srcName: string,
    dstName: string,
    plane: string,
    kind: string
  ) => {
    const srcRef = equipmentRefByName.get(srcName) || appRefById.get(srcName);
    const dstRef = equipmentRefByName.get(dstName) || appRefById.get(dstName);
    if (!srcRef || !dstRef) return;
    const fRef = `relation:${toSlug(rawId)}`;
    if (seenFlowRefs.has(fRef)) return;
    seenFlowRefs.add(fRef);
    flows.push({
      architectureRef: fRef,
      sourceRef: srcRef,
      targetRef: dstRef,
      kind,
      plane,
      planeSource: 'declared'
    });
  };

  for (const flow of rg?.service_mediation_flows || []) {
    const hops = Array.isArray(flow.mandatory_mediation_hops)
      ? flow.mandatory_mediation_hops.map(String)
      : [];
    const chain = [String(flow.source || ''), ...hops, String(flow.target || '')].filter(Boolean);
    for (let i = 0; i < chain.length - 1; i++) {
      addFlow(`${flow.id}-hop-${i + 1}`, chain[i], chain[i + 1], 'signalling', 'dataFlow');
    }
  }

  for (const link of rg?.ip_underlay_links || []) {
    if (link.endpoint_a && link.endpoint_z) {
      addFlow(
        `underlay-${link.id}`,
        String(link.endpoint_a),
        String(link.endpoint_z),
        'control',
        'connectedTo'
      );
    }
  }

  // 8. RedundancyGroups
  const redundancyGroups: Array<Record<string, unknown>> = [];
  const deviceRefs = Array.from(equipmentRefByName.values());
  if (deviceRefs.length >= 2) {
    redundancyGroups.push({
      architectureRef: `item:rg-${subjectSlug}`,
      mode: 'active-active',
      memberRefs: deviceRefs
    });
  }

  const data: Record<string, unknown> = {
    architectureStudioVersion: 'archinex-edp-1.0',
    modelId: `archinex-${subjectSlug}`,
    baselineRef: options.revision !== undefined ? `rev-${options.revision}` : null,
    sensitivity,
    environments,
    sites,
    equipment,
    applications,
    serviceEndpoints,
    zones,
    zonePolicies,
    flows,
    redundancyGroups
  };

  const checksum = computeArmChecksum(data);

  return {
    snapshotId: `archinex-arm-${subjectSlug}-${nowUtc}`,
    sourceSystem: 'architecture-studio',
    schemaVersion: '1.6',
    createdAt: nowUtc,
    checksum,
    sensitivity,
    sensitivityLabel,
    data
  };
}

/**
 * Vérifie la disponibilité d'IP Flow Manager (`GET /health`).
 */
export async function checkIpFlowManagerHealth(
  timeoutMs = 1500,
  customFetch: typeof fetch = fetch,
  baseUrlOverride?: string
): Promise<IpfmHealthResult> {
  const baseUrl = (baseUrlOverride || getIpFlowManagerUrl()).replace(/\/+$/, '');
  try {
    const res = await customFetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      return { available: false, url: baseUrl, error: `HTTP ${res.status}` };
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      available: true,
      url: baseUrl,
      version: typeof body.version === 'string' ? body.version : undefined
    };
  } catch (err: any) {
    return {
      available: false,
      url: baseUrl,
      error: err?.message || 'IP Flow Manager injoignable'
    };
  }
}

/**
 * Pousse de manière synchrone l'enveloppe ARM 1.6 vers IP Flow Manager (`POST /catalog/import-manifest`)
 * et déclenche optionnellement `POST /netbox/sync` pour rafraîchir l'instantané Nautobot côté IFM.
 */
export async function pushArmToIpFlowManager(
  envelope: ArmEnvelope,
  clientOpts: IpFlowManagerClientOptions & { triggerNautobotSync?: boolean } = {}
): Promise<IpfmSyncSummary> {
  const baseUrl = (clientOpts.baseUrl || getIpFlowManagerUrl()).replace(/\/+$/, '');
  const fetchFn = clientOpts.fetchImpl || fetch;
  const timeoutMs = clientOpts.timeoutMs || 5000;
  const data = envelope.data as Record<string, unknown[]>;

  const summary: IpfmSyncSummary = {
    reachable: false,
    baseUrl,
    armImported: false,
    nautobotSyncTriggered: false,
    snapshotId: envelope.snapshotId,
    checksum: envelope.checksum,
    created: 0,
    updated: 0,
    totalChanges: 0,
    datasetsCounts: {
      environments: Array.isArray(data.environments) ? data.environments.length : 0,
      sites: Array.isArray(data.sites) ? data.sites.length : 0,
      equipment: Array.isArray(data.equipment) ? data.equipment.length : 0,
      zones: Array.isArray(data.zones) ? data.zones.length : 0,
      zonePolicies: Array.isArray(data.zonePolicies) ? data.zonePolicies.length : 0,
      applications: Array.isArray(data.applications) ? data.applications.length : 0,
      serviceEndpoints: Array.isArray(data.serviceEndpoints) ? data.serviceEndpoints.length : 0,
      flows: Array.isArray(data.flows) ? data.flows.length : 0,
      redundancyGroups: Array.isArray(data.redundancyGroups) ? data.redundancyGroups.length : 0
    },
    errors: []
  };

  try {
    const res = await fetchFn(`${baseUrl}/catalog/import-manifest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(timeoutMs)
    });
    summary.reachable = true;

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      summary.errors.push(`Import ARM refusé (HTTP ${res.status}): ${errText}`);
      return summary;
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    summary.armImported = true;
    summary.created = Number(body.created || 0);
    summary.updated = Number(body.updated || 0);
    summary.totalChanges = Number(body.totalChanges || 0);

    if (clientOpts.triggerNautobotSync) {
      try {
        const nbRes = await fetchFn(`${baseUrl}/netbox/sync`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs)
        });
        summary.nautobotSyncTriggered = nbRes.ok;
      } catch (e: any) {
        summary.errors.push(`Synchro Nautobot côté IFM : ${e?.message || 'échec'}`);
      }
    }
  } catch (err: any) {
    summary.errors.push(err?.message || `IP Flow Manager injoignable (${baseUrl})`);
  }

  return summary;
}
