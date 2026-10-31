import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('Préférence utilisateur — Mémorisation du sujet, de la vue et de la posture dans le localStorage', () => {
	let mockStorage: Record<string, string> = {};

	beforeEach(() => {
		mockStorage = {};
		const localStorageMock = {
			getItem: (key: string) => mockStorage[key] ?? null,
			setItem: (key: string, value: string) => {
				mockStorage[key] = String(value);
			},
			removeItem: (key: string) => {
				delete mockStorage[key];
			},
			clear: () => {
				mockStorage = {};
			}
		};

		vi.stubGlobal('localStorage', localStorageMock);
		vi.stubGlobal('window', { localStorage: localStorageMock });
		deliberationStore.activeEngagementId = '';
		deliberationStore.deliberationViewMode = 'board';
		deliberationStore.activePosture = 'deliberation';
		deliberationStore.notifications = [];
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('persiste le sujet sélectionné dans le localStorage avec la clé scopée par engagement', () => {
		const engagements = createTestDefaultEngagements();
		deliberationStore.initFromDb(engagements, []);

		const activeEngId = deliberationStore.activeEngagementId;
		const secondSubject = deliberationStore.subjects[1];
		expect(secondSubject).toBeDefined();

		deliberationStore.selectSubject(secondSubject.id);

		expect(deliberationStore.activeSubjectId).toBe(secondSubject.id);
		expect(mockStorage[`archinex:activeSubjectId:${activeEngId}`]).toBe(secondSubject.id);
		expect(mockStorage[`archinex:deliberationViewMode:${activeEngId}`]).toBe('conversation');
	});

	it('persiste deliberationViewMode et activePosture lors de changements explicites', () => {
		const engagements = createTestDefaultEngagements();
		deliberationStore.initFromDb(engagements, []);
		const activeEngId = deliberationStore.activeEngagementId;

		deliberationStore.setDeliberationViewMode('conversation');
		expect(deliberationStore.deliberationViewMode).toBe('conversation');
		expect(mockStorage[`archinex:deliberationViewMode:${activeEngId}`]).toBe('conversation');

		deliberationStore.setPosture('appropriation');
		expect(deliberationStore.activePosture).toBe('appropriation');
		expect(mockStorage[`archinex:activePosture:${activeEngId}`]).toBe('appropriation');
	});

	it('restaure le dernier sujet mémorisé lors de initFromDb si valide', () => {
		const engagements = createTestDefaultEngagements();
		const eng = engagements[0];
		const targetSubject = eng.subjects[2];
		expect(targetSubject).toBeDefined();

		mockStorage['archinex:activeEngagementId'] = eng.id;
		mockStorage[`archinex:activeSubjectId:${eng.id}`] = targetSubject.id;

		deliberationStore.initFromDb(engagements, []);

		expect(deliberationStore.activeSubjectId).toBe(targetSubject.id);
	});

	it('restaure deliberationViewMode et activePosture mémorisés lors de initFromDb', () => {
		const engagements = createTestDefaultEngagements();
		const eng = engagements[0];

		mockStorage['archinex:activeEngagementId'] = eng.id;
		mockStorage[`archinex:deliberationViewMode:${eng.id}`] = 'conversation';
		mockStorage[`archinex:activePosture:${eng.id}`] = 'rendu';

		deliberationStore.initFromDb(engagements, []);

		expect(deliberationStore.deliberationViewMode).toBe('conversation');
		expect(deliberationStore.activePosture).toBe('rendu');
	});

	it("rabat sur le sujet par défaut si l'identifiant mémorisé n'existe plus dans les sujets", () => {
		const engagements = createTestDefaultEngagements();
		const eng = engagements[0];

		mockStorage['archinex:activeEngagementId'] = eng.id;
		mockStorage[`archinex:activeSubjectId:${eng.id}`] = 'non-existent-subject-id';

		deliberationStore.initFromDb(engagements, []);

		expect(deliberationStore.activeSubjectId).toBe(eng.defaultSubjectId || eng.subjects[0]?.id);
	});

	it("restaure le sujet mémorisé spécifique lors du basculement d'engagement via switchEngagement", () => {
		const engagements = createTestDefaultEngagements();
		expect(engagements.length).toBeGreaterThan(1);
		const secondEng = engagements[1];
		const secondEngSubject = secondEng.subjects[1];
		expect(secondEngSubject).toBeDefined();

		mockStorage[`archinex:activeSubjectId:${secondEng.id}`] = secondEngSubject.id;
		mockStorage[`archinex:deliberationViewMode:${secondEng.id}`] = 'conversation';
		mockStorage[`archinex:activePosture:${secondEng.id}`] = 'appropriation';

		deliberationStore.initFromDb(engagements, []);
		deliberationStore.switchEngagement(secondEng.id);

		expect(deliberationStore.activeEngagementId).toBe(secondEng.id);
		expect(deliberationStore.activeSubjectId).toBe(secondEngSubject.id);
		expect(deliberationStore.deliberationViewMode).toBe('conversation');
		expect(deliberationStore.activePosture).toBe('appropriation');
	});

	it("met à jour le localStorage lors du changement de sujet et le conserve lors d'allers-retours entre engagements", () => {
		const engagements = createTestDefaultEngagements();
		deliberationStore.initFromDb(engagements, []);

		const eng1 = engagements[0];
		const eng2 = engagements[1];

		// Sélection d'un sujet sur l'engagement 1
		const sub1 = eng1.subjects[2];
		deliberationStore.selectSubject(sub1.id);
		expect(mockStorage[`archinex:activeSubjectId:${eng1.id}`]).toBe(sub1.id);

		// Bascule vers engagement 2
		deliberationStore.switchEngagement(eng2.id);
		const sub2 = eng2.subjects[1];
		deliberationStore.selectSubject(sub2.id);
		expect(mockStorage[`archinex:activeSubjectId:${eng2.id}`]).toBe(sub2.id);

		// Re-bascule vers engagement 1 : il doit retrouver sub1
		deliberationStore.switchEngagement(eng1.id);
		expect(deliberationStore.activeSubjectId).toBe(sub1.id);
	});

	it("syncWithLLMOps avec l'option silent: true ne génère aucune notification visuelle intempestive", async () => {
		const engagements = createTestDefaultEngagements();
		deliberationStore.initFromDb(engagements, []);
		deliberationStore.notifications = [];

		const mockPayload = {
			engagement: engagements[0].id,
			source: 'live',
			health: { status: 'healthy', version: '1.0' },
			syncedAt: new Date().toISOString(),
			conflicts: [],
			board: [],
			statements: []
		};

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockPayload
		});

		// 1. Appel silencieux
		const resSilent = await deliberationStore.syncWithLLMOps(
			engagements[0].id,
			mockFetch as unknown as typeof fetch,
			{ silent: true }
		);

		expect(resSilent.success).toBe(true);
		expect(deliberationStore.notifications).toHaveLength(0);

		// 2. Appel non silencieux (clic manuel utilisateur)
		const resLoud = await deliberationStore.syncWithLLMOps(
			engagements[0].id,
			mockFetch as unknown as typeof fetch,
			{ silent: false }
		);

		expect(resLoud.success).toBe(true);
		expect(deliberationStore.notifications.length).toBeGreaterThan(0);
	});
});
