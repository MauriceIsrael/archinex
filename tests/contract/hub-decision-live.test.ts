/**
 * #103 contre un VRAI Hub : l'affirmation d'une décision d'un projet basculé atteint réellement le Hub, par les routes d'Archinex.
 *
 *   LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/contract/hub-decision-live.test.ts
 *
 * (serveur de contrat de LLMOps avec les jetons arx-token = eng:delegate et suite-token = eng:service)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { requireVerifiedHubSnapshot } from '$lib/domain/hubSnapshot';

// Le client « singleton » des routes lit sa configuration à l'import : elle doit être fixée avant tout import.
vi.hoisted(() => {
	if (process.env.LLMOPS_LIVE_URL) {
		process.env.LLMOPS_BASE_URL = process.env.LLMOPS_LIVE_URL;
		process.env.LLMOPS_AUTH_TOKEN = 'arx-token';
	}
});

const LIVE = process.env.LLMOPS_LIVE_URL;
const RUN = Math.floor(1000 + Math.random() * 9000);
const ENG = `live-dec-${RUN}`;
const PID = `test-live-dec-${RUN}`;
const SID = `${PID}-s1`;

const person = (id: string, email: string, role: string) => ({ user: { id, email, name: id, role }, expires: '2030-01-01T00:00:00Z' });
const ADA = person(`u-dec-ada-${RUN}`, 'ada@example.org', 'admin');
const DAN = person(`u-dec-dan-${RUN}`, 'dan@example.org', 'domain_expert'); // décideur au Hub
const CARL = person(`u-dec-carl-${RUN}`, 'carl@example.org', 'lead_architect'); // auteur de la décision (contributeur au Hub)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (session: unknown, params: Record<string, string>, body?: unknown): any => ({
	params,
	locals: { session },
	request: new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
	url: new URL('http://localhost/x')
});

describe.skipIf(!LIVE)('#103 : la décision d\'un projet basculé atteint le vrai Hub', () => {
	let ASSERT: (e: unknown) => Promise<Response>;
	let EXTRACT: (e: unknown) => Promise<Response>;
	let arx: LLMOpsClient;
	let suite: LLMOpsClient;

	beforeAll(async () => {
		const [{ POST: a }, { POST: x }] = await Promise.all([
			import('../../src/routes/api/projects/[projectId]/subjects/[subjectId]/decision/assert/+server'),
			import('../../src/routes/api/projects/[projectId]/subjects/[subjectId]/decision/extract-facts/+server')
		]);
		ASSERT = a as never;
		EXTRACT = x as never;

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
		for (const p of [ADA, DAN, CARL]) {
			await prisma.user.create({ data: { id: p.user.id, name: p.user.name, email: p.user.email, passwordHash: 'h', role: p.user.role } });
		}
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.project.create({
			data: {
				id: PID, shortName: PID, type: 'project_rfp', badge: 'RFP', title: 'Projet #103', description: 't',
				strategy: JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: ENG }),
				members: { create: [{ userId: ADA.user.id, role: 'lead_architect' }, { userId: DAN.user.id, role: 'domain_expert' }, { userId: CARL.user.id, role: 'lead_architect' }] },
				subjects: {
					create: [{
						id: SID, name: 'Cluster haute disponibilité', sectionRef: '§4.2', problemStatement: 'Garantir la résilience', maturityLevel: 'L2_decomposed',
						options: { create: [
							{ id: `${SID}-ha`, title: 'Bi-site actif/actif', summary: 'Réplication synchrone', origin: 'human', author: 'x', productionMode: 'human-authored' },
							{ id: `${SID}-one`, title: 'Site unique', summary: 'Un seul site', origin: 'human', author: 'x', productionMode: 'human-authored' }
						] },
						decision: { create: {
							id: `${SID}-d`, retainedOptionId: `${SID}-ha`, rejected: JSON.stringify([{ optionId: `${SID}-one`, reason: 'SPOF inacceptable' }]),
							rationale: 'Déploiement bi-site actif/actif avec réplication synchrone.', reversibility: 'costly', arbiterId: CARL.user.email, arbiterRole: 'lead_architect'
						} }
					}]
				}
			}
		});
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: PID } });
		await prisma.user.deleteMany({ where: { id: { in: [ADA.user.id, DAN.user.id, CARL.user.id] } } });
	});

	const params = { projectId: PID, subjectId: SID };
	const FACTS = [
		{ key: 'topology.dc_count', value: '2', source_excerpt: 'bi-site', selected: true },
		{ key: 'topology.mode', value: 'active-active', source_excerpt: 'actif/actif', selected: true },
		{ key: 'resilience_mode', value: 'actif/actif', source_excerpt: 'x', selected: true } // vocabulaire d'Archinex : écarté
	];

	it('1. l\'extraction vise le vocabulaire du Hub, pas celui d\'Archinex', async () => {
		const res = await EXTRACT(ev(DAN, params, { decisionRationale: 'Déploiement bi-site actif/actif.', retainedOptionTitle: 'Bi-site actif/actif' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.allowedVocabularyKeys).toEqual(expect.arrayContaining(['topology.dc_count', 'topology.mode', 'data.rpo_target_s']));
		expect(body.allowedVocabularyKeys).not.toContain('resilience_mode');
	});

	it('2. l\'auteur ne peut pas affirmer sa propre décision (refusé avant le Hub)', async () => {
		const res = await ASSERT(ev(CARL, params, { facts: FACTS }));
		expect(res.status).toBe(409);
		expect((await res.json()).error).toBe('self_validation');
		expect((await prisma.subject.findUniqueOrThrow({ where: { id: SID } })).maturityLevel).toBe('L2_decomposed');
	});

	it('3. une autre personne l\'affirme : le Hub reçoit la décision, ses faits typés, et le sujet passe à L3 des deux côtés', async () => {
		const res = await ASSERT(ev(DAN, params, { facts: FACTS }));
		expect(res.status, await res.clone().text()).toBe(200);
		expect((await res.json()).affirmedFactsCount).toBe(2);
		expect((await prisma.subject.findUniqueOrThrow({ where: { id: SID } })).maturityLevel).toBe('L3_decided');

		const issued = await arx.exportEngagementSnapshot(ENG, ADA.user.email);
		const snap = requireVerifiedHubSnapshot(await suite.getEngagementExport(ENG, issued.snapshotRef.snapshotId));
		const decision = snap.data.decisions.find((d) => d.subject === 'Cluster haute disponibilité')!;
		expect(decision).toMatchObject({
			decision: 'Bi-site actif/actif', // le texte de l'option, pas son identifiant
			rationale: 'Déploiement bi-site actif/actif avec réplication synchrone.',
			status: 'active', assertion_level: 'asserted', author: '@carl', validated_by: '@dan'
		});
		expect((decision as unknown as { rejected: unknown[] }).rejected).toEqual([{ option: 'Site unique', reason: 'SPOF inacceptable' }]);
		expect((decision as unknown as { facts: unknown[] }).facts).toEqual([
			{ key: 'topology.dc_count', value: 2, source_excerpt: 'bi-site' },
			{ key: 'topology.mode', value: 'active-active', source_excerpt: 'actif/actif' }
		]);
		expect(snap.data.subjects.find((s) => s.name === 'Cluster haute disponibilité')!.maturity).toBe('L3_decided');
	});

	it('4. rejouer l\'affirmation ne duplique rien', async () => {
		const res = await ASSERT(ev(DAN, params, { facts: FACTS }));
		expect(res.status).toBe(200);
		expect((await res.json()).alreadyAsserted).toBe(true);
	});

	it('5. une valeur que le Hub ne peut pas typer est refusée avec la clé, sur un sujet vierge', async () => {
		const sid2 = `${PID}-s2`;
		await prisma.subject.create({
			data: {
				id: sid2, projectId: PID, name: 'Second sujet', sectionRef: '§4.3', problemStatement: 'x', maturityLevel: 'L2_decomposed',
				options: { create: [{ id: `${sid2}-a`, title: 'Option A', summary: 's', origin: 'human', author: 'x', productionMode: 'human-authored' }] },
				decision: { create: { id: `${sid2}-d`, retainedOptionId: `${sid2}-a`, rejected: '[]', rationale: 'Parce que.', reversibility: 'reversible', arbiterId: CARL.user.email, arbiterRole: 'lead_architect' } }
			}
		});
		const res = await ASSERT(ev(DAN, { projectId: PID, subjectId: sid2 }, { facts: [{ key: 'topology.dc_count', value: 'plusieurs', source_excerpt: 'x', selected: true }] }));
		expect(res.status).toBe(422);
		expect(await res.json()).toMatchObject({ error: 'FACT_VALUE', key: 'topology.dc_count' });
		expect((await prisma.subject.findUniqueOrThrow({ where: { id: sid2 } })).maturityLevel).toBe('L2_decomposed');
	});
});
