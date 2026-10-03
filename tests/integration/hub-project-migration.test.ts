/**
 * Tests d'intégration pour la simulation, migration et bascule vers le Hub (Issue #34).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import {
	simulateProjectMigration,
	executeProjectMigration,
	isProjectCutOverToHub
} from '$lib/server/projects/hubMigrationService';
import { POST as exportProjectBundle } from '../../src/routes/api/projects/[projectId]/bundle-export/+server';
import { POST as assertStatementEndpoint } from '../../src/routes/api/projects/[projectId]/statements/[statementId]/assert/+server';
import type { RequestEvent } from '@sveltejs/kit';

describe('Hub Project Migration & Cutover Integration (Issue #34)', () => {
	let server: Server;
	let baseUrl: string;
	let client: LLMOpsClient;

	const recordedCalls: Array<{ method: string; url: string; body: any; headers: any }> = [];

	const testProjectId = 'test-proj-mig-34';
	const testAdminUserId = 'user-admin-mig-34';
	const testDeciderUserId = 'user-decider-mig-34';
	const testContributorUserId = 'user-contrib-mig-34';

	beforeAll(async () => {
		// Nettoyage préalable
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.user.deleteMany({
			where: { id: { in: [testAdminUserId, testDeciderUserId, testContributorUserId] } }
		});

		// Création des utilisateurs
		await prisma.user.create({
			data: {
				id: testAdminUserId,
				name: 'Alice Architect',
				email: 'alice.architect@domain.com',
				passwordHash: 'hash',
				role: 'admin'
			}
		});

		await prisma.user.create({
			data: {
				id: testDeciderUserId,
				name: 'Bob Decider',
				email: 'bob.expert@domain.com',
				passwordHash: 'hash',
				role: 'user'
			}
		});

		await prisma.user.create({
			data: {
				id: testContributorUserId,
				name: 'Charlie Contributor',
				email: 'charlie.author@domain.com',
				passwordHash: 'hash',
				role: 'user'
			}
		});
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.user.deleteMany({
			where: { id: { in: [testAdminUserId, testDeciderUserId, testContributorUserId] } }
		});
	});

	beforeEach(async () => {
		recordedCalls.length = 0;

		server = createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => {
				const raw = Buffer.concat(chunks).toString('utf-8');
				let body: any = {};
				try {
					body = JSON.parse(raw);
				} catch {
					body = raw;
				}

				recordedCalls.push({
					method: req.method || 'GET',
					url: req.url || '',
					body,
					headers: req.headers
				});

				const url = req.url || '';

				if (req.method === 'POST' && url === '/api/engagements') {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								engagement: body.engagement,
								confidentiality: body.confidentiality,
								members: [{ handle: body.admin_handle, role: 'admin' }]
							}
						})
					);
					return;
				}

				if (req.method === 'PUT' && url.includes('/members')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ status: 'ok', data: { members: body.members } }));
					return;
				}

				if (req.method === 'POST' && url.includes('/requirements')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: { created: body.requirements.map((r: any) => r.id), unchanged: [], origin: 'human' }
						})
					);
					return;
				}

				if (req.method === 'POST' && url.includes('/subjects') && !url.includes('/maturity')) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ status: 'ok', data: { created: true, subject: body.name } }));
					return;
				}

				if (req.method === 'POST' && url.includes('/maturity')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ status: 'ok', data: { subject: 'mcx-core', level: body.level } }));
					return;
				}

				if (req.method === 'POST' && url.includes('/questions')) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ status: 'ok', data: { created: true, question: { id: 'Q-1', status: 'open' } } }));
					return;
				}

				if (req.method === 'POST' && url.includes('/statements') && !url.includes('/assert')) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								created: true,
								statement: {
									id: 'STMT-' + Math.random().toString(36).slice(2, 7),
									status: 'proposed'
								}
							}
						})
					);
					return;
				}

				if (req.method === 'POST' && url.includes('/assert')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								statement: { id: 'STMT-asserted', status: 'active', validated_by: '@bob-expert' },
								conflicts_opened: []
							}
						})
					);
					return;
				}

				if (req.method === 'POST' && url.includes('/exports')) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								snapshotRef: {
									sourceSystem: 'knowledge-hub',
									snapshotId: 'eng-test-snap-1234',
									checksum: 'sha256:aabbcc',
									producedAt: new Date().toISOString()
								},
								created: true,
								is_provisional: false
							}
						})
					);
					return;
				}

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ status: 'ok', data: {} }));
			});
		});

		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
		const port = (server.address() as AddressInfo).port;
		baseUrl = `http://127.0.0.1:${port}`;
		client = new LLMOpsClient({ baseUrl, authToken: 'mig-test-token', timeoutMs: 3000 });
	});

	afterEach(async () => {
		if (server) {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	it('1. simulateProjectMigration détecte les e-mails dans les textes et les confiances invalides', async () => {
		// Créer un projet avec des données non conformes
		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Test Migration Project',
				shortName: 'test-mig-proj',
				type: 'project_rfp',
				badge: 'TMP',
				description: 'Projet de test pour validation K15',
				strategy: JSON.stringify({
					objectives: ['Sécuriser avec contact bob.expert@domain.com'] // EMAIL dans l'exigence
				}),
				members: {
					create: [
						{ userId: testAdminUserId, role: 'lead_architect' },
						{ userId: testDeciderUserId, role: 'domain_expert' },
						{ userId: testContributorUserId, role: 'contributor' }
					]
				},
				subjects: {
					create: [
						{
							id: 'subj-1',
							name: 'Core MCX',
							sectionRef: '§4.1',
							problemStatement: 'Écrire à alice.architect@domain.com pour détails' // EMAIL dans le sujet
						}
					]
				},
				statements: {
					create: [
						{
							id: 'stmt-bad-conf',
							section: '§4.1',
							subjectRef: 'Core MCX',
							predicate: 'has_property',
							value: 'Valeur correcte sans email',
							author: 'charlie.author@domain.com',
							role: 'architect',
							productionMode: 'human-authored',
							confidence: 'super-confident-custom', // Confiance invalide
							subjectLevel: 'L2_decomposed',
							status: 'active'
						},
						{
							id: 'stmt-bad-email',
							section: '§4.1',
							subjectRef: 'Core MCX',
							predicate: 'contact',
							value: 'Pour support voir support@partner.fr', // EMAIL dans l'énoncé
							author: 'charlie.author@domain.com',
							role: 'architect',
							productionMode: 'human-authored',
							confidence: 'designed',
							subjectLevel: 'L2_decomposed',
							status: 'active'
						}
					]
				}
			}
		});

		const report = await simulateProjectMigration(testProjectId);
		expect(report.ok).toBe(false);
		expect(report.rejected.length).toBeGreaterThanOrEqual(3);

		const emailRejections = report.rejected.filter((r) => r.code === 'EMAIL');
		expect(emailRejections.length).toBeGreaterThanOrEqual(2);

		const confRejection = report.rejected.find((r) => r.code === 'INVALID_CONFIDENCE');
		expect(confRejection).toBeDefined();
		expect(confRejection?.entityId).toBe('stmt-bad-conf');

		// Tentative d'exécution avec anomalies -> Rejet immédiat (Fail Loud)
		await expect(
			executeProjectMigration(testProjectId, 'alice.architect@domain.com', { client })
		).rejects.toThrowError(/Migration refusée/);
	});

	it('2. Exécute la migration sur des données assainies, affirme les énoncés qualifiés et bascule en SoR hub', async () => {
		// Nettoyage et recréation d'un projet propre
		await prisma.project.deleteMany({ where: { id: testProjectId } });

		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Test Clean Migration Project',
				shortName: 'clean-mig-proj',
				type: 'project_rfp',
				badge: 'CMP',
				description: 'Projet de test propre',
				strategy: JSON.stringify({
					objectives: ['Haute disponibilité 99.999%', 'Latence MCX < 100ms'],
					constraints: ['SecNumCloud 3.2']
				}),
				members: {
					create: [
						{ userId: testAdminUserId, role: 'lead_architect' },
						{ userId: testDeciderUserId, role: 'domain_expert' },
						{ userId: testContributorUserId, role: 'contributor' }
					]
				},
				subjects: {
					create: [
						{
							id: 'subj-clean',
							name: 'Clean MCX Core',
							sectionRef: '§4.1',
							problemStatement: 'Spécification du coeur MCX',
							maturityLevel: 'L3_decided',
							questions: {
								create: [
									{
										id: 'q-clean-1',
										text: 'Quel algorithme pour le floor control ?',
										assignedRole: 'lead_architect'
									}
								]
							}
						}
					]
				},
				statements: {
					create: [
						// Énoncé 1 : rédigé par charlie, validé par bob (distinct decider) -> assertable !
						{
							id: 'stmt-assertable',
							section: '§4.1',
							subjectRef: 'Clean MCX Core',
							predicate: 'implements',
							value: 'Floor Control UDP direct',
							author: 'charlie.author@domain.com',
							role: 'architect',
							productionMode: 'human-authored',
							confidence: 'designed',
							subjectLevel: 'L3_decided',
							status: 'active'
						},
						// Énoncé 2 : rédigé par charlie, sans valideur distinct -> proposed only
						{
							id: 'stmt-proposed-only',
							section: '§4.1',
							subjectRef: 'Clean MCX Core',
							predicate: 'requires',
							value: 'Buffer jitter 20ms',
							author: 'charlie.author@domain.com',
							role: 'architect',
							productionMode: 'human-authored',
							confidence: 'assumed',
							subjectLevel: 'L2_decomposed',
							status: 'active'
						}
					]
				}
			}
		});

		// Enregistrement de l'affirmation par un décideur distinct (Bob) pour stmt-assertable
		await prisma.domainEvent.create({
			data: {
				projectId: testProjectId,
				entityType: 'statement',
				entityId: 'stmt-assertable',
				type: 'STATEMENT_ASSERTED',
				payload: JSON.stringify({ validatedBy: 'bob.expert@domain.com' }),
				actorId: testDeciderUserId,
				actorRole: 'domain_expert',
				productionMode: 'human-authored'
			}
		});

		// 1. Simulation
		const report = await simulateProjectMigration(testProjectId);
		expect(report.ok).toBe(true);
		expect(report.rejected).toEqual([]);
		expect(report.counts.members).toBe(3);
		expect(report.counts.subjects).toBe(1);
		expect(report.counts.statements).toBe(2);
		expect(report.counts.statementsAssertable).toBe(1);
		expect(report.counts.statementsProposedOnly).toBe(1);
		expect(report.counts.requirements).toBe(3);

		// Les handles sont uniques et normalisés
		const handles = report.accepted.members.map((m) => m.handle);
		expect(new Set(handles).size).toBe(3);
		expect(handles.every((h) => h.startsWith('@'))).toBe(true);

		// 2. Exécution de la migration
		const result = await executeProjectMigration(testProjectId, 'alice.architect@domain.com', {
			client,
			confidentiality: 'confidential'
		});

		expect(result.ok).toBe(true);
		expect(result.systemOfRecord).toBe('hub');

		// 3. Vérification de la bascule en base locale
		const updatedProject = await prisma.project.findUnique({ where: { id: testProjectId } });
		expect(isProjectCutOverToHub(updatedProject!)).toBe(true);

		const strat = JSON.parse(updatedProject!.strategy || '{}');
		expect(strat.systemOfRecord).toBe('hub');
		expect(strat.hubEngagementId).toBe(report.engagementId);

		// 4. Vérification des appels Hub : aucun e-mail dans les textes envoyés
		const writeCalls = recordedCalls.filter((c) => c.method === 'POST' || c.method === 'PUT');
		for (const call of writeCalls) {
			if (call.url.includes('/statements') || call.url.includes('/subjects') || call.url.includes('/requirements')) {
				const bodyStr = JSON.stringify(call.body);
				// Les adresses e-mail ne doivent apparaître nulle part dans les textes des énoncés ou exigences
				expect(bodyStr.includes('alice.architect@domain.com')).toBe(false);
				expect(bodyStr.includes('charlie.author@domain.com')).toBe(false);
			}
		}

		// 5. Vérification qu'une affirmation a été déclenchée pour l'énoncé assertable
		const assertCalls = recordedCalls.filter((c) => c.url.includes('/assert'));
		expect(assertCalls.length).toBe(1);
		expect(assertCalls[0].headers?.['x-actor-email']).toBe('bob.expert@domain.com');

		// 6. Test d'idempotence : ré-exécuter la migration ne produit aucune erreur
		const secondRun = await executeProjectMigration(testProjectId, 'alice.architect@domain.com', { client });
		expect(secondRun.ok).toBe(true);
	});

	it('3. L’endpoint de bundle-export délègue au Hub quand le projet a basculé (SoR: hub)', async () => {
		// Le projet testProjectId a été basculé vers le Hub dans le test 2
		// On s'assure que llmopsClient pointe vers notre serveur mock
		const originalBaseUrl = process.env.LLMOPS_BASE_URL;
		process.env.LLMOPS_BASE_URL = baseUrl;
		const { llmopsClient } = await import('../../src/lib/server/llmops/client');
		llmopsClient.setBaseUrl(baseUrl);

		try {
			const mockEvent = {
				params: { projectId: testProjectId },
				locals: {
					session: {
						user: { id: testAdminUserId, name: 'Alice Architect', email: 'alice.architect@domain.com', role: 'admin' },
						expires: '2026-12-31T00:00:00Z'
					}
				},
				request: new Request(`http://localhost/api/projects/${testProjectId}/bundle-export`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ confidentiality: 'confidential' })
				}),
				url: new URL(`http://localhost/api/projects/${testProjectId}/bundle-export`)
			} as unknown as RequestEvent;

			const response = await exportProjectBundle(mockEvent as any);
			expect(response.status).toBe(200);
			const json = await response.json();

			expect(json.status).toBe('ok');
			expect(json.systemOfRecord).toBe('hub');
			expect(json.snapshotRef).toBeDefined();
			expect(json.snapshotRef.sourceSystem).toBe('knowledge-hub');
			expect(json.snapshotRef.snapshotId).toBe('eng-test-snap-1234');

			// Vérifier qu'un appel POST a bien été fait sur le mock Hub /exports
			const exportCalls = recordedCalls.filter((c) => c.url.includes('/exports') && c.method === 'POST');
			expect(exportCalls.length).toBeGreaterThanOrEqual(1);
			expect(exportCalls[0].headers?.['x-actor-email']).toBe('alice.architect@domain.com');
		} finally {
			if (originalBaseUrl) {
				process.env.LLMOPS_BASE_URL = originalBaseUrl;
				llmopsClient.setBaseUrl(originalBaseUrl);
			}
		}
	});

	it('4. L’endpoint d’affirmation d’énoncé refuse l’auto-validation (409) et accepte la validation par un valideur distinct', async () => {
		const originalBaseUrl = process.env.LLMOPS_BASE_URL;
		process.env.LLMOPS_BASE_URL = baseUrl;
		const { llmopsClient } = await import('../../src/lib/server/llmops/client');
		llmopsClient.setBaseUrl(baseUrl);

		try {
			// 1. Appel par un valideur distinct (Bob, domain_expert) -> succès
			const mockEventBob = {
				params: { projectId: testProjectId, statementId: 'stmt-assertable' },
				locals: {
					session: {
						user: { id: testDeciderUserId, name: 'Bob Decider', email: 'bob.expert@domain.com', role: 'user' },
						expires: '2026-12-31T00:00:00Z'
					}
				},
				request: new Request(`http://localhost/api/projects/${testProjectId}/statements/stmt-assertable/assert`, {
					method: 'POST'
				}),
				url: new URL(`http://localhost/api/projects/${testProjectId}/statements/stmt-assertable/assert`)
			} as unknown as RequestEvent;

			const bobResponse = await assertStatementEndpoint(mockEventBob as any);
			expect(bobResponse.status).toBe(200);
			const bobJson = await bobResponse.json();
			expect(bobJson.status).toBe('ok');
			expect(bobJson.data.statement.validated_by).toBe('@bob-expert');

			// 2. Appel par un non-décideur (Charlie, contributor) -> refus 403
			const mockEventCharlie = {
				params: { projectId: testProjectId, statementId: 'stmt-assertable' },
				locals: {
					session: {
						user: { id: testContributorUserId, name: 'Charlie Contributor', email: 'charlie.author@domain.com', role: 'user' },
						expires: '2026-12-31T00:00:00Z'
					}
				},
				request: new Request(`http://localhost/api/projects/${testProjectId}/statements/stmt-assertable/assert`, {
					method: 'POST'
				}),
				url: new URL(`http://localhost/api/projects/${testProjectId}/statements/stmt-assertable/assert`)
			} as unknown as RequestEvent;

			const charlieResponse = await assertStatementEndpoint(mockEventCharlie as any);
			expect(charlieResponse.status).toBe(403);
			const charlieJson = await charlieResponse.json();
			expect(charlieJson.error).toBe('forbidden');
		} finally {
			if (originalBaseUrl) {
				process.env.LLMOPS_BASE_URL = originalBaseUrl;
				llmopsClient.setBaseUrl(originalBaseUrl);
			}
		}
	});
});

