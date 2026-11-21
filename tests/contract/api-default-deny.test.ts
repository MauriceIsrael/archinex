import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
	handle,
	requiresSession,
	isPublicApiPath,
	PUBLIC_API_PREFIXES,
	PUBLIC_API_EXACT_PATHS
} from '../../src/hooks.server';
import { load as rootLayoutLoad } from '../../src/routes/+layout.server';
import { load as homePageLoad } from '../../src/routes/+page.server';
import { GET as getEngagements, POST as postEngagements } from '../../src/routes/api/engagements/+server';
import { GET as getEngagementById, PATCH as patchEngagementById, DELETE as deleteEngagementById } from '../../src/routes/api/engagements/[id]/+server';
import { GET as getCorpus, POST as postCorpus } from '../../src/routes/api/corpus/+server';
import { GET as getLlmops, POST as postLlmops } from '../../src/routes/api/llmops/+server';
import { GET as getProjectEvents } from '../../src/routes/api/projects/[projectId]/events/+server';

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

function routeFileToConcretePath(filePath: string): string {
	const rel = relative('src/routes', filePath).replace(/\\/g, '/');
	const routeDir = rel.replace(/\/\+server\.ts$/, '');
	const concrete = routeDir.replace(/\[([^\]]+)\]/g, 'test-$1');
	return `/${concrete}`;
}

function makeAnonymousHookEvent(pathname: string, method = 'GET') {
	const url = new URL(`http://localhost${pathname}`);
	return {
		request: new Request(url.toString(), { method }),
		url,
		cookies: {
			get: () => undefined,
			set: () => {},
			delete: () => {},
			getAll: () => [],
			serialize: () => ''
		},
		locals: {} as App.Locals
	} as any;
}

