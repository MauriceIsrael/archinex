/**
 * Test d'Intégration · Maturation de Sujet suite à un Débat d'Experts Contradictoire
 * 
 * Valide le cycle dialectique complet d'Archinex :
 * 1. Sujet initialement bloqué à L1_framed avec dépendances en aval (sub_radio, sub_core).
 * 2. Débat contradictoire multi-experts dans le canal dialectique (Infra vs RSSI vs Agent IA).
 * 3. Formalisation de la controverse dans le brouillon (conflit ouvert, is_provisional: true).
 * 4. Règle du Silence : impossibilité de consensus tacite ou de promotion L3 par l'IA.
 * 5. Arbitrage formel par le Lead Architect humain (Human Gate Tour 8).
 * 6. Promotion effective à L3_decided et purge du conflit.
 * 7. Effet Multiplicateur : déblocage en cascade des sujets aval et réordonnancement du Board.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import { canTransitionMaturity, sortMaturityBoard, type MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';

describe('Test d\'Intégration · Maturation par Débat d\'Experts & Arbitrage (Dialectic Cycle)', () => {
	const SUB_SYNC = 'sub_ptp_sync';
	const SUB_RADIO = 'sub_radio_ppdr';
	const SUB_CORE = 'sub_mcx_core';

	beforeEach(() => {
		// 1. Initialisation de la chaîne de sujets sur le Board
		const subjects: MaturitySubject[] = [
			{
				id: SUB_SYNC,
				section_ref: '§4.1',
				name: 'Distribution PTP & Synchronisation Fréquentielle',
				level: 'L1_framed',
				blocking_count: 0,
				unlocks_count: 2,
				waiting_for_role: 'infra_expert_architect',
				relative_effort: 'M',
				last_transition_date: '2026-09-01T00:00:00Z',
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: [SUB_RADIO, SUB_CORE]
			},
			{
				id: SUB_RADIO,
				section_ref: '§4.2',
				name: 'Réseau d\'Accès Radio 5G PPDR',
				level: 'L1_framed',
				blocking_count: 1, // Bloqué par sub_sync
				unlocks_count: 0,
				waiting_for_role: 'domain_expert',
				relative_effort: 'S',
				last_transition_date: '2026-09-01T00:00:00Z',
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: []
			},
			{
				id: SUB_CORE,
				section_ref: '§5.1',
				name: 'Coeur de Réseau MCX Géo-redondant',
				level: 'L1_framed',
				blocking_count: 2, // Bloqué par sub_sync + autre
				unlocks_count: 0,
				waiting_for_role: 'lead_architect',
				relative_effort: 'L',
				last_transition_date: '2026-09-01T00:00:00Z',
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: []
			}
		];

		// 2. Brouillons télégraphiques initiaux
		const drafts: Record<string, TelegraphicDraft> = {
			[SUB_SYNC]: {
				section_id: '§4.1',
				subject: 'Distribution PTP',
				maturity: 'L1_framed',
				is_provisional: true,
				retenu: ['Cadrage préliminaire PTP'],
				suppose: [
					{
						text: 'Attente proposition dimensionnement horloge',
						consequence: 'Blocage des profils radio PPDR',
						cost_hint: 'M'
					}
				],
				conflit: [],
				manque: [
					{
						id: 'Q-SYNC-01',
						question: 'Quel composant d\'horloge garantit le holdover requis en cas de perte GNSS ?',
						assigned_role: 'infra_expert_architect'
					}
				]
			},
			[SUB_RADIO]: {
				section_id: '§4.2',
				subject: 'Réseau Radio PPDR',
				maturity: 'L1_framed',
				is_provisional: true,
				retenu: ['Attente synchronisation PTP'],
				suppose: [],
				conflit: [],
				manque: []
			},
			[SUB_CORE]: {
				section_id: '§5.1',
				subject: 'Coeur MCX',
				maturity: 'L1_framed',
				is_provisional: true,
				retenu: ['Attente synchronisation temporelle'],
				suppose: [],
				conflit: [],
				manque: []
			}
		};

		// 3. Hydratation du store
		deliberationStore.subjects = subjects;
		deliberationStore.drafts = drafts;
		deliberationStore.activeSubjectId = SUB_SYNC;
		deliberationStore.dialogueMessages = [];
		deliberationStore.currentRole = 'infra_expert_architect';
		deliberationStore.isHuman = true;
	});

	it('1. Situation de blocage initial : sub_sync débloque 2 sujets mais reste à L1_framed', () => {
		const syncSubject = deliberationStore.subjects.find((s) => s.id === SUB_SYNC);
		expect(syncSubject?.level).toBe('L1_framed');
		expect(syncSubject?.unlocks_count).toBe(2);

		// Les sujets dépendants sont bloqués
		const radioSubject = deliberationStore.subjects.find((s) => s.id === SUB_RADIO);
		const coreSubject = deliberationStore.subjects.find((s) => s.id === SUB_CORE);
		expect(radioSubject?.blocking_count).toBe(1);
		expect(coreSubject?.blocking_count).toBe(2);

		// Le tri du Board priorise sub_sync car son effet multiplicateur (unlocks_count) est maximal
		const sorted = sortMaturityBoard(deliberationStore.subjects);
		expect(sorted[0].id).toBe(SUB_SYNC);
	});

	it('2. Déroulement du débat d\'experts contradictoire dans le canal dialectique', () => {
		// Tour 1 : Proposition par l'expert Infrastructure (Pierre)
		deliberationStore.currentRole = 'infra_expert_architect';
		deliberationStore.isHuman = true;
		deliberationStore.sendSubjectMessage(
			'Proposition technique : oscillateur TCXO économique pour réduire les coûts CAPEX (holdover max 4h).',
			SUB_SYNC
		);

		// Tour 2 : Contestation formelle par la responsable Sécurité / RSSI (Claire)
		deliberationStore.currentRole = 'security_architect';
		deliberationStore.isHuman = true;
		deliberationStore.sendSubjectMessage(
			'Objection de conformité : NIS2 Art. 21 et CCTP §4.2 imposent une autonomie PTP >= 24h en cas de brouillage GNSS.',
			SUB_SYNC
		);

		// Tour 3 : Synthèse dialectique formulée par l\'Agent IA
		deliberationStore.currentRole = 'domain_expert';
		deliberationStore.isHuman = false;
		deliberationStore.sendSubjectMessage(
			'Synthèse dialectique : Conflit ouvert entre Optimisation Coût (TCXO 4h) et Résilience Réglementaire (Rubidium 24h). Arbitrage du Lead Architect requis.',
			SUB_SYNC
		);

		// Vérifications sur les messages de débat enregistrés
		const subjectMessages = deliberationStore.dialogueMessages.filter((m) => m.subjectId === SUB_SYNC);
		expect(subjectMessages.length).toBe(3);

		expect(subjectMessages[0].role).toBe('infra_expert_architect');
		expect(subjectMessages[0].isAi).toBe(false);

		expect(subjectMessages[1].role).toBe('security_architect');
		expect(subjectMessages[1].isAi).toBe(false);

		expect(subjectMessages[2].isAi).toBe(true);
		expect(subjectMessages[2].author).toBe('Agent Élicitation IA');
	});

	it('3. Règle du Silence : la présence d\'arguments ne vaut pas consensus (Interdiction du saut à L3 par l\'IA)', () => {
		// Formalisation de la controverse dans le brouillon (passage à L2_decomposed)
		deliberationStore.subjects[0].level = 'L2_decomposed';
		deliberationStore.drafts[SUB_SYNC].conflit = [
			{
				text: 'Controverse d\'autonomie holdover : 4h (TCXO économique) vs 24h (Rubidium résilient)',
				opposing_reference: '§2.1 vs Budget',
				requires_arbitration: true
			}
		];

		// Tentative de promotion directe par un agent IA sans arbitrage humain
		const aiPromotionAttempt = canTransitionMaturity('L2_decomposed', 'L3_decided', {
			is_human: false,
			role: 'domain_expert'
		});
		expect(aiPromotionAttempt.allowed).toBe(false);
		expect(aiPromotionAttempt.code).toBe('HUMAN_GATE_REQUIRED');

		// Le sujet reste obligatoirement provisoire et à L2
		expect(deliberationStore.drafts[SUB_SYNC].is_provisional).toBe(true);
		expect(deliberationStore.subjects[0].level).toBe('L2_decomposed');
	});

	it('4. Arbitrage formel par le Lead Architect : le sujet monte à L3_decided et purge le conflit', () => {
		// Le Lead Architect prend la main
		deliberationStore.currentRole = 'lead_architect';
		deliberationStore.isHuman = true;

		// Message officiel d'arbitrage
		deliberationStore.sendSubjectMessage(
			'Arbitrage Lead Architect : Décision finale en faveur de l\'option Rubidium 24h (Conformité NIS2 absolue). Débat clos.',
			SUB_SYNC
		);

		// Exécution de l'arbitrage
		const arbitrationResult = deliberationStore.arbitrateSubject(SUB_SYNC);
		expect(arbitrationResult.success).toBe(true);

		// Assertions sur le sujet arbitré
		const arbitratedSubject = deliberationStore.subjects.find((s) => s.id === SUB_SYNC);
		expect(arbitratedSubject?.level).toBe('L3_decided');
		expect(arbitratedSubject?.blocking_count).toBe(0);

		// Le brouillon n'est plus provisoire et le conflit est résolu
		const draft = deliberationStore.drafts[SUB_SYNC];
		expect(draft.maturity).toBe('L3_decided');
		expect(draft.is_provisional).toBe(false);
		expect(draft.conflit).toEqual([]);
	});

	it('5. Effet Multiplicateur : Déblocage en cascade des sujets en aval (sub_radio et sub_core)', () => {
		deliberationStore.currentRole = 'lead_architect';
		deliberationStore.isHuman = true;

		// Arbitrage du sujet bloquant
		deliberationStore.arbitrateSubject(SUB_SYNC);

		// Vérification du déblocage en cascade
		const radioSubject = deliberationStore.subjects.find((s) => s.id === SUB_RADIO);
		const coreSubject = deliberationStore.subjects.find((s) => s.id === SUB_CORE);

		// sub_radio : blocking_count est passé de 1 à 0 -> Totalement débloqué !
		expect(radioSubject?.blocking_count).toBe(0);

		// sub_core : blocking_count est passé de 2 à 1 -> Progression vers le déblocage
		expect(coreSubject?.blocking_count).toBe(1);

		// Réordonnancement du Board : sub_radio remonte immédiatement en tête de liste
		const sorted = sortMaturityBoard(deliberationStore.subjects);
		const unblockedCandidates = sorted.filter((s) => s.level !== 'L3_decided' && s.blocking_count === 0);
		expect(unblockedCandidates[0].id).toBe(SUB_RADIO);
	});
});
