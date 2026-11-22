import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';

const AUTH_DIR = resolve(process.cwd(), 'tests/e2e/.auth');
const AUTH_STATES = {
	lead: resolve(AUTH_DIR, 'lead.json')
};

const MOCK_DRIFT_OVERVIEW = {
	status: 'ok',
	projectId: 'proj-a11y',
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
			projectId: 'proj-a11y',
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
			projectId: 'proj-a11y',
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
	generatedAt: '2026-11-21T12:00:00.000Z'
};

test.describe('Issue #379 — Accessibilité (axe) de la vue « Dérive » et de la pastille d’en-tête', () => {
	test('la vue Dérive et la pastille d’en-tête ne présentent aucune violation axe-core', async ({
		browser
	}) => {
		const context = await browser.newContext({ storageState: AUTH_STATES.lead });
		const page = await context.newPage();

		await page.route('**/api/projects/*/drift*', async (route) => {
			if (route.request().method() === 'GET') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(MOCK_DRIFT_OVERVIEW)
				});
				return;
			}
			await route.continue();
		});

		await page.goto('/deliberation?posture=consolidation', { waitUntil: 'networkidle' });

		const headerPill = page.getByTestId('header-drift-pill');
		await expect(headerPill).toBeVisible();
		await expect(headerPill).toContainText('Dérive : 2 écart(s)');

		const driftView = page.getByTestId('phase5-drift-view');
		await expect(driftView).toBeVisible();
		await expect(page.getByTestId('drift-last-reconciliation')).toContainText('il y a 4 min');

		// Ouvrir le formulaire de planification pour couvrir aussi les champs de formulaire dans l'audit axe
		await page.getByTestId('drift-config-toggle-btn').click();
		await expect(page.getByTestId('drift-config-form')).toBeVisible();

		const axeResults = await new AxeBuilder({ page })
			.include('[data-testid="phase5-drift-view"]')
			.include('[data-testid="header-drift-pill"]')
			.analyze();

		expect(axeResults.violations).toEqual([]);

		await context.close();
	});
});
