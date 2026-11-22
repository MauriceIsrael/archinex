/**
 * Job de réconciliation périodique Nautobot par projet (Issue #379).
 *
 * Garanties :
 *  1. Verrou atomique par projet (`lockToken`, `lockedAt` avec TTL) empêchant les exécutions concurrentes.
 *  2. Idempotence stricte : relancer la réconciliation avec le même état Nautobot ne crée aucun doublon
 *     et résout automatiquement (`remediated`) les écarts disparus.
 *  3. Panne Nautobot = état `unverified` (jamais `succeeded` / `compliant`), `lastSuccessAt` préservé,
 *     aucun finding ouvert fermé à tort.
 *  4. Reprise transparente dès que Nautobot redevient joignable.
 *  5. Évaluation de l'état de réalisation selon le contrat de write-back (#399) pour chaque objet planifié.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import {
  belongsToProjectScope,
  normalizeProjectScope,
  projectTagName,
  resolveProjectNautobotOptions,
  unscopeNautobotName,
  type NautobotClientOptions
} from './nautobotSync';
import {
  compareFrozenIntentWithNautobotObject,
  computeDriftFingerprint,
  extractArchinexMarkers,
  hasTraceabilityMarkers,
  persistDriftFindings,
  resolveAbsentDriftFindings
} from './driftService';
import type { DriftFindingDraft } from './driftTypes';
import {
  buildNautobotObjectUrl,
  evaluateRealizationStatus,
  summarizeRealizationItems,
  type RealizationCounts,
  type RealizationItem
} from '../../domain/edp/realizationStatus.js';

const DEFAULT_NAUTOBOT_URL = process.env.NAUTOBOT_URL || 'http://localhost:8080';
const DEFAULT_NAUTOBOT_TOKEN =
  process.env.NAUTOBOT_TOKEN || '0123456789abcdef0123456789abcdef01234567';
const DEFAULT_INTERVAL_SECONDS = Math.max(
  30,
  Number(process.env.RECONCILIATION_INTERVAL_SECONDS || 300) || 300
);
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;

export type ReconciliationTrigger = 'scheduled' | 'manual' | 'webhook_recovery';

export interface ReconcileProjectOptions {
  trigger?: ReconciliationTrigger;
  db?: any;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  lockTtlMs?: number;
}

export interface ReconcileProjectResult {
  projectId: string;
  skipped: boolean;
  reason?: 'locked' | 'project_not_found';
  runId?: string;
  status: 'succeeded' | 'unverified' | 'error' | 'skipped';
  nautobotReachable: boolean;
  checkedEdpCount: number;
  observedObjects: number;
  openFindingsCount: number;
  newFindingsCount: number;
  resolvedFindingsCount: number;
  realizationSummary: RealizationCounts;
  error?: string | null;
}

interface PlannedObjectEntry {
  modelName: string;
  key: string;
  name: string;
  plannedObj: Record<string, any>;
  edpRow: any;
  parsedEdp: Record<string, any>;
  clauseRefs: string[];
}

async function fetchNautobotJson(
  path: string,
  clientOpts: NautobotClientOptions,
  timeoutMs = 4000
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const baseUrl = (clientOpts.baseUrl || DEFAULT_NAUTOBOT_URL).replace(/\/+$/, '');
  const token = clientOpts.token || DEFAULT_NAUTOBOT_TOKEN;
  const fetchFn = clientOpts.fetchImpl || fetch;

  try {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Token ${token}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}: ${errText}` };
    }
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

function extractLiveObjectKey(modelName: string, obj: Record<string, any>, scope?: string): string {
  const raw =
    modelName === 'ipam.prefix'
      ? String(obj.prefix || obj.id || '')
      : modelName === 'ipam.ipaddress'
        ? String(obj.address || obj.id || '')
        : String(obj.name || obj.cid || obj.vid || obj.id || '');
  return unscopeNautobotName(raw, scope).trim().toLowerCase();
}

function extractLiveObjectName(modelName: string, obj: Record<string, any>, scope?: string): string {
  const raw =
    modelName === 'ipam.prefix'
      ? String(obj.prefix || obj.id || '')
      : modelName === 'ipam.ipaddress'
        ? String(obj.address || obj.id || '')
        : String(obj.name || obj.cid || obj.display || obj.id || '');
  return unscopeNautobotName(raw, scope).trim();
}

function estimateDetectionDelayMs(
  liveObj: Record<string, any> | null | undefined,
  nowMs: number
): number | null {
  if (!liveObj || typeof liveObj !== 'object') return null;
  const rawTs = liveObj.last_updated || liveObj.updated_at || liveObj.created;
  if (typeof rawTs !== 'string' || !rawTs.trim()) return null;
  const ts = Date.parse(rawTs);
  if (!Number.isFinite(ts) || ts > nowMs) return null;
  return Math.max(0, nowMs - ts);
}

function collectPlannedObjectsFromEdp(
  edpRow: any,
  parsedEdp: Record<string, any>
): PlannedObjectEntry[] {
  const inv = parsedEdp?.hydratedInventory;
  if (!inv || typeof inv !== 'object') return [];

  const clauseRefs: string[] = Array.isArray(parsedEdp?.decision_context?.clause_refs)
    ? parsedEdp.decision_context.clause_refs.map((c: unknown) => String(c).trim()).filter(Boolean)
    : [];

  const entries: PlannedObjectEntry[] = [];

  if (Array.isArray(inv.nautobot_planned_devices)) {
    for (const dev of inv.nautobot_planned_devices) {
      const name = String(dev?.name || dev?.id || '').trim();
      if (!name) continue;
      entries.push({
        modelName: 'dcim.device',
        key: name.toLowerCase(),
        name,
        plannedObj: dev,
        edpRow,
        parsedEdp,
        clauseRefs
      });
    }
  }

  const tenants = [
    ...(Array.isArray(inv.tenants) ? inv.tenants : []),
    ...(Array.isArray(inv.reconciliation_graph?.partner_organizations)
      ? inv.reconciliation_graph.partner_organizations
      : [])
  ];
  const seenTenants = new Set<string>();
  for (const tenant of tenants) {
    const name = String(tenant?.name || tenant?.id || '').trim();
    if (!name || seenTenants.has(name.toLowerCase())) continue;
    seenTenants.add(name.toLowerCase());
    entries.push({
      modelName: 'tenancy.tenant',
      key: name.toLowerCase(),
      name,
      plannedObj: tenant,
      edpRow,
      parsedEdp,
      clauseRefs
    });
  }

  const prefixes = Array.isArray(inv.ipam_prefixes)
    ? inv.ipam_prefixes
    : Array.isArray(inv.prefixes)
      ? inv.prefixes
      : [];
  for (const p of prefixes) {
    const cidr = String(p?.prefix || p?.cidr || p?.id || '').trim();
    if (!cidr) continue;
    entries.push({
      modelName: 'ipam.prefix',
      key: cidr.toLowerCase(),
      name: cidr,
      plannedObj: p,
      edpRow,
      parsedEdp,
      clauseRefs
    });
  }

  const vlans = Array.isArray(inv.vlans)
    ? inv.vlans
    : Array.isArray(inv.ipam_vlans)
      ? inv.ipam_vlans
      : [];
  for (const v of vlans) {
    const name = String(v?.name || v?.vid || '').trim();
    if (!name) continue;
    entries.push({
      modelName: 'ipam.vlan',
      key: name.toLowerCase(),
      name,
      plannedObj: v,
      edpRow,
      parsedEdp,
      clauseRefs
    });
  }

  const ips = Array.isArray(inv.ip_addresses) ? inv.ip_addresses : [];
  for (const ip of ips) {
    const addr = String(ip?.address || ip?.ip || '').trim();
    if (!addr) continue;
    entries.push({
      modelName: 'ipam.ipaddress',
      key: addr.toLowerCase(),
      name: addr,
      plannedObj: ip,
      edpRow,
      parsedEdp,
      clauseRefs
    });
  }

  return entries;
}

/**
 * Assure l'existence de la ligne `ProjectReconciliationState` pour un projet donné.
 */
