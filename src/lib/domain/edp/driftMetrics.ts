/**
 * Calcul pur de la posture de dérive (« non vérifié » vs « dérive détectée » vs « aucune dérive »)
 * et des indicateurs de pilotage (Issue #379).
 *
 * Invariant fondamental (#379 / ADR-017 règle 6) :
 *  - Jamais de posture `no_drift` (vert) en l'absence de réconciliation réussie, en cas de panne Nautobot,
 *    ou si la dernière réconciliation réussie est périmée (`isStale === true`).
 */

import type { DriftSeverity, DriftState } from '../../server/edp/driftTypes.js';

export type DriftPosture = 'unverified' | 'drift_detected' | 'no_drift';

export type ReconciliationHealthStatus = 'never_run' | 'succeeded' | 'unverified' | 'error';

export interface DriftFindingMetricInput {
  severity: DriftSeverity;
  state: DriftState;
  outOfDecision: boolean;
  firstSeenAt: string | Date;
  lastSeenAt: string | Date;
  resolvedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  detectedDelayMs?: number | null;
}

export interface OpenBySeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DriftIndicators {
  openBySeverity: OpenBySeverityCounts;
  oldestOpenFindingAgeMs: number | null;
  averageOpenFindingAgeMs: number | null;
  averageDetectionDelayMs: number | null;
  averageResolutionDelayMs: number | null;
  outOfDecisionCount: number;
  outOfDecisionRatio: number | null;
  staleDecisionsCount: number;
}

export interface PostureEvaluation {
  posture: DriftPosture;
  isStale: boolean;
  lastSuccessAgeMs: number | null;
  reason: string;
}

