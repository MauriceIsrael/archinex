import { describe, it, expect, beforeEach } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import type { WorkspaceCreationInput } from '$lib/domain/engagements';

describe('Workspace Lifecycle, Persistence, Archiving & Deletion Contract', () => {
	beforeEach(() => {
		// Réinitialiser vers l'état usine avant les tests
		deliberationStore.resetToDefaults();
	});

	it('1. Démarre avec les espaces de travail par défaut actifs', () => {
		expect(deliberationStore.engagements.length).toBeGreaterThanOrEqual(2);
		expect(deliberationStore.activeEngagements.length).toBe(deliberationStore.engagements.length);
		expect(deliberationStore.archivedEngagements.length).toBe(0);
	});

	it('2. Archive un espace de travail et filtre correctement entre actifs et archivés', () => {
		const targetId = 'cctp-mcx-nordwave';
		const success = deliberationStore.archiveEngagement(targetId);

		expect(success).toBe(true);

		const target = deliberationStore.engagements.find((e) => e.id === targetId);
		expect(target?.status).toBe('archived');
		expect(target?.archivedAt).toBeDefined();

		// Filtres réactifs
		expect(deliberationStore.activeEngagements.some((e) => e.id === targetId)).toBe(false);
		expect(deliberationStore.archivedEngagements.some((e) => e.id === targetId)).toBe(true);
	});

	it('3. Désarchive et réactive un espace de travail', () => {
		const targetId = 'cctp-mcx-nordwave';
		deliberationStore.archiveEngagement(targetId);

		const restored = deliberationStore.unarchiveEngagement(targetId);
		expect(restored).toBe(true);

		const target = deliberationStore.engagements.find((e) => e.id === targetId);
		expect(target?.status).toBe('active');
		expect(target?.archivedAt).toBeUndefined();

		expect(deliberationStore.activeEngagements.some((e) => e.id === targetId)).toBe(true);
		expect(deliberationStore.archivedEngagements.some((e) => e.id === targetId)).toBe(false);
	});

	it('4. Supprime un espace de travail et bascule automatiquement si l\'espace supprimé était actif', () => {
		// Créer un espace temporaire
		const input: WorkspaceCreationInput = {
			title: 'Projet Test Suppression',
			type: 'poc_migration',
			description: 'Espace destiné à être supprimé.',
			strategy: {
				objectives: ['Test de suppression'],
				principles: ['Souveraineté'],
				constraints: ['Local']
			},
			participants: [],
			upstreamDocuments: []
		};

		const created = deliberationStore.createNewWorkspace(input);
		expect(deliberationStore.activeEngagementId).toBe(created.id);
		const countBefore = deliberationStore.engagements.length;

		// Supprimer l'espace en cours
		const deleted = deliberationStore.deleteEngagement(created.id);
		expect(deleted).toBe(true);
		expect(deliberationStore.engagements.length).toBe(countBefore - 1);
		expect(deliberationStore.engagements.some((e) => e.id === created.id)).toBe(false);

		// Doit avoir basculé vers un autre projet actif
		expect(deliberationStore.activeEngagementId).not.toBe(created.id);
		expect(deliberationStore.activeEngagement).toBeDefined();
	});

	it('5. Protège le dernier espace de travail contre la suppression accidentelle', () => {
		// Supprimer jusqu'à ce qu'il ne reste qu'un seul
		while (deliberationStore.engagements.length > 1) {
			const idToDelete = deliberationStore.engagements[deliberationStore.engagements.length - 1].id;
			deliberationStore.deleteEngagement(idToDelete);
		}

		expect(deliberationStore.engagements.length).toBe(1);
		const lastId = deliberationStore.engagements[0].id;

		// Tentative de supprimer le dernier
		const attempted = deliberationStore.deleteEngagement(lastId);
		expect(attempted).toBe(false);
		expect(deliberationStore.engagements.length).toBe(1);
	});

	it('6. Exporte la configuration et l\'état complet d\'un espace de travail en JSON souverain', () => {
		const jsonExport = deliberationStore.exportWorkspaceJSON();
		expect(jsonExport).toBeTruthy();

		const parsed = JSON.parse(jsonExport);
		expect(parsed.id).toBe(deliberationStore.activeEngagementId);
		expect(parsed.title).toBe(deliberationStore.activeEngagement.title);
		expect(Array.isArray(parsed.subjects)).toBe(true);
	});
});
