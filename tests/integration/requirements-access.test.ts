import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { buildEngagementProfileFromWorkspaceInput } from '$lib/domain/engagements';
import { requirementBundleId, sourceSha256 } from '$lib/domain/requirementAudit';
import { POST as createEngagement } from '../../src/routes/api/engagements/+server';
import { POST as saveAudit } from '../../src/routes/api/projects/[projectId]/requirements/+server';
import { POST as auditFromRun } from '../../src/routes/api/projects/[projectId]/requirements/from-run/+server';

// #63 : le dossier d'exigences doit pouvoir être enregistré par le créateur de l'espace ou un participant
// (retrouvé par e-mail), et réparé à partir de l'analyse de RFP enregistrée.
describe("Dossier d'exigences : accès et réenregistrement depuis l'analyse (#63)", () => {
	const projectId = `req-access-${Date.now()}`;
	const sourceText = `RFP de test ${projectId}\n1.1 Disponibilité 99,99 %\n1.2 Hébergement en France`;
	const sha = sourceSha256(sourceText);
	let runId = '';

	const session = (id: string, email: string, role = 'user') => ({ user: { id, email, role, name: id } });
	const event = (body: unknown, user: ReturnType<typeof session> | null, params: Record<string, string> = { projectId }) =>
		({
			params,
			locals: { session: user },
			request: new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) })
		}) as any;

	beforeAll(async () => {
		const { engagement } = buildEngagementProfileFromWorkspaceInput({
			id: projectId,
			title: 'Accès dossier',
			type: 'project_rfp',
			description: 'd',
			strategy: { objectives: [], principles: [], constraints: [] },
			participants: [{ id: 'part-x', name: 'Expert', role: 'infra_expert_architect', email: 'Expert@Example.org' }],
			initialSubjects: [
				{ name: 'Disponibilité', waitingForRole: 'lead_architect', requirementIds: [requirementBundleId(sha, '1.1')] } as any
			]
		});
		engagement.subjects[0].requirement_ids = [requirementBundleId(sha, '1.1')];
		const res = await createEngagement(event({ engagement }, session('creator-1', 'creator@example.org')));
		expect(res.status).toBe(200);

		const run = await prisma.factorizationRun.create({
			data: {
				inputSha256: `test-${projectId}`,
				documentTitle: 'RFP de test',
				model: 'claude-sonnet-5-5',
				engine: 'audit',
				status: 'ok',
				clauseCount: 2,
				sourceText,
				finishedAt: new Date(),
				result: JSON.stringify({
					engine: 'arckit-requirements-audit',
					modelUsed: 'claude-sonnet-5-5',
					allAuditedRequirements: [
						{ clauseRef: '1.1', title: 'Disponibilité', text: 'Disponibilité 99,99 %', criticality: 'bloquant', disposition: 'deliberated' },
						{ clauseRef: '1.2', title: 'Hébergement', text: 'Hébergement en France', criticality: 'majeur', disposition: 'evacuated', evacuationReason: 'Contrainte de contexte' }
					]
				})
			}
		});
		runId = run.id;
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: projectId } });
		await prisma.engagement.deleteMany({ where: { id: projectId } });
		await prisma.factorizationRun.deleteMany({ where: { id: runId } });
	});

	it('le créateur de l\'espace en devient membre Lead Architect', async () => {
		const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: 'creator-1' } } });
		expect(member?.role).toBe('lead_architect');
	});

	it('un compte sans lien avec le projet est refusé', async () => {
		const res = await auditFromRun(event({}, session('stranger', 'stranger@example.org')));
		expect(res.status).toBe(403);
	});

	it('un participant retrouvé par e-mail réenregistre le dossier depuis l\'analyse, clauses couvertes confirmées', async () => {
		const res = await auditFromRun(event({}, session('expert-account', 'expert@example.org')));
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.saved).toEqual([{ sourceId: requirementBundleId(sha, '').slice(0, -1), runId, clauses: 2, confirmed: 1 }]);
		expect(await prisma.requirement.count({ where: { source: { projectId } } })).toBe(2);
	});

	it('le créateur peut aussi enregistrer un audit directement', async () => {
		const res = await saveAudit(
			event(
				{
					source: { title: 'RFP de test', kind: 'rfp', language: 'fr', sha256: sha },
					model: 'claude-sonnet-5-5',
					auditedAt: new Date().toISOString(),
					items: [{ clauseRef: '1.1', title: 'Disponibilité', text: 'Disponibilité 99,99 %', criticality: 'bloquant', disposition: 'deliberated', position: 0 }],
					confirmedDeliberated: ['1.1']
				},
				session('creator-1', 'creator@example.org')
			)
		);
		expect(res.status).not.toBe(403);
	});
});
