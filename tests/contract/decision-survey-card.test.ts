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
	let hubDecision: any = null;
	let refuseEverything = false;
	let forceDecisionConflict = false;

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
		refuseEverything = false;
		forceDecisionConflict = false;

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
				const json = (status: number, payload: unknown) => {
					res.writeHead(status, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(payload));
				};
				const actor = ((req.headers['x-actor-email'] as string) || '').toLowerCase();

				// Vocabulaire des faits : celui du Hub (pas celui d'Archinex)
				if (req.method === 'GET' && url.startsWith('/snapshot/latest')) {
					return json(200, {
						snapshot_id: 'snap-stub',
						fact_vocabulary: {
							version: 1,
							keys: [
								{ key: 'topology.dc_count', type: 'int', min: 1 },
								{ key: 'topology.mode', type: 'enum', values: ['single-site', 'active-passive', 'active-active'] }
							]
						}
					});
				}

				if (req.method === 'POST' && /\/subjects$/.test(url)) return json(201, { status: 'ok', data: { created: true, subject: body.name } });

				// Proposition d'une décision : le Hub applique SON contrat (K16/K18), pas celui qu'on lui suppose
				if (req.method === 'POST' && /\/decisions$/.test(url)) {
					if (forceDecisionConflict) return json(409, { status: 'error', error: 'decision_exists', reason: "'Cluster B' has an asserted decision (D-0001): name it in 'supersedes' to replace it" });
					const bad = (argument: string, reason: string) => json(400, { status: 'invalid_argument', argument, reason });
					if (typeof body.decision !== 'string' || !body.decision.trim()) return bad('decision', "'decision' is required");
					if (typeof body.rationale !== 'string' || !body.rationale.trim()) return bad('rationale', "'rationale' is required");
					if (!['reversible', 'costly', 'irreversible'].includes(body.reversibility)) return bad('reversibility', 'invalid');
					if (body.rejected !== undefined && !(Array.isArray(body.rejected) && body.rejected.every((r: any) => typeof r.option === 'string' && typeof r.reason === 'string'))) return bad('rejected', 'invalid');
					for (const f of body.facts || []) {
						if (f.key === 'topology.dc_count' && typeof f.value !== 'number') return json(400, { status: 'invalid_argument', code: 'FACT_TYPE', argument: 'facts', reason: 'expected a whole number' });
						if (!['topology.dc_count', 'topology.mode'].includes(f.key)) return json(400, { status: 'invalid_argument', code: 'UNKNOWN_FACT_KEY', argument: 'facts', reason: f.key });
						if (!f.source_excerpt) return bad('facts', 'source_excerpt is required');
					}
					if (actor !== testAuthorEmail.toLowerCase()) return json(403, { status: 'error', error: 'forbidden', reason: 'not_a_member' });
					hubDecision = { id: 'D-stub01', subject: body.subject, decision: body.decision, status: 'proposed', author: actor, facts: body.facts || [] };
					return json(201, { status: 'ok', data: { decision: hubDecision, created: true } });
				}

				// Affirmation : par l'identifiant du HUB, par une autre personne que l'auteur
				if (req.method === 'POST' && /\/decisions\/[^/]+\/assert$/.test(url)) {
					const id = decodeURIComponent(url.split('/decisions/')[1].split('/')[0]);
					if (!hubDecision || id !== hubDecision.id) return json(404, { status: 'not_found', error: 'unknown_decision', reason: `decision '${id}' not found` });
					if (actor === hubDecision.author) return json(409, { status: 'error', error: 'self_validation', reason: "Auto-validation interdite (K16) : L'auteur ne peut valider sa propre décision." });
					hubDecision = { ...hubDecision, status: 'active', validated_by: actor };
					return json(200, { status: 'ok', data: { decision: hubDecision } });
				}

				if (req.method === 'POST' && /\/maturity$/.test(url)) return json(200, { status: 'ok', data: { subject: 'x', level: body.level } });

				if (refuseEverything) return json(503, { status: 'error', error: 'unavailable', reason: 'Hub indisponible' });
				return json(200, { status: 'ok', data: {} });
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
			// En test, le modèle ne répond pas : les faits viennent du repli par mots-clés,
			// jamais cochés d'office et signalés comme tels (à vérifier par l'humain).
			expect(f.selected).toBe(false);
			expect(f.fallback).toBe(true);
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
							options: {
								create: [
									{ id: 'opt-ha', title: 'Bi-site actif/actif', summary: 'Réplication synchrone', origin: 'human', author: 'x', productionMode: 'human-authored' },
									{ id: 'opt-single', title: 'Site unique', summary: 'Un seul site', origin: 'human', author: 'x', productionMode: 'human-authored' }
								]
							},
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
								{ key: 'topology.dc_count', value: '2', source_excerpt: 'bi-site', selected: true }, // FAIT COCHÉ (vocabulaire du Hub)
								{ key: 'topology.mode', value: 'active-active', selected: false }, // FAIT DÉCOCHÉ -> ne doit PAS être affirmé
								{ key: 'unknown_key_fake', value: 'bad', selected: true } // FAIT HORS VOCABULAIRE DU HUB -> écarté
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

			// Ce que le Hub a reçu : son contrat, au nom de l'auteur, puis l'affirmation par Bob avec l'identifiant du Hub
			const proposal = recordedCalls.find((c) => c.method === 'POST' && /\/decisions$/.test(c.url))!;
			expect(proposal.body).toMatchObject({
				subject: 'Cluster Haute Disponibilité',
				decision: 'Bi-site actif/actif', // le TEXTE de l'option, pas « opt-ha »
				rejected: [{ option: 'Site unique', reason: 'SPOF inacceptable' }],
				reversibility: 'costly',
				facts: [{ key: 'topology.dc_count', value: 2, source_excerpt: 'bi-site' }] // typée : le Hub refuse « "2" »
			});
			expect(proposal.body).not.toHaveProperty('retained_option');
			expect(String(proposal.headers['x-actor-email']).toLowerCase()).toBe(testAuthorEmail.toLowerCase());
			const assertion = recordedCalls.find((c) => /\/decisions\/D-stub01\/assert$/.test(c.url))!;
			expect(String(assertion.headers['x-actor-email']).toLowerCase()).toBe(testDeciderEmail.toLowerCase());
			expect(recordedCalls.some((c) => /\/subjects\/[^/]+\/maturity$/.test(c.url))).toBe(true);

			// Vérification en base locale : le sujet est passé à L3_decided
			const updatedSubject = await prisma.subject.findUnique({ where: { id: testSubjectId } });
			expect(updatedSubject?.maturityLevel).toBe('L3_decided');

			// Vérification des énoncés créés à partir du fait affirmé
			const createdStatement = await prisma.statement.findUnique({
				where: { id: 'stmt-fact-dec-k16-01-topology.dc_count' }
			});
			expect(createdStatement).toBeDefined();
			expect(createdStatement?.value).toBe('2');
			expect(createdStatement?.confidence).toBe('designed');
			expect(createdStatement?.productionMode).toBe('llm-proposed-human-approved');

			// Le fait décoché n'a pas été créé
			const unselectedStatement = await prisma.statement.findUnique({
				where: { id: 'stmt-fact-dec-k16-01-topology.mode' }
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

	describe('Refus : rien n\'est écrit en local quand le Hub refuse, aucune erreur n\'est avalée (#103)', () => {
		const subjectB = 'sub-dec-b-38';
		const call = async (facts: unknown[]) => {
			const { llmopsClient } = await import('../../src/lib/server/llmops/client');
			llmopsClient.setBaseUrl(baseUrl);
			const ev = {
				params: { projectId: testProjectId, subjectId: subjectB },
				locals: { session: { user: { id: testDeciderUserId, name: 'Bob Decider', email: testDeciderEmail, role: 'domain_expert' }, expires: '2026-12-31T00:00:00Z' } },
				request: new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts }) }),
				url: new URL('http://localhost/x')
			} as unknown as RequestEvent;
			return assertDecisionEndpoint(ev as any);
		};
		const localTraces = async () => ({
			maturity: (await prisma.subject.findUnique({ where: { id: subjectB } }))?.maturityLevel,
			event: await prisma.domainEvent.count({ where: { projectId: testProjectId, entityId: 'dec-k16-b', type: 'DECISION_ASSERTED' } }),
			statements: await prisma.statement.count({ where: { subjectId: subjectB } })
		});

		beforeEach(async () => {
			await prisma.subject.deleteMany({ where: { id: subjectB } });
			await prisma.subject.create({
				data: {
					id: subjectB, projectId: testProjectId, name: 'Cluster B', sectionRef: '§4.3', problemStatement: 'Autre sujet', maturityLevel: 'L2_decomposed',
					options: { create: [{ id: 'opt-b1', title: 'Option B1', summary: 's', origin: 'human', author: 'x', productionMode: 'human-authored' }] },
					decision: { create: { id: 'dec-k16-b', retainedOptionId: 'opt-b1', rejected: '[]', rationale: 'Parce que.', reversibility: 'reversible', arbiterId: testAuthorEmail, arbiterRole: 'lead_architect' } }
				}
			});
		});

		it('le Hub refuse la décision : la route refuse avec le code du Hub, le sujet reste à L2, rien n\'est créé', async () => {
			forceDecisionConflict = true;
			const res = await call([]);
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({ error: 'decision_exists', message: expect.stringContaining('asserted decision') });
			expect(await localTraces()).toEqual({ maturity: 'L2_decomposed', event: 0, statements: 0 });
			// Aucune affirmation n'a été tentée après le refus de la proposition.
			expect(recordedCalls.some((c) => /\/assert$/.test(c.url))).toBe(false);
		});

		it('une valeur de fait qui ne se convertit pas au type du Hub est refusée avec la clé, avant tout envoi', async () => {
			const res = await call([{ key: 'topology.dc_count', value: 'deux', source_excerpt: 'x', selected: true }]);
			expect(res.status).toBe(422);
			expect(await res.json()).toMatchObject({ error: 'FACT_VALUE', key: 'topology.dc_count' });
			expect(recordedCalls.some((c) => c.method === 'POST' && /\/decisions$/.test(c.url))).toBe(false);
			expect(await localTraces()).toEqual({ maturity: 'L2_decomposed', event: 0, statements: 0 });
		});

		it('un Hub injoignable n\'écrit rien en local non plus', async () => {
			const { llmopsClient } = await import('../../src/lib/server/llmops/client');
			llmopsClient.setBaseUrl('http://127.0.0.1:9'); // personne n'écoute
			const ev = {
				params: { projectId: testProjectId, subjectId: subjectB },
				locals: { session: { user: { id: testDeciderUserId, name: 'Bob Decider', email: testDeciderEmail, role: 'domain_expert' }, expires: '2026-12-31T00:00:00Z' } },
				request: new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts: [] }) }),
				url: new URL('http://localhost/x')
			} as unknown as RequestEvent;
			const res = await assertDecisionEndpoint(ev as any);
			expect(res.status).toBeGreaterThanOrEqual(500);
			expect(await localTraces()).toEqual({ maturity: 'L2_decomposed', event: 0, statements: 0 });
		});
	});
});
