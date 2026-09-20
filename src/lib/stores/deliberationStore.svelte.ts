import type { MaturityLevel, ArchitectRole } from '$lib/types/epistemic';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import {
	sortMaturityBoard,
	resolveSubjectArbitration,
	canTransitionMaturity,
	type MaturitySubject
} from '$lib/domain/maturityBoard';

export type DeliberationPosture = 'appropriation' | 'deliberation' | 'rendu';

export interface DeliberationState {
	activeSubjectId: string;
	activePosture: DeliberationPosture;
	currentRole: ArchitectRole;
	isHuman: boolean;
	subjects: MaturitySubject[];
	drafts: Record<string, TelegraphicDraft>;
	notificationLog: Array<{ id: string; timestamp: string; message: string; type: 'info' | 'success' | 'warning' }>;
}

const INITIAL_SUBJECTS: MaturitySubject[] = [
	{
		id: 'sub_sync',
		section_ref: '§4.2',
		name: 'Synchronisation Réseau & Holdover',
		level: 'L2_decomposed',
		blocking_count: 1,
		unlocks_count: 3,
		waiting_for_role: 'lead_architect',
		relative_effort: 'S',
		last_transition_date: '2026-09-08T00:00:00Z',
		stall_days: 12,
		is_stalled: false,
		dependent_subject_ids: ['sub_radio', 'sub_core', 'sub_ppdr']
	},
	{
		id: 'sub_dc_resilience',
		section_ref: '§3.1',
		name: 'Résilience Datacenter & Énergie',
		level: 'L0_named',
		blocking_count: 2,
		unlocks_count: 4,
		waiting_for_role: 'infra_expert_architect',
		relative_effort: 'M',
		last_transition_date: '2026-08-28T00:00:00Z',
		stall_days: 23,
		is_stalled: true,
		dependent_subject_ids: ['sub_sync', 'sub_storage', 'sub_core', 'sub_backup']
	},
	{
		id: 'sub_radio',
		section_ref: '§4.3',
		name: 'Transmission Radio Fréquences MCX',
		level: 'L1_framed',
		blocking_count: 2,
		unlocks_count: 1,
		waiting_for_role: 'domain_architect',
		relative_effort: 'M',
		last_transition_date: '2026-09-14T00:00:00Z',
		stall_days: 6,
		is_stalled: false,
		dependent_subject_ids: ['sub_ppdr']
	},
	{
		id: 'sub_core',
		section_ref: '§4.4',
		name: 'Cœur de Réseau & Tranches 5G (Slicing)',
		level: 'L1_framed',
		blocking_count: 2,
		unlocks_count: 1,
		waiting_for_role: 'domain_architect',
		relative_effort: 'L',
		last_transition_date: '2026-09-12T00:00:00Z',
		stall_days: 8,
		is_stalled: false,
		dependent_subject_ids: ['sub_ppdr']
	},
	{
		id: 'sub_ppdr',
		section_ref: '§5.1',
		name: 'Terminaux PPDR & Ergonomie Terrain',
		level: 'L2_decomposed',
		blocking_count: 5,
		unlocks_count: 0,
		waiting_for_role: 'domain_architect',
		relative_effort: 'XL',
		last_transition_date: '2026-09-15T00:00:00Z',
		stall_days: 5,
		is_stalled: false,
		dependent_subject_ids: []
	},
	{
		id: 'sub_pqc',
		section_ref: '§6.2',
		name: 'Cryptographie Post-Quantique (PQC) & Chiffrement Flux',
		level: 'L3_decided',
		blocking_count: 0,
		unlocks_count: 2,
		waiting_for_role: 'security_architect',
		relative_effort: 'S',
		last_transition_date: '2026-09-19T00:00:00Z',
		stall_days: 1,
		is_stalled: false,
		dependent_subject_ids: ['sub_core', 'sub_ppdr']
	}
];

