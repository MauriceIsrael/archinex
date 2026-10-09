/**
 * Adaptateur client LLMOps : lecture quand le serveur répond, honnêteté quand il est absent.
 *
 * Le contrat réel avec un serveur LLMOps vivant est vérifié par tests/contract/llmops-live*.test.ts
 * (LLMOPS_LIVE_URL). Ici, un serveur HTTP local, explicitement simulé, ne sert qu'à vérifier la
 * lecture des réponses par le client. Quand LLMOps est injoignable, le client ne doit RIEN fabriquer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

const sealedSnapshot = JSON.parse(
	readFileSync(resolve(process.cwd(), 'tests/fixtures/llmops/llmops-sealed-snapshot.json'), 'utf-8').replace(/^﻿/, '')
);

const HEALTH = {
	status: 'ok',
	plane: 'all',
	schema_version: '1.9',
	service: 'llmops-mcp-server',
	engine_version: '0.1.0',
	engine_commit: 'abc1234',
	kb: { snapshot_id: 'snap-1', source_revision: 'rev-1', payload_sha256: 'sha256:abc', created_at: '2026-10-01T00:00:00Z' }
};
const BOARD = [
	{
		subject: 'sujet-distant',
		name: 'Sujet distant',
		level: 'L1_framed',
		origin: 'discovered',
		days_at_level: 2,
		updated_at: '2026-10-01T00:00:00Z',
		is_stalled: false,
		open_question_ref: null,
		assigned_role: 'domain_architect',
		dependent_sections: ['4.1']
	}
];
const STATEMENTS = [
	{
		id: 'S-0001',
		section: '4.1',
		subject: 'sujet-distant',
		predicate: 'has_property',
		value: '99.99',
		unit: '%',
		author: 'alice',
		role: 'domain_architect',
		confidence: 'designed',
		verbatim: 'Disponibilité cible.',
		status: 'active'
	}
];
const CONFLICTS = [{ id: 'C-0001', detail: 'tension entre deux exigences', status: 'open' }];

describe('Adaptateur LLMOps — le serveur répond', () => {
	let server: Server;
	let client: LLMOpsClient;

	beforeAll(async () => {
		server = createServer((req, res) => {
			const path = (req.url || '').split('?')[0];
			const ok = (data: unknown) => {
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(JSON.stringify(data));
			};
			if (path === '/health') return ok(HEALTH);
			if (path === '/snapshot/latest') return ok(sealedSnapshot);
			if (path === '/api/arbitration/board') return ok({ status: 'ok', data: BOARD });
			if (path === '/api/arbitration/statements') return ok({ status: 'ok', data: STATEMENTS });
			if (path === '/api/arbitration/conflicts') return ok({ status: 'ok', data: CONFLICTS });
			res.writeHead(404, { 'content-type': 'application/json' });
			res.end('{}');
		});
		await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
		client = new LLMOpsClient({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, timeoutMs: 5000 });
	});

	afterAll(async () => {
		await new Promise((r) => server.close(() => r(null)));
	});

	it('lit la santé, l\'instantané, le board, les énoncés et les conflits, source « live »', async () => {
		const health = await client.getHealth();
		expect(health.source).toBe('live');
		expect(health.data.status).toBe('ok');
		expect(health.data.kb?.payload_sha256).toMatch(/^sha256:/);

		const snap = await client.getLatestSnapshot();
		expect(snap.source).toBe('live');
		expect(snap.data.payload_sha256).toMatch(/^sha256:/);

		const board = await client.getBoard('mon-projet');
		expect(board.source).toBe('live');
		expect(board.data.map((s) => s.subject)).toEqual(['sujet-distant']);

		const statements = await client.getStatements('mon-projet');
		expect(statements.source).toBe('live');
		expect(statements.data[0]).toMatchObject({ id: 'S-0001', predicate: 'has_property', value: '99.99' });

		const conflicts = await client.getConflicts('mon-projet');
		expect(conflicts.source).toBe('live');
		expect(conflicts.data).toHaveLength(1);
	});

	it('la synchronisation hydrate le store sans toucher aux sujets locaux', async () => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
		const localIds = deliberationStore.subjects.map((s) => s.id);
		expect(localIds.length).toBeGreaterThan(0);

		const payload = await client.syncEngagement('mon-projet');
		expect(payload.source).toBe('live');
		const fetcher = async () => ({ ok: true, status: 200, json: async () => payload }) as Response;
		const result = await deliberationStore.syncWithLLMOps('mon-projet', fetcher as unknown as typeof fetch);

		expect(result.success).toBe(true);
		expect(deliberationStore.llmopsStatus).toBe('connected');
		const ids = deliberationStore.subjects.map((s) => s.id);
		expect(ids).toContain('sujet-distant');
		for (const id of localIds) expect(ids).toContain(id);
	});
});

describe('Adaptateur LLMOps — le serveur est absent : rien n\'est fabriqué', () => {
	const unreachable = () => new LLMOpsClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 300 });

	beforeEach(() => {
		// Même avec ces variables d'ancienne génération, aucune donnée de repli ne doit apparaître.
		process.env.ALLOW_OFFLINE_MOCK = '1';
		process.env.USE_FAKE_LLMOPS = '1';
	});
	afterAll(() => {
		delete process.env.ALLOW_OFFLINE_MOCK;
		delete process.env.USE_FAKE_LLMOPS;
	});

	it('la santé est « unreachable », jamais un faux « ok »', async () => {
		const health = await unreachable().getHealth();
		expect(health.source).toBe('offline-fallback');
		expect(health.data.status).toBe('unreachable');
		expect(health.data.kb).toBeUndefined();
	});

	it('board, énoncés et conflits sont vides, pour tout projet', async () => {
		const c = unreachable();
		for (const engagement of [undefined, 'mon-projet', 'cctp-mcx-nordwave']) {
			expect((await c.getBoard(engagement)).data).toEqual([]);
			expect((await c.getStatements(engagement)).data).toEqual([]);
			expect((await c.getConflicts(engagement)).data).toEqual([]);
		}
	});

	it('pas d\'instantané scellé de remplacement : erreur explicite', async () => {
		await expect(unreachable().getLatestSnapshot()).rejects.toThrow(/injoignable/);
	});

	it('la synchronisation hors ligne est vide et signale l\'indisponibilité', async () => {
		const payload = await unreachable().syncEngagement('mon-projet');
		expect(payload.source).toBe('offline-fallback');
		expect(payload.health.status).toBe('unreachable');
		expect([payload.board, payload.statements, payload.conflicts]).toEqual([[], [], []]);
	});

	it('la doctrine hors ligne est vide et marquée offline : aucune règle inventée', async () => {
		const ctx = await unreachable().getDoctrineContext({ subject: 'synchronisation' });
		expect(ctx.offline).toBe(true);
		expect(ctx.items).toEqual([]);
	});

	it('aucune simulation de succès : dépouillement, suggestion et santé KB échouent clairement', async () => {
		const c = unreachable();
		await expect(c.shredRfp('Le système doit garantir une disponibilité élevée en toutes circonstances.')).rejects.toThrow(/inaccessible/);
		await expect(
			c.submitKnowledgeSuggestion({ title: 't', rationale: 'r', suggestedChange: 'c' })
		).rejects.toThrow();
		const kb = await c.getKbHealth('expert@example.org');
		expect(kb.status).toBe('unavailable');
		expect(kb.data).toBeUndefined();
	});

	it('le store reste « hors ligne » et conserve les données locales du projet', async () => {
		deliberationStore.initFromDb(createTestDefaultEngagements(), []);
		const before = deliberationStore.subjects.map((s) => s.id);
		const payload = await unreachable().syncEngagement('mon-projet');
		const fetcher = async () => ({ ok: true, status: 200, json: async () => payload }) as Response;
		await deliberationStore.syncWithLLMOps('mon-projet', fetcher as unknown as typeof fetch);

		expect(deliberationStore.llmopsStatus).toBe('offline');
		expect(deliberationStore.subjects.map((s) => s.id)).toEqual(before);
	});
});

describe('Aucune donnée de projet dans le client LLMOps', () => {
	it('le client ne lit aucune fixture de tests/ et ne connaît aucun projet', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/lib/server/llmops/client.ts'), 'utf-8');
		expect(src).not.toMatch(/tests\/fixtures/);
		expect(src).not.toMatch(/nordwave|suse-telco|cctp-mcx/i);
		expect(src).not.toMatch(/ALLOW_OFFLINE_MOCK|USE_FAKE_LLMOPS/);
	});
});
