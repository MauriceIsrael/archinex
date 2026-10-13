/** Routes de décision sur une exigence : projet basculé (Hub) et projet local, sans écriture double. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { llmopsClient } from '$lib/server/llmops/client';
import { saveRequirementAudit } from '$lib/server/projects/requirementsDb';
import { buildRequirementAudit, requirementBundleId, sourceSha256, type ReviewedClause } from '$lib/domain/requirementAudit';
import { HubApiError } from '$lib/types/llmops';
import { PATCH } from '../../src/routes/api/projects/[projectId]/requirements/[requirementId]/+server';
import { POST as ASSERT } from '../../src/routes/api/projects/[projectId]/requirements/[requirementId]/assert/+server';
import { POST as WITHDRAW } from '../../src/routes/api/projects/[projectId]/requirements/[requirementId]/withdraw/+server';

const HUB_PID = 'test-route-hub-req';
const LOCAL_PID = 'test-route-local-req';
const USER = 'user-route-req';
const RFP = 'RFP des routes de décision sur les exigences.';
const SHA = sourceSha256(RFP);
const R2 = requirementBundleId(SHA, 'R-2');
const clauses: ReviewedClause[] = [
	{ clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie 30 jours.', criticality: 'bloquant', disposition: 'deliberated', deliberationReason: 'Coût' },
	{ clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', disposition: 'evacuated', evacuationReason: 'Hors périmètre technique' }
];

const session = { user: { id: USER, email: 'alice.admin@exemple.org', name: 'Alice', role: 'admin' }, expires: '2030-01-01T00:00:00Z' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function event(projectId: string, body?: unknown): any {
	return {
		params: { projectId, requirementId: encodeURIComponent(R2) },
		locals: { session },
		request: new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
		url: new URL('http://localhost/x')
	} as unknown as RequestEvent;
}

async function mkProject(id: string, strategy: object) {
	await prisma.project.deleteMany({ where: { id } });
	await prisma.project.create({ data: { id, shortName: id, type: 'project_rfp', badge: 'RFP', title: id, description: 't', strategy: JSON.stringify(strategy) } });
	await prisma.projectMember.create({ data: { projectId: id, userId: USER, role: 'lead_architect', domains: '[]' } });
	await saveRequirementAudit(id, buildRequirementAudit({ sourceText: RFP, sourceTitle: 'RFP', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: [] }), '@alice');
}

describe('Routes de décision sur une exigence', () => {
	beforeAll(async () => {
		await prisma.user.deleteMany({ where: { id: USER } });
		await prisma.user.create({ data: { id: USER, name: 'Alice', email: 'alice.admin@exemple.org', passwordHash: 'h', role: 'admin' } });
		await mkProject(HUB_PID, { systemOfRecord: 'hub', hubEngagementId: 'eng-routes' });
		await mkProject(LOCAL_PID, {});
	});
	afterAll(async () => {
		vi.restoreAllMocks();
		await prisma.project.deleteMany({ where: { id: { in: [HUB_PID, LOCAL_PID] } } });
		await prisma.user.deleteMany({ where: { id: USER } });
	});

	it('projet basculé : la décision est proposée dans le Hub, au nom de la session, rien n\'est écrit en local', async () => {
		vi.spyOn(llmopsClient, 'addRequirements').mockResolvedValue({ created: [], unchanged: [], origin: 'human' } as never);
		const propose = vi.spyOn(llmopsClient, 'proposeRequirementDisposition').mockResolvedValue({ created: true, requirement: { id: R2 } } as never);
		const res = await PATCH(event(HUB_PID, { disposition: 'evacuated', reason: 'Hors périmètre technique', actor: 'mallory@x.org' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ status: 'ok', systemOfRecord: 'hub', needsAssertion: true });
		expect(propose).toHaveBeenCalledWith('eng-routes', R2, { disposition: 'evacuated', reason: 'Hors périmètre technique' }, 'alice.admin@exemple.org');
		const row = await prisma.requirement.findFirstOrThrow({ where: { clauseRef: 'R-2', source: { projectId: HUB_PID } } });
		expect(row.decidedDisposition).toBeNull();
	});

	it('projet basculé : un motif trop court est refusé avant même d\'appeler le Hub', async () => {
		const propose = vi.spyOn(llmopsClient, 'proposeRequirementDisposition');
		propose.mockClear();
		const res = await PATCH(event(HUB_PID, { disposition: 'evacuated', reason: 'non' }));
		expect(res.status).toBe(400);
		expect(propose).not.toHaveBeenCalled();
	});

	it('une erreur du Hub est rendue telle quelle (code, raison, statut), jamais reformulée', async () => {
		vi.spyOn(llmopsClient, 'assertRequirementDisposition').mockRejectedValue(new HubApiError(409, 'self_validation', 'même personne', {}));
		const res = await ASSERT(event(HUB_PID));
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ status: 'error', error: 'self_validation', reason: 'même personne' });
	});

	it('projet basculé : retirer une décision passe par le Hub', async () => {
		const withdraw = vi.spyOn(llmopsClient, 'withdrawRequirementDisposition').mockResolvedValue({ requirement: { id: R2 } } as never);
		const res = await WITHDRAW(event(HUB_PID));
		expect(res.status).toBe(200);
		expect(withdraw).toHaveBeenCalledWith('eng-routes', R2, 'alice.admin@exemple.org');
	});

	it('projet non basculé : décision directe en local, et rien à affirmer ni retirer côté Hub', async () => {
		const propose = vi.spyOn(llmopsClient, 'proposeRequirementDisposition');
		propose.mockClear();
		const res = await PATCH(event(LOCAL_PID, { disposition: 'evacuated', reason: 'Hors périmètre technique' }));
		expect(res.status).toBe(200);
		expect(propose).not.toHaveBeenCalled();
		const row = await prisma.requirement.findFirstOrThrow({ where: { clauseRef: 'R-2', source: { projectId: LOCAL_PID } } });
		expect(row.decidedDisposition).toBe('evacuated');
		expect(row.decidedBy).toBe('@alice-admin');
		for (const route of [ASSERT, WITHDRAW]) {
			const r = await route(event(LOCAL_PID));
			expect(r.status).toBe(409);
			expect((await r.json()).error).toBe('not_cut_over');
		}
	});
});
