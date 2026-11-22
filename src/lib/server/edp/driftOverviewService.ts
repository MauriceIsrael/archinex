/**
 * Service de synthèse de la dérive et de l'état de réalisation d'un projet (Issue #379).
 *
 * Alimente :
 *  - la vue « Dérive » (Phase 5 · Consolidation) ;
 *  - la pastille d'état dans l'en-tête (`ProjectEngagementHeader`) ;
 *  - la vue de couverture (#402) via `getProjectRealizationCoverage`.
 */

import { prisma } from '../prisma';
import { listDriftFindings } from './driftService';
import { resolveProjectNautobotOptions } from './nautobotSync';
import type { DriftFindingRecord } from './driftTypes';
import {
  computeDriftIndicators,
  evaluateDriftPosture,
  type DriftIndicators,
  type DriftPosture,
  type ReconciliationHealthStatus
} from '../../domain/edp/driftMetrics.js';
import {
  buildNautobotObjectUrl,
  summarizeRealizationItems,
  type RealizationCounts,
  type RealizationItem
} from '../../domain/edp/realizationStatus.js';

const DEFAULT_NAUTOBOT_URL = process.env.NAUTOBOT_URL || 'http://localhost:8080';

export interface DriftFindingViewItem extends DriftFindingRecord {
  ageMs: number;
  nautobotUrl: string | null;
  subjectTitle: string | null;
  subjectSectionRef: string | null;
}

export interface StaleDecisionItem {
  edpId: string;
  decisionId: string;
  subjectId: string;
  subjectTitle: string | null;
  subjectSectionRef: string | null;
  revision: number;
  staleReason: string | null;
  updatedAt: string;
}

