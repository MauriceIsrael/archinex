import { describe, it, expect } from 'vitest';
import {
  buildNautobotObjectUrl,
  evaluateRealizationStatus,
  summarizeRealizationItems
} from '../../src/lib/domain/edp/realizationStatus';
import {
  computeDriftIndicators,
  evaluateDriftPosture,
  formatDurationFr,
  formatRelativeAgeFr
} from '../../src/lib/domain/edp/driftMetrics';

describe('Issue #379 / #399 — État de réalisation (contrat write-back)', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');

  it('retourne unverified lorsque Nautobot est injoignable, même si un objet était actif', () => {
    const res = evaluateRealizationStatus({
      nautobotReachable: false,
      observedObject: {
        status: { value: 'active' },
        custom_fields: {
          realized_status: 'active',
          realized_revision: 2,
          evidence_ref: 'https://ci.example/runs/42'
        }
      },
      expectedDecisionRevision: 2,
      now
    });
    expect(res.state).toBe('unverified');
  });

  it('retourne unverified lorsque la dernière réconciliation est périmée (isStale)', () => {
    const res = evaluateRealizationStatus({
      nautobotReachable: true,
      isStale: true,
      observedObject: {
        status: { value: 'active' },
        custom_fields: {
          realized_revision: 1,
          evidence_ref: 'https://ci.example/runs/1'
        }
      },
      expectedDecisionRevision: 1,
      now
    });
    expect(res.state).toBe('unverified');
  });

  it('retourne realized_proven uniquement si active + evidence_ref présent + realized_revision concordante', () => {
    const res = evaluateRealizationStatus({
      nautobotReachable: true,
      observedObject: {
        status: { value: 'active' },
        custom_fields: {
          realized_status: 'active',
          realized_revision: 3,
          realized_by: 'connector-gitops@1.2.0',
          realized_at: '2026-11-21T11:30:00.000Z',
          evidence_ref: 'https://git.example/org/repo/commit/abc123'
        }
      },
      expectedDecisionRevision: 3,
      now
    });
    expect(res.state).toBe('realized_proven');
    expect(res.evidence.evidenceRef).toBe('https://git.example/org/repo/commit/abc123');
    expect(res.evidence.realizedBy).toBe('connector-gitops@1.2.0');
  });

  it('retourne declared_unproven si statut active mais evidence_ref absent (jamais réalisé prouvé sans preuve)', () => {
    const res = evaluateRealizationStatus({
      nautobotReachable: true,
      observedObject: {
        status: { value: 'active' },
        custom_fields: {
          realized_status: 'active',
          realized_revision: 2
        }
      },
      expectedDecisionRevision: 2,
      now
    });
    expect(res.state).toBe('declared_unproven');
    expect(res.reason).toContain('evidence_ref');
  });

  it('retourne declared_unproven si realized_revision diverge de la révision décidée', () => {
    const res = evaluateRealizationStatus({
      nautobotReachable: true,
      observedObject: {
        status: { value: 'active' },
        custom_fields: {
          realized_status: 'active',
          realized_revision: 1,
          evidence_ref: 'https://ci.example/runs/99'
        }
      },
      expectedDecisionRevision: 2,
      now
    });
    expect(res.state).toBe('declared_unproven');
    expect(res.reason).toContain('révision');
  });

  it('retourne planned pour un objet au statut planned récent', () => {
    const res = evaluateRealizationStatus({
      nautobotReachable: true,
      observedObject: { status: { value: 'planned' } },
      expectedDecisionRevision: 1,
      plannedSince: '2026-11-20T12:00:00.000Z',
      connectorSilentDays: 7,
      now
    });
    expect(res.state).toBe('planned');
  });

  it('retourne unverified si aucun retour connecteur depuis plus de N jours', () => {
    const res = evaluateRealizationStatus({
      nautobotReachable: true,
      observedObject: { status: { value: 'planned' } },
      expectedDecisionRevision: 1,
      plannedSince: '2026-11-01T12:00:00.000Z',
      connectorSilentDays: 7,
      now
    });
    expect(res.state).toBe('unverified');
  });

  it('agrège correctement les compteurs de réalisation', () => {
    const counts = summarizeRealizationItems([
      { state: 'planned' },
      { state: 'realized_proven' },
      { state: 'realized_proven' },
      { state: 'declared_unproven' },
      { state: 'unverified' }
    ]);
    expect(counts).toEqual({
      planned: 1,
      realized_proven: 2,
      declared_unproven: 1,
      unverified: 1,
      total: 5
    });
  });

  it('construit des liens directs Nautobot pour UUID et recherche par nom', () => {
    expect(
      buildNautobotObjectUrl('https://nautobot.internal/', {
        type: 'dcim.device',
        id: '11111111-2222-3333-4444-555555555555',
        name: 'compute-01'
      })
    ).toBe('https://nautobot.internal/dcim/devices/11111111-2222-3333-4444-555555555555/');

    expect(
      buildNautobotObjectUrl('https://nautobot.internal', {
        type: 'ipam.prefix',
        id: '10.10.0.0/24',
        name: '10.10.0.0/24'
      })
    ).toBe('https://nautobot.internal/ipam/prefixes/?q=10.10.0.0%2F24');

    expect(buildNautobotObjectUrl('', { type: 'dcim.device', id: 'x' })).toBeNull();
  });
});

