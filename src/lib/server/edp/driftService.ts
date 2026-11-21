import { createHash } from 'node:crypto';
import { prisma } from '../prisma';
import type {
  ArchinexTraceMarkers,
  DriftFindingDraft,
  DriftFindingRecord,
  DriftKind,
  DriftObjectRef,
  DriftSeverity,
  DriftState,
  OracleVerdictDraft,
  OracleVerdictRecord,
  OracleVerdictSource
} from './driftTypes';
import { unscopeNautobotName } from './nautobotSync';

const REGRESSED_STATUSES = new Set([
  'offline',
  'failed',
  'decommissioning',
  'decommissioned',
  'retired',
  'quarantined',
  'deprecated'
]);

const HEALTHY_STATUSES = new Set(['planned', 'staged', 'active']);

/**
 * Sérialisation JSON canonique (clés triées récursivement) pour calculer des empreintes
 * déterministes (`intent_hash` et `fingerprint`).
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`).join(',')}}`;
}

/**
 * Empreinte SHA-256 canonique d'une intention (EDP ou objet planifié).
 */
export function computeIntentHash(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value)).digest('hex');
}

/**
 * Empreinte de déduplication déterministe pour un `DriftFinding`.
 * Garantit qu'un rejeu sur le même objet, la même nature d'écart et le même attribut
 * met à jour l'enregistrement existant au lieu de créer un doublon.
 */
export function computeDriftFingerprint(input: {
  objectRef: DriftObjectRef;
  kind: DriftKind;
  attributeKey: string;
}): string {
  const key = [
    String(input.objectRef.type || '').trim().toLowerCase(),
    String(input.objectRef.id || '').trim().toLowerCase(),
    String(input.kind || '').trim().toLowerCase(),
    String(input.attributeKey || '').trim().toLowerCase()
  ].join('|');
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extrait une chaîne lisible depuis un champ Nautobot (chaîne directe ou objet `{ value | name | model | display | id }`).
 */
function extractNautobotScalar(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.value ?? obj.model ?? obj.name ?? obj.display ?? obj.slug ?? obj.id;
    if (candidate !== undefined && candidate !== null) {
      const s = String(candidate).trim();
      return s.length > 0 ? s : null;
    }
  }
  return null;
}