describe('Sécurité API : refus par défaut sur /api/** et isolation anonyme (#391)', () => {
	const apiServerFiles = walk('src/routes/api')
		.filter((p) => p.endsWith('+server.ts'))
		.sort();

	it('énumère tous les +server.ts sous src/routes/api et impose 401 sans session sauf liste blanche explicite', async () => {
		expect(apiServerFiles.length).toBeGreaterThan(50);

		const unexpectedPublicRoutes: string[] = [];
		const failedDefaultDeny: string[] = [];

		// Liste blanche attendue strictement maîtrisée : toute extension doit être justifiée ici et dans hooks.server.ts
		const expectedPublicPaths = new Set([
			'/api/auth/login',
			'/api/auth/logout',
			'/api/auth/refresh',
			'/api/invite/accept',
			'/api/invite/activate'
		]);

		for (const file of apiServerFiles) {
			const pathname = routeFileToConcretePath(file);
			const content = readFileSync(file, 'utf-8');
			const exportedMethods = [...content.matchAll(/export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map(
				(m) => m[1]
			);
			const method = exportedMethods[0] ?? 'GET';

			if (isPublicApiPath(pathname)) {
				if (!expectedPublicPaths.has(pathname)) {
					unexpectedPublicRoutes.push(pathname);
				}
				expect(requiresSession(pathname), pathname).toBe(false);
				continue;
			}

			expect(requiresSession(pathname), pathname).toBe(true);

			let resolvedCalled = false;
			const res = await handle({
				event: makeAnonymousHookEvent(pathname, method),
				resolve: async () => {
					resolvedCalled = true;
					return new Response('should-not-resolve', { status: 200 });
				}
			});

			if (res.status !== 401 || resolvedCalled) {
				failedDefaultDeny.push(`${method} ${pathname} -> status=${res.status} resolved=${resolvedCalled}`);
			}
		}

		expect(unexpectedPublicRoutes).toEqual([]);
		expect(failedDefaultDeny).toEqual([]);
	});

	it('la liste blanche publique reste minimale et n’expose ni /api/invite racine ni les webhooks non signés', () => {
		expect(PUBLIC_API_PREFIXES).toEqual(['/api/auth/']);
		expect(PUBLIC_API_EXACT_PATHS).toEqual(['/api/invite/accept', '/api/invite/activate']);

		expect(requiresSession('/api/auth/login')).toBe(false);
		expect(requiresSession('/api/auth/logout')).toBe(false);
		expect(requiresSession('/api/auth/refresh')).toBe(false);
		expect(requiresSession('/api/invite/accept')).toBe(false);
		expect(requiresSession('/api/invite/activate')).toBe(false);

		// Endpoints explicitement listés dans #391 : tous refusés par défaut
		for (const protectedPath of [
			'/api/engagements',
			'/api/engagements/demo',
			'/api/corpus',
			'/api/llmops',
			'/api/projects/demo/events',
			'/api/webhooks/nautobot',
			'/api/invite',
			'/api/frugality-opportunities',
			'/api/knowledge/health',
			'/api/frameworks/ingestions'
		]) {
			expect(requiresSession(protectedPath), protectedPath).toBe(true);
		}
	});

	it('les handlers engagements, corpus, llmops et events refusent les appels directs sans session (401)', async () => {
		const anonEvent = (urlStr: string, method = 'GET', body?: unknown, params: Record<string, string> = {}) =>
			({
				request: new Request(urlStr, {
					method,
					headers: body ? { 'Content-Type': 'application/json' } : undefined,
					body: body ? JSON.stringify(body) : undefined
				}),
				url: new URL(urlStr),
				params,
				locals: { session: null }
			}) as any;

		expect((await getEngagements(anonEvent('http://localhost/api/engagements?full=true'))).status).toBe(401);
		expect((await postEngagements(anonEvent('http://localhost/api/engagements', 'POST', { engagement: { id: 'x' } }))).status).toBe(401);
		expect((await getEngagementById(anonEvent('http://localhost/api/engagements/x', 'GET', undefined, { id: 'x' }))).status).toBe(401);
		expect((await patchEngagementById(anonEvent('http://localhost/api/engagements/x', 'PATCH', {}, { id: 'x' }))).status).toBe(401);
		expect((await deleteEngagementById(anonEvent('http://localhost/api/engagements/x', 'DELETE', undefined, { id: 'x' }))).status).toBe(401);
		expect((await getCorpus(anonEvent('http://localhost/api/corpus'))).status).toBe(401);
		expect((await postCorpus(anonEvent('http://localhost/api/corpus', 'POST', { document: { id: 'd1', title: 'T' } }))).status).toBe(401);
		expect((await getLlmops(anonEvent('http://localhost/api/llmops?action=health'))).status).toBe(401);
		expect((await postLlmops(anonEvent('http://localhost/api/llmops?action=shred', 'POST', { rfpText: 'x' }))).status).toBe(401);
		expect((await getProjectEvents(anonEvent('http://localhost/api/projects/p1/events', 'GET', undefined, { projectId: 'p1' }))).status).toBe(401);

		// /api/llmops refuse aussi un rôle invalide (403)
		const badRoleEvent = {
			request: new Request('http://localhost/api/llmops?action=health'),
			url: new URL('http://localhost/api/llmops?action=health'),
			params: {},
			locals: {
				session: {
					user: { id: 'u1', email: 'guest@example.com', name: 'Guest', role: 'guest' as any },
					expires: new Date(Date.now() + 60000).toISOString()
				}
			}
		} as any;
		expect((await getLlmops(badRoleEvent)).status).toBe(403);
	});

	it('100 % des handlers (GET, POST, PATCH, PUT, DELETE) sous /api/projects/[projectId] vérifient authorizeProjectAccess', () => {
		const projectRoutes = walk('src/routes/api/projects/[projectId]').filter((p) => p.endsWith('+server.ts'));
		expect(projectRoutes.length).toBeGreaterThan(50);

		const offenders: string[] = [];
		for (const file of projectRoutes) {
			const content = readFileSync(file, 'utf-8');
			const methods = [...content.matchAll(/export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map(
				(m) => m[1]
			);
			const authCalls = [...content.matchAll(/authorizeProjectAccess\(/g)].length;
			if (authCalls < methods.length || !content.includes('auth.error')) {
				offenders.push(`${file.replace(/\\/g, '/')} (methods=${methods.join(',')}, authCalls=${authCalls})`);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('+layout.server.ts et +page.server.ts ne renvoient aucune donnée de projet ou d’engagement à un anonyme', async () => {
		const anonEvent = {
			locals: { session: null },
			url: new URL('http://localhost/')
		} as any;

		const layoutData = (await rootLayoutLoad(anonEvent)) as any;
		expect(layoutData).toEqual({ session: null });

		const homeData = (await homePageLoad(anonEvent)) as any;
		expect(homeData.engagements).toEqual([]);
		expect(homeData.corpusDocuments).toEqual([]);
		expect(homeData.kbClausesHealth).toBeNull();
		expect(homeData.frugalityOpportunities).toEqual([]);

		// Vérifier également que le layout conditionne la pilule d'engagement actif à `session`
		const layoutSvelte = readFileSync('src/routes/+layout.svelte', 'utf-8');
		expect(layoutSvelte).toContain('{#if session && deliberationStore.activeEngagement?.id}');
	});
});