const INITIAL_DRAFTS: Record<string, TelegraphicDraft> = {
	sub_sync: {
		section_id: '§4.2',
		subject: 'Synchronisation Réseau & Holdover',
		maturity: 'L2_decomposed',
		is_provisional: true,
		retenu: ['KH:ADR-0042@v2 PTP G.8275.1 boundary clocks', 'PAT-0012 double adduction optique'],
		suppose: [
			{
				text: 'holdover ≥ 30 j sans GNSS',
				consequence: 'rubidium par site ⇒ Tier IV nord ⇒ +1 salle technique',
				cost_hint: '+180 k€ · CAPEX 2026'
			}
		],
		conflit: [
			{
				text: 'buffer MTIE (PTP)',
				opposing_reference: 'SLA Opérateur Fédérateur (ADR-0019)',
				requires_arbitration: true
			}
		],
		manque: [
			{
				id: 'Q-0012',
				question: 'MTIE toléré en holdover 30 j sur les stations de base MCX ?',
				assigned_role: 'infra_expert_architect'
			}
		],
		variante_b: {
			title: 'GNSS multi-constellation + NTP durci',
			cost_delta: '÷3 le coût (-120 k€)',
			trade_off: 'Perd l\'éligibilité MCX Priorité 1 en cas de brouillage'
		}
	},
	sub_dc_resilience: {
		section_id: '§3.1',
		subject: 'Résilience Datacenter & Énergie',
		maturity: 'L0_named',
		is_provisional: true,
		retenu: ['KH:STD-0089 Dual-cord power supply'],
		suppose: [
			{
				text: 'autonomie groupe électrogène 72 h',
				consequence: 'cuve fioul 10 000 L enterrée avec permis ICPE',
				cost_hint: '+95 k€'
			}
		],
		conflit: [],
		manque: [
			{
				id: 'Q-0003',
				question: 'Classification Tier III suffisante ou Tier IV exigé par le client ?',
				assigned_role: 'infra_expert_architect'
			}
		]
	}
};

class DeliberationStore {
	activeSubjectId = $state<string>('sub_sync');
	activePosture = $state<DeliberationPosture>('deliberation');
	currentRole = $state<ArchitectRole>('lead_architect');
	isHuman = $state<boolean>(true);
	subjects = $state<MaturitySubject[]>(INITIAL_SUBJECTS);
	drafts = $state<Record<string, TelegraphicDraft>>(INITIAL_DRAFTS);
	notifications = $state<Array<{ id: string; timestamp: string; message: string; type: 'info' | 'success' | 'warning' }>>([]);

	// Tri réactif automatique par déblocages (effet multiplicateur)
	sortedSubjects = $derived(sortMaturityBoard(this.subjects));

	activeSubject = $derived(this.subjects.find((s) => s.id === this.activeSubjectId));

	activeDraft = $derived(this.drafts[this.activeSubjectId] || null);

	stalledSubjects = $derived(this.subjects.filter((s) => s.is_stalled));

	totalUnlocks = $derived(this.subjects.reduce((sum, s) => sum + s.unlocks_count, 0));

	totalBlocking = $derived(this.subjects.reduce((sum, s) => sum + s.blocking_count, 0));

	selectSubject(id: string) {
		this.activeSubjectId = id;
	}

	setPosture(posture: DeliberationPosture) {
		this.activePosture = posture;
	}

	setRole(role: ArchitectRole) {
		this.currentRole = role;
	}

	setIsHuman(isHuman: boolean) {
		this.isHuman = isHuman;
	}

	/**
	 * Arbitre un sujet : résout les conflits, le passe à L3_decided, et propage le déblocage en cascade.
	 */
	arbitrateSubject(subjectId: string): { success: boolean; message: string } {
		const target = this.subjects.find((s) => s.id === subjectId);
		if (!target) return { success: false, message: 'Sujet introuvable' };

		// Vérification du Gate Tour 8
		const check = canTransitionMaturity(target.level, 'L3_decided', {
			role: this.currentRole,
			is_human: this.isHuman
		});

		if (!check.allowed) {
			this.logNotification(check.reason || 'Transition refusée', 'warning');
			return { success: false, message: check.reason || 'Transition refusée' };
		}

		// Application de l'arbitrage et déblocage en cascade
		const result = resolveSubjectArbitration(subjectId, this.subjects);
		this.subjects = result.updatedSubjects;

		// Mise à jour du brouillon télégraphique correspondant
		if (this.drafts[subjectId]) {
			this.drafts[subjectId] = {
				...this.drafts[subjectId],
				maturity: 'L3_decided',
				is_provisional: false,
				conflit: []
			};
		}

		const unblockedNames = result.unblockedSubjectIds
			.map((id) => this.subjects.find((s) => s.id === id)?.name)
			.filter(Boolean)
			.join(', ');

		const msg = `✅ Arbitrage validé : ${target.name} promu à L3_decided. Déblocage en cascade : [${unblockedNames}].`;
		this.logNotification(msg, 'success');
		return { success: true, message: msg };
	}

	/**
	 * Relance ciblée d'un rôle d'expert en 1 clic.
	 */
	sendRelance(subjectId: string, questionId: string) {
		const subject = this.subjects.find((s) => s.id === subjectId);
		if (!subject) return;

		const msg = `🔔 Relance envoyée à [${subject.waiting_for_role}] pour ${questionId} sur ${subject.section_ref} ${subject.name}.`;
		this.logNotification(msg, 'info');
	}

	private logNotification(message: string, type: 'info' | 'success' | 'warning' = 'info') {
		this.notifications = [
			{
				id: Math.random().toString(36).substring(2, 9),
				timestamp: new Date().toLocaleTimeString(),
				message,
				type
			},
			...this.notifications.slice(0, 19)
		];
	}
}

export const deliberationStore = new DeliberationStore();
