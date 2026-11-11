import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { render } from 'svelte/server';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient, llmopsClient } from '$lib/server/llmops/client';
import { checkSubjectCompliance } from '$lib/server/compliance/complianceService';
import { GET as getWorkbench } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/workbench/+server';
import DeliberationWorkbench from '$lib/components/deliberation/DeliberationWorkbench.svelte';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('Deliberation Subject Switch Performance & LLMOps Caching Contract', () => {
	const testProjectId = 'test-proj-perf-switch';
	const testSubjectId = 'sub-perf-switch-1';

	let server: Server | null = null;

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.engagement.deleteMany({ where: { id: testProjectId } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.engagement.deleteMany({ where: { id: testProjectId } });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		if (server) {
			await new Promise<void>((resolve) => server!.close(() => resolve()));
			server = null;
		}
	});

	it('LLMOpsClient met en cache getDoctrineContext, checkOption et getFrameworkCoverage sans vider le cache en lecture', async () => {
		const counts = { context: 0, check: 0, coverage: 0, snapshot: 0 };
		let forceContextError = false;

		server = createServer((req, res) => {
			const url = req.url || '';
			res.setHeader('Content-Type', 'application/json');
			if (url.startsWith('/api/knowledge/context')) {
				counts.context++;
				if (forceContextError) {
					res.writeHead(503);
					res.end(JSON.stringify({ error: 'unavailable' }));
					return;
				}
				res.writeHead(200);
				res.end(JSON.stringify({ items: [{ id: 'KB-1', type: 'rule', title: 'Rule 1', content: 'C1' }], total_items: 1, truncated: false }));
				return;
			}
			if (url.startsWith('/api/knowledge/check')) {
				counts.check++;
				res.writeHead(200);
				res.end(JSON.stringify({ verdicts: [] }));
				return;
			}
			if (url.startsWith('/api/compliance/frameworks/applicable')) {
				counts.coverage++;
				res.writeHead(200);
				res.end(JSON.stringify({ coverage: { NIS2: { status: 'covered', expected: 1, validated: 1, missing_ids: [] } } }));
				return;
			}
			if (url.includes('/snapshot')) {
				counts.snapshot++;
				res.writeHead(200);
				res.end(JSON.stringify({ rules: [] }));
				return;
			}
			res.writeHead(404);
			res.end('{}');
		});

		await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as AddressInfo).port;
		const client = new LLMOpsClient({
			baseUrl: `http://127.0.0.1:${port}`,
			cacheTtlMs: 10_000
		});

		// Pré-remplir une autre entrée du cache (ex: snapshot)
		await client.cachedFetch('snapshot:latest', async () => {
			counts.snapshot++;
			return { ok: true };
		});
		expect(counts.snapshot).toBe(1);

		// 1. Les appels de lecture doivent mettre en cache et ne PAS invalider les autres clés
		const ctx1 = await client.getDoctrineContext({ subject: 'Reseau', domains: ['net'], frameworks: ['NIS2'] });
		const ctx2 = await client.getDoctrineContext({ subject: 'Reseau', domains: ['net'], frameworks: ['NIS2'] });
		expect(ctx1.offline).toBe(false);
		expect(ctx2.items).toHaveLength(1);
		expect(counts.context).toBe(1);

		const chk1 = await client.checkOption({ option: { id: 'o1', title: 'Opt 1', summary: 'Sum' }, frameworks: ['NIS2'] });
		const chk2 = await client.checkOption({ option: { id: 'o1', title: 'Opt 1', summary: 'Sum' }, frameworks: ['NIS2'] });
		expect(chk1.offline).toBe(false);
		expect(chk2.offline).toBe(false);
		expect(counts.check).toBe(1);

		const cov1 = await client.getFrameworkCoverage('proj-a');
		const cov2 = await client.getFrameworkCoverage('proj-a');
		expect(cov1.offline).toBe(false);
		expect(cov2.frameworks).toHaveLength(1);
		expect(counts.coverage).toBe(1);

		// Vérifier que snapshot:latest est toujours en cache (non invalidé par les lectures ci-dessus)
		await client.cachedFetch('snapshot:latest', async () => {
			counts.snapshot++;
			return { ok: true };
		});
		expect(counts.snapshot).toBe(1);

		// 2. Une réponse hors-ligne/erreur ne doit pas être mise en cache durablement
		forceContextError = true;
		const offlineCtx = await client.getDoctrineContext({ subject: 'Autre' });
		expect(offlineCtx.offline).toBe(true);
		forceContextError = false;
		const recoveredCtx = await client.getDoctrineContext({ subject: 'Autre' });
		expect(recoveredCtx.offline).toBe(false);
	});

	it('checkSubjectCompliance exécute les vérifications checkOption en parallèle', async () => {
		await prisma.engagement.upsert({
			where: { id: testProjectId },
			update: { strategy: JSON.stringify({ applicableFrameworks: ['NIS2'] }) },
			create: {
				id: testProjectId,
				title: 'Perf Test Engagement',
				shortName: 'PERF',
				type: 'project_rfp',
				badge: 'TEST',
				description: 'Perf test',
				strategy: JSON.stringify({ applicableFrameworks: ['NIS2'] }),
				subjects: '[]'
			}
		});
		await prisma.project.upsert({
			where: { id: testProjectId },
			update: {},
			create: {
				id: testProjectId,
				title: 'Perf Test Project',
				shortName: 'PERF',
				type: 'project_rfp',
				badge: 'TEST',
				description: 'Perf test',
				strategy: JSON.stringify({ applicableFrameworks: ['NIS2'] })
			}
		});
		await prisma.subject.upsert({
			where: { id: testSubjectId },
			update: {},
			create: {
				id: testSubjectId,
				projectId: testProjectId,
				sectionRef: '§1.1',
				name: 'Architecture Réseau',
				domain: 'network',
				problemStatement: 'Choix topologie',
				maturityLevel: 'L2_decomposed',
				deliberationStatus: 'debating'
			}
		});
		await prisma.option.deleteMany({ where: { subjectId: testSubjectId } });
		await prisma.option.createMany({
			data: [
				{ id: 'opt-p1', subjectId: testSubjectId, title: 'Option 1', summary: 'S1', origin: 'human', author: 'u1', productionMode: 'human-authored' },
				{ id: 'opt-p2', subjectId: testSubjectId, title: 'Option 2', summary: 'S2', origin: 'human', author: 'u1', productionMode: 'human-authored' },
				{ id: 'opt-p3', subjectId: testSubjectId, title: 'Option 3', summary: 'S3', origin: 'human', author: 'u1', productionMode: 'human-authored' }
			]
		});

		let inFlight = 0;
		let maxInFlight = 0;
		vi.spyOn(llmopsClient, 'checkOption').mockImplementation(async ({ option }) => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 30));
			inFlight--;
			return {
				offline: false,
				verdicts:
					option.id === 'opt-p2'
						? [{ typed_id: 'rule:R1', check_id: 'C1', verdict: 'violates', message: 'Non conforme', check_status: 'validated' } as any]
						: []
			} as any;
		});
		vi.spyOn(llmopsClient, 'getFrameworkCoverage').mockResolvedValue({
			frameworks: [{ name: 'NIS2', required: true, status: 'covered', covered_count: 1, total_count: 1, missing_clauses: [] }],
			overall_coverage: 'covered',
			checked_at: new Date().toISOString(),
			offline: false
		});

		const compliance = await checkSubjectCompliance(testProjectId, testSubjectId);
		expect(maxInFlight).toBeGreaterThanOrEqual(2);
		expect(compliance.violations).toHaveLength(1);
		expect(compliance.violations[0].optionId).toBe('opt-p2');
	});

	it('GET /workbench agrège les données locales du sujet en une seule requête sans appeler LLMOps', async () => {
		const checkSpy = vi.spyOn(llmopsClient, 'checkOption');
		const ctxSpy = vi.spyOn(llmopsClient, 'getDoctrineContext');
		const covSpy = vi.spyOn(llmopsClient, 'getFrameworkCoverage');

		await prisma.criterion.deleteMany({ where: { subjectId: testSubjectId } });
		await prisma.criterion.create({
			data: {
				id: 'crit-perf-1',
				subjectId: testSubjectId,
				name: 'Résilience',
				description: 'HA',
				kind: 'performance',
				weight: 4,
				author: 'u1',
				productionMode: 'human-authored'
			}
		});
		await prisma.argument.deleteMany({ where: { subjectId: testSubjectId } });
		await prisma.argument.create({
			data: {
				id: 'arg-perf-1',
				subjectId: testSubjectId,
				stance: 'support',
				claim: 'Option 1 robuste',
				grounds: 'Testé en lab',
				kbRefs: '[]',
				confidence: 'designed',
				author: 'Alice',
				authorKind: 'human',
				productionMode: 'human-authored',
				round: 1
			}
		});

		const event = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			request: new Request(`http://localhost/api/projects/${testProjectId}/subjects/${testSubjectId}/workbench`),
			locals: { user: { id: 'u1', email: 'alice@test.local', role: 'lead_architect' } }
		} as unknown as Parameters<typeof getWorkbench>[0];

		const res = await getWorkbench(event);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.subject.id).toBe(testSubjectId);
		expect(body.arguments).toHaveLength(1);
		expect(body.options).toHaveLength(3);
		expect(body.criteria).toHaveLength(1);
		expect(body.criteriaReport).toBeTruthy();
		expect(body.decision).toBeNull();

		// Aucun appel LLMOps sur le chemin critique du workbench
		expect(checkSpy).not.toHaveBeenCalled();
		expect(ctxSpy).not.toHaveBeenCalled();
		expect(covSpy).not.toHaveBeenCalled();
	});

	it('DeliberationWorkbench ne monte qu’une seule instance de SubjectThreadView', () => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
		const { html } = render(DeliberationWorkbench, {
			props: {
				sessionRole: 'lead_architect'
			}
		});

		const matches = html.match(/data-testid="unified-workspace-tabs"/g) || [];
		expect(matches).toHaveLength(1);
	});
});