function parseClauseRefsValue(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        // Fallback liste séparée par virgules
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Extrait les marqueurs de traçabilité `archinex_*` exclusivement depuis l'objet Nautobot
 * (`_custom_field_data`, `custom_fields`, `tags`), jamais depuis le corps libre du webhook.
 */
export function extractArchinexMarkers(
  nautobotObject: Record<string, unknown> | null | undefined
): ArchinexTraceMarkers {
  const markers: ArchinexTraceMarkers = { clauseRefs: [] };
  if (!nautobotObject || typeof nautobotObject !== 'object') return markers;

  const cf = (nautobotObject._custom_field_data ||
    nautobotObject.custom_fields ||
    {}) as Record<string, unknown>;

  if (typeof cf.archinex_project === 'string' && cf.archinex_project.trim()) {
    markers.projectId = cf.archinex_project.trim();
  }
  if (typeof cf.archinex_subject_id === 'string' && cf.archinex_subject_id.trim()) {
    markers.subjectId = cf.archinex_subject_id.trim();
  }
  if (typeof cf.archinex_decision_id === 'string' && cf.archinex_decision_id.trim()) {
    markers.decisionId = cf.archinex_decision_id.trim();
  }
  if (cf.archinex_decision_revision !== undefined && cf.archinex_decision_revision !== null) {
    const rev = Number(cf.archinex_decision_revision);
    if (Number.isFinite(rev) && rev > 0) {
      markers.decisionRevision = rev;
    }
  }
  if (cf.archinex_clause_refs !== undefined) {
    markers.clauseRefs = parseClauseRefsValue(cf.archinex_clause_refs);
  }
  if (typeof cf.archinex_intent_hash === 'string' && cf.archinex_intent_hash.trim()) {
    markers.intentHash = cf.archinex_intent_hash.trim();
  }

  // Complément à partir des tags structurés `archinex_*:<valeur>` si non fournis en custom_fields
  const rawTags = Array.isArray(nautobotObject.tags) ? nautobotObject.tags : [];
  for (const tag of rawTags) {
    const tagName = extractNautobotScalar(tag);
    if (!tagName) continue;
    if (!markers.projectId && tagName.startsWith('archinex_project:')) {
      markers.projectId = tagName.slice('archinex_project:'.length).trim() || undefined;
    } else if (!markers.subjectId && tagName.startsWith('archinex_subject:')) {
      markers.subjectId = tagName.slice('archinex_subject:'.length).trim() || undefined;
    } else if (!markers.decisionId && tagName.startsWith('archinex_decision:')) {
      markers.decisionId = tagName.slice('archinex_decision:'.length).trim() || undefined;
    } else if (tagName.startsWith('archinex_clause:')) {
      const clause = tagName.slice('archinex_clause:'.length).trim();
      if (clause && !markers.clauseRefs.includes(clause)) {
        markers.clauseRefs.push(clause);
      }
    }
  }

  return markers;
}

/**
 * Indique si l'objet Nautobot porte un marquage de traçabilité Archinex permettant
 * de le rattacher à une décision gouvernée.
 */
export function hasTraceabilityMarkers(markers: ArchinexTraceMarkers): boolean {
  return Boolean(markers.decisionId || markers.subjectId || markers.intentHash);
}

/**
 * Détermine si un changement de statut constitue une régression de cycle de vie
 * (ex. Planned/Active → Offline/Failed/Decommissioning/Retired, ou Active → Planned).
 */
export function isStatusRegression(expectedStatus: string, observedStatus: string): boolean {
  const exp = String(expectedStatus || '').trim().toLowerCase();
  const obs = String(observedStatus || '').trim().toLowerCase();
  if (!exp || !obs || exp === obs) return false;
  if (HEALTHY_STATUSES.has(exp) && REGRESSED_STATUSES.has(obs)) return true;
  if (exp === 'active' && (obs === 'planned' || obs === 'staged')) return true;
  return false;
}

/**
 * Construit un `DriftObjectRef` normalisé à partir d'un modèle et d'un snapshot Nautobot.
 */
export function extractObjectRef(
  modelName: string,
  dataSnapshot: Record<string, unknown> | null | undefined,
  projectScope?: string
): DriftObjectRef {
  const type = String(modelName || 'unknown').trim().toLowerCase();
  const rawName =
    extractNautobotScalar(dataSnapshot?.name) ||
    extractNautobotScalar(dataSnapshot?.cid) ||
    extractNautobotScalar(dataSnapshot?.prefix) ||
    extractNautobotScalar(dataSnapshot?.address) ||
    extractNautobotScalar(dataSnapshot?.display) ||
    undefined;
  const unscopedName = rawName ? unscopeNautobotName(rawName, projectScope) : undefined;
  const rawId =
    extractNautobotScalar(dataSnapshot?.id) ||
    unscopedName ||
    'unknown';

  return {
    type,
    id: rawId,
    ...(unscopedName ? { name: unscopedName } : {})
  };
}

function summarizeObservedObject(
  modelName: string,
  dataSnapshot: Record<string, unknown>
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    model: modelName
  };
  const keys = [
    'id',
    'name',
    'cid',
    'prefix',
    'address',
    'vid',
    'status',
    'device_type',
    'role',
    'site',
    'location',
    'tenant',
    'platform'
  ];
  for (const k of keys) {
    if (dataSnapshot[k] !== undefined) {
      const scalar = extractNautobotScalar(dataSnapshot[k]);
      if (scalar !== null) summary[k] = scalar;
    }
  }
  return summary;
}