export async function ensureProjectReconciliationState(
  projectId: string,
  db: any = prisma
): Promise<any> {
  const existing = await db.projectReconciliationState.findUnique({
    where: { projectId }
  });
  if (existing) return existing;

  try {
    return await db.projectReconciliationState.create({
      data: {
        projectId,
        enabled: true,
        intervalSeconds: DEFAULT_INTERVAL_SECONDS,
        staleThresholdSeconds: DEFAULT_INTERVAL_SECONDS * 3,
        connectorSilentDays: 7,
        lastStatus: 'never_run'
      }
    });
  } catch {
    return db.projectReconciliationState.findUnique({ where: { projectId } });
  }
}

/**
 * Met à jour les paramètres de planification de réconciliation d'un projet.
 */
export async function configureProjectReconciliation(
  projectId: string,
  config: {
    enabled?: boolean;
    intervalSeconds?: number;
    staleThresholdSeconds?: number;
    connectorSilentDays?: number;
  },
  db: any = prisma
): Promise<any> {
  await ensureProjectReconciliationState(projectId, db);
  const data: Record<string, unknown> = {};
  if (typeof config.enabled === 'boolean') data.enabled = config.enabled;
  if (typeof config.intervalSeconds === 'number' && Number.isFinite(config.intervalSeconds)) {
    data.intervalSeconds = Math.max(30, Math.min(86400, Math.round(config.intervalSeconds)));
  }
  if (
    typeof config.staleThresholdSeconds === 'number' &&
    Number.isFinite(config.staleThresholdSeconds)
  ) {
    data.staleThresholdSeconds = Math.max(
      60,
      Math.min(604800, Math.round(config.staleThresholdSeconds))
    );
  }
  if (typeof config.connectorSilentDays === 'number' && Number.isFinite(config.connectorSilentDays)) {
    data.connectorSilentDays = Math.max(1, Math.min(365, Math.round(config.connectorSilentDays)));
  }

  return db.projectReconciliationState.update({
    where: { projectId },
    data
  });
}