function toMs(val: string | Date | null | undefined): number | null {
  if (!val) return null;
  const ts = val instanceof Date ? val.getTime() : Date.parse(String(val));
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Détermine la posture de dérive du projet en distinguant strictement
 * « réconciliation non effectuée / périmée / Nautobot injoignable » (`unverified`)
 * de « aucune dérive » (`no_drift`).
 */
export function evaluateDriftPosture(input: {
  lastStatus: ReconciliationHealthStatus;
  lastSuccessAt: string | Date | null | undefined;
  staleThresholdSeconds: number;
  openFindingsCount: number;
  staleDecisionsCount: number;
  now?: Date;
}): PostureEvaluation {
  const nowMs = (input.now ?? new Date()).getTime();
  const lastSuccessMs = toMs(input.lastSuccessAt);
  const lastSuccessAgeMs = lastSuccessMs !== null ? Math.max(0, nowMs - lastSuccessMs) : null;
  const staleLimitMs = Math.max(1, input.staleThresholdSeconds) * 1000;
  const isStale = lastSuccessAgeMs === null ? true : lastSuccessAgeMs > staleLimitMs;

  if (input.lastStatus === 'never_run' || lastSuccessMs === null) {
    return {
      posture: 'unverified',
      isStale: true,
      lastSuccessAgeMs: null,
      reason: 'Aucune réconciliation Nautobot n’a encore réussi sur ce projet.'
    };
  }

  if (input.lastStatus === 'unverified' || input.lastStatus === 'error') {
    return {
      posture: 'unverified',
      isStale,
      lastSuccessAgeMs,
      reason:
        input.lastStatus === 'unverified'
          ? 'Nautobot était injoignable lors de la dernière tentative de réconciliation.'
          : 'La dernière tentative de réconciliation a échoué.'
    };
  }

  if (isStale) {
    return {
      posture: 'unverified',
      isStale: true,
      lastSuccessAgeMs,
      reason: `Dernière réconciliation réussie trop ancienne (${formatDurationFr(lastSuccessAgeMs)} > seuil ${formatDurationFr(staleLimitMs)}).`
    };
  }

  if (input.openFindingsCount > 0 || input.staleDecisionsCount > 0) {
    const parts: string[] = [];
    if (input.openFindingsCount > 0) {
      parts.push(`${input.openFindingsCount} écart(s) ouvert(s)`);
    }
    if (input.staleDecisionsCount > 0) {
      parts.push(`${input.staleDecisionsCount} décision(s) caduque(s)`);
    }
    return {
      posture: 'drift_detected',
      isStale: false,
      lastSuccessAgeMs,
      reason: `Dérive active : ${parts.join(' et ')}.`
    };
  }

  return {
    posture: 'no_drift',
    isStale: false,
    lastSuccessAgeMs,
    reason: 'Réconciliation récente réussie, aucun écart ouvert ni décision caduque.'
  };
}

/**
 * Calcule les indicateurs de gouvernance de la dérive :
 *  - répartition des findings ouverts par sévérité ;
 *  - âge max et moyen des findings ouverts ;
 *  - délai moyen de détection ;
 *  - délai moyen de résolution ;
 *  - ratio « hors décision » sur les findings ouverts.
 */
export function computeDriftIndicators(
  findings: ReadonlyArray<DriftFindingMetricInput>,
  staleDecisionsCount: number,
  now: Date = new Date()
): DriftIndicators {
  const nowMs = now.getTime();
  const openBySeverity: OpenBySeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0
  };

  let openAgesSum = 0;
  let openAgesCount = 0;
  let oldestOpenFindingAgeMs: number | null = null;
  let outOfDecisionCount = 0;

  let detectionDelaySum = 0;
  let detectionDelayCount = 0;

  let resolutionDelaySum = 0;
  let resolutionDelayCount = 0;

  for (const f of findings) {
    const firstMs = toMs(f.firstSeenAt);

    if (typeof f.detectedDelayMs === 'number' && Number.isFinite(f.detectedDelayMs) && f.detectedDelayMs >= 0) {
      detectionDelaySum += f.detectedDelayMs;
      detectionDelayCount += 1;
    }

    if (f.state === 'open') {
      openBySeverity.total += 1;
      if (f.severity === 'critical') openBySeverity.critical += 1;
      else if (f.severity === 'high') openBySeverity.high += 1;
      else if (f.severity === 'medium') openBySeverity.medium += 1;
      else openBySeverity.low += 1;

      if (f.outOfDecision) outOfDecisionCount += 1;

      if (firstMs !== null) {
        const ageMs = Math.max(0, nowMs - firstMs);
        openAgesSum += ageMs;
        openAgesCount += 1;
        if (oldestOpenFindingAgeMs === null || ageMs > oldestOpenFindingAgeMs) {
          oldestOpenFindingAgeMs = ageMs;
        }
      }
    } else {
      // Résolu (remediated | amended | waived)
      const resolvedMs = toMs(f.resolvedAt) ?? toMs(f.updatedAt) ?? toMs(f.lastSeenAt);
      if (firstMs !== null && resolvedMs !== null && resolvedMs >= firstMs) {
        resolutionDelaySum += resolvedMs - firstMs;
        resolutionDelayCount += 1;
      }
    }
  }

  return {
    openBySeverity,
    oldestOpenFindingAgeMs,
    averageOpenFindingAgeMs: openAgesCount > 0 ? Math.round(openAgesSum / openAgesCount) : null,
    averageDetectionDelayMs:
      detectionDelayCount > 0 ? Math.round(detectionDelaySum / detectionDelayCount) : null,
    averageResolutionDelayMs:
      resolutionDelayCount > 0 ? Math.round(resolutionDelaySum / resolutionDelayCount) : null,
    outOfDecisionCount,
    outOfDecisionRatio:
      openBySeverity.total > 0
        ? Math.round((outOfDecisionCount / openBySeverity.total) * 1000) / 1000
        : null,
    staleDecisionsCount: Math.max(0, staleDecisionsCount)
  };
}

/**
 * Formate une durée en millisecondes en libellé français compact (ex. « 4 min », « 2 h 15 min », « 3 j »).
 */
export function formatDurationFr(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const totalHours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  if (totalHours < 24) {
    return remMin > 0 ? `${totalHours} h ${remMin} min` : `${totalHours} h`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days} j ${remHours} h` : `${days} j`;
}

/**
 * Formate un âge relatif en français (ex. « il y a 4 min », « à l'instant »).
 */
export function formatRelativeAgeFr(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return 'Jamais';
  if (ms < 5000) return 'à l’instant';
  return `il y a ${formatDurationFr(ms)}`;
}