describe('Issue #379 — Posture de dérive et indicateurs', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');

  it('ne retourne JAMAIS no_drift quand aucune réconciliation n’a réussi', () => {
    const res = evaluateDriftPosture({
      lastStatus: 'never_run',
      lastSuccessAt: null,
      staleThresholdSeconds: 900,
      openFindingsCount: 0,
      staleDecisionsCount: 0,
      now
    });
    expect(res.posture).toBe('unverified');
    expect(res.isStale).toBe(true);
    expect(res.lastSuccessAgeMs).toBeNull();
  });

  it('retourne unverified en cas de panne Nautobot même si 0 écart ouvert et lastSuccessAt récent', () => {
    const res = evaluateDriftPosture({
      lastStatus: 'unverified',
      lastSuccessAt: '2026-11-21T11:58:00.000Z',
      staleThresholdSeconds: 900,
      openFindingsCount: 0,
      staleDecisionsCount: 0,
      now
    });
    expect(res.posture).toBe('unverified');
    expect(res.lastSuccessAgeMs).toBe(120_000);
  });

  it('retourne unverified lorsque la dernière réconciliation réussie dépasse le seuil de péremption', () => {
    const res = evaluateDriftPosture({
      lastStatus: 'succeeded',
      lastSuccessAt: '2026-11-21T11:30:00.000Z', // 30 min > 15 min
      staleThresholdSeconds: 900,
      openFindingsCount: 0,
      staleDecisionsCount: 0,
      now
    });
    expect(res.posture).toBe('unverified');
    expect(res.isStale).toBe(true);
  });

  it('retourne no_drift uniquement quand réconciliation réussie, fraîche, 0 écart et 0 décision stale', () => {
    const res = evaluateDriftPosture({
      lastStatus: 'succeeded',
      lastSuccessAt: '2026-11-21T11:55:00.000Z',
      staleThresholdSeconds: 900,
      openFindingsCount: 0,
      staleDecisionsCount: 0,
      now
    });
    expect(res.posture).toBe('no_drift');
    expect(res.isStale).toBe(false);
    expect(res.lastSuccessAgeMs).toBe(300_000);
  });

  it('retourne drift_detected quand des écarts ouverts ou des décisions stale existent', () => {
    const res = evaluateDriftPosture({
      lastStatus: 'succeeded',
      lastSuccessAt: '2026-11-21T11:58:00.000Z',
      staleThresholdSeconds: 900,
      openFindingsCount: 0,
      staleDecisionsCount: 1,
      now
    });
    expect(res.posture).toBe('drift_detected');
  });

  it('calcule les indicateurs (sévérités, âge, délai détection, délai résolution, ratio hors décision)', () => {
    const ind = computeDriftIndicators(
      [
        {
          severity: 'high',
          state: 'open',
          outOfDecision: false,
          firstSeenAt: '2026-11-21T11:00:00.000Z', // 60 min
          lastSeenAt: '2026-11-21T11:55:00.000Z',
          detectedDelayMs: 60_000
        },
        {
          severity: 'medium',
          state: 'open',
          outOfDecision: true,
          firstSeenAt: '2026-11-21T11:30:00.000Z', // 30 min
          lastSeenAt: '2026-11-21T11:55:00.000Z',
          detectedDelayMs: 120_000
        },
        {
          severity: 'low',
          state: 'remediated',
          outOfDecision: false,
          firstSeenAt: '2026-11-21T10:00:00.000Z',
          lastSeenAt: '2026-11-21T10:20:00.000Z',
          resolvedAt: '2026-11-21T10:30:00.000Z', // 30 min résolution
          detectedDelayMs: 180_000
        }
      ],
      2,
      now
    );

    expect(ind.openBySeverity).toEqual({ critical: 0, high: 1, medium: 1, low: 0, total: 2 });
    expect(ind.oldestOpenFindingAgeMs).toBe(3_600_000);
    expect(ind.averageOpenFindingAgeMs).toBe(2_700_000);
    expect(ind.averageDetectionDelayMs).toBe(120_000);
    expect(ind.averageResolutionDelayMs).toBe(1_800_000);
    expect(ind.outOfDecisionCount).toBe(1);
    expect(ind.outOfDecisionRatio).toBe(0.5);
    expect(ind.staleDecisionsCount).toBe(2);
  });

  it('formate les durées et âges relatifs en français', () => {
    expect(formatDurationFr(null)).toBe('—');
    expect(formatDurationFr(45_000)).toBe('45 s');
    expect(formatDurationFr(300_000)).toBe('5 min');
    expect(formatDurationFr(5_400_000)).toBe('1 h 30 min');
    expect(formatRelativeAgeFr(null)).toBe('Jamais');
    expect(formatRelativeAgeFr(2000)).toBe('à l’instant');
    expect(formatRelativeAgeFr(240_000)).toBe('il y a 4 min');
  });
});
