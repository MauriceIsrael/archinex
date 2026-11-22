import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: false,
	dev: true,
	building: false,
	version: 'test'
}));

import { render } from 'svelte/server';
import ProjectEngagementHeader from '$lib/components/deliberation/ProjectEngagementHeader.svelte';
import Phase5DriftView from '$lib/components/deliberation/Phase5DriftView.svelte';
import Phase5ConsolidationHub from '$lib/components/deliberation/Phase5ConsolidationHub.svelte';
import '$lib/i18n';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';
import type { ProjectDriftOverview } from '$lib/server/edp/driftOverviewService';

function buildSampleOverview(overrides: Partial<ProjectDriftOverview> = {}): ProjectDriftOverview {
	return {
		projectId: 'proj-sample',
		posture: 'drift_detected',
		postureReason: 'Dérive active : 2 écart(s) ouvert(s) et 1 décision(s) caduque(s).',
		reconciliation: {
			status: 'succeeded',
			enabled: true,
			intervalSeconds: 300,
			staleThresholdSeconds: 900,
			connectorSilentDays: 7,
			lastAttemptAt: '2026-11-21T11:56:00.000Z',
			lastSuccessAt: '2026-11-21T11:56:00.000Z',
			lastSuccessAgeMs: 240_000,
			isStale: false,
			consecutiveFailures: 0,
			lastError: null,
			nautobotBaseUrl: 'https://nautobot.example.internal'
		},
		indicators: {
			openBySeverity: { critical: 0, high: 1, medium: 1, low: 0, total: 2 },
			oldestOpenFindingAgeMs: 3_600_000,
			averageOpenFindingAgeMs: 2_400_000,
			averageDetectionDelayMs: 180_000,
			averageResolutionDelayMs: 900_000,
			outOfDecisionCount: 1,
			outOfDecisionRatio: 0.5,
			staleDecisionsCount: 1
		},
		findings: [
			{
				id: 'f1',
				projectId: 'proj-sample',
				subjectId: 'sub-1',
				decisionId: 'dec-1',
				clauseRefs: ['REQ-01'],
				objectRef: {
					type: 'dcim.device',
					id: '11111111-1111-4111-8111-111111111111',
					name: 'compute-01'
				},
				attributeKey: 'device_type',
				fingerprint: 'fp-1',
				kind: 'attribute_mismatch',
				outOfDecision: false,
				expected: 'Generic-2U',
				observed: 'Alt-1U',
				severity: 'high',
				firstSeenAt: '2026-11-21T11:00:00.000Z',
				lastSeenAt: '2026-11-21T11:56:00.000Z',
				resolvedAt: null,
				detectedDelayMs: 180_000,
				state: 'open',
				sourceEvent: 'nautobot_reconcile:run-1',
				ageMs: 3_600_000,
				nautobotUrl: 'https://nautobot.example.internal/dcim/devices/11111111-1111-4111-8111-111111111111/',
				subjectTitle: 'Socle de calcul',
				subjectSectionRef: 'SEC-01'
			},
			{
				id: 'f2',
				projectId: 'proj-sample',
				subjectId: null,
				decisionId: null,
				clauseRefs: [],
				objectRef: {
					type: 'dcim.device',
					id: '22222222-2222-4222-8222-222222222222',
					name: 'rogue-box'
				},
				attributeKey: 'out_of_decision',
				fingerprint: 'fp-2',
				kind: 'unexpected',
				outOfDecision: true,
				expected: null,
				observed: { name: 'rogue-box' },
				severity: 'medium',
				firstSeenAt: '2026-11-21T11:40:00.000Z',
				lastSeenAt: '2026-11-21T11:56:00.000Z',
				resolvedAt: null,
				detectedDelayMs: 120_000,
				state: 'open',
				sourceEvent: 'nautobot_reconcile:run-1',
				ageMs: 1_200_000,
				nautobotUrl: 'https://nautobot.example.internal/dcim/devices/22222222-2222-4222-8222-222222222222/',
				subjectTitle: null,
				subjectSectionRef: null
			}
		],
		staleDecisions: [
			{
				edpId: 'edp-1',
				decisionId: 'dec-1',
				subjectId: 'sub-1',
				subjectTitle: 'Socle de calcul',
				subjectSectionRef: 'SEC-01',
				revision: 2,
				staleReason: 'Écart matériel détecté dans Nautobot',
				updatedAt: '2026-11-21T11:56:00.000Z'
			}
		],
		realization: {
			summary: {
				planned: 1,
				realized_proven: 1,
				declared_unproven: 1,
				unverified: 0,
				total: 3
			},
			items: [
				{
					objectType: 'dcim.device',
					objectId: '11111111-1111-4111-8111-111111111111',
					objectName: 'compute-01',
					subjectId: 'sub-1',
					decisionId: 'dec-1',
					decisionRevision: 2,
					clauseRefs: ['REQ-01'],
					state: 'realized_proven',
					reason: 'Réalisé et prouvé (rév. 2, par connector-ref@1.0.0).',
					observedStatus: 'active',
					evidence: {
						realizedStatus: 'active',
						realizedAt: '2026-11-21T11:50:00.000Z',
						realizedRevision: 2,
						realizedBy: 'connector-ref@1.0.0',
						evidenceRef: 'https://ci.example/runs/42'
					},
					nautobotUrl: 'https://nautobot.example.internal/dcim/devices/11111111-1111-4111-8111-111111111111/'
				}
			]
		},
		recentRuns: [],
		generatedAt: '2026-11-21T12:00:00.000Z',
		...overrides
	};
}

