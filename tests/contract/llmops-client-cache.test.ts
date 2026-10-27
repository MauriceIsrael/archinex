import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMOpsClient } from '$lib/server/llmops/client';

describe('LLMOpsClient Caching & Singleflight Engine', () => {
	let client: LLMOpsClient;

	beforeEach(() => {
		// Crée un client avec un TTL de 1 000 ms pour tester explicitement le cache
		client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000', cacheTtlMs: 1000 });
	});

	it('met en cache le résultat d’une lecture pendant la durée du TTL', async () => {
		let callCount = 0;
		const fetcher = async () => {
			callCount++;
			return { status: 'ok', data: [{ id: 'FW-1', name: 'NIS2' }] };
		};

		const res1 = await client.cachedFetch('test-key', fetcher);
		const res2 = await client.cachedFetch('test-key', fetcher);

		expect(res1).toEqual(res2);
		expect(callCount).toBe(1); // Second appel servi depuis le cache mémoire
	});

	it('déduplique les requêtes concurrentes via le mécanisme singleflight', async () => {
		let callCount = 0;
		const slowFetcher = async () => {
			callCount++;
			await new Promise((resolve) => setTimeout(resolve, 50));
			return { status: 'ok', count: 42 };
		};

		// Lancement simultané de 5 appels identiques
		const [r1, r2, r3, r4, r5] = await Promise.all([
			client.cachedFetch('singleflight-key', slowFetcher),
			client.cachedFetch('singleflight-key', slowFetcher),
			client.cachedFetch('singleflight-key', slowFetcher),
			client.cachedFetch('singleflight-key', slowFetcher),
			client.cachedFetch('singleflight-key', slowFetcher)
		]);

		expect(callCount).toBe(1);
		expect(r1).toEqual({ status: 'ok', count: 42 });
		expect(r2).toEqual(r1);
		expect(r3).toEqual(r1);
		expect(r4).toEqual(r1);
		expect(r5).toEqual(r1);
	});

	it('invalide immédiatement le cache sur appel explicite à invalidateCache()', async () => {
		let callCount = 0;
		const fetcher = async () => {
			callCount++;
			return { value: callCount };
		};

		const r1 = await client.cachedFetch('cache-inv-key', fetcher);
		expect(r1).toEqual({ value: 1 });

		client.invalidateCache('cache-inv');

		const r2 = await client.cachedFetch('cache-inv-key', fetcher);
		expect(r2).toEqual({ value: 2 });
		expect(callCount).toBe(2);
	});

	it('réduit automatiquement le TTL à 2s en cas de réponse error/unavailable pour permettre un rétablissement rapide', async () => {
		const fetcher = async () => ({ status: 'unavailable', error: 'Service down' });
		const res = await client.cachedFetch('err-key', fetcher, 60_000);
		expect(res.status).toBe('unavailable');
	});

	it('invalide tout le cache lors d’un changement de baseUrl', async () => {
		let callCount = 0;
		const fetcher = async () => {
			callCount++;
			return { count: callCount };
		};

		await client.cachedFetch('url-key', fetcher);
		client.setBaseUrl('http://127.0.0.1:9000');

		await client.cachedFetch('url-key', fetcher);
		expect(callCount).toBe(2);
	});
});