export interface ReconciliationRunSummary {
  id: string;
  trigger: string;
  status: string;
  nautobotReachable: boolean;
  checkedEdpCount: number;
  observedObjects: number;
  openFindingsCount: number;
  newFindingsCount: number;
  resolvedFindingsCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ProjectRealizationCoverage {
  projectId: string;
  posture: DriftPosture;
  verified: boolean;
  lastSuccessAt: string | null;
  lastSuccessAgeMs: number | null;
  isStale: boolean;
  summary: RealizationCounts;
  items: RealizationItem[];
}

export interface ProjectDriftOverview {
  projectId: string;
  posture: DriftPosture;
  postureReason: string;
  reconciliation: {
    status: ReconciliationHealthStatus;
    enabled: boolean;
    intervalSeconds: number;
    staleThresholdSeconds: number;
    connectorSilentDays: number;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastSuccessAgeMs: number | null;
    isStale: boolean;
    consecutiveFailures: number;
    lastError: string | null;
    nautobotBaseUrl: string;
  };
  indicators: DriftIndicators;
  findings: DriftFindingViewItem[];
  staleDecisions: StaleDecisionItem[];
  realization: {
    summary: RealizationCounts;
    items: RealizationItem[];
  };
  recentRuns: ReconciliationRunSummary[];
  generatedAt: string;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Construit la vue consolidée de la dérive et de la réalisation pour un projet.
 */
export async function getProjectDriftOverview(
  projectId: string,
  options: {
    includeResolved?: boolean;
    db?: any;
    now?: Date;
  } = {}
): Promise<ProjectDriftOverview> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  const [project, stateRow, allFindings, subjects, recentRunsRows] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { id: true, shortName: true, strategy: true }
    }),
    db.projectReconciliationState?.findUnique({
      where: { projectId }
    }),
    listDriftFindings({ projectId }, db),
    db.subject.findMany({
      where: { projectId },
      select: { id: true, name: true, sectionRef: true }
    }),
    db.reconciliationRun?.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 5
    }) ?? []
  ]);

  const subjectById = new Map<string, { id: string; name: string; sectionRef: string }>(
    subjects.map((s: any) => [s.id, s])
  );
  const subjectIds = subjects.map((s: any) => s.id);

  // Décisions caduques (`stale`) du projet
  const staleEdpRows =
    subjectIds.length > 0
      ? await db.executableDecisionPackage.findMany({
          where: {
            subjectId: { in: subjectIds },
            status: 'stale'
          },
          orderBy: { updatedAt: 'desc' }
        })
      : [];

  const staleDecisions: StaleDecisionItem[] = staleEdpRows.map((row: any) => {
    const sub = subjectById.get(row.subjectId);
    return {
      edpId: row.id,
      decisionId: row.decisionId,
      subjectId: row.subjectId,
      subjectTitle: sub?.name ?? null,
      subjectSectionRef: sub?.sectionRef ?? null,
      revision: row.revision,
      staleReason: row.staleReason ?? null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)
    };
  });

  const nautobotOpts = resolveProjectNautobotOptions(project || { id: projectId });
  const nautobotBaseUrl = (nautobotOpts.baseUrl || DEFAULT_NAUTOBOT_URL).replace(/\/+$/, '');

  const lastStatus = (stateRow?.lastStatus || 'never_run') as ReconciliationHealthStatus;
  const intervalSeconds = stateRow?.intervalSeconds ?? 300;
  const staleThresholdSeconds = stateRow?.staleThresholdSeconds ?? 900;
  const connectorSilentDays = stateRow?.connectorSilentDays ?? 7;
  const lastSuccessAt = stateRow?.lastSuccessAt
    ? stateRow.lastSuccessAt instanceof Date
      ? stateRow.lastSuccessAt.toISOString()
      : String(stateRow.lastSuccessAt)
    : null;
  const lastAttemptAt = stateRow?.lastAttemptAt
    ? stateRow.lastAttemptAt instanceof Date
      ? stateRow.lastAttemptAt.toISOString()
      : String(stateRow.lastAttemptAt)
    : null;

  const indicators = computeDriftIndicators(allFindings, staleDecisions.length, now);

  const postureEval = evaluateDriftPosture({
    lastStatus,
    lastSuccessAt,
    staleThresholdSeconds,
    openFindingsCount: indicators.openBySeverity.total,
    staleDecisionsCount: staleDecisions.length,
    now
  });

  // Enrichissement des findings avec âge et lien direct vers Nautobot
  const visibleFindings = options.includeResolved
    ? allFindings
    : allFindings.filter((f) => f.state === 'open');

  const findingsView: DriftFindingViewItem[] = visibleFindings.map((f) => {
    const firstMs = Date.parse(f.firstSeenAt);
    const ageMs = Number.isFinite(firstMs) ? Math.max(0, nowMs - firstMs) : 0;
    const sub = f.subjectId ? subjectById.get(f.subjectId) : undefined;
    return {
      ...f,
      ageMs,
      nautobotUrl: buildNautobotObjectUrl(nautobotBaseUrl, f.objectRef),
      subjectTitle: sub?.name ?? null,
      subjectSectionRef: sub?.sectionRef ?? null
    };
  });

  // État de réalisation (#399) : si la réconciliation n'est pas vérifiée / est périmée,
  // aucun objet ne peut apparaître comme « réalisé prouvé » — ils basculent en `unverified`.
  const rawRealizationItems = safeParseJson<RealizationItem[]>(
    stateRow?.lastRealizationSnapshot,
    []
  );
  const isUnverified = postureEval.posture === 'unverified';
  const realizationItems: RealizationItem[] = rawRealizationItems.map((item) => {
    const url =
      item.nautobotUrl ||
      buildNautobotObjectUrl(nautobotBaseUrl, {
        type: item.objectType,
        id: item.objectId,
        name: item.objectName
      });
    if (isUnverified && item.state !== 'unverified') {
      return {
        ...item,
        state: 'unverified',
        reason: postureEval.reason,
        nautobotUrl: url
      };
    }
    return { ...item, nautobotUrl: url };
  });

  const realizationSummary = summarizeRealizationItems(realizationItems);

  const recentRuns: ReconciliationRunSummary[] = (recentRunsRows || []).map((r: any) => ({
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    nautobotReachable: Boolean(r.nautobotReachable),
    checkedEdpCount: r.checkedEdpCount ?? 0,
    observedObjects: r.observedObjects ?? 0,
    openFindingsCount: r.openFindingsCount ?? 0,
    newFindingsCount: r.newFindingsCount ?? 0,
    resolvedFindingsCount: r.resolvedFindingsCount ?? 0,
    error: r.error ?? null,
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : String(r.startedAt),
    finishedAt: r.finishedAt
      ? r.finishedAt instanceof Date
        ? r.finishedAt.toISOString()
        : String(r.finishedAt)
      : null
  }));

  return {
    projectId,
    posture: postureEval.posture,
    postureReason: postureEval.reason,
    reconciliation: {
      status: lastStatus,
      enabled: stateRow?.enabled ?? true,
      intervalSeconds,
      staleThresholdSeconds,
      connectorSilentDays,
      lastAttemptAt,
      lastSuccessAt,
      lastSuccessAgeMs: postureEval.lastSuccessAgeMs,
      isStale: postureEval.isStale,
      consecutiveFailures: stateRow?.consecutiveFailures ?? 0,
      lastError: stateRow?.lastError ?? null,
      nautobotBaseUrl
    },
    indicators,
    findings: findingsView,
    staleDecisions,
    realization: {
      summary: realizationSummary,
      items: realizationItems
    },
    recentRuns,
    generatedAt: now.toISOString()
  };
}

/**
 * Source de vérité unique de l'état de réalisation d'un projet,
 * destinée à alimenter directement la vue de couverture (#402).
 */
export async function getProjectRealizationCoverage(
  projectId: string,
  options: { db?: any; now?: Date } = {}
): Promise<ProjectRealizationCoverage> {
  const overview = await getProjectDriftOverview(projectId, options);
  return {
    projectId,
    posture: overview.posture,
    verified: overview.posture !== 'unverified',
    lastSuccessAt: overview.reconciliation.lastSuccessAt,
    lastSuccessAgeMs: overview.reconciliation.lastSuccessAgeMs,
    isStale: overview.reconciliation.isStale,
    summary: overview.realization.summary,
    items: overview.realization.items
  };
}
