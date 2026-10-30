import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { createTestDefaultEngagements } from '../fixtures/sample-data';

describe('Préférence utilisateur — Mémorisation du dernier sujet dans le localStorage', () => {
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

		deliberationStore.initFromDb(engagements, []);
		deliberationStore.switchEngagement(secondEng.id);

		expect(deliberationStore.activeEngagementId).toBe(secondEng.id);
		expect(deliberationStore.activeSubjectId).toBe(secondEngSubject.id);
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
});
