import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';

describe('Pastille de connectivité & Garde Document Engine (Issue #UserRequest)', () => {
	beforeEach(() => {
		deliberationStore.docEngineStatus = 'idle';
		deliberationStore.isCheckingDocEngine = false;
	});

	it('initialise le statut à idle par défaut', () => {
		expect(deliberationStore.docEngineStatus).toBe('idle');
		expect(deliberationStore.docEngineUrl).toBe('http://localhost:3001');
		expect(deliberationStore.docStudioUrl).toBe('http://localhost:5174');
	});

	it('détecte Document Engine connecté quand l API répond available=true', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				status: 'ok',
				engine: { available: true, url: 'http://localhost:3001' },
				studio: { url: 'http://localhost:5174' }
			})
		});

		const res = await deliberationStore.checkDocEngine({
			silent: false,
			customFetch: mockFetch as unknown as typeof fetch
		});

		expect(res.connected).toBe(true);
		expect(deliberationStore.docEngineStatus).toBe('connected');
		expect(deliberationStore.isCheckingDocEngine).toBe(false);
		expect(deliberationStore.notifications[0].message).toContain('Document Engine prêt');
		expect(deliberationStore.notifications[0].type).toBe('success');
	});

	it('détecte Document Engine hors ligne quand le serveur n est pas démarré (available=false)', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				status: 'ok',
				engine: { available: false, url: 'http://localhost:3001' },
				studio: { url: 'http://localhost:5174' }
			})
		});

		const res = await deliberationStore.checkDocEngine({
			silent: false,
			customFetch: mockFetch as unknown as typeof fetch
		});

		expect(res.connected).toBe(false);
		expect(deliberationStore.docEngineStatus).toBe('offline');
		expect(deliberationStore.isCheckingDocEngine).toBe(false);
		expect(deliberationStore.notifications[0].message).toContain('Document Engine non démarré');
		expect(deliberationStore.notifications[0].message).toContain('npm run server');
		expect(deliberationStore.notifications[0].type).toBe('warning');
	});

	it('gère les erreurs réseau (ex: fetch échoue) en basculant à offline avec notification claire', async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

		const res = await deliberationStore.checkDocEngine({
			silent: false,
			customFetch: mockFetch as unknown as typeof fetch
		});

		expect(res.connected).toBe(false);
		expect(deliberationStore.docEngineStatus).toBe('offline');
		expect(deliberationStore.notifications[0].message).toContain('Document Engine indisponible');
		expect(deliberationStore.notifications[0].type).toBe('warning');
	});

	it('utilise le mode silencieux pour le check automatique au montage', async () => {
		const prevNotifCount = deliberationStore.notifications.length;
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				status: 'ok',
				engine: { available: false, url: 'http://localhost:3001' },
				studio: { url: 'http://localhost:5174' }
			})
		});

		const res = await deliberationStore.checkDocEngine({
			silent: true,
			customFetch: mockFetch as unknown as typeof fetch
		});

		expect(res.connected).toBe(false);
		expect(deliberationStore.docEngineStatus).toBe('offline');
		// En mode silencieux, aucune notification n'est injectée dans la file
		expect(deliberationStore.notifications.length).toBe(prevNotifCount);
	});
});