/**
 * Exécute une passe complète de réconciliation Nautobot pour un projet :
 *  - Verrou concurrent par projet ;
 *  - Lecture seule de l'intention figée (EDP) et comparaison avec Nautobot ;
 *  - Évaluation de l'état de réalisation (#399) ;
 *  - Enregistrement idempotent des `DriftFinding` et résolution des écarts disparus ;
 *  - En cas d'indisponibilité Nautobot : état `unverified` et conservation de `lastSuccessAt`.
 */
export async function reconcileProject(
  projectId: string,
  options: ReconcileProjectOptions = {}
): Promise<ReconcileProjectResult> {
  const db = options.db ?? prisma;
  const trigger: ReconciliationTrigger = options.trigger ?? 'manual';
  const nowFn = options.now ?? (() => new Date());
  const lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  const startedAt = nowFn();

  const emptySummary: RealizationCounts = {
    planned: 0,
    realized_proven: 0,
    declared_unproven: 0,
    unverified: 0,
    total: 0
  };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, shortName: true, strategy: true }
  });
  if (!project) {
    return {
      projectId,
      skipped: true,
      reason: 'project_not_found',
      status: 'skipped',
      nautobotReachable: false,
      checkedEdpCount: 0,
      observedObjects: 0,
      openFindingsCount: 0,
      newFindingsCount: 0,
      resolvedFindingsCount: 0,
      realizationSummary: emptySummary
    };
  }

  const stateRow = await ensureProjectReconciliationState(projectId, db);
  const lockToken = randomUUID();
  const lockCutoff = new Date(startedAt.getTime() - lockTtlMs);

  // Acquisition atomique du verrou par projet
  const lockAcquire = await db.projectReconciliationState.updateMany({
    where: {
      projectId,
      OR: [{ lockToken: null }, { lockedAt: null }, { lockedAt: { lt: lockCutoff } }]
    },
    data: {
      lockToken,
      lockedAt: startedAt
    }
  });

  if (!lockAcquire || lockAcquire.count === 0) {
    return {
      projectId,
      skipped: true,
      reason: 'locked',
      status: 'skipped',
      nautobotReachable: false,
      checkedEdpCount: 0,
      observedObjects: 0,
      openFindingsCount: 0,
      newFindingsCount: 0,
      resolvedFindingsCount: 0,
      realizationSummary: emptySummary
    };
  }

  const runRow = await db.reconciliationRun.create({
    data: {
      projectId,
      trigger,
      status: 'running',
      nautobotReachable: false,
      startedAt
    }
  });

  try {
    const nautobotOpts = resolveProjectNautobotOptions(project, {
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
    });
    const nautobotBaseUrl = (nautobotOpts.baseUrl || DEFAULT_NAUTOBOT_URL).replace(/\/+$/, '');
    const scope = nautobotOpts.projectScope
      ? normalizeProjectScope(nautobotOpts.projectScope)
      : undefined;
    const tagFilter = scope ? `&tag=${encodeURIComponent(projectTagName(scope))}` : '';

    // 1. Vérification de disponibilité Nautobot
    const statusProbe = await fetchNautobotJson('/api/status/', nautobotOpts);
    if (!statusProbe.ok) {
      const finishedAt = nowFn();
      const errMsg = `Nautobot injoignable (${statusProbe.error || 'erreur réseau'})`;

      // Préserver `lastSuccessAt` ; ne jamais fermer de findings ni passer en « conforme »
      await db.projectReconciliationState.update({
        where: { projectId },
        data: {
          lastAttemptAt: finishedAt,
          lastStatus: 'unverified',
          lastError: errMsg,
          consecutiveFailures: { increment: 1 }
        }
      });

      const existingOpen = await db.driftFinding.count({
        where: { projectId, state: 'open' }
      });

      await db.reconciliationRun.update({
        where: { id: runRow.id },
        data: {
          status: 'unverified',
          nautobotReachable: false,
          openFindingsCount: existingOpen,
          error: errMsg,
          finishedAt
        }
      });

      return {
        projectId,
        skipped: false,
        runId: runRow.id,
        status: 'unverified',
        nautobotReachable: false,
        checkedEdpCount: 0,
        observedObjects: 0,
        openFindingsCount: existingOpen,
        newFindingsCount: 0,
        resolvedFindingsCount: 0,
        realizationSummary: emptySummary,
        error: errMsg
      };
    }

    // 2. Lecture en direct des 3 familles de la tranche minimale (Tenant, Device, Prefix/VLAN/IP)
    const endpoints: Array<{ modelName: string; path: string; required: boolean }> = [
      { modelName: 'tenancy.tenant', path: `/api/tenancy/tenants/?limit=200${tagFilter}`, required: false },
      { modelName: 'dcim.device', path: `/api/dcim/devices/?limit=200${tagFilter}`, required: true },
      { modelName: 'ipam.prefix', path: `/api/ipam/prefixes/?limit=200${tagFilter}`, required: false },
      { modelName: 'ipam.vlan', path: `/api/ipam/vlans/?limit=200${tagFilter}`, required: false },
      { modelName: 'ipam.ipaddress', path: `/api/ipam/ip-addresses/?limit=200${tagFilter}`, required: false }
    ];

    const liveByModel = new Map<string, Map<string, Record<string, any>>>();
    let observedObjects = 0;

    for (const ep of endpoints) {
      const res = await fetchNautobotJson(ep.path, nautobotOpts);
      const map = new Map<string, Record<string, any>>();
      liveByModel.set(ep.modelName, map);
      if (!res.ok) {
        if (ep.required) {
          throw new Error(`Échec de lecture ${ep.path} : ${res.error}`);
        }
        continue;
      }
      const rawResults: any[] = Array.isArray(res.data?.results) ? res.data.results : [];
      for (const item of rawResults) {
        if (!item || typeof item !== 'object') continue;
        // Filtrage par scope projet pour les objets nommés (Tenant, Device, VLAN)
        if (scope && (ep.modelName === 'dcim.device' || ep.modelName === 'tenancy.tenant')) {
          const rawName = String(item.name || '');
          const markers = extractArchinexMarkers(item);
          const matchesScope =
            belongsToProjectScope(rawName, scope) || markers.projectId === projectId;
          if (!matchesScope) continue;
        }
        const key = extractLiveObjectKey(ep.modelName, item, scope);
        if (!key) continue;
        map.set(key, item);
        observedObjects += 1;
      }
    }

    // 3. Chargement des EDP actifs (intention figée) pour les sujets du projet
    const subjects = await db.subject.findMany({
      where: { projectId },
      select: { id: true }
    });
    const subjectIds = subjects.map((s: { id: string }) => s.id);

    const allEdps =
      subjectIds.length > 0
        ? await db.executableDecisionPackage.findMany({
            where: {
              subjectId: { in: subjectIds },
              status: { not: 'retracted' }
            },
            orderBy: { revision: 'desc' }
          })
        : [];

    // Ne retenir que la dernière révision non rétractée par sujet
    const latestEdpBySubject = new Map<string, any>();
    for (const edp of allEdps) {
      if (!latestEdpBySubject.has(edp.subjectId)) {
        latestEdpBySubject.set(edp.subjectId, edp);
      }
    }

    const activeEdps = Array.from(latestEdpBySubject.values());
    const sourceEvent = `nautobot_reconcile:${runRow.id}`;
    const matchedLiveKeys = new Set<string>();
    const allDrafts: DriftFindingDraft[] = [];
    const realizationItems: RealizationItem[] = [];
    const now = nowFn();
    const connectorSilentDays = stateRow?.connectorSilentDays ?? 7;

    for (const edpRow of activeEdps) {
      let parsedEdp: Record<string, any> | null = null;
      try {
        parsedEdp = JSON.parse(edpRow.content);
      } catch {
        continue;
      }
      if (!parsedEdp) continue;

      const plannedEntries = collectPlannedObjectsFromEdp(edpRow, parsedEdp);
      for (const entry of plannedEntries) {
        const modelMap = liveByModel.get(entry.modelName);
        const liveObj = modelMap?.get(entry.key) || null;
        if (liveObj) {
          matchedLiveKeys.add(`${entry.modelName}|${entry.key}`);
        }

        const objectRef = {
          type: entry.modelName,
          id: String(liveObj?.id || entry.plannedObj.id || entry.name),
          name: entry.name
        };

        // 3a. Évaluation de l'état de réalisation (#399)
        const realizationEval = evaluateRealizationStatus({
          nautobotReachable: true,
          isStale: false,
          observedObject: liveObj,
          expectedDecisionRevision: edpRow.revision,
          now,
          connectorSilentDays,
          plannedSince: edpRow.validatedAt ?? edpRow.createdAt
        });

        realizationItems.push({
          objectType: entry.modelName,
          objectId: objectRef.id,
          objectName: entry.name,
          subjectId: edpRow.subjectId,
          decisionId: edpRow.decisionId,
          decisionRevision: edpRow.revision,
          clauseRefs: entry.clauseRefs,
          state: realizationEval.state,
          reason: realizationEval.reason,
          observedStatus: realizationEval.observedStatus,
          evidence: realizationEval.evidence,
          nautobotUrl: buildNautobotObjectUrl(nautobotBaseUrl, objectRef)
        });

        // 3b. Détection d'écart contre l'intention figée
        if (!liveObj) {
          if (edpRow.status === 'validated' || edpRow.status === 'stale') {
            allDrafts.push({
              projectId,
              subjectId: edpRow.subjectId,
              decisionId: edpRow.decisionId,
              clauseRefs: entry.clauseRefs,
              objectRef,
              kind: 'missing',
              attributeKey: 'object_missing',
              outOfDecision: false,
              expected: entry.plannedObj,
              observed: null,
              severity: 'high',
              sourceEvent,
              summary: `Objet planifié '${entry.name}' (${entry.modelName}) absent de Nautobot.`
            });
          }
          continue;
        }

        const liveMarkers = extractArchinexMarkers(liveObj);
        const effectiveMarkers = hasTraceabilityMarkers(liveMarkers)
          ? liveMarkers
          : {
              projectId,
              subjectId: edpRow.subjectId,
              decisionId: edpRow.decisionId,
              decisionRevision: edpRow.revision,
              clauseRefs: entry.clauseRefs
            };

        const drafts = compareFrozenIntentWithNautobotObject({
          projectId,
          modelName: entry.modelName,
          eventType: 'reconcile',
          dataSnapshot: liveObj,
          markers: effectiveMarkers,
          frozenEdp: parsedEdp,
          subjectId: edpRow.subjectId,
          decisionId: edpRow.decisionId,
          sourceEvent,
          projectScope: scope
        });

        const delayMs = estimateDetectionDelayMs(liveObj, now.getTime());
        for (const d of drafts) {
          allDrafts.push({
            ...d,
            ...(delayMs !== null ? { detectedDelayMs: delayMs } : {})
          });
        }
      }
    }

    // 4. Objets présents dans Nautobot mais absents de toute intention planifiée (hors décision / imprévus)
    for (const [modelName, modelMap] of liveByModel.entries()) {
      for (const [key, liveObj] of modelMap.entries()) {
        if (matchedLiveKeys.has(`${modelName}|${key}`)) continue;

        const markers = extractArchinexMarkers(liveObj);
        const unmarked = !hasTraceabilityMarkers(markers);
        const objName = extractLiveObjectName(modelName, liveObj, scope);
        const delayMs = estimateDetectionDelayMs(liveObj, now.getTime());

        allDrafts.push({
          projectId,
          subjectId: unmarked ? null : markers.subjectId ?? null,
          decisionId: unmarked ? null : markers.decisionId ?? null,
          clauseRefs: unmarked ? [] : markers.clauseRefs,
          objectRef: {
            type: modelName,
            id: String(liveObj.id || objName),
            name: objName
          },
          kind: 'unexpected',
          attributeKey: unmarked ? 'out_of_decision' : 'unplanned_object',
          outOfDecision: unmarked,
          expected: null,
          observed: {
            model: modelName,
            name: objName,
            status: liveObj.status?.value || liveObj.status?.name || liveObj.status || null
          },
          severity: 'medium',
          sourceEvent,
          ...(delayMs !== null ? { detectedDelayMs: delayMs } : {}),
          summary: unmarked
            ? `Objet Nautobot '${objName}' (${modelName}) sans marquage archinex_* (écart hors décision).`
            : `Objet marqué '${objName}' (${modelName}) absent de l'intention planifiée.`
        });
      }
    }

    // 5. Persistance idempotente + auto-résolution des écarts disparus
    const existingOpenRows = await db.driftFinding.findMany({
      where: { projectId, state: 'open' },
      select: { fingerprint: true }
    });
    const prevOpenFingerprints = new Set<string>(
      existingOpenRows.map((r: { fingerprint: string }) => r.fingerprint)
    );

    const activeFingerprints = new Set<string>(
      allDrafts.map((d) =>
        computeDriftFingerprint({
          objectRef: d.objectRef,
          kind: d.kind,
          attributeKey: d.attributeKey
        })
      )
    );

    const newFindingsCount = Array.from(activeFingerprints).filter(
      (fp) => !prevOpenFingerprints.has(fp)
    ).length;

    if (allDrafts.length > 0) {
      await persistDriftFindings(allDrafts, db);
    }

    const resolvedFindingsCount = await resolveAbsentDriftFindings(
      projectId,
      activeFingerprints,
      now,
      db
    );

    const openFindingsCount = await db.driftFinding.count({
      where: { projectId, state: 'open' }
    });

    const realizationSummary = summarizeRealizationItems(realizationItems);
    const finishedAt = nowFn();

    await db.projectReconciliationState.update({
      where: { projectId },
      data: {
        lastAttemptAt: finishedAt,
        lastSuccessAt: finishedAt,
        lastStatus: 'succeeded',
        lastError: null,
        consecutiveFailures: 0,
        lastRealizationSnapshot: JSON.stringify(realizationItems)
      }
    });

    await db.reconciliationRun.update({
      where: { id: runRow.id },
      data: {
        status: 'succeeded',
        nautobotReachable: true,
        checkedEdpCount: activeEdps.length,
        observedObjects,
        openFindingsCount,
        newFindingsCount,
        resolvedFindingsCount,
        realizationSummary: JSON.stringify(realizationSummary),
        finishedAt
      }
    });

    return {
      projectId,
      skipped: false,
      runId: runRow.id,
      status: 'succeeded',
      nautobotReachable: true,
      checkedEdpCount: activeEdps.length,
      observedObjects,
      openFindingsCount,
      newFindingsCount,
      resolvedFindingsCount,
      realizationSummary
    };
  } catch (err: any) {
    const finishedAt = nowFn();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[ReconciliationJob] Erreur lors de la réconciliation:', {
      projectId,
      runId: runRow.id,
      error: err
    });

    await db.projectReconciliationState.update({
      where: { projectId },
      data: {
        lastAttemptAt: finishedAt,
        lastStatus: 'error',
        lastError: errMsg,
        consecutiveFailures: { increment: 1 }
      }
    });

    await db.reconciliationRun.update({
      where: { id: runRow.id },
      data: {
        status: 'error',
        nautobotReachable: false,
        error: errMsg,
        finishedAt
      }
    });

    return {
      projectId,
      skipped: false,
      runId: runRow.id,
      status: 'error',
      nautobotReachable: false,
      checkedEdpCount: 0,
      observedObjects: 0,
      openFindingsCount: 0,
      newFindingsCount: 0,
      resolvedFindingsCount: 0,
      realizationSummary: emptySummary,
      error: errMsg
    };
  } finally {
    // Libération du verrou uniquement si toujours détenu par ce jeton
    try {
      await db.projectReconciliationState.updateMany({
        where: { projectId, lockToken },
        data: { lockToken: null, lockedAt: null }
      });
    } catch (unlockErr) {
      console.error('[ReconciliationJob] Impossible de libérer le verrou:', {
        projectId,
        error: unlockErr
      });
    }
  }
}

