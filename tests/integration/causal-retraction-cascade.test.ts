/**
 * Test d'Intégration · Moteur de Rétractation Causale sur DAG de Dépendances (Axe 2A)
 * 
 * Valide le Truth Maintenance System d'Archinex de bout en bout :
 * 1. Construction d'une chaîne de décision multiniveaux (S1 -> S2 -> S3) à maturité L3_decided.
 * 2. Déclenchement de la rétractation sur l'énoncé racine S1 par le Lead Architect.
 * 3. Propagation automatique de l'invalidation le long du DAG causal.
 * 4. Déclassement transitif de tous les énoncés descendants à 'assumed'.
 * 5. Rétrogradation automatique des sujets associés sur le Board de maturité (L3 -> L2).
 * 6. Réactivation du statut 'provisoire' sur les brouillons télégraphiques.
 * 7. Verrouillage immédiat de la barrière de certification (Freeze Gating bloqué).
 * 8. Immunisation stricte des branches indépendantes dans le graphe.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
import type { Statement } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';

describe('Test d\'Intégration · Rétractation Causale & Truth Maintenance (Axe 2A)', () => {
	const S1_ID = 'S-PWR-001';
	const S2_ID = 'S-SYNC-002';
	const S3_ID = 'S-CORE-003';
	const S_INDEP_ID = 'S-SEC-099';

	const SUB_PWR = 'sub_dc_power';
	const SUB_SYNC = 'sub_telecom_sync';
	const SUB_CORE = 'sub_mcx_core';
	const SUB_SEC = 'sub_pqc_security';

	beforeEach(() => {
		// 1. Initialisation des 4 énoncés formant la chaîne causale S1 -> S2 -> S3 + Indépendant
		const s1: Statement = {
			id: S1_ID,
			section: '§3.1',
			triplet: { subject: SUB_PWR, predicate: 'redundancy', value: '2N+1 Tier IV' },
			justification: { basedOn: [] },
			authority: { author: 'M. Israel', role: 'lead_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: '2026-09-01T00:00:00Z',
			updatedAt: '2026-09-01T00:00:00Z'
		};

		const s2: Statement = {
			id: S2_ID,
			section: '§4.1',
			triplet: { subject: SUB_SYNC, predicate: 'ptp_profile', value: 'ITU-T G.8275.1 Telecom Profile' },
			justification: { basedOn: [S1_ID] },
			authority: { author: 'Sync Expert', role: 'infra_expert_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
			revisability: { antecedents: [S1_ID] },
			status: 'active',
			createdAt: '2026-09-02T00:00:00Z',
			updatedAt: '2026-09-02T00:00:00Z'
		};

		const s3: Statement = {
			id: S3_ID,
			section: '§5.1',
			triplet: { subject: SUB_CORE, predicate: 'high_availability', value: 'Geo-redundant active-active' },
			justification: { basedOn: [S2_ID] },
			authority: { author: 'Core Expert', role: 'domain_expert', productionMode: 'llm-proposed-human-approved' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
			revisability: { antecedents: [S2_ID] },
			status: 'active',
			createdAt: '2026-09-03T00:00:00Z',
			updatedAt: '2026-09-03T00:00:00Z'
		};

		const sIndep: Statement = {
			id: S_INDEP_ID,
			section: '§6.1',
			triplet: { subject: SUB_SEC, predicate: 'crypto_suite', value: 'ML-KEM-768 Kyber' },
			justification: { basedOn: [] },
			authority: { author: 'CISO Officer', role: 'security_architect', productionMode: 'human-authored' },
			maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: '2026-09-04T00:00:00Z',
			updatedAt: '2026-09-04T00:00:00Z'
		};

		// 2. Initialisation des sujets de maturité sur le Board (tous scellés à L3)
		const subjects: MaturitySubject[] = [
			{
				id: SUB_PWR,
				section_ref: '§3.1',
				name: 'Infrastructure Énergie & Climatisation',
				level: 'L3_decided',
				blocking_count: 0,
				unlocks_count: 2,
				waiting_for_role: 'lead_architect',
				relative_effort: 'M',
				last_transition_date: '2026-09-01T00:00:00Z',
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: [SUB_SYNC]
			},
			{
				id: SUB_SYNC,
				section_ref: '§4.1',
				name: 'Distribution PTP et Synchronisation',
				level: 'L3_decided',
				blocking_count: 0,
				unlocks_count: 1,
				waiting_for_role: 'infra_expert_architect',
				relative_effort: 'S',
				last_transition_date: '2026-09-02T00:00:00Z',
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: [SUB_CORE]
			},
			{
				id: SUB_CORE,
				section_ref: '§5.1',
				name: 'Coeur de Réseau MCX Distribué',
				level: 'L3_decided',
				blocking_count: 0,
				unlocks_count: 0,
				waiting_for_role: 'lead_architect',
				relative_effort: 'L',
				last_transition_date: '2026-09-03T00:00:00Z',
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: []
			},
			{
				id: SUB_SEC,
				section_ref: '§6.1',
				name: 'Chiffrement Post-Quantique',
				level: 'L3_decided',
				blocking_count: 0,
				unlocks_count: 0,
				waiting_for_role: 'security_architect',
				relative_effort: 'S',
				last_transition_date: '2026-09-04T00:00:00Z',
				stall_days: 0,
				is_stalled: false,
				dependent_subject_ids: []
			}
		];

		// 3. Initialisation des brouillons télégraphiques certifiés (is_provisional: false)
		const drafts: Record<string, TelegraphicDraft> = {
			[SUB_PWR]: {
				section_id: '§3.1',
				subject: 'Infrastructure Énergie',
				maturity: 'L3_decided',
				is_provisional: false,
				retenu: ['Double adduction Tier IV certifiée'],
				suppose: [],
				conflit: [],
				manque: []
			},
			[SUB_SYNC]: {
				section_id: '§4.1',
				subject: 'Distribution PTP',
				maturity: 'L3_decided',
				is_provisional: false,
				retenu: ['Profil ITU-T G.8275.1'],
				suppose: [],
				conflit: [],
				manque: []
			},
			[SUB_CORE]: {
				section_id: '§5.1',
				subject: 'Coeur de Réseau MCX',
				maturity: 'L3_decided',
				is_provisional: false,
				retenu: ['Géo-redondance active-active'],
				suppose: [],
				conflit: [],
				manque: []
			},
			[SUB_SEC]: {
				section_id: '§6.1',
				subject: 'Chiffrement PQC',
				maturity: 'L3_decided',
				is_provisional: false,
				retenu: ['Suite ML-KEM-768'],
				suppose: [],
				conflit: [],
				manque: []
			}
		};

		// 4. Hydratation du store Archinex
		deliberationStore.statements = [s1, s2, s3, sIndep];
		deliberationStore.subjects = subjects;
		deliberationStore.drafts = drafts;
		deliberationStore.currentRole = 'lead_architect';
		deliberationStore.isHuman = true;
	});

	it('1. État initial : tous les sujets sont à L3_decided et certifiables (Freeze Gate déverrouillé)', () => {
		expect(deliberationStore.subjects.every((s) => s.level === 'L3_decided')).toBe(true);
		expect(Object.values(deliberationStore.drafts).every((d) => !d.is_provisional)).toBe(true);

		// Le Lead Architect peut geler la section coeur
		const gatingBefore = deliberationStore.getGatingCheck(SUB_CORE);
		expect(gatingBefore.allowed).toBe(true);
	});

	it('2. Déclenchement de la rétractation sur S1 : invalidation causale en cascade', () => {
		const reason = 'Audit technique : Perte de certification Tier IV suite à incident sur le groupe électrogène';
		const cascadeResult = deliberationStore.retractStatement(S1_ID, reason);

		// A. L'énoncé cible passe en 'contested' avec confiance 'assumed'
		expect(cascadeResult.retractedStatement?.status).toBe('contested');
		expect(cascadeResult.retractedStatement?.maturity.confidence).toBe('assumed');

		// B. Les descendants transitifs (S2 direct et S3 indirect) sont identifiés
		expect(cascadeResult.impactedDescendantIds).toContain(S2_ID);
		expect(cascadeResult.impactedDescendantIds).toContain(S3_ID);
		expect(cascadeResult.impactedDescendantIds).not.toContain(S_INDEP_ID);

		// C. Déclassement effectif dans le store
		const s2InStore = deliberationStore.statements.find((s) => s.id === S2_ID);
		const s3InStore = deliberationStore.statements.find((s) => s.id === S3_ID);
		const sIndepInStore = deliberationStore.statements.find((s) => s.id === S_INDEP_ID);

		expect(s2InStore?.maturity.confidence).toBe('assumed');
		expect(s2InStore?.status).toBe('under_review');

		expect(s3InStore?.maturity.confidence).toBe('assumed');
		expect(s3InStore?.status).toBe('under_review');

		// La branche indépendante n'a pas bougé
		expect(sIndepInStore?.maturity.confidence).toBe('verified');
		expect(sIndepInStore?.status).toBe('active');
	});

	it('3. Rétrogradation automatique de maturité sur le Board (L3 -> L2) et réactivation du badge provisoire', () => {
		deliberationStore.retractStatement(S1_ID, 'Défaut majeur d\'adduction');

		// Les sujets de la chaîne causale tombent à L2_decomposed
		const pwrSub = deliberationStore.subjects.find((s) => s.id === SUB_PWR);
		const syncSub = deliberationStore.subjects.find((s) => s.id === SUB_SYNC);
		const coreSub = deliberationStore.subjects.find((s) => s.id === SUB_CORE);
		const secSub = deliberationStore.subjects.find((s) => s.id === SUB_SEC);

		expect(pwrSub?.level).toBe('L2_decomposed');
		expect(syncSub?.level).toBe('L2_decomposed');
		expect(coreSub?.level).toBe('L2_decomposed');

		// Le sujet indépendant reste à L3_decided
		expect(secSub?.level).toBe('L3_decided');

		// Les brouillons de la chaîne causale repassent immédiatement en provisoire
		expect(deliberationStore.drafts[SUB_PWR].is_provisional).toBe(true);
		expect(deliberationStore.drafts[SUB_SYNC].is_provisional).toBe(true);
		expect(deliberationStore.drafts[SUB_CORE].is_provisional).toBe(true);

		// Le brouillon indépendant reste certifié non-provisoire
		expect(deliberationStore.drafts[SUB_SEC].is_provisional).toBe(false);
	});

	it('4. Barrière de certification (Freeze Gate) : Le gel est formellement bloqué sur toute la chaîne impactée', () => {
		deliberationStore.retractStatement(S1_ID, 'Défaut alimentation');

		// Tentative de geler la section Coeur (alors que son antécédent a été invalidé)
		const gatingCore = deliberationStore.getGatingCheck(SUB_CORE);
		expect(gatingCore.allowed).toBe(false);
		expect(gatingCore.code).toBe('MATURITY_INSUFFICIENT');

		// Tentative d'exécution formelle du gel -> Rejet immédiat
		const freezeAttempt = deliberationStore.freezeSection(SUB_CORE);
		expect(freezeAttempt.success).toBe(false);
		expect(freezeAttempt.error).toBeTruthy();

		// En revanche, la section indépendante (sub_pqc_security) reste certifiable
		const gatingSec = deliberationStore.getGatingCheck(SUB_SEC);
		expect(gatingSec.allowed).toBe(true);

		const freezeSecAttempt = deliberationStore.freezeSection(SUB_SEC);
		expect(freezeSecAttempt.success).toBe(true);
		expect(freezeSecAttempt.snapshot?.sealSha256).toMatch(/^[a-f0-9]{64}$/);
	});

	it('5. Audit et traçabilité : L\'invalidation génère une notification d\'alerte haute priorité', () => {
		const notificationCountBefore = deliberationStore.notifications.length;
		deliberationStore.retractStatement(S1_ID, 'Délai d\'approvisionnement holdover non tenable');

		expect(deliberationStore.notifications.length).toBeGreaterThan(notificationCountBefore);

		const latestNotification = deliberationStore.notifications[0];
		expect(latestNotification.type).toBe('warning');
		expect(latestNotification.message).toContain(S1_ID);
		expect(latestNotification.message).toContain('déclassé');
	});
});
