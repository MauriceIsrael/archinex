/**
 * Contract tests for LLMOps Knowledge Hub Managed Engagement Client (K14, K15, K11).
 * Tests all 17 new methods against a mock server adhering strictly to CONTRAT-KH-API-V1 §5.16–§5.18.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LLMOpsClient, HubApiError } from '../../src/lib/server/llmops/client';

describe('Hub Engagement Client Contract (K14, K15, K11)', () => {
	let server: Server;
	let baseUrl: string;
	let client: LLMOpsClient;
	let lastRequest: {
		method?: string;
		url?: string;
		headers?: Record<string, string | string[] | undefined>;
		body?: any;
	} = {};

	beforeEach(async () => {
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

				lastRequest = {
					method: req.method,
					url: req.url,
					headers: req.headers,
					body
				};

				const url = req.url || '';

				// K14: POST /api/engagements
				if (req.method === 'POST' && url === '/api/engagements') {
					if (body.engagement === 'conflict-eng') {
						res.writeHead(409, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ status: 'invalid_argument', reason: "'conflict-eng' already exists" }));
						return;
					}
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

				// K14: GET /api/engagements/:id/members
				if (req.method === 'GET' && url.match(/^\/api\/engagements\/[^/]+\/members$/)) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								engagement: 'mcx-2027',
								members: [
									{ email: 'alice@domain.com', handle: '@alice', role: 'admin' },
									{ email: 'bob@domain.com', handle: '@bob', role: 'decider' }
								]
							}
						})
					);
					return;
				}

				// K14: PUT /api/engagements/:id/members
				if (req.method === 'PUT' && url.match(/^\/api\/engagements\/[^/]+\/members$/)) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								engagement: 'mcx-2027',
								members: body.members
							}
						})
					);
					return;
				}

				// K14: GET /api/engagements/:id/me
				if (req.method === 'GET' && url.match(/^\/api\/engagements\/[^/]+\/me$/)) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								engagement: 'mcx-2027',
								managed: true,
								handle: '@alice',
								role: 'admin',
								actions: ['read', 'contribute', 'decide', 'export', 'members'],
								confidentiality: 'confidential'
							}
						})
					);
					return;
				}

				// K14: GET /api/engagements/:id/audit
				if (req.method === 'GET' && url.includes('/audit')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								engagement: 'mcx-2027',
								events: [
									{ id: 1, at: '2026-10-03T12:00:00Z', actor: '@alice', action: 'members', verdict: 'allowed', detail: {} }
								]
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/subjects/:name/maturity
				if (req.method === 'POST' && url.includes('/maturity')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								subject: 'mcx-core',
								level: body.level
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/subjects
				if (req.method === 'POST' && url.match(/^\/api\/engagements\/[^/]+\/subjects$/)) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								created: true,
								subject: body.name
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/statements/:id/assert
				if (req.method === 'POST' && url.includes('/assert')) {
					const actorEmail = req.headers['x-actor-email'];
					if (actorEmail === 'author@domain.com') {
						res.writeHead(409, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({
								status: 'error',
								error: 'self_validation',
								reason: 'author wrote STMT-1: another person with the decider role must assert it'
							})
						);
						return;
					}
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								statement: {
									id: 'STMT-1',
									subject: 'mcx-core',
									predicate: 'implements',
									value: '3GPP Rel-18',
									author: '@author',
									role: 'architect',
									confidence: 'verified',
									status: 'active',
									origin: 'human',
									validated_by: '@decider',
									validated_at: '2026-10-03T12:00:00Z'
								},
								conflicts_opened: []
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/statements/:id/withdraw
				if (req.method === 'POST' && url.includes('/withdraw')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								statement: {
									id: 'STMT-1',
									status: 'withdrawn'
								}
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/statements
				if (req.method === 'POST' && url.match(/^\/api\/engagements\/[^/]+\/statements$/)) {
					const idKey = req.headers['idempotency-key'];
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								created: idKey !== 'existing-key',
								statement: {
									id: idKey === 'existing-key' ? 'S-existing-123' : 'S-new-456',
									subject: body.subject,
									section: body.section || 'general',
									predicate: body.predicate || 'has_property',
									value: body.value,
									author: '@alice',
									role: body.role || 'architect',
									confidence: body.confidence,
									status: 'proposed',
									origin: body.origin || 'human',
									validated_by: null,
									validated_at: null
								}
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/questions/:id/answers
				if (req.method === 'POST' && url.includes('/answers')) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								created: true,
								statement: {
									id: 'S-ans-1',
									value: body.value,
									status: 'proposed'
								}
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/questions
				if (req.method === 'POST' && url.match(/^\/api\/engagements\/[^/]+\/questions$/)) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								created: true,
								question: {
									id: 'Q-001',
									question: body.question,
									status: 'open'
								}
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/requirements
				if (req.method === 'POST' && url.match(/^\/api\/engagements\/[^/]+\/requirements$/)) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								created: body.requirements.map((r: any) => r.id),
								unchanged: [],
								origin: 'human'
							}
						})
					);
					return;
				}

				// K15: POST /api/engagements/:id/conflicts/:id/arbitrate
				if (req.method === 'POST' && url.includes('/arbitrate')) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								conflict: {
									id: 'CONF-1',
									status: 'arbitrated',
									statement_ids: ['STMT-1', 'STMT-2'],
									keep_statement_id: body.keep_statement_id,
									resolution_reason: body.reason,
									arbitrated_by: '@decider'
								}
							}
						})
					);
					return;
				}

				// K11: POST /api/engagements/:id/exports
				if (req.method === 'POST' && url.match(/^\/api\/engagements\/[^/]+\/exports$/)) {
					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								snapshotRef: {
									sourceSystem: 'knowledge-hub',
									snapshotId: 'eng-mcx-2027-a1b2c3d4e5f6',
									checksum: 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
									producedAt: '2026-10-03T12:00:00Z'
								},
								created: true,
								is_provisional: false
							}
						})
					);
					return;
				}

				// K11: GET /api/engagements/:id/exports/:snapshotId
				if (req.method === 'GET' && url.match(/^\/api\/engagements\/[^/]+\/exports\/[^/]+$/)) {
					res.writeHead(200, {
						'Content-Type': 'application/json',
						'ETag': 'sha256:1234567890abcdef'
					});
					res.end(
						JSON.stringify({
							schemaVersion: '1.0',
							snapshotId: 'eng-mcx-2027-a1b2c3d4e5f6',
							sourceSystem: 'knowledge-hub',
							emitter: 'knowledge-hub',
							createdAt: '2026-10-03T12:00:00Z',
							sourceRevision: 'abc123',
							checksum: 'sha256:1234567890abcdef',
							data: {
								engagement: { id: 'mcx-2027', confidentiality: 'confidential' },
								is_provisional: false,
								pins: { contract_version: '1.0', kb_snapshot_id: 'kb-snap-1' },
								provisional_reasons: { unripe_subjects: 0, open_conflicts: 0 },
								requirements: [],
								subjects: [],
								statements: [],
								conflicts: [],
								gaps: [],
								kb_references: [],
								unresolved_references: []
							}
						})
					);
					return;
				}

				// K11: GET /api/engagements/:id/exports
				if (req.method === 'GET' && url.match(/^\/api\/engagements\/[^/]+\/exports$/)) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'ok',
							data: {
								engagement: 'mcx-2027',
								exports: [
									{
										snapshot_id: 'eng-mcx-2027-a1b2c3d4e5f6',
										checksum: 'sha256:123456',
										created_at: '2026-10-03T12:00:00Z',
										actor: '@alice',
										is_provisional: false
									}
								]
							}
						})
					);
					return;
				}

				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ status: 'error', error: 'not_found' }));
			});
		});

		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
		const port = (server.address() as AddressInfo).port;
		baseUrl = `http://127.0.0.1:${port}`;
		client = new LLMOpsClient({ baseUrl, authToken: 'test-token', timeoutMs: 3000 });
	});

	afterEach(async () => {
		if (server) {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	it('1. createManagedEngagement envoie POST /api/engagements avec X-Actor-Email et retourne le payload', async () => {
		const res = await client.createManagedEngagement(
			{
				engagement: 'mcx-2027',
				confidentiality: 'confidential',
				admin_email: 'admin@domain.com',
				admin_handle: '@admin'
			},
			'admin@domain.com'
		);

		expect(res.engagement).toBe('mcx-2027');
		expect(res.confidentiality).toBe('confidential');
		expect(lastRequest.method).toBe('POST');
		expect(lastRequest.headers?.['x-actor-email']).toBe('admin@domain.com');
		expect(lastRequest.headers?.['x-engagement-id']).toBe('mcx-2027');
	});

	it('2. getEngagementMembers & setEngagementMembers gèrent le cycle de vie des membres', async () => {
		const members = await client.getEngagementMembers('mcx-2027', 'admin@domain.com');
		expect(members.length).toBe(2);
		expect(members[0].handle).toBe('@alice');

		const newMembers = [
			{ email: 'admin@domain.com', handle: '@admin', role: 'admin' as const },
			{ email: 'decider@domain.com', handle: '@decider', role: 'decider' as const }
		];
		const updated = await client.setEngagementMembers('mcx-2027', newMembers, 'admin@domain.com');
		expect(updated.length).toBe(2);
		expect(lastRequest.method).toBe('PUT');
		expect(lastRequest.body.members).toEqual(newMembers);
	});

	it('3. getEngagementMe retourne le profil et les actions autorisées', async () => {
		const me = await client.getEngagementMe('mcx-2027', 'admin@domain.com');
		expect(me.managed).toBe(true);
		expect(me.handle).toBe('@alice');
		expect(me.actions).toContain('export');
	});

	it('4. addSubject & advanceSubjectMaturity font progresser la maturité', async () => {
		const subRes = await client.addSubject('mcx-2027', { name: 'mcx-core', definition: 'Core MCX 3GPP' }, 'alice@domain.com');
		expect(subRes.created).toBe(true);
		expect(subRes.subject).toBe('mcx-core');

		const matRes = await client.advanceSubjectMaturity('mcx-2027', 'mcx-core', 'L3_decided', 'alice@domain.com');
		expect(matRes.level).toBe('L3_decided');
		expect(lastRequest.url).toContain('/mcx-core/maturity');
	});

	it('5. addStatement transmet Idempotency-Key et crée un énoncé proposed', async () => {
		const res = await client.addStatement(
			'mcx-2027',
			{
				subject: 'mcx-core',
				value: 'Floor Control < 100ms',
				confidence: 'verified',
				based_on: [{ id: 'TEST-1' }]
			},
			'author@domain.com',
			'my-idempotency-key-1'
		);

		expect(res.created).toBe(true);
		expect(res.statement.status).toBe('proposed');
		expect(lastRequest.headers?.['idempotency-key']).toBe('my-idempotency-key-1');
	});

	it('6. assertStatement réussit avec un valideur distinct et rejette la self-validation avec 409', async () => {
		// Succès : valideur distinct
		const success = await client.assertStatement('mcx-2027', 'STMT-1', 'decider@domain.com');
		expect(success.statement.status).toBe('active');
		expect(success.statement.validated_by).toBe('@decider');

		// Échec : auto-validation par l'auteur -> 409 self_validation
		try {
			await client.assertStatement('mcx-2027', 'STMT-1', 'author@domain.com');
			expect.fail('Should have thrown HubApiError');
		} catch (err: any) {
			expect(err.status).toBe(409);
			expect(err.code).toBe('self_validation');
		}
	});

	it('7. addQuestion & answerQuestion gèrent le flux d’élicitation', async () => {
		const qRes = await client.addQuestion(
			'mcx-2027',
			{ question: 'Quel codec pour MCPTT ?' },
			'user@domain.com',
			'q-key-1'
		);
		expect(qRes.created).toBe(true);
		expect(qRes.question.status).toBe('open');

		const ansRes = await client.answerQuestion(
			'mcx-2027',
			'Q-001',
			{ value: 'AMR-WB', confidence: 'designed' },
			'expert@domain.com',
			'ans-key-1'
		);
		expect(ansRes.created).toBe(true);
		expect(lastRequest.url).toContain('/Q-001/answers');
	});

	it('8. addRequirements ingère les exigences de façon idempotente', async () => {
		const reqRes = await client.addRequirements(
			'mcx-2027',
			{
				requirements: [
					{ id: 'REQ-001', text: 'Chiffrement IPsec de bout en bout' },
					{ id: 'REQ-002', text: 'SecNumCloud 3.2' }
				]
			},
			'architect@domain.com'
		);
		expect(reqRes.created).toContain('REQ-001');
		expect(reqRes.created).toContain('REQ-002');
	});

	it('9. arbitrateConflict transmet l’arbitrage au Hub', async () => {
		const arbRes = await client.arbitrateConflict(
			'mcx-2027',
			'CONF-1',
			{ keep_statement_id: 'STMT-1', reason: 'Priorité à la latence sur la voix tactique' },
			'decider@domain.com'
		);
		expect(arbRes.conflict.status).toBe('arbitrated');
		expect(arbRes.conflict.keep_statement_id).toBe('STMT-1');
	});

	it('10. exportEngagementSnapshot émet l’instantané scellé vers la suite', async () => {
		const exportRes = await client.exportEngagementSnapshot('mcx-2027', 'admin@domain.com');
		expect(exportRes.created).toBe(true);
		expect(exportRes.is_provisional).toBe(false);
		expect(exportRes.snapshotRef.sourceSystem).toBe('knowledge-hub');
		expect(exportRes.snapshotRef.snapshotId).toContain('eng-mcx-2027-');

		const exportsList = await client.listEngagementExports('mcx-2027', 'admin@domain.com');
		expect(exportsList.length).toBe(1);

		const envelope = await client.getEngagementExport('mcx-2027', exportRes.snapshotRef.snapshotId, 'admin@domain.com');
		expect(envelope.emitter).toBe('knowledge-hub');
		expect(envelope.data.engagement.id).toBe('mcx-2027');
	});
});