/**
 * Ordonnanceur périodique léger pour exécuter `reconcileProject` sur les projets éligibles.
 */
export class ReconciliationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;
  private readonly tickIntervalMs: number;
  private readonly db: any;
  private readonly fetchImpl?: typeof fetch;
  private readonly now: () => Date;

  constructor(options: {
    tickIntervalMs?: number;
    db?: any;
    fetchImpl?: typeof fetch;
    now?: () => Date;
  } = {}) {
    this.tickIntervalMs = Math.max(5000, options.tickIntervalMs ?? 60_000);
    this.db = options.db ?? prisma;
    this.fetchImpl = options.fetchImpl;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runDueProjects();
    }, this.tickIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Identifie et réconcilie tous les projets actifs dont l'intervalle est échu.
   */
  async runDueProjects(): Promise<ReconcileProjectResult[]> {
    if (this.isTicking) return [];
    this.isTicking = true;
    const results: ReconcileProjectResult[] = [];
    try {
      const now = this.now();
      const projects = await this.db.project.findMany({
        where: { status: 'active' },
        select: { id: true }
      });
      const states = await this.db.projectReconciliationState.findMany();
      const stateByProject = new Map<string, any>(
        states.map((s: any) => [s.projectId, s])
      );

      for (const proj of projects) {
        const st = stateByProject.get(proj.id);
        if (st && st.enabled === false) continue;

        const intervalMs = Math.max(30, st?.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS) * 1000;
        const lastAttemptMs = st?.lastAttemptAt ? new Date(st.lastAttemptAt).getTime() : null;
        const isDue = lastAttemptMs === null || now.getTime() - lastAttemptMs >= intervalMs;
        if (!isDue) continue;

        const res = await reconcileProject(proj.id, {
          trigger: 'scheduled',
          db: this.db,
          fetchImpl: this.fetchImpl,
          now: this.now
        });
        results.push(res);
      }
    } catch (err) {
      console.error('[ReconciliationScheduler] Erreur lors du cycle périodique:', err);
    } finally {
      this.isTicking = false;
    }
    return results;
  }
}

let singletonScheduler: ReconciliationScheduler | null = null;

export function getReconciliationScheduler(): ReconciliationScheduler {
  if (!singletonScheduler) {
    singletonScheduler = new ReconciliationScheduler();
  }
  return singletonScheduler;
}