function findPlannedObjectInFrozenIntent(
  frozenInventory: Record<string, any> | null | undefined,
  modelName: string,
  objectRef: DriftObjectRef
): Record<string, any> | null {
  if (!frozenInventory || typeof frozenInventory !== 'object') return null;
  const model = modelName.toLowerCase();
  const targetName = (objectRef.name || objectRef.id || '').toLowerCase();

  if (model.includes('device')) {
    const devices: any[] = Array.isArray(frozenInventory.nautobot_planned_devices)
      ? frozenInventory.nautobot_planned_devices
      : [];
    return (
      devices.find(
        (d) =>
          String(d?.id || '').toLowerCase() === objectRef.id.toLowerCase() ||
          String(d?.name || '').toLowerCase() === targetName
      ) || null
    );
  }

  if (model.includes('tenant')) {
    const tenants: any[] = [
      ...(Array.isArray(frozenInventory.tenants) ? frozenInventory.tenants : []),
      ...(Array.isArray(frozenInventory.reconciliation_graph?.partner_organizations)
        ? frozenInventory.reconciliation_graph.partner_organizations
        : [])
    ];
    return (
      tenants.find(
        (t) =>
          String(t?.id || '').toLowerCase() === targetName ||
          String(t?.name || '').toLowerCase() === targetName
      ) || null
    );
  }

  if (model.includes('prefix')) {
    const prefixes: any[] = Array.isArray(frozenInventory.ipam_prefixes)
      ? frozenInventory.ipam_prefixes
      : Array.isArray(frozenInventory.prefixes)
        ? frozenInventory.prefixes
        : [];
    return (
      prefixes.find(
        (p) =>
          String(p?.prefix || p?.cidr || p?.id || '').toLowerCase() === targetName
      ) || null
    );
  }

  if (model.includes('vlan')) {
    const vlans: any[] = Array.isArray(frozenInventory.vlans)
      ? frozenInventory.vlans
      : Array.isArray(frozenInventory.ipam_vlans)
        ? frozenInventory.ipam_vlans
        : [];
    return (
      vlans.find(
        (v) =>
          String(v?.name || '').toLowerCase() === targetName ||
          String(v?.vid ?? '').toLowerCase() === targetName
      ) || null
    );
  }

  if (model.includes('ipaddress') || model.includes('ip_address')) {
    const ips: any[] = Array.isArray(frozenInventory.ip_addresses)
      ? frozenInventory.ip_addresses
      : [];
    return (
      ips.find(
        (ip) => String(ip?.address || ip?.ip || '').toLowerCase() === targetName
      ) || null
    );
  }

  return null;
}

/**
 * Compare l'intention figée d'un EDP (jamais mutée) avec l'état observé d'un objet Nautobot
 * et produit des `DriftFindingDraft` typés.
 *
 * - Objet non marqué `archinex_*` → écart « hors décision » (`outOfDecision: true`), jamais ignoré.
 * - Objet marqué supprimé → `kind: 'missing'`.
 * - Statut dégradé → `kind: 'status_regression'`.
 * - Attribut ou `intent_hash` divergent → `kind: 'attribute_mismatch'`.
 * - Objet marqué absent de l'intention figée → `kind: 'unexpected'`.
 */
