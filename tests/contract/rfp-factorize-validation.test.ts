import { describe, it, expect, vi, beforeEach } from 'vitest';

const { audit, direct, runs } = vi.hoisted(() => ({
	audit: vi.fn(),
	direct: vi.fn(),
	runs: {
		start: vi.fn(),
		finish: vi.fn(),
		findCompleted: vi.fn(),
		progress: vi.fn(),
		markInterrupted: vi.fn(),
		request: vi.fn(),
		restart: vi.fn()
	}
}));

vi.mock('$lib/server/ingest/factorizationRunsDb', () => ({
	sha256: (v: unknown) => `sha-${JSON.stringify(v).length}`,
	startFactorizationRun: runs.start,
	finishFactorizationRun: runs.finish,
	findCompletedRun: runs.findCompleted,
	updateFactorizationProgress: runs.progress,
	markInterruptedRuns: runs.markInterrupted,
	getFactorizationRunRequest: runs.request,
	restartFactorizationRun: runs.restart,
	prismaStageCache: { get: async () => undefined, set: async () => {} }
}));

vi.mock('$lib/server/ingest/arckitRequirementsPipeline', async (orig) => ({
	...(await orig<typeof import('$lib/server/ingest/arckitRequirementsPipeline')>()),
	runRequirementsAudit: audit
}));
vi.mock('$lib/server/llm/rfpFactorizer', async (orig) => ({
	...(await orig<typeof import('$lib/server/llm/rfpFactorizer')>()),
	factorizeRfpWithLocalLlm: direct
}));
vi.mock('$lib/server/doctrine/doctrineService', () => ({
	doctrineService: { getDoctrineContext: async () => ({ items: [] }) }
}));

import { POST } from '../../src/routes/api/rfp/factorize/+server';
import type { HumanExtractionValidation } from '$lib/domain/rfpExtractionReport';

const clauses = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: `c${i}`,
		clauseRef: `REQ-Lot1-${i + 1}`,
		title: `Exigence ${i + 1}`,
		text: `Corps de texte de l'exigence ${i + 1}`,
		criticality: 'majeur' as const
	}));

const call = (body: Record<string, unknown>) =>
	POST({
		request: new Request('http://localhost/api/rfp/factorize', {
			method: 'POST',
			body: JSON.stringify({ wait: true, ...body })
		})
	} as never);

const emptyReport = {
	totalCount: 5,
	evacuatedCount: 0,
	deliberatedCount: 5,
	clarificationCount: 0,
	toQualifyCount: 0,
	requirements: []
};

describe('Traçabilité de la validation humaine du découpage RFP (Issue #50)', () => {
	beforeEach(() => {
		audit.mockReset();
		audit.mockResolvedValue({
			status: 'ok',
			report: emptyReport,
			subjects: [],
			modelUsed: 'local-test',
			warnings: []
		});
		direct.mockReset();
		direct.mockResolvedValue({ status: 'ok', subjects: [], warning: undefined });
		runs.start.mockReset().mockResolvedValue('run-val-1');
		runs.finish.mockReset().mockResolvedValue(undefined);
		runs.findCompleted.mockReset().mockResolvedValue(null);
		runs.progress.mockReset().mockResolvedValue(undefined);
		runs.markInterrupted.mockReset().mockResolvedValue(0);
		runs.request.mockReset().mockResolvedValue(null);
		runs.restart.mockReset().mockResolvedValue(undefined);
	});

	it('persiste la validation humaine avec les métadonnées de vérification et la renvoie dans le résultat', async () => {
		direct.mockResolvedValue({
			status: 'ok',
			subjects: [],
			summary: 'Synthèse',
			totalClauses: 5,
			coveredClausesCount: 5,
			coverageRate: 100,
			unassignedClauses: []
		});

		const mockValidation: HumanExtractionValidation = {
			validated: true,
			validatedAt: '2026-10-19T08:30:00.000Z',
			validatedBy: 'architecte-referent@defense.gouv.fr',
			sampleSize: 5,
			sampleItems: [
				{ clauseRef: 'REQ-Lot1-1', pageNumber: 1, status: 'accepted' },
				{ clauseRef: 'REQ-Lot1-2', pageNumber: 1, status: 'accepted' }
			],
			acceptedAnomaliesCount: 1,
			flaggedIssuesCount: 0,
			notes: 'Échantillon vérifié sur plan de vol',
			reportSummary: {
				pageCount: 12,
				clauseCount: 5,
				coverageRate: 98,
				anomaliesCount: 1
			}
		};

		const res = await call({
			clauses: clauses(5),
			extractionValidation: mockValidation
		});

		expect(res.status).toBe(200);
		const json = await res.json();

		// La réponse doit porter la validation
		expect(json.extractionValidation).toBeDefined();
		expect(json.extractionValidation.validated).toBe(true);
		expect(json.extractionValidation.validatedBy).toBe('architecte-referent@defense.gouv.fr');
		expect(json.extractionValidation.acceptedAnomaliesCount).toBe(1);

		// startFactorizationRun a reçu la validation dans sa requête d'origine
		expect(runs.start).toHaveBeenCalledWith(
			expect.objectContaining({
				request: expect.objectContaining({
					extractionValidation: expect.objectContaining({
						validated: true,
						validatedBy: 'architecte-referent@defense.gouv.fr'
					})
				})
			})
		);

		// finishFactorizationRun a persisté le résultat contenant extractionValidation
		expect(runs.finish).toHaveBeenCalledWith(
			'run-val-1',
			expect.objectContaining({
				result: expect.objectContaining({
					extractionValidation: expect.objectContaining({
						validated: true,
						validatedBy: 'architecte-referent@defense.gouv.fr'
					})
				})
			})
		);
	});

	it('marque automatiquement une analyse lancée sans validation humaine préalable comme non validée', async () => {
		direct.mockResolvedValue({
			status: 'ok',
			subjects: [],
			summary: 'Synthèse sans validation',
			totalClauses: 5,
			coveredClausesCount: 5,
			coverageRate: 100,
			unassignedClauses: []
		});

		const res = await call({
			clauses: clauses(5)
			// Aucune extractionValidation transmise
		});

		expect(res.status).toBe(200);
		const json = await res.json();

		expect(json.extractionValidation).toBeDefined();
		expect(json.extractionValidation.validated).toBe(false);

		expect(runs.finish).toHaveBeenCalledWith(
			'run-val-1',
			expect.objectContaining({
				result: expect.objectContaining({
					extractionValidation: expect.objectContaining({
						validated: false
					})
				})
			})
		);
	});
});