describe('Issue #379 — Vue Dérive (Phase 5) et pastille dans l’en-tête', () => {
	beforeEach(() => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
	});

	it('affiche la pastille « Dérive : Non vérifié » par défaut dans l’en-tête (jamais vert sans données)', () => {
		const { html } = render(ProjectEngagementHeader, {
			props: { onOpenQuickAsk: () => {}, onOpenLiveLock: () => {} }
		});
		expect(html).toContain('data-testid="header-drift-pill"');
		expect(html).toContain('data-posture="unverified"');
		expect(html).toContain('Dérive : Non vérifié');
	});

	it('affiche la pastille « Aucune dérive » uniquement si la posture est no_drift', () => {
		const { html } = render(ProjectEngagementHeader, {
			props: {
				driftSummary: {
					posture: 'no_drift',
					openCount: 0,
					staleCount: 0,
					lastSuccessAgeMs: 120_000
				}
			}
		});
		expect(html).toContain('data-posture="no_drift"');
		expect(html).toContain('Aucune dérive');
	});

	it('affiche dans Phase5DriftView l’ancienneté de la dernière réconciliation, les indicateurs, les liens Nautobot et l’état de réalisation', () => {
		const overview = buildSampleOverview();
		const { html } = render(Phase5DriftView, {
			props: { projectId: 'proj-sample', initialOverview: overview }
		});

		expect(html).toContain('data-testid="phase5-drift-view"');
		expect(html).toContain('data-posture="drift_detected"');
		expect(html).toContain('il y a 4 min'); // ancienneté dernière réconciliation (240_000 ms)
		expect(html).toContain('50 %'); // ratio hors décision
		expect(html).toContain('3 min'); // délai moyen détection
		expect(html).toContain('15 min'); // délai moyen résolution
		expect(html).toContain('https://nautobot.example.internal/dcim/devices/11111111-1111-4111-8111-111111111111/');
		expect(html).toContain('Hors décision');
		expect(html).toContain('Réalisé prouvé');
		expect(html).toContain('Déclaré non prouvé');
		expect(html).toContain('Planifié');
		expect(html).toContain('Non vérifié');
		expect(html).toContain('data-testid="drift-stale-decisions-section"');
	});

	it('intègre la vue Dérive dans Phase5ConsolidationHub', () => {
		const { html } = render(Phase5ConsolidationHub);
		expect(html).toContain('data-testid="phase5-jump-drift-view-btn"');
		expect(html).toContain('data-testid="phase5-drift-view"');
	});
});
