import { describe, it, expect, vi, beforeEach } from 'vitest';

const { audit, direct } = vi.hoisted(() => ({ audit: vi.fn(), direct: vi.fn() }));

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
import { canFallBackToDirectFactorization, DIRECT_FALLBACK_MAX_CHARS } from '$lib/server/ingest/arckitRequirementsPipeline';

const clauses = (n: number, size: number) =>
	Array.from({ length: n }, (_, i) => ({ id: `c${i}`, clauseRef: `R-${i}`, title: `Exigence ${i}`, text: 'x'.repeat(size), criticality: 'majeur' }));

const call = (body: unknown) => POST({ request: new Request('http://localhost/api/rfp/factorize', { method: 'POST', body: JSON.stringify(body) }) } as never);

const emptyReport = { totalCount: 0, evacuatedCount: 0, deliberatedCount: 0, clarificationCount: 0, toQualifyCount: 0, requirements: [] };

describe('Repli de la factorisation RFP', () => {
	beforeEach(() => {
		audit.mockReset();
		direct.mockReset();
		direct.mockResolvedValue({ status: 'ok', subjects: [], warning: undefined });
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
