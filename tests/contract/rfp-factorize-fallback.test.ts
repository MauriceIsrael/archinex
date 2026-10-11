import { describe, it, expect, vi, beforeEach } from 'vitest';

const { audit, direct, runs } = vi.hoisted(() => ({
	audit: vi.fn(),
	direct: vi.fn(),
	runs: { start: vi.fn(), finish: vi.fn(), findCompleted: vi.fn(), progress: vi.fn(), markInterrupted: vi.fn(), request: vi.fn(), restart: vi.fn() }
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
import { POST as RESUME } from '../../src/routes/api/rfp/factorize/runs/[runId]/resume/+server';
import { canFallBackToDirectFactorization, DIRECT_FALLBACK_MAX_CHARS } from '$lib/server/ingest/arckitRequirementsPipeline';

const clauses = (n: number, size: number) =>
	Array.from({ length: n }, (_, i) => ({ id: `c${i}`, clauseRef: `R-${i}`, title: `Exigence ${i}`, text: 'x'.repeat(size), criticality: 'majeur' }));

const post = (body: unknown) => POST({ request: new Request('http://localhost/api/rfp/factorize', { method: 'POST', body: JSON.stringify(body) }) } as never);
/** Mode synchrone (`wait`) : la réponse porte le résultat final. */
const call = (body: Record<string, unknown>) => post({ wait: true, ...body });

const emptyReport = { totalCount: 0, evacuatedCount: 0, deliberatedCount: 0, clarificationCount: 0, toQualifyCount: 0, requirements: [] };

describe('Repli de la factorisation RFP', () => {
	beforeEach(() => {
		audit.mockReset();
		direct.mockReset();
		direct.mockResolvedValue({ status: 'ok', subjects: [], warning: undefined });
		runs.start.mockReset().mockResolvedValue('run-1');
		runs.finish.mockReset().mockResolvedValue(undefined);
		runs.findCompleted.mockReset().mockResolvedValue(null);
		runs.progress.mockReset().mockResolvedValue(undefined);
		runs.markInterrupted.mockReset().mockResolvedValue(0);
		runs.request.mockReset().mockResolvedValue(null);
		runs.restart.mockReset().mockResolvedValue(undefined);
	});

	it('par défaut, rend la main aussitôt (202) : le calcul continue en tâche de fond et publie son avancement', async () => {
		let release!: () => void;
		audit.mockImplementation(async (_clauses: unknown, opts: { onProgress?: (p: unknown) => void }) => {
			opts.onProgress?.({ stage: 'classify', done: 1, total: 2 });
			await new Promise<void>((r) => (release = r));
			return { status: 'ok', report: emptyReport, subjects: [], modelUsed: 'm', warnings: [] };
		});
		const res = await post({ clauses: clauses(900, 500) });
		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ runId: 'run-1', status: 'running' });
		await vi.waitFor(() => expect(runs.progress).toHaveBeenCalledWith('run-1', expect.objectContaining({ stage: 'classify', done: 1, total: 2 }), undefined));
		expect(runs.finish).not.toHaveBeenCalled();
		release();
		await vi.waitFor(() => expect(runs.finish).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'ok', engine: 'audit' })));
	});

	it('reprise : relance la requête d\'origine sur la même exécution, avec le cache des étapes', async () => {
		runs.request.mockResolvedValue({ clauses: clauses(900, 500), model: 'claude-sonnet-5-5' });
		audit.mockResolvedValue({ status: 'ok', report: emptyReport, subjects: [], modelUsed: 'm', warnings: [] });
		const res = await RESUME({ params: { runId: 'run-9' } } as never);
		expect(res.status).toBe(202);
		expect(runs.restart).toHaveBeenCalledWith('run-9');
		await vi.waitFor(() => expect(runs.finish).toHaveBeenCalledWith('run-9', expect.objectContaining({ status: 'ok' })));
		expect(audit.mock.calls[0][1].cache).toBeDefined();
	});

	it('reprise impossible (exécution aboutie ou inconnue) : 409', async () => {
		await expect(RESUME({ params: { runId: 'run-x' } } as never)).rejects.toMatchObject({ status: 409 });
	});

	it('persiste le résultat de l\'audit et renvoie l\'identifiant de l\'exécution', async () => {
		audit.mockResolvedValue({ status: 'partial', report: { ...emptyReport, totalCount: 900 }, subjects: [], modelUsed: 'm', warnings: ['x'] });
		const res = await call({ clauses: clauses(900, 500), sourceText: 'texte du RFP' });
		const body = await res.json();
		expect(body.runId).toBe('run-1');
		expect(runs.start).toHaveBeenCalledWith(expect.objectContaining({ clauseCount: 900, sourceText: 'texte du RFP' }));
		expect(runs.finish).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'partial', engine: 'audit' }));
		expect(runs.finish.mock.calls[0][1].result.engine).toBe('arckit-requirements-audit');
	});

	it('mêmes entrées déjà factorisées : résultat persisté renvoyé sans recalcul, sauf recompute', async () => {
		runs.findCompleted.mockResolvedValue({ id: 'run-0', result: { status: 'ok', subjects: [{ id: 'SUBJ-01' }] } });
		const reused = await (await call({ clauses: clauses(900, 500) })).json();
		expect(reused).toMatchObject({ runId: 'run-0', reusedRun: true });
		expect(audit).not.toHaveBeenCalled();

		audit.mockResolvedValue({ status: 'ok', report: emptyReport, subjects: [], modelUsed: 'm', warnings: [] });
		await call({ clauses: clauses(900, 500), recompute: true });
		expect(audit).toHaveBeenCalledTimes(1);
		expect(audit.mock.calls[0][1].cache).toBeUndefined();
	});

	it('persistance indisponible : la factorisation aboutit quand même', async () => {
		runs.start.mockRejectedValue(new Error('SQLITE_BUSY'));
		audit.mockResolvedValue({ status: 'ok', report: emptyReport, subjects: [], modelUsed: 'm', warnings: [] });
		const res = await call({ clauses: clauses(900, 500) });
		expect(res.status).toBe(200);
		expect(runs.finish).not.toHaveBeenCalled();
	});

	it('petit RFP : le repli direct reste possible', () => {
		expect(canFallBackToDirectFactorization(clauses(10, 200))).toBe(true);
		expect(canFallBackToDirectFactorization(clauses(1000, 500))).toBe(false);
		expect(DIRECT_FALLBACK_MAX_CHARS).toBeGreaterThan(0);
	});

	it('gros RFP, audit indisponible : erreur explicite avec la cause, aucun appel direct condamné au délai', async () => {
		audit.mockResolvedValue({ status: 'unavailable', report: emptyReport, subjects: [], modelUsed: 'm', warnings: ['Classement indisponible pour le lot 1/12 (Erreur Anthropic Claude (429 Too Many Requests)).'] });
		const res = await call({ clauses: clauses(900, 500) });
		expect(res.status).toBe(502);
		const body = await res.json();
		expect(body.message).toContain('429');
		expect(body.message).toContain('900 clauses');
		expect(direct).not.toHaveBeenCalled();
	});

	it('gros RFP, audit partiel : on rend l\'audit tel quel, avec ses avertissements', async () => {
		audit.mockResolvedValue({ status: 'partial', report: { ...emptyReport, totalCount: 900, toQualifyCount: 40 }, subjects: [], modelUsed: 'm', warnings: ['Classement indisponible pour le lot 3/23.'] });
		const res = await call({ clauses: clauses(900, 500) });
		expect(res.status).toBe(200);
		expect((await res.json()).warning).toContain('lot 3/23');
		expect(direct).not.toHaveBeenCalled();
	});

	it('modèle grand contexte, RFP volumineux : audit en étapes, pas de passe directe condamnée au délai', async () => {
		audit.mockResolvedValue({ status: 'ok', report: emptyReport, subjects: [], modelUsed: 'm', warnings: [] });
		const res = await call({ clauses: clauses(900, 500), model: 'claude-sonnet-4-5-20250929' });
		expect(res.status).toBe(200);
		expect(audit).toHaveBeenCalledTimes(1);
		expect(direct).not.toHaveBeenCalled();
	});

	it('modèle grand contexte, petit RFP : passe directe conservée', async () => {
		await call({ clauses: clauses(10, 200), model: 'claude-sonnet-4-5-20250929' });
		expect(direct).toHaveBeenCalledTimes(1);
		expect(audit).not.toHaveBeenCalled();
	});

	it('le seuil se règle par RFP_DIRECT_MAX_CHARS', async () => {
		process.env.RFP_DIRECT_MAX_CHARS = '100';
		try {
			audit.mockResolvedValue({ status: 'ok', report: emptyReport, subjects: [], modelUsed: 'm', warnings: [] });
			await call({ clauses: clauses(10, 200), model: 'claude-sonnet-4-5-20250929' });
			expect(direct).not.toHaveBeenCalled();
		} finally {
			delete process.env.RFP_DIRECT_MAX_CHARS;
		}
	});

	it('petit RFP, audit indisponible : repli direct conservé', async () => {
		audit.mockResolvedValue({ status: 'unavailable', report: emptyReport, subjects: [], modelUsed: 'm', warnings: ['hors ligne'] });
		await call({ clauses: clauses(10, 200) });
		expect(direct).toHaveBeenCalledTimes(1);
	});
});
