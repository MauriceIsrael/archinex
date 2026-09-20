import { describe, it, expect } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { renderTelegraphicDraft, validateTelegraphicTone } from '$lib/domain/telegraphic';

describe('Integration Scenario - End-to-End Deliberation & Epistemic Governance', () => {
	it('Scénario Intégration Complet: Cycle d\'élicitation, priorité des déblocages, garde-fous humains et effet domino', () => {
		// 1. État initial : Vérification du tri par effet multiplicateur (unlocks_count)
		const sorted = deliberationStore.sortedSubjects;
		expect(sorted[0].id).toBe('sub_dc_resilience'); // unlocks_count = 4
		expect(sorted[0].unlocks_count).toBe(4);

		// 2. Sélection du sujet clé §4.2 Synchronisation
		deliberationStore.selectSubject('sub_sync');
		expect(deliberationStore.activeSubjectId).toBe('sub_sync');
		expect(deliberationStore.activeSubject?.name).toBe('Synchronisation Réseau & Holdover');
		expect(deliberationStore.activeSubject?.level).toBe('L2_decomposed');
		expect(deliberationStore.activeDraft?.is_provisional).toBe(true);

		// 3. Rendu télégraphique et présence du chiffrage percutant (Appât)
		const renderedDraft = renderTelegraphicDraft(deliberationStore.activeDraft!);
		expect(renderedDraft).toContain('[PROVISOIRE]');
		expect(renderedDraft).toContain('+180 k€');
		expect(renderedDraft).toContain('variante B : GNSS multi-constellation + NTP durci');

		// 4. Test anti-blabla sur le brouillon
		const toneCheck = validateTelegraphicTone(renderedDraft);
		expect(toneCheck.valid).toBe(true);

		// 5. Test d'usurpation par Agent IA (Violation Gate Tour 8)
		deliberationStore.setIsHuman(false);
		const aiArbitration = deliberationStore.arbitrateSubject('sub_sync');
		expect(aiArbitration.success).toBe(false);
		expect(aiArbitration.message).toContain('Gate Tour 8 violé');

		// sub_sync est toujours à L2_decomposed
		const syncStillL2 = deliberationStore.subjects.find((s) => s.id === 'sub_sync');
		expect(syncStillL2?.level).toBe('L2_decomposed');

		// 6. Test avec rôle expert non habilité pour L4 (Violation Gate Tour 11)
		deliberationStore.setIsHuman(true);
		deliberationStore.setRole('infra_expert_architect');

		// 7. Arbitrage légitime par le Lead Architect humain
		deliberationStore.setRole('lead_architect');
		deliberationStore.setIsHuman(true);

		// Noter l'état des bloquants des sujets dépendants avant arbitrage
		const radioBefore = deliberationStore.subjects.find((s) => s.id === 'sub_radio')?.blocking_count!;
		const coreBefore = deliberationStore.subjects.find((s) => s.id === 'sub_core')?.blocking_count!;

		// Exécution de l'arbitrage
		const humanArbitration = deliberationStore.arbitrateSubject('sub_sync');
		expect(humanArbitration.success).toBe(true);
		expect(humanArbitration.message).toContain('L3_decided');

		// 8. Vérification de la promotion et de l'extinction des conflits
		const syncAfter = deliberationStore.subjects.find((s) => s.id === 'sub_sync');
		expect(syncAfter?.level).toBe('L3_decided');
		expect(syncAfter?.blocking_count).toBe(0);

		const draftAfter = deliberationStore.drafts['sub_sync'];
		expect(draftAfter.is_provisional).toBe(false);
		expect(draftAfter.conflit).toHaveLength(0);

		// 9. Vérification du déblocage en cascade (effet domino) sur les dépendants
		const radioAfter = deliberationStore.subjects.find((s) => s.id === 'sub_radio')?.blocking_count!;
		const coreAfter = deliberationStore.subjects.find((s) => s.id === 'sub_core')?.blocking_count!;

		expect(radioAfter).toBe(radioBefore - 1);
		expect(coreAfter).toBe(coreBefore - 1);

		// 10. Relance en 1 clic d'un expert pour une question résiduelle
		deliberationStore.sendRelance('sub_dc_resilience', 'Q-0003');
		expect(deliberationStore.notifications[0].message).toContain('Relance envoyée à [infra_expert_architect]');
	});
});