export function compareFrozenIntentWithNautobotObject(params: {
  projectId: string;
  modelName: string;
  eventType: string;
  dataSnapshot: Record<string, unknown>;
  markers: ArchinexTraceMarkers;
  frozenEdp: Record<string, any> | null;
  subjectId: string | null;
  decisionId: string | null;
  sourceEvent: string;
  projectScope?: string;
}): DriftFindingDraft[] {
  const {
    projectId,
    modelName,
    eventType,
    dataSnapshot,
    markers,
    frozenEdp,
    subjectId,
    decisionId,
    sourceEvent,
    projectScope
  } = params;

  const objectRef = extractObjectRef(modelName, dataSnapshot, projectScope);
  const normalizedEvent = String(eventType || 'updated').trim().toLowerCase();
  const observedSummary = summarizeObservedObject(modelName, dataSnapshot);

  // Cas 1 : Objet non marqué `archinex_*` → écart « hors décision » distinct, jamais ignoré
  if (!hasTraceabilityMarkers(markers)) {
    return [
      {
        projectId,
        subjectId: null,
        decisionId: null,
        clauseRefs: [],
        objectRef,
        kind: normalizedEvent === 'deleted' ? 'missing' : 'unexpected',
        attributeKey: 'out_of_decision',
        outOfDecision: true,
        expected: null,
        observed: observedSummary,
        severity: 'medium',
        sourceEvent,
        summary: `Objet Nautobot '${objectRef.name || objectRef.id}' (${objectRef.type}) sans marquage archinex_* (écart hors décision).`
      }
    ];
  }

  const clauseRefs = markers.clauseRefs;
  const frozenInventory = frozenEdp?.hydratedInventory || null;
  const plannedObj = findPlannedObjectInFrozenIntent(frozenInventory, modelName, objectRef);

  // Cas 2 : Suppression d'un objet marqué
  if (normalizedEvent === 'deleted') {
    return [
      {
        projectId,
        subjectId,
        decisionId,
        clauseRefs,
        objectRef,
        kind: 'missing',
        attributeKey: 'object_deleted',
        outOfDecision: false,
        expected: plannedObj || {
          ...(markers.intentHash ? { intent_hash: markers.intentHash } : {}),
          object: objectRef
        },
        observed: null,
        severity: 'high',
        sourceEvent,
        summary: `Objet marqué '${objectRef.name || objectRef.id}' (${objectRef.type}) supprimé dans Nautobot.`
      }
    ];
  }

  const findings: DriftFindingDraft[] = [];

  if (plannedObj) {
    // 2a. Comparaison du statut (status_regression vs attribute_mismatch)
    const observedStatus = extractNautobotScalar(dataSnapshot.status);
    const expectedStatus = extractNautobotScalar(plannedObj.status);
    if (
      observedStatus &&
      expectedStatus &&
      observedStatus.toLowerCase() !== expectedStatus.toLowerCase()
    ) {
      const regression = isStatusRegression(expectedStatus, observedStatus);
      findings.push({
        projectId,
        subjectId,
        decisionId,
        clauseRefs,
        objectRef,
        kind: regression ? 'status_regression' : 'attribute_mismatch',
        attributeKey: 'status',
        outOfDecision: false,
        expected: expectedStatus.toLowerCase(),
        observed: observedStatus.toLowerCase(),
        severity: regression ? 'high' : 'medium',
        sourceEvent,
        summary: `Statut de '${objectRef.name || objectRef.id}' modifié : '${observedStatus}' (attendu : '${expectedStatus}').`
      });
    }

    // 2b. Comparaison générique des attributs clés présents dans l'intention planifiée
    const attributePairs: Array<{ key: string; plannedKey: string; observedKey: string; severity: DriftSeverity }> = [
      { key: 'device_type', plannedKey: 'device_type', observedKey: 'device_type', severity: 'high' },
      { key: 'role', plannedKey: 'role', observedKey: 'role', severity: 'medium' },
      { key: 'site', plannedKey: 'site', observedKey: 'location', severity: 'medium' },
      { key: 'tenant', plannedKey: 'tenant', observedKey: 'tenant', severity: 'medium' },
      { key: 'platform', plannedKey: 'platform', observedKey: 'platform', severity: 'medium' },
      { key: 'prefix', plannedKey: 'prefix', observedKey: 'prefix', severity: 'high' },
      { key: 'vid', plannedKey: 'vid', observedKey: 'vid', severity: 'high' },
      { key: 'address', plannedKey: 'address', observedKey: 'address', severity: 'high' }
    ];

    for (const pair of attributePairs) {
      const expVal = extractNautobotScalar(plannedObj[pair.plannedKey]);
      const obsRaw =
        dataSnapshot[pair.observedKey] !== undefined
          ? dataSnapshot[pair.observedKey]
          : dataSnapshot[pair.key];
      const obsVal = extractNautobotScalar(obsRaw);
      if (expVal && obsVal && expVal.toLowerCase() !== obsVal.toLowerCase()) {
        findings.push({
          projectId,
          subjectId,
          decisionId,
          clauseRefs,
          objectRef,
          kind: 'attribute_mismatch',
          attributeKey: pair.key,
          outOfDecision: false,
          expected: expVal,
          observed: obsVal,
          severity: pair.severity,
          sourceEvent,
          summary: `Attribut '${pair.key}' de '${objectRef.name || objectRef.id}' modifié : '${obsVal}' (attendu : '${expVal}').`
        });
      }
    }

    // 2c. Comparaison oob_ip via custom_fields
    const cf = (dataSnapshot._custom_field_data || dataSnapshot.custom_fields || {}) as Record<
      string,
      unknown
    >;
    if (
      typeof cf.oob_ip === 'string' &&
      plannedObj.oob_ip !== undefined &&
      cf.oob_ip !== String(plannedObj.oob_ip)
    ) {
      findings.push({
        projectId,
        subjectId,
        decisionId,
        clauseRefs,
        objectRef,
        kind: 'attribute_mismatch',
        attributeKey: 'oob_ip',
        outOfDecision: false,
        expected: plannedObj.oob_ip,
        observed: cf.oob_ip,
        severity: 'high',
        sourceEvent,
        summary: `Attribut 'oob_ip' de '${objectRef.name || objectRef.id}' modifié : '${cf.oob_ip}' (attendu : '${plannedObj.oob_ip}').`
      });
    }
  } else if (frozenInventory) {
    // Objet marqué mais absent de l'intention figée de l'EDP
    findings.push({
      projectId,
      subjectId,
      decisionId,
      clauseRefs,
      objectRef,
      kind: 'unexpected',
      attributeKey: 'unplanned_object',
      outOfDecision: false,
      expected: null,
      observed: observedSummary,
      severity: 'medium',
      sourceEvent,
      summary: `Objet marqué '${objectRef.name || objectRef.id}' (${objectRef.type}) non présent dans l'intention figée de l'EDP.`
    });
  }

  // Cas 3 : Si aucun écart d'attribut spécifique n'a été trouvé mais qu'un `intent_hash`
  // est présent sur l'objet et diverge de l'empreinte de l'état observé
  if (findings.length === 0 && markers.intentHash) {
    const observedHash = computeIntentHash(observedSummary);
    if (observedHash !== markers.intentHash) {
      findings.push({
        projectId,
        subjectId,
        decisionId,
        clauseRefs,
        objectRef,
        kind: 'attribute_mismatch',
        attributeKey: 'intent_hash',
        outOfDecision: false,
        expected: { intent_hash: markers.intentHash },
        observed: { intent_hash: observedHash, snapshot: observedSummary },
        severity: 'medium',
        sourceEvent,
        summary: `Empreinte d'intention divergente pour '${objectRef.name || objectRef.id}' (${objectRef.type}).`
      });
    }
  }

  return findings;
}

