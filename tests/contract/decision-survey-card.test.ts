import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import {
	extractFactsForDecision,
	DEFAULT_ARCHINEX_VOCABULARY
} from '$lib/server/agents/factExtractor';
import { POST as assertDecisionEndpoint } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/decision/assert/+server';
import { POST as extractFactsEndpoint } from '../../src/routes/api/projects/[projectId]/subjects/[subjectId]/decision/extract-facts/+server';
import { formatDecisionAffirmedMilestone } from '$lib/domain/debate';
import type { RequestEvent } from '@sveltejs/kit';

describe('Lot A27 Contract & Integration: Decision Survey Card, Machine-Readable Facts & K16/K18 Affirmation (#38)', () => {
	let server: Server;
	let baseUrl: string;
	let client: LLMOpsClient;
	const recordedCalls: Array<{ method: string; url: string; body: any; headers: any }> = [];

	const testProjectId = 'test-proj-dec-38';
	const testSubjectId = 'sub-dec-core-38';
	const testAuthorUserId = 'user-author-38';
	const testAuthorEmail = 'author.architect@domain.com';
	const testDeciderUserId = 'user-decider-38';
	const testDeciderEmail = 'bob.decider@domain.com';

	beforeAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.user.deleteMany({
			where: { id: { in: [testAuthorUserId, testDeciderUserId] } }
		});

		await prisma.user.create({
			data: {
				id: testAuthorUserId,
				name: 'Alice Author',
				email: testAuthorEmail,
				passwordHash: 'hash',
				role: 'lead_architect'
			}
		});

		await prisma.user.create({
			data: {
				id: testDeciderUserId,
				name: 'Bob Decider',
				email: testDeciderEmail,
				passwordHash: 'hash',
				role: 'domain_expert'
			}
		});
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { id: testProjectId } });
		await prisma.user.deleteMany({
			where: { id: { in: [testAuthorUserId, testDeciderUserId] } }
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

				// Endpoint décisions Hub
				if (req.method === 'POST' && url.includes('/decisions') && !url.includes('/assert')) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							decision: {
								id: body.id || 'dec-hub-1',
								subject: body.subject,
								retained_option: body.retained_option,
								status: 'proposed',
								facts: body.facts || []
							}
						})
					);
					return;
				}

				// Endpoint affirmation décision Hub
				if (req.method === 'POST' && url.includes('/decisions') && url.includes('/assert')) {
					const actorHeader = req.headers['x-actor-email'] as string;
					if (actorHeader && actorHeader.toLowerCase() === testAuthorEmail.toLowerCase()) {
						res.writeHead(409, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({
								status: 'error',
								error: 'self_validation',
								reason: "Auto-validation interdite (K16) : L'auteur ne peut valider sa propre décision."
							})
						);
						return;
					}

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							decision: {
								id: 'dec-hub-1',
								status: 'asserted',
								validated_by: actorHeader || testDeciderEmail,
								asserted_at: new Date().toISOString()
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
		client = new LLMOpsClient({ baseUrl, authToken: 'dec-test-token', timeoutMs: 3000 });
	});

	afterEach(async () => {
		if (server) {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	it('1. Agent extracteur de faits (rôle synthesizer) : contraint au vocabulaire autorisé et écarte toute clé inconnue', async () => {
		const vocabulary = ['resilience_mode', 'site_count', 'sovereignty_level'];

		const facts = await extractFactsForDecision({
			decisionRationale:
				'Nous retenons une architecture avec deux sites redondés en actif/actif répondant aux exigences SecNumCloud 3.2. Clé inventée fantôme non autorisée.',
			retainedOptionTitle: 'Option Haute Disponibilité Cloud',
			retainedOptionSummary: 'Déploiement actif/actif souverain',
			allowedVocabularyKeys: vocabulary
		});

		expect(facts.length).toBeGreaterThanOrEqual(2);
		// Toutes les clés doivent STRICTEMENT faire partie du vocabulaire
		for (const f of facts) {
			expect(vocabulary).toContain(f.key);
			expect(f.productionMode).toBe('llm-derived');
			expect(f.selected).toBe(true);
			expect(f.source_excerpt).toBeDefined();
		}

		// Clé inconnue / fantôme strictement absente
		expect(facts.some((f) => f.key === 'invented_key' || f.key === 'fantome')).toBe(false);
	});

	it('2. Auto-validation proscrite (K16) : un appel forcé par l’auteur est refusé avec 409 self_validation', async () => {
		// Créer le projet et une décision rédigée par Alice Author
		await prisma.project.create({
			data: {
				id: testProjectId,
				title: 'Project K16 Test',
				shortName: 'proj-k16',
				type: 'project_rfp',
				badge: 'K16',
				description: 'Projet de test pour décision K16',
				strategy: JSON.stringify({ systemOfRecord: 'hub', hubEngagementId: 'eng-k16-test' }),
				members: {
					create: [
						{ userId: testAuthorUserId, role: 'lead_architect' },
						{ userId: testDeciderUserId, role: 'domain_expert' }
					]
				},
				subjects: {
					create: [
						{
							id: testSubjectId,
							name: 'Cluster Haute Disponibilité',
							sectionRef: '§4.2',
							problemStatement: 'Garantir la résilience',
							maturityLevel: 'L2_decomposed',
							decision: {
								create: {
									id: 'dec-k16-01',
									retainedOptionId: 'opt-ha',
									rejected: JSON.stringify([{ optionId: 'opt-single', reason: 'SPOF inacceptable' }]),
									rationale: 'Déploiement bi-site actif/actif avec réplication synchrone.',
									reversibility: 'costly',
									arbiterId: testAuthorEmail, // Rédigée par Alice Author
									arbiterRole: 'lead_architect'
								}
							}
						}
					]
				}
			}
		});

		// Tentative d'affirmation par l'auteur lui-même (Alice)
		const mockEventAuthor = {
			params: { projectId: testProjectId, subjectId: testSubjectId },
			locals: {
				session: {
					user: {
						id: testAuthorUserId,
						name: 'Alice Author',
						email: testAuthorEmail,
						role: 'lead_architect'
					},
					expires: '2026-12-31T00:00:00Z'
				}
			},
			request: new Request(
				`http://localhost/api/projects/${testProjectId}/subjects/${testSubjectId}/decision/assert`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						facts: [{ key: 'resilience_mode', value: 'actif/actif', selected: true }]
					})
				}
			),
			url: new URL(
				`http://localhost/api/projects/${testProjectId}/subjects/${testSubjectId}/decision/assert`
			)
		} as unknown as RequestEvent;

		const authorResponse = await assertDecisionEndpoint(mockEventAuthor as any);
		expect(authorResponse.status).toBe(409);
		const jsonAuthor = await authorResponse.json();
		expect(jsonAuthor.error).toBe('self_validation');
		expect(jsonAuthor.message).toContain('Auto-validation interdite (K16)');
	});

	it('3. Affirmation réussie par un décideur distinct : filtre les faits décochés et crée le jalon L3', async () => {
		const originalBaseUrl = process.env.LLMOPS_BASE_URL;
		process.env.LLMOPS_BASE_URL = baseUrl;
		const { llmopsClient } = await import('../../src/lib/server/llmops/client');
		llmopsClient.setBaseUrl(baseUrl);

		try {
			// Appel par Bob Decider (distinct de l'auteur)
			const mockEventDecider = {
				params: { projectId: testProjectId, subjectId: testSubjectId },
				locals: {
					session: {
						user: {
							id: testDeciderUserId,
							name: 'Bob Decider',
							email: testDeciderEmail,
							role: 'domain_expert'
						},
						expires: '2026-12-31T00:00:00Z'
					}
				},
				request: new Request(
					`http://localhost/api/projects/${testProjectId}/subjects/${testSubjectId}/decision/assert`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							facts: [
								{ key: 'resilience_mode', value: 'actif/actif', selected: true }, // FAIT COCHÉ
								{ key: 'site_count', value: '2', selected: false }, // FAIT DÉCOCHÉ -> ne doit PAS être affirmé
								{ key: 'unknown_key_fake', value: 'bad', selected: true } // FAIT HORS VOCABULAIRE -> écarté
							],
							idempotencyKey: 'test-idemp-key-1'
						})
					}
				),
				url: new URL(
					`http://localhost/api/projects/${testProjectId}/subjects/${testSubjectId}/decision/assert`
				)
			} as unknown as RequestEvent;

			const deciderResponse = await assertDecisionEndpoint(mockEventDecider as any);
			expect(deciderResponse.status).toBe(200);
			const deciderJson = await deciderResponse.json();

			expect(deciderJson.status).toBe('ok');
			expect(deciderJson.validatedBy).toBe(testDeciderEmail);
			expect(deciderJson.affirmedFactsCount).toBe(1); // Seul le fait coché et dans le vocabulaire a été retenu !
			expect(deciderJson.milestone).toBe(formatDecisionAffirmedMilestone('Bob Decider', 'L3'));

			// Vérification en base locale : le sujet est passé à L3_decided
			const updatedSubject = await prisma.subject.findUnique({ where: { id: testSubjectId } });
			expect(updatedSubject?.maturityLevel).toBe('L3_decided');

			// Vérification des énoncés créés à partir du fait affirmé
			const createdStatement = await prisma.statement.findUnique({
				where: { id: 'stmt-fact-dec-k16-01-resilience_mode' }
			});
			expect(createdStatement).toBeDefined();
			expect(createdStatement?.value).toBe('actif/actif');
			expect(createdStatement?.confidence).toBe('designed');
			expect(createdStatement?.productionMode).toBe('llm-proposed-human-approved');

			// Le fait décoché n'a pas été créé
			const unselectedStatement = await prisma.statement.findUnique({
				where: { id: 'stmt-fact-dec-k16-01-site_count' }
			});
			expect(unselectedStatement).toBeNull();

			// 4. Test d'idempotence : rejouer l'affirmation ne duplique rien
			const secondCall = await assertDecisionEndpoint(mockEventDecider as any);
			expect(secondCall.status).toBe(200);
			const secondJson = await secondCall.json();
			expect(secondJson.alreadyAsserted).toBe(true);
		} finally {
			if (originalBaseUrl) {
				process.env.LLMOPS_BASE_URL = originalBaseUrl;
				llmopsClient.setBaseUrl(originalBaseUrl);
			}
		}
	});
});
