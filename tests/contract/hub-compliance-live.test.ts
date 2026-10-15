/**
 * K17 contre un VRAI Hub, par les routes d'Archinex : une exigence portée par un sujet, une décision qui cite des éléments de la base,
 * puis l'instantané scellé du Hub (section de conformité) et la matrice de traçabilité qui en est tirée.
 *
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/hub-compliance-live.test.ts
 *
 * (serveur de contrat de LLMOps ≥ 1.31 avec les jetons arx-token = eng:delegate et suite-token = eng:service)
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
import { requireVerifiedHubSnapshot } from '$lib/domain/hubSnapshot';

const LIVE = process.env.LLMOPS_LIVE_URL;
const RUN = Math.floor(1000 + Math.random() * 9000);
const ENG = `live-k17-${RUN}`;
const PID = `test-live-k17-${RUN}`;
const SID = `${PID}-s1`;
const RFP = `RFP de la conformité déclarée ${RUN}.`;
const R1 = requirementBundleId(sourceSha256(RFP), 'R-1');
const clauses: ReviewedClause[] = [
	{ clauseRef: 'R-1', title: 'Reprise', text: 'Les données critiques sont restaurables après la perte d\'un site.', criticality: 'bloquant', disposition: 'deliberated', deliberationReason: 'Coût' }
];

const person = (id: string, email: string, role: string) => ({ user: { id, email, name: id, role }, expires: '2030-01-01T00:00:00Z' });
const ADA = person(`u-k17-ada-${RUN}`, 'ada@example.org', 'admin');
const DAN = person(`u-k17-dan-${RUN}`, 'dan@example.org', 'domain_expert'); // décideur au Hub
const CARL = person(`u-k17-carl-${RUN}`, 'carl@example.org', 'lead_architect'); // auteur de la décision

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (session: unknown, params: Record<string, string>, body?: unknown): any => ({
	params,
	locals: { session },
	request: new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
	url: new URL('http://localhost/x')
});

describe.skipIf(!LIVE)('K17 : la couverture déclarée exigence → contrôle, de la décision à la matrice', () => {
	let PATCH: (e: unknown) => Promise<Response>;
	let REQ_ASSERT: (e: unknown) => Promise<Response>;
	let DEC_ASSERT: (e: unknown) => Promise<Response>;
	let MATRIX: (e: unknown) => Promise<Response>;
	let arx: LLMOpsClient;
	let suite: LLMOpsClient;

	beforeAll(async () => {
		const [{ PATCH: p }, { POST: ra }, { POST: da }, { GET: m }] = await Promise.all([
			import('../../src/routes/api/projects/[projectId]/requirements/[requirementId]/+server'),
			import('../../src/routes/api/projects/[projectId]/requirements/[requirementId]/assert/+server'),
			import('../../src/routes/api/projects/[projectId]/subjects/[subjectId]/decision/assert/+server'),
			import('../../src/routes/api/projects/[projectId]/traceability-matrix/+server')
		]);
		PATCH = p as never;
		REQ_ASSERT = ra as never;
		DEC_ASSERT = da as never;
		MATRIX = m as never;

		const operator = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'demo-token' });
		arx = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'arx-token' });
		suite = new LLMOpsClient({ baseUrl: LIVE!, authToken: 'suite-token' });
		await operator.createManagedEngagement({ engagement: ENG, confidentiality: 'internal', admin_email: ADA.user.email, admin_handle: '@ada' });
		await arx.setEngagementMembers(ENG, [
			{ email: ADA.user.email, handle: '@ada', role: 'admin' },
			{ email: DAN.user.email, handle: '@dan', role: 'decider' },
			{ email: CARL.user.email, handle: '@carl', role: 'contributor' }
		], ADA.user.email);

		await prisma.user.deleteMany({ where: { id: { in: [ADA.user.id, DAN.user.id, CARL.user.id] } } });
		for (const u of [ADA, DAN, CARL]) {
			await prisma.user.create({ data: { id: u.user.id, name: u.user.name, email: u.user.email, passwordHash: 'h', role: u.user.role } });
		}
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.project.create({
			data: {
				id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet K17', description: 't',
				strategy: JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: ENG }),
				members: { create: [{ userId: ADA.user.id, role: 'lead_architect' }, { userId: DAN.user.id, role: 'domain_expert' }, { userId: CARL.user.id, role: 'lead_architect' }] }
			}
		});
		await saveRequirementAudit(PID, buildRequirementAudit({ sourceText: RFP, sourceTitle: 'RFP', model: 'm', auditedAt: '2026-10-01T08:00:00.000Z', reviewed: clauses, confirmedDeliberated: [] }), '@ada');
		await prisma.subject.create({
			data: {
				id: SID, projectId: PID, name: 'Reprise après sinistre', sectionRef: '§4', problemStatement: 'Restaurer après la perte d\'un site', maturityLevel: 'L2_decomposed',
				requirementRefs: JSON.stringify([R1]),
				options: { create: [
					// ADR-0007 met en œuvre des contrôles dans l'instantané de connaissances du Hub ; la seconde référence n'y existe pas.
					{ id: `${SID}-a`, title: 'Réplication synchrone bi-site', summary: 'a', origin: 'kb-pattern', author: 'x', productionMode: 'human-authored', kbRefs: JSON.stringify(['ADR-0007', 'ADR-INCONNU']) },
					{ id: `${SID}-b`, title: 'Sauvegardes de nuit', summary: 'b', origin: 'human', author: 'x', productionMode: 'human-authored', kbRefs: JSON.stringify(['ADR-0001']) }
				] },
				decision: { create: {
					id: `${SID}-d`, retainedOptionId: `${SID}-a`, rejected: JSON.stringify([{ optionId: `${SID}-b`, reason: 'Point de reprise trop lointain' }]),
					rationale: 'La réplication synchrone tient l\'objectif de reprise.', reversibility: 'costly', arbiterId: CARL.user.email, arbiterRole: 'lead_architect'
				} }
			}
		});
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.user.deleteMany({ where: { id: { in: [ADA.user.id, DAN.user.id, CARL.user.id] } } });
	});

	it('la décision affirmée porte les références de la base de l\'option retenue, et la section de conformité du Hub est lisible', async () => {
		const rid = { projectId: PID, requirementId: encodeURIComponent(R1) };
		expect((await PATCH(ev(CARL, rid, { disposition: 'deliberated' }))).status).toBe(200);
		expect((await REQ_ASSERT(ev(DAN, rid))).status).toBe(200);

		const res = await DEC_ASSERT(ev(DAN, { projectId: PID, subjectId: SID }, { facts: [] }));
		expect(res.status, await res.clone().text()).toBe(200);

		const issued = await arx.exportEngagementSnapshot(ENG, ADA.user.email);
		const snap = requireVerifiedHubSnapshot(await suite.getEngagementExport(ENG, issued.snapshotRef.snapshotId));
		expect(snap.schemaVersion).toBe('1.7');

		// Ce qu'Archinex envoie : les références de l'option RETENUE (pas celles de l'option écartée), telles quelles.
		const decision = snap.data.decisions.find((d) => d.subject === 'Reprise après sinistre')! as unknown as { based_on: Array<{ id: string }> };
		expect(decision.based_on.map((b) => b.id).sort()).toEqual(['ADR-0007', 'ADR-INCONNU']);

		// Ce que le Hub en tire : une section déclarative, d'origine Hub, jamais « vérifiée ».
		const compliance = snap.data.compliance!;
		expect(compliance.origin).toBe('knowledge-hub');
		expect(Array.isArray(compliance.items)).toBe(true);
		expect(compliance.items.every((c) => ['allocated', 'proposed', 'uncovered'].includes(c.status))).toBe(true);
		expect(JSON.stringify(compliance)).not.toMatch(/verified/);
		expect(JSON.stringify(snap)).not.toContain('example.org');
		// NB : le Hub ne produit une ligne que pour un contrôle « rapproché » de l'exigence (`matched_controls`). Une exigence créée par
		// l'API d'écriture n'en porte pas encore : la section est donc vide pour un projet d'Archinex. Ce test ne fige pas ce vide ;
		// il vérifie la forme de ce qui existe.
	});

	it('la matrice de traçabilité, lue dans l\'instantané du Hub, a sa colonne de contrôles déclarés et ne dit jamais « vérifié »', async () => {
		const res = await MATRIX(ev(ADA, { projectId: PID }));
		expect(res.status).toBe(200);
		expect(res.headers.get('X-Source')).toBe('hub-snapshot');
		const md = await res.text();
		expect(md).toContain('Contrôles déclarés');
		expect(md).toMatch(/restaurables/);
		expect(md).not.toMatch(/vérifié/i);
	});
});