function hydrateDriftFindingRow(row: any): DriftFindingRecord {
  const safeParse = (raw: string | null | undefined, fallback: unknown) => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  return {
    id: row.id,
    projectId: row.projectId,
    subjectId: row.subjectId ?? null,
    decisionId: row.decisionId ?? null,
    clauseRefs: safeParse(row.clauseRefs, []) as string[],
    objectRef: safeParse(row.objectRef, {
      type: row.objectType,
      id: row.objectId
    }) as DriftObjectRef,
    attributeKey: row.attributeKey || '',
    fingerprint: row.fingerprint,
    kind: row.kind as DriftKind,
    outOfDecision: Boolean(row.outOfDecision),
    expected: safeParse(row.expected, null),
    observed: safeParse(row.observed, null),
    severity: (row.severity || 'medium') as DriftSeverity,
    firstSeenAt: row.firstSeenAt instanceof Date ? row.firstSeenAt.toISOString() : String(row.firstSeenAt),
    lastSeenAt: row.lastSeenAt instanceof Date ? row.lastSeenAt.toISOString() : String(row.lastSeenAt),
    state: (row.state || 'open') as DriftState,
    sourceEvent: row.sourceEvent
  };
}

/**
 * Persiste une liste de `DriftFindingDraft` de manière idempotente (déduplication par
 * `(projectId, fingerprint)`). Toute erreur de persistance est journalisée et propagée.
 */
export async function persistDriftFindings(
  findings: DriftFindingDraft[],
  db: any = prisma
): Promise<DriftFindingRecord[]> {
  const persisted: DriftFindingRecord[] = [];
  const now = new Date();

  for (const draft of findings) {
    const fingerprint = computeDriftFingerprint({
      objectRef: draft.objectRef,
      kind: draft.kind,
      attributeKey: draft.attributeKey
    });

    try {
      const row = await db.driftFinding.upsert({
        where: {
          projectId_fingerprint: {
            projectId: draft.projectId,
            fingerprint
          }
        },
        create: {
          projectId: draft.projectId,
          subjectId: draft.subjectId,
          decisionId: draft.decisionId,
          clauseRefs: JSON.stringify(draft.clauseRefs || []),
          objectType: draft.objectRef.type,
          objectId: draft.objectRef.id,
          objectRef: JSON.stringify(draft.objectRef),
          attributeKey: draft.attributeKey,
          fingerprint,
          kind: draft.kind,
          outOfDecision: Boolean(draft.outOfDecision),
          expected: JSON.stringify(draft.expected ?? null),
          observed: JSON.stringify(draft.observed ?? null),
          severity: draft.severity,
          firstSeenAt: now,
          lastSeenAt: now,
          state: 'open',
          sourceEvent: draft.sourceEvent
        },
        update: {
          subjectId: draft.subjectId,
          decisionId: draft.decisionId,
          clauseRefs: JSON.stringify(draft.clauseRefs || []),
          objectRef: JSON.stringify(draft.objectRef),
          outOfDecision: Boolean(draft.outOfDecision),
          expected: JSON.stringify(draft.expected ?? null),
          observed: JSON.stringify(draft.observed ?? null),
          severity: draft.severity,
          lastSeenAt: now,
          state: 'open',
          sourceEvent: draft.sourceEvent
        }
      });
      persisted.push(hydrateDriftFindingRow(row));
    } catch (err) {
      console.error('[DriftService] Échec de persistance DriftFinding:', {
        projectId: draft.projectId,
        objectRef: draft.objectRef,
        kind: draft.kind,
        error: err
      });
      throw err;
    }
  }

  return persisted;
}

