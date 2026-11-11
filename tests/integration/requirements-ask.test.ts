import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { buildEngagementProfileFromWorkspaceInput } from '$lib/domain/engagements';
import { requirementBundleId, sourceSha256 } from '$lib/domain/requirementAudit';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { POST as createEngagement } from '../../src/routes/api/engagements/+server';
import { POST as saveAudit } from '../../src/routes/api/projects/[projectId]/requirements/+server';
import { POST as askRequirements } from '../../src/routes/api/projects/[projectId]/requirements/ask/+server';

describe("API Quick-Ask Exigences : POST /api/projects/[projectId]/requirements/ask", () => {
	const projectId = `req-ask-${Date.now()}`;
	const emptyProjectId = `req-ask-empty-${Date.now()}`;
	const sourceText = `CCTP Test ${projectId}\nREQ-10 Architecture tri-site sur 3 DC\nREQ-11 Chiffrement AES-256`;
	const sha = sourceSha256(sourceText);

	const session = (id: string, email: string, role = 'user') => ({ user: { id, email, role, name: id } });
	const event = (
		body: unknown,
		user: ReturnType<typeof session> | null,
		params: Record<string, string> = { projectId }
	) =>
		({
			params,
			locals: { session: user },
			request: new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) })
		}) as any;

	beforeAll(async () => {
		const { engagement } = buildEngagementProfileFromWorkspaceInput({
			id: projectId,
			title: 'Projet Quick-Ask',
			type: 'project_rfp',
			description: 'Projet test Q&A',
			strategy: { objectives: [], principles: [], constraints: [] },
			participants: [{ id: 'part-1', name: 'Experte', role: 'infra_expert_architect', email: 'expert@example.org' }],
			initialSubjects: [
				{
					name: 'Topologie Multi-DC',
					waitingForRole: 'lead_architect',
					requirementIds: [requirementBundleId(sha, 'REQ-10')]
				} as any
			]
		});
		engagement.subjects[0].requirement_ids = [requirementBundleId(sha, 'REQ-10')];
		expect((await createEngagement(event({ engagement }, session('lead-1', 'lead@example.org')))).status).toBe(200);

		const auditRes = await saveAudit(
			event(
				{
					source: { title: 'CCTP Test', kind: 'rfp', language: 'fr', sha256: sha },
					model: 'claude-sonnet-5-5',
					auditedAt: new Date().toISOString(),
					confirmedDeliberated: ['REQ-10'],
					items: [
						{
							clauseRef: 'REQ-10',
							title: 'Topologie 3 datacenters',
							text: 'La solution doit être hébergée sur 3 datacenters actifs.',
							criticality: 'bloquant',
							category: 'NFR',
							disposition: 'deliberated',
							reason: 'Impact fort sur la latence synchrone',
							position: 0
						},
						{
							clauseRef: 'REQ-11',
							title: 'Chiffrement disques',
							text: 'Chiffrement AES-256 exigé.',
							criticality: 'majeur',
							category: 'NFR',
							disposition: 'evacuated',
							reason: 'Standard établi sans alternative',
							position: 1
						}
					]
				},
				session('lead-1', 'lead@example.org')
			)
		);
		expect(auditRes.status).toBe(200);

		const emptyProfile = buildEngagementProfileFromWorkspaceInput({
			id: emptyProjectId,
			title: 'Projet sans exigences',
			type: 'project_rfp',
			description: 'Vide',
			strategy: { objectives: [], principles: [], constraints: [] },
			participants: [],
			initialSubjects: []
		});
		expect(
			(await createEngagement(event({ engagement: emptyProfile.engagement }, session('lead-1', 'lead@example.org'))))
				.status
		).toBe(200);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: { in: [projectId, emptyProjectId] } } });
		await prisma.engagement.deleteMany({ where: { id: { in: [projectId, emptyProjectId] } } });
	});

	it('refuse un appel non authentifié (401) ou hors projet (403)', async () => {
		const res401 = await askRequirements(event({ question: '3 DC ?' }, null));
		expect(res401.status).toBe(401);

		const res403 = await askRequirements(event({ question: '3 DC ?' }, session('stranger', 'stranger@example.org')));
		expect(res403.status).toBe(403);
	});

	it('retourne 422 NO_REQUIREMENTS si le projet n a aucune exigence enregistrée', async () => {
		const res = await askRequirements(
			event({ question: '3 DC ?' }, session('lead-1', 'lead@example.org'), { projectId: emptyProjectId })
		);
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.code).toBe('NO_REQUIREMENTS');
	});

	it('répond avec citations vérifiées, lien sujet, cacheable=true et préfixe identique entre 2 utilisateurs', async () => {
		const capturedSystems: string[] = [];
		const capturedCacheable: boolean[] = [];

		vi.spyOn(localLlmClient, 'chat').mockImplementation(async (options) => {
			const sys = options.messages.find((m) => m.role === 'system');
			capturedSystems.push(sys?.content ?? '');
			capturedCacheable.push(Boolean(sys?.cacheable));
			return JSON.stringify({
				verdict: 'imposed',
				answer: 'Oui, la clause [REQ-10] impose un hébergement sur 3 datacenters actifs.',
				caveats: [],
				citations: [
					{ clauseRef: 'REQ-10', excerpt: 'hébergée sur 3 datacenters actifs' },
					{ clauseRef: 'REQ-FAKE', excerpt: 'hallucination' }
				]
			});
		});

		const res1 = await askRequirements(
			event({ question: 'Les exigences imposent-elles 3 DC ?' }, session('lead-1', 'lead@example.org'))
		);
		expect(res1.status).toBe(200);
		const body1 = await res1.json();

		expect(body1.verdict).toBe('imposed');
		expect(body1.meta.mode).toBe('full_context');
		expect(body1.meta.totalRequirements).toBe(2);
		expect(body1.citations).toHaveLength(1);
		expect(body1.citations[0].clauseRef).toBe('REQ-10');
		expect(body1.citations[0].linkedSubjectIds).toHaveLength(1);
		expect(body1.caveats.some((c: string) => c.includes('REQ-FAKE'))).toBe(true);

		const res2 = await askRequirements(
			event({ question: 'Y a-t-il du chiffrement ?' }, session('expert-acc', 'expert@example.org'))
		);
		expect(res2.status).toBe(200);
		const body2 = await res2.json();

		expect(capturedCacheable).toEqual([true, true]);
		expect(capturedSystems[0]).toBe(capturedSystems[1]);
		expect(body2.meta.cacheHint).toBe(body1.meta.cacheHint);
	});

	it('retourne 503 LLM_UNAVAILABLE quand aucun modèle LLM n est joignable', async () => {
		vi.spyOn(localLlmClient, 'chat').mockRejectedValue(
			new Error('Aucun modèle LLM configuré ni détecté sur http://localhost:11434')
		);

		const res = await askRequirements(
			event({ question: 'Les exigences imposent-elles 3 DC ?' }, session('lead-1', 'lead@example.org'))
		);
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.code).toBe('LLM_UNAVAILABLE');
	});
});
