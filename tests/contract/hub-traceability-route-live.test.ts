/**
 * Parcours complet par les ROUTES d'Archinex, contre un VRAI Hub : proposer, affirmer par une autre personne, puis lire la
 * matrice de traçabilité produite depuis l'instantané scellé du Hub.
 *
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/hub-traceability-route-live.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Le client « singleton » des routes lit sa configuration à l'import : elle doit être fixée avant tout import.
vi.hoisted(() => {
	if (process.env.LLMOPS_LIVE_URL) {
		process.env.LLMOPS_BASE_URL = process.env.LLMOPS_LIVE_URL;
		process.env.LLMOPS_AUTH_TOKEN = 'arx-token';
	}
});
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { saveRequirementAudit } from '$lib/server/projects/requirementsDb';
import { buildRequirementAudit, requirementBundleId, sourceSha256, type ReviewedClause } from '$lib/domain/requirementAudit';

const LIVE = process.env.LLMOPS_LIVE_URL;
const RUN = Math.floor(1000 + Math.random() * 9000);
const ENG = `live-route-${RUN}`;
const PID = `test-live-route-${RUN}`;
const RFP = `RFP du parcours par les routes ${RUN}.`;
const SHA = sourceSha256(RFP);
const R1 = requirementBundleId(SHA, 'R-1');
const R2 = requirementBundleId(SHA, 'R-2');

const clauses: ReviewedClause[] = [
	{ clauseRef: 'R-1', title: 'Autonomie', text: 'Autonomie de 30 jours.', criticality: 'bloquant', disposition: 'deliberated', deliberationReason: 'Coût' },
	{ clauseRef: 'R-2', title: 'Mobilier', text: 'Six postes.', criticality: 'info', disposition: 'evacuated', evacuationReason: 'Hors périmètre technique' }
];

const person = (id: string, email: string) => ({ user: { id, email, name: id, role: 'admin' }, expires: '2030-01-01T00:00:00Z' });
const CARL = person('u-route-carl', 'carl@example.org');
const DAN = person('u-route-dan', 'dan@example.org');
const ADA = person('u-route-ada', 'ada@example.org');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (session: unknown, params: Record<string, string>, opts: { body?: unknown; url?: string } = {}): any => ({
	params,
	locals: { session },
	request: new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
	url: new URL(opts.url ?? 'http://localhost/x')
});

describe.skipIf(!LIVE)('Parcours par les routes, contre un Hub réel', () => {
	let routes: {
		PATCH: (e: unknown) => Promise<Response>;
		ASSERT: (e: unknown) => Promise<Response>;
		MATRIX: (e: unknown) => Promise<Response>;
	};

	beforeAll(async () => {
		const [{ PATCH }, { POST: ASSERT }, { GET: MATRIX }] = await Promise.all([
			import('../../src/routes/api/projects/[projectId]/requirements/[requirementId]/+server'),
			import('../../src/routes/api/projects/[projectId]/requirements/[requirementId]/assert/+server'),
			import('../../src/routes/api/projects/[projectId]/traceability-matrix/+server')
		]);
		routes = { PATCH, ASSERT, MATRIX } as never;

		const operator = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'demo-token' });
		const arx = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'arx-token' });
		await operator.createManagedEngagement({ engagement: ENG, confidentiality: 'internal', admin_email: ADA.user.email, admin_handle: '@ada' });
		await arx.setEngagementMembers(ENG, [
			{ email: ADA.user.email, handle: '@ada', role: 'admin' },
			{ email: DAN.user.email, handle: '@dan', role: 'decider' },
			{ email: CARL.user.email, handle: '@carl', role: 'contributor' }
		], ADA.user.email);

		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.project.create({
			data: { id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet par les routes', description: 't', strategy: JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: ENG }) }
		});
		await saveRequirementAudit(PID, buildRequirementAudit({ sourceText: RFP, sourceTitle: 'RFP', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: [] }), '@ada');
		await prisma.subject.create({ data: { id: `${PID}-s1`, projectId: PID, sectionRef: '§1', name: 'Autonomie', maturityLevel: 'L1_framed', requirementRefs: JSON.stringify([R1]) } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
	});

	const params = (rid: string) => ({ projectId: PID, requirementId: encodeURIComponent(rid) });

	it('une personne propose, la même ne peut pas affirmer, une autre affirme', async () => {
		const proposed = await routes.PATCH(ev(CARL, params(R1), { body: { disposition: 'deliberated' } }));
		expect(proposed.status).toBe(200);
		expect(await proposed.json()).toMatchObject({ systemOfRecord: 'hub', needsAssertion: true });

		const own = await routes.ASSERT(ev(DAN, params(R1)));
		expect(own.status).toBe(200); // DAN n'est pas l'auteur : il peut

		const r2 = await routes.PATCH(ev(DAN, params(R2), { body: { disposition: 'evacuated', reason: 'Hors périmètre technique' } }));
		expect(r2.status).toBe(200);
		const self = await routes.ASSERT(ev(DAN, params(R2)));
		expect(self.status).toBe(409);
		expect(await self.json()).toMatchObject({ error: 'self_validation' });
		const other = await routes.ASSERT(ev(ADA, params(R2)));
		expect(other.status).toBe(200);
	});

	it('la matrice est lue depuis l\'instantané scellé du Hub, sceau revérifié, avec qui a décidé quoi', async () => {
		const res = await routes.MATRIX(ev(ADA, { projectId: PID }));
		expect(res.status).toBe(200);
		expect(res.headers.get('X-Source')).toBe('hub-snapshot');
		const md = await res.text();
		expect(md).toMatch(/Autonomie de 30 jours.*À délibérer.*décidé par une personne.*@dan \(proposé par @carl\).*Autonomie/);
		expect(md).toMatch(/Six postes\. — Hors périmètre technique.*Évacuée.*@ada \(proposé par @dan\)/);
		expect(md).not.toContain('example.org');
		// Même état, même instantané, même texte.
		expect(await (await routes.MATRIX(ev(ADA, { projectId: PID }))).text()).toBe(md);
	});
});