/**
 * Liste les `DriftFinding` persistés pour un projet / sujet donné.
 */
export async function listDriftFindings(
  filter: {
    projectId: string;
    subjectId?: string | null;
    state?: DriftState;
    outOfDecision?: boolean;
  },
  db: any = prisma
): Promise<DriftFindingRecord[]> {
  const where: Record<string, unknown> = {
    projectId: filter.projectId
  };
  if (filter.subjectId !== undefined) where.subjectId = filter.subjectId;
  if (filter.state !== undefined) where.state = filter.state;
  if (filter.outOfDecision !== undefined) where.outOfDecision = filter.outOfDecision;

  const rows = await db.driftFinding.findMany({
    where,
    orderBy: { lastSeenAt: 'desc' }
  });

  return rows.map(hydrateDriftFindingRow);
}

function hydrateOracleVerdictRow(row: any): OracleVerdictRecord {
  const safeParse = (raw: string | null | undefined, fallback: unknown) => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  return {
    id: row.id,
    edpId: row.edpId,
    projectId: row.projectId,
    subjectId: row.subjectId,
    decisionId: row.decisionId,
    verdict: row.verdict,
    source: row.source as OracleVerdictSource,
    provenance: row.provenance,
    intentHash: row.intentHash ?? null,
    ontologyFingerprint: row.ontologyFingerprint ?? null,
    webhookEventId: row.webhookEventId ?? null,
    violations: safeParse(row.violations, []) as string[],
    detailedViolations: safeParse(row.detailedViolations, []) as unknown[],
    driftFindingIds: safeParse(row.driftFindingIds, []) as string[],
    verifiedAt: row.verifiedAt instanceof Date ? row.verifiedAt.toISOString() : String(row.verifiedAt)
  };
}

/**
 * Enregistre un verdict d'évaluation de l'oracle dans `edp_oracle_verdicts` (à côté de l'EDP,
 * sans jamais muter `executable_decision_packages`). Toute erreur est journalisée et propagée.
 */
export async function recordOracleVerdict(
  draft: OracleVerdictDraft,
  db: any = prisma
): Promise<OracleVerdictRecord> {
  try {
    const row = await db.edpOracleVerdict.create({
      data: {
        edpId: draft.edpId,
        projectId: draft.projectId,
        subjectId: draft.subjectId,
        decisionId: draft.decisionId,
        verdict: draft.verdict,
        source: draft.source,
        provenance: draft.provenance,
        intentHash: draft.intentHash ?? null,
        ontologyFingerprint: draft.ontologyFingerprint ?? null,
        webhookEventId: draft.webhookEventId ?? null,
        violations: JSON.stringify(draft.violations || []),
        detailedViolations: JSON.stringify(draft.detailedViolations || []),
        driftFindingIds: JSON.stringify(draft.driftFindingIds || []),
        verifiedAt: draft.verifiedAt ?? new Date()
      }
    });
    return hydrateOracleVerdictRow(row);
  } catch (err) {
    console.error('[DriftService] Échec de persistance EdpOracleVerdict:', {
      edpId: draft.edpId,
      projectId: draft.projectId,
      subjectId: draft.subjectId,
      error: err
    });
    throw err;
  }
}

/**
 * Retourne le dernier verdict d'oracle stocké à côté d'un EDP.
 */
export async function getLatestOracleVerdict(
  params: { edpId?: string; projectId?: string; subjectId?: string },
  db: any = prisma
): Promise<OracleVerdictRecord | null> {
  const where: Record<string, unknown> = {};
  if (params.edpId) where.edpId = params.edpId;
  if (params.projectId) where.projectId = params.projectId;
  if (params.subjectId) where.subjectId = params.subjectId;
  if (Object.keys(where).length === 0) return null;

  const row = await db.edpOracleVerdict?.findFirst({
    where,
    orderBy: { verifiedAt: 'desc' }
  });
  return row ? hydrateOracleVerdictRow(row) : null;
}
