import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement, ArchitectRole } from '$lib/types/epistemic';
import type { CorpusDocument, DocumentCategory } from '$lib/domain/corpus';
import type { DialogueMessage } from '$lib/domain/dialectic';
import { INITIAL_CORPUS_DOCUMENTS } from '$lib/domain/corpus';

export type EngagementType =
	| 'generic_blueprint'
	| 'project_rfp'
	| 'audit_resilience'
	| 'poc_migration';

export interface ProjectStrategy {
	objectives: string[];
	principles: string[];
	constraints: string[];
	targetDate?: string;
	budget?: string;
}

export interface ProjectParticipant {
	id: string;
	name: string;
	role: ArchitectRole;
	email?: string;
	isLead?: boolean;
}

export interface EngagementProfile {
	id: string;
	title: string;
	shortName: string;
	type: EngagementType;
	badge: string;
	description: string;
	defaultSubjectId: string;
	defaultDocId: string;
	strategy?: ProjectStrategy;
	participants?: ProjectParticipant[];
	subjects: MaturitySubject[];
	drafts: Record<string, TelegraphicDraft>;
	statements: Statement[];
	corpusDocuments: CorpusDocument[];
	dialogueMessages: DialogueMessage[];
	createdAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCE 1 : ARCHITECTURE GÉNÉRIQUE SUSE TELCO CLOUD (100% LOCAL)
// ─────────────────────────────────────────────────────────────────────────────

export const SUSE_TELCO_SUBJECTS: MaturitySubject[] = [
	{
		id: 'suse_cni_sriov',
		section_ref: '§2.1',
		name: 'Accélération Réseau CNI & SR-IOV/DPDK',
		level: 'L2_decomposed',
		blocking_count: 1,
		unlocks_count: 3,
		waiting_for_role: 'infra_expert_architect',
		relative_effort: 'M',
		last_transition_date: '2026-09-20T00:00:00Z',
		stall_days: 7,
		is_stalled: false,
		dependent_subject_ids: ['suse_rt_kernel', 'suse_neuvector_mesh']
	},
	{
		id: 'suse_rt_kernel',
		section_ref: '§2.2',
		name: 'Noyau Temps Réel (SLERT) & Gigue Sub-ms',
		level: 'L1_framed',
		blocking_count: 2,
		unlocks_count: 2,
		waiting_for_role: 'infra_expert_architect',
		relative_effort: 'S',
		last_transition_date: '2026-09-18T00:00:00Z',
		stall_days: 9,
		is_stalled: false,
		dependent_subject_ids: ['suse_cni_sriov']
	},
	{
		id: 'suse_rke2_hardened',
		section_ref: '§3.1',
		name: 'Cluster Kubernetes RKE2 Durci (CIS/FIPS)',
		level: 'L3_decided',
		blocking_count: 0,
		unlocks_count: 4,
		waiting_for_role: 'security_architect',
		relative_effort: 'M',
		last_transition_date: '2026-09-22T00:00:00Z',
		stall_days: 5,
		is_stalled: false,
		dependent_subject_ids: ['suse_neuvector_mesh']
	},
	{
		id: 'suse_neuvector_mesh',
		section_ref: '§3.2',
		name: 'Sécurité Zero-Trust & Inspection DPI (NeuVector)',
		level: 'L0_named',
		blocking_count: 2,
		unlocks_count: 2,
		waiting_for_role: 'security_architect',
		relative_effort: 'L',
		last_transition_date: '2026-09-10T00:00:00Z',
		stall_days: 17,
		is_stalled: true,
		dependent_subject_ids: ['suse_rke2_hardened']
	},
	{
		id: 'suse_harvester_kvm',
		section_ref: '§4.1',
		name: 'Virtualisation Edge Hybride (Harvester / KubeVirt)',
		level: 'L0_named',
		blocking_count: 1,
		unlocks_count: 1,
		waiting_for_role: 'infra_expert_architect',
		relative_effort: 'XL',
		last_transition_date: '2026-09-12T00:00:00Z',
		stall_days: 15,
		is_stalled: true,
		dependent_subject_ids: []
	},
	{
		id: 'suse_rancher_fleet',
		section_ref: '§5.1',
		name: 'Orchestration GitOps Multi-Clusters Edge (Fleet)',
		level: 'L2_decomposed',
		blocking_count: 0,
		unlocks_count: 3,
		waiting_for_role: 'lead_architect',
		relative_effort: 'L',
		last_transition_date: '2026-09-24T00:00:00Z',
		stall_days: 3,
		is_stalled: false,
		dependent_subject_ids: ['suse_rke2_hardened']
	}
];

export const SUSE_TELCO_DRAFTS: Record<string, TelegraphicDraft> = {
	suse_cni_sriov: {
		section_id: '§2.1',
		subject: 'Accélération Réseau CNI & SR-IOV/DPDK',
		maturity: 'L2_decomposed',
		is_provisional: true,
		retenu: [
			'SUSE:Multus CNI Dual-Homing',
			'SUSE:SR-IOV Network Operator pour UPF 5G',
			'RKE2 Telco Profile v1.30'
		],
		suppose: [
			{
				text: 'Cartes NIC Intel E810 100GbE avec DDP (Dynamic Device Personalization)',
				consequence: 'Firmware certifié requis sur tous les serveurs Edge distants',
				cost_hint: '+32 k€ / site Edge'
			}
		],
		conflit: [
			{
				text: 'Calico eBPF vs Kube-OVN pour le routage est-ouest',
				opposing_reference: 'ADR-SUSE-003 Performance CNI Telco',
				requires_arbitration: true
			}
		],
		manque: [
			{
				id: 'Q-SUSE-001',
				question: 'Le fournisseur de CNF UPF exige-t-il DPDK natif ou supporte-t-il AF_XDP ?',
				assigned_role: 'infra_expert_architect'
			}
		],
		variante_b: {
			title: 'Pure eBPF avec Cilium CNI',
			cost_delta: '-15% latence de contrôle',
			trade_off: 'Non certifié sur certaines CNF vIMS Nokia / Ericsson'
		}
	},
	suse_rt_kernel: {
		section_id: '§2.2',
		subject: 'Noyau Temps Réel (SLERT) & Gigue Sub-ms',
		maturity: 'L1_framed',
		is_provisional: true,
		retenu: [
			'SUSE Linux Enterprise Real Time (SLERT 15 SP5)'
		],
		suppose: [
			{
				text: 'Isolation CPU stricte (isolcpus=2-31, nohz_full, rcu_nocbs)',
				consequence: 'Réservation de 30 cœurs physiques dédiés au plan usager 5G',
				cost_hint: 'Pas de surcoût matériel direct'
			}
		],
		conflit: [],
		manque: [
			{
				id: 'Q-SUSE-003',
				question: 'Test de gigue cyclictest < 15 µs sous charge I/O 100G validé sur matériel cible ?',
				assigned_role: 'infra_expert_architect'
			}
		]
	},
	suse_rke2_hardened: {
		section_id: '§3.1',
		subject: 'Cluster Kubernetes RKE2 Durci (CIS/FIPS)',
		maturity: 'L3_decided',
		is_provisional: false,
		retenu: [
			'CIS Kubernetes Benchmark Level 2 Profile',
			'Modules Cryptographiques FIPS 140-3 natifs',
			'SELinux Enforcing mode strict'
		],
		suppose: [
			{
				text: 'Control plane 3 nœuds haute disponibilité avec etcd sur NVMe',
				consequence: 'Tolérance à la panne d\'un contrôleur sans indisponibilité de l\'API',
				cost_hint: 'Standard infra'
			}
		],
		conflit: [],
		manque: []
	},
	suse_neuvector_mesh: {
		section_id: '§3.2',
		subject: 'Sécurité Zero-Trust & Inspection DPI (NeuVector)',
		maturity: 'L0_named',
		is_provisional: true,
		retenu: [
			'NeuVector Container Security Suite'
		],
		suppose: [
			{
				text: 'Inspection DPI à la volée sur les flux N2/N3 du cœur 5G',
				consequence: 'Surcoût CPU estimé à 8% par cœur de calcul',
				cost_hint: '+4 vCPU par nœud worker'
			}
		],
		conflit: [
			{
				text: 'Mode Discover vs Mode Protect bloquant dès la mise en service',
				opposing_reference: 'SLA Disponibilité 99.999% Cœur',
				requires_arbitration: true
			}
		],
		manque: [
			{
				id: 'Q-SUSE-002',
				question: 'Quelle politique d\'apprentissage NeuVector autorisée en pré-production ?',
				assigned_role: 'security_architect'
			}
		]
	},
	suse_harvester_kvm: {
		section_id: '§4.1',
		subject: 'Virtualisation Edge Hybride (Harvester / KubeVirt)',
		maturity: 'L0_named',
		is_provisional: true,
		retenu: [
			'SUSE Harvester HCI v1.3'
		],
		suppose: [
			{
				text: 'Hébergement conjoint des VNFs legacy (VM KVM) et des CNFs 5G conteneurisées',
				consequence: 'Stockage distribué Longhorn NVMe requis sur tous les hyperviseurs Edge',
				cost_hint: '+45 k€ stockage distribué'
			}
		],
		conflit: [],
		manque: [
			{
				id: 'Q-SUSE-004',
				question: 'Les VNF transmises par le client supportent-elles la migration à chaud sous KubeVirt ?',
				assigned_role: 'infra_expert_architect'
			}
		]
	},
	suse_rancher_fleet: {
		section_id: '§5.1',
		subject: 'Orchestration GitOps Multi-Clusters Edge (Fleet)',
		maturity: 'L2_decomposed',
		is_provisional: true,
		retenu: [
			'Rancher Prime Management Server',
			'Fleet GitOps Controller pour 50+ clusters Edge'
		],
		suppose: [
			{
				text: 'Dépôt Git souverain interne avec signature des commits Sigstore',
				consequence: 'Air-gapped registry local avec miroir d\'images synchronisé de nuit',
				cost_hint: 'Inclus socle tooling'
			}
		],
		conflit: [],
		manque: []
	}
};

export const SUSE_TELCO_STATEMENTS: Statement[] = [
	{
		id: 'STMT-SUSE-01',
		section: '§2.1',
		triplet: { subject: 'suse_cni_sriov', predicate: 'network_acceleration', value: 'Multus CNI + SR-IOV Intel E810' },
		justification: { basedOn: ['DOC-SUSE-ARCH-01/§3.2.1'] },
		authority: { author: 'M. Israel', role: 'infra_expert_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L2_decomposed', confidence: 'designed' },
		revisability: { antecedents: [] },
		status: 'active',
		createdAt: '2026-09-20T10:00:00Z',
		updatedAt: '2026-09-20T10:00:00Z'
	},
	{
		id: 'STMT-SUSE-02',
		section: '§3.1',
		triplet: { subject: 'suse_rke2_hardened', predicate: 'compliance', value: 'CIS Kubernetes Benchmark Level 2' },
		justification: { basedOn: ['DOC-SUSE-RKE2-SEC/§2.4'] },
		authority: { author: 'Lead SecOps', role: 'security_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L3_decided', confidence: 'verified' },
		revisability: { antecedents: [] },
		status: 'active',
		createdAt: '2026-09-21T11:00:00Z',
		updatedAt: '2026-09-21T11:00:00Z'
	},
	{
		id: 'STMT-SUSE-03',
		section: '§2.2',
		triplet: { subject: 'suse_rt_kernel', predicate: 'os_kernel', value: 'SUSE Linux Enterprise Real Time (SLERT)' },
		justification: { basedOn: ['DOC-SUSE-ARCH-01/§4.1'] },
		authority: { author: 'P. Durand', role: 'infra_expert_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L1_framed', confidence: 'designed' },
		revisability: { antecedents: [] },
		status: 'active',
		createdAt: '2026-09-22T09:00:00Z',
		updatedAt: '2026-09-22T09:00:00Z'
	}
];

export const SUSE_TELCO_CORPUS: CorpusDocument[] = [
	{
		id: 'DOC-SUSE-ARCH-01',
		title: 'SUSE Telco Cloud · Architecture de Référence & Matrice de Compatibilité',
		origin: 'client',
		category: 'standard',
		categoryLabel: 'Architecture de Référence',
		sourceOrAuthor: 'SUSE Telco Engineering Team',
		version: 'v2.4',
		pageCount: 86,
		extractedClausesCount: 2,
		relatedSubjectIds: ['suse_cni_sriov', 'suse_rt_kernel', 'suse_rke2_hardened'],
		summary: 'Spécifications officielles pour le déploiement de CNF 5G critiques sur RKE2, SLERT et Rancher.',
		keyIdeas: [
			'Socle Kubernetes souverain et temps réel optimisé pour charges de travail télécoms haut débit.',
			'Séparation stricte du trafic OAM de gestion et du trafic utilisateur UPF sans contention.',
			'Déterminisme temporel absolu (gigue sub-milliseconde) via le noyau SLERT et l\'isolation des cœurs.'
		],
		inducedRules: [
			{
				id: 'RULE-SUSE-01',
				title: 'Double Adduction Réseau Multus CNI Obligatoire',
				type: 'obligation',
				description: 'Les pods CNF 5G doivent posséder une interface OAM et des VF SR-IOV dédiées au trafic données.',
				targetSubjectId: 'suse_cni_sriov'
			},
			{
				id: 'RULE-SUSE-02',
				title: 'Exécution sur Noyau Temps Réel SLERT',
				type: 'obligation',
				description: 'Les nœuds hébergeant les fonctions UPF et vDU doivent être configurés avec isolcpus et nohz_full.',
				targetSubjectId: 'suse_rt_kernel'
			}
		],
		keyClauses: [
			{
				id: 'CLAUSE-SUSE-01',
				clauseRef: '§3.2.1',
				title: 'Support Multus & SR-IOV',
				text: 'La plateforme doit obligatoirement fournir une double adduction réseau via Multus CNI pour séparer le trafic OAM du plan utilisateur UPF.',
				criticality: 'bloquant',
				impactSummary: 'Conditionne le choix des cartes NIC et du driver SR-IOV'
			},
			{
				id: 'CLAUSE-SUSE-02',
				clauseRef: '§4.1',
				title: 'Noyau Temps Réel SLERT',
				text: 'Pour les charges de travail O-RAN et UPF, le système hôte doit exécuter le noyau SUSE Linux Enterprise Real Time avec isolation CPU (isolcpus) et nohz_full.',
				criticality: 'bloquant',
				impactSummary: 'Garantit une latence de traitement déterministe inférieure à 20 µs'
			}
		],
		addedDate: '2026-09-20T00:00:00Z',
		lastUpdated: '2026-09-20T00:00:00Z'
	},
	{
		id: 'DOC-SUSE-RKE2-SEC',
		title: 'RKE2 Hardening & Conformité CIS Benchmark Level 2',
		origin: 'contributor_external',
		category: 'guideline',
		categoryLabel: 'Guide de Durcissement',
		sourceOrAuthor: 'Équipe Sécurité Archinex',
		contributorRole: 'security_architect',
		version: 'v1.4',
		pageCount: 38,
		extractedClausesCount: 1,
		relatedSubjectIds: ['suse_rke2_hardened', 'suse_neuvector_mesh'],
		summary: 'Guide opérationnel pour durcir les clusters RKE2 en conformité avec les exigences ANSSI / SecNumCloud et CIS Benchmark.',
		keyIdeas: [
			'Distribution Kubernetes durcie par défaut sans composants legacy superflus.',
			'Chiffrement systématique au repos des secrets etcd validé FIPS 140-3.',
			'Alignement complet sur les profils de conformité CIS Benchmark Level 2.'
		],
		inducedRules: [
			{
				id: 'RULE-SUSE-SEC-01',
				title: 'Chiffrement etcd FIPS 140-3',
				type: 'obligation',
				description: 'Interdiction de stocker des secrets en clair dans etcd. KMS ou clé FIPS exigée.',
				targetSubjectId: 'suse_rke2_hardened'
			}
		],
		keyClauses: [
			{
				id: 'CLAUSE-SUSE-SEC-01',
				clauseRef: '§2.4',
				title: 'FIPS 140-3 et Chiffrement etcd',
				text: 'Tous les secrets au repos dans etcd doivent être chiffrés avec AES-CBC ou KMS externe certifié FIPS 140-3.',
				criticality: 'bloquant'
			}
		],
		addedDate: '2026-09-21T00:00:00Z',
		lastUpdated: '2026-09-21T00:00:00Z'
	},
	{
		id: 'DOC-SUSE-NEUVECTOR',
		title: 'NeuVector Zero-Trust Container Security for Telco Cloud',
		origin: 'contributor_external',
		category: 'vendor_whitepaper',
		categoryLabel: 'Livre Blanc Éditeur',
		sourceOrAuthor: 'SUSE Security Labs',
		contributorRole: 'security_architect',
		version: 'v5.3',
		pageCount: 42,
		extractedClausesCount: 1,
		relatedSubjectIds: ['suse_neuvector_mesh'],
		summary: 'Inspection protocolaire profonde DPI (Deep Packet Inspection) et segmentation réseau L7 pour les microservices 5G SBA.',
		keyIdeas: [
			'Sécurité conteneur Zero-Trust sans injection de sidecars invasifs.',
			'Inspection protocolaire L7 en temps réel des interfaces 5G SBA (N2, N3, N4).',
			'Détection et blocage immédiat des flux latéraux non autorisés.'
		],
		inducedRules: [
			{
				id: 'RULE-SUSE-NV-01',
				title: 'Inspection DPI N2/N3 Transparente',
				type: 'obligation',
				description: 'L\'analyse comportementale des microservices SBA doit être faite en temps réel sans injection de sidecar invasif.',
				targetSubjectId: 'suse_neuvector_mesh'
			}
		],
		addedDate: '2026-09-22T00:00:00Z',
		lastUpdated: '2026-09-22T00:00:00Z',
		keyClauses: [
			{
				id: 'CLAUSE-SUSE-NV-01',
				clauseRef: '§5.2',
				title: 'Inspection DPI N2/N3 sans agent hôte',
				text: 'L\'inspection des paquets SBA doit s\'effectuer en couche de routage conteneur sans modifier les binaires CNF opérateurs.',
				criticality: 'majeur'
			}
		]
	}
];

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRE DES DISCUSSIONS EXPERTS PAR ENGAGEMENT & SUJET
// ─────────────────────────────────────────────────────────────────────────────

export const SUSE_TELCO_DIALOGUE_MESSAGES: DialogueMessage[] = [
	{
		id: 'msg-suse-01',
		channel: 'internal',
		author: 'P. Durand',
		role: 'infra_expert_architect',
		content: 'Sur le socle SUSE, nous devons impérativement activer Multus CNI et l\'opérateur SR-IOV pour isoler le plan utilisateur UPF du trafic OAM de gestion.',
		timestamp: '09:45',
		isAi: false,
		subjectId: 'suse_cni_sriov'
	},
	{
		id: 'msg-suse-02',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'Validé pour Multus SR-IOV, sous réserve que NeuVector inspecte les interfaces N2/N3 en couche L7 sans injection de sidecar invasif dans les pods UPF.',
		timestamp: '09:50',
		isAi: false,
		subjectId: 'suse_cni_sriov'
	},
	{
		id: 'msg-suse-03',
		channel: 'internal',
		author: 'M. Israel (Lead Architect)',
		role: 'lead_architect',
		content: 'D\'accord avec la séparation Multus. Pour le DPDK, nous fixons 4 cœurs isolés par nœud worker edge.',
		timestamp: '09:55',
		isAi: false,
		subjectId: 'suse_cni_sriov'
	},
	{
		id: 'msg-suse-rt-01',
		channel: 'internal',
		author: 'P. Durand',
		role: 'infra_expert_architect',
		content: 'Pour le profil temps réel SLERT (kernel PREEMPT_RT), les tests montrent une gigue maximale de 12 µs avec isolcpus=2-7 et nohz_full=2-7.',
		timestamp: '10:05',
		isAi: false,
		subjectId: 'suse_rt_kernel'
	},
	{
		id: 'msg-suse-rt-02',
		channel: 'internal',
		author: 'M. Israel (Lead Architect)',
		role: 'lead_architect',
		content: 'Ce profil SLERT est conforme aux exigences O-RAN FH. Nous verrouillons l\'hypothèse de dimensionnement.',
		timestamp: '10:10',
		isAi: false,
		subjectId: 'suse_rt_kernel'
	},
	{
		id: 'msg-suse-rke2-01',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'Le profil de durcissement CIS Benchmark L2 est appliqué via les profils RKE2 natifs. Chiffrement etcd activé avec clés AES-CBC.',
		timestamp: '10:15',
		isAi: false,
		subjectId: 'suse_rke2_hardened'
	},
	{
		id: 'msg-suse-nv-01',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'Le contrôleur NeuVector doit être déployé en mode Enforce sur le cluster d\'administration et en mode Monitor initial sur les nœuds radio edge.',
		timestamp: '10:30',
		isAi: false,
		subjectId: 'suse_neuvector_mesh'
	}
];

export const CCTP_DIALOGUE_MESSAGES: DialogueMessage[] = [
	{
		id: 'msg-sync-01',
		channel: 'internal',
		author: 'P. Durand',
		role: 'infra_expert_architect',
		content: 'Sur le site nodal, le surcoût de 180 k€ pour le double rubidium 30 jours absorbe 50% de notre enveloppe CAPEX. La variante B (GNSS durci + NTP secouru) permet d\'économiser 135 k€.',
		timestamp: '10:14',
		isAi: false,
		subjectId: 'sub_sync'
	},
	{
		id: 'msg-sync-02',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'Attention : sous NIS2 et selon le CCTP Art. 4.2.1, l\'ANSSI refuse tout risque de désynchronisation de phase en bande TDD. Le holdover 30 jours sans signal satellite est non négociable pour les 4 nœuds nodaux.',
		timestamp: '10:18',
		isAi: false,
		subjectId: 'sub_sync'
	},
	{
		id: 'msg-sync-03',
		channel: 'internal',
		author: 'Lead Architect',
		role: 'lead_architect',
		content: 'Proposition de compromis : nous confirmons l\'Option A (Rubidium 30j) sur les 4 nœuds nodaux centraux, et nous autorisons la variante B sur les relais secondaires pour respecter le budget.',
		timestamp: '10:22',
		isAi: false,
		subjectId: 'sub_sync'
	},
	{
		id: 'msg-dc-01',
		channel: 'internal',
		author: 'P. Durand',
		role: 'infra_expert_architect',
		content: 'L\'autonomie électrique 72h impose l\'installation de cuves fioul enterrées ICPE (+95 k€). Sommes-nous prêts à engager ce surcoût ?',
		timestamp: '08:30',
		isAi: false,
		subjectId: 'sub_dc_resilience'
	},
	{
		id: 'msg-dc-02',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'L\'obligation NIS2 Art. 21 impose la redondance d\'alimentation sur site sensible. Une cuve tampon avec accord préfectoral est impérative.',
		timestamp: '08:45',
		isAi: false,
		subjectId: 'sub_dc_resilience'
	},
	{
		id: 'msg-pqc-01',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'Pour les flux inter-sites N2/N3, l\'ANSSI préconise un chiffrement hybride classique + ML-KEM (Kyber-768). Les cartes crypto accélèrent le débit sans surcoût CPU.',
		timestamp: '11:15',
		isAi: false,
		subjectId: 'sub_pqc'
	},
	{
		id: 'msg-core-01',
		channel: 'internal',
		author: 'P. Durand',
		role: 'infra_expert_architect',
		content: 'Le découpage de réseau (network slicing) requiert l\'isolation stricte des files d\'attente UPF pour les tranches tactiques PPDR.',
		timestamp: '11:30',
		isAi: false,
		subjectId: 'sub_core'
	},
	{
		id: 'msg-core-02',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'L\'ANSSI exige des garanties formelles sur le non-débordement des files mémoire entre la tranche régalienne PPDR (5QI 65) et la tranche ouverte. Si nous mutualisons l\'UPF physique, une qualification de cloisonnement CSPN est requise.',
		timestamp: '11:34',
		isAi: false,
		subjectId: 'sub_core'
	},
	{
		id: 'msg-core-03',
		channel: 'internal',
		author: 'Lead Architect',
		role: 'lead_architect',
		content: 'Deux options s\'offrent à nous : l\'Option A (UPF dédié physique, +85 k€ de matériel mais zéro risque réglementaire) ou l\'Option B (Slicing logique avec Dynamic QoS). Quel est le temps d\'obtention de la qualification CSPN ?',
		timestamp: '11:40',
		isAi: false,
		subjectId: 'sub_core'
	},
	{
		id: 'msg-core-04',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'Le délai d\'évaluation CESTI est estimé à 6 mois. Si le calendrier de mise en service opérationnelle est T2 2027, l\'Option A avec serveurs nodaux dédiés reste la plus sûre.',
		timestamp: '11:45',
		isAi: false,
		subjectId: 'sub_core'
	},
	{
		id: 'msg-ppdr-01',
		channel: 'internal',
		author: 'Lead Architect',
		role: 'lead_architect',
		content: 'Le CCTP impose des terminaux utilisables avec gants d\'intervention et bouton PTT mécanique. Les retours terrain confirment que les écrans tactiles purs sous la pluie sont inopérants.',
		timestamp: '14:05',
		isAi: false,
		subjectId: 'sub_ppdr'
	},
	{
		id: 'msg-ppdr-02',
		channel: 'internal',
		author: 'P. Durand',
		role: 'infra_expert_architect',
		content: 'La flotte de terminaux propriétaires ultra-durcis pèse lourd dans l\'enveloppe budgétaire. La variante B (smartphones durcis COTS sous Android Enterprise avec bouton PTT externe) permet d\'économiser 95 k€.',
		timestamp: '14:15',
		isAi: false,
		subjectId: 'sub_ppdr'
	},
	{
		id: 'msg-ppdr-03',
		channel: 'internal',
		author: 'S. Bernard',
		role: 'security_architect',
		content: 'Attention aux mises à jour de sécurité Android : les terminaux COTS ont souvent un cycle de vie OS de seulement 3 ans, contre 7 ans pour les terminaux radio professionnels scellés.',
		timestamp: '14:22',
		isAi: false,
		subjectId: 'sub_ppdr'
	},
	{
		id: 'msg-radio-01',
		channel: 'internal',
		author: 'P. Durand',
		role: 'infra_expert_architect',
		content: 'Pour atteindre les 98% de couverture géographique exigés par l\'Art 4.3, nous devons soit ériger 12 nouveaux pylônes 700 MHz (+240 k€), soit contractualiser une itinérance prioritaire sur un opérateur commercial.',
		timestamp: '15:10',
		isAi: false,
		subjectId: 'sub_radio'
	},
	{
		id: 'msg-radio-02',
		channel: 'internal',
		author: 'Lead Architect',
		role: 'lead_architect',
		content: 'L\'itinérance commerciale peut servir de filet de secours (Variante B), mais le cœur de zone doit impérativement disposer d\'une couverture propre en n28/n78 pour préserver la souveraineté.',
		timestamp: '15:20',
		isAi: false,
		subjectId: 'sub_radio'
	}
];

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRE DES ENGAGEMENTS DISPONIBLES
// ─────────────────────────────────────────────────────────────────────────────

export function createDefaultEngagements(
	initialCctpSubjects: MaturitySubject[],
	initialCctpDrafts: Record<string, TelegraphicDraft>,
	initialCctpStatements: Statement[],
	initialCctpMessages: DialogueMessage[] = CCTP_DIALOGUE_MESSAGES
): EngagementProfile[] {
	return [
		{
			id: 'suse-telco-cloud-generic',
			title: 'SUSE Telco Cloud (Architecture Générique)',
			shortName: 'SUSE Telco Cloud',
			type: 'generic_blueprint',
			badge: 'SUSE Telco Cloud · Baseline',
			description: 'Patrimoine d\'architecture vierge pour concevoir une pile Telco Cloud souveraine (Rancher, RKE2, SLERT, NeuVector, Harvester). 100% Local.',
			defaultSubjectId: 'suse_cni_sriov',
			defaultDocId: 'DOC-SUSE-ARCH-01',
			subjects: SUSE_TELCO_SUBJECTS,
			drafts: SUSE_TELCO_DRAFTS,
			statements: SUSE_TELCO_STATEMENTS,
			corpusDocuments: SUSE_TELCO_CORPUS,
			dialogueMessages: SUSE_TELCO_DIALOGUE_MESSAGES
		},
		{
			id: 'cctp-mcx-nordwave',
			title: 'CCTP 5G & MCX (Projet Réel RFP)',
			shortName: 'CCTP 5G & MCX',
			type: 'project_rfp',
			badge: 'CCTP 5G & CŒUR · RFP Réel',
			description: 'Appel d\'offres contractuel client : réseau fédérateur critique, tranches hybrides MCX, contraintes de résilience et arbitrages 3GPP.',
			defaultSubjectId: 'sub_sync',
			defaultDocId: 'DOC-CLI-01',
			subjects: initialCctpSubjects,
			drafts: initialCctpDrafts,
			statements: initialCctpStatements,
			corpusDocuments: INITIAL_CORPUS_DOCUMENTS,
			dialogueMessages: initialCctpMessages
		}
	];
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI-APP : TYPES, PRÉSETS ET GÉNÉRATEUR D'ESPACE DE TRAVAIL (PROJET)
// ─────────────────────────────────────────────────────────────────────────────

export interface UpstreamDocInput {
	id?: string;
	title: string;
	category: DocumentCategory;
	categoryLabel?: string;
	sourceOrAuthor: string;
	version?: string;
	pageCount?: number;
	summary: string;
	keyIdeas?: string[];
	clauses?: Array<{
		clauseRef: string;
		title: string;
		text: string;
		criticality: 'bloquant' | 'majeur' | 'info';
		impactSummary?: string;
	}>;
}

export interface InitialSubjectInput {
	id?: string;
	sectionRef?: string;
	name: string;
	waitingForRole: ArchitectRole;
	effort?: 'S' | 'M' | 'L' | 'XL';
	initialRetenu?: string[];
	initialHypothesis?: string;
	initialConflict?: string;
	initialQuestion?: string;
}

export interface WorkspaceCreationInput {
	id?: string;
	title: string;
	shortName?: string;
	type: EngagementType;
	badge?: string;
	description: string;
	strategy: ProjectStrategy;
	participants: ProjectParticipant[];
	upstreamDocuments?: UpstreamDocInput[];
	linkedStandardIds?: string[];
	initialSubjects?: InitialSubjectInput[];
}

export const DEFAULT_PARTICIPANTS: ProjectParticipant[] = [
	{
		id: 'part-lead',
		name: 'M. Israel',
		role: 'lead_architect',
		email: 'm.israel@archinex.local',
		isLead: true
	},
	{
		id: 'part-infra',
		name: 'P. Durand',
		role: 'infra_expert_architect',
		email: 'p.durand@archinex.local'
	},
	{
		id: 'part-sec',
		name: 'S. Bernard',
		role: 'security_architect',
		email: 's.bernard@archinex.local'
	},
	{
		id: 'part-domain',
		name: 'A. Chen',
		role: 'domain_architect',
		email: 'a.chen@archinex.local'
	}
];

export const WORKSPACE_PRESETS: Array<{
	id: string;
	name: string;
	description: string;
	preset: WorkspaceCreationInput;
}> = [
	{
		id: 'frmcs-rail',
		name: 'Réseau Ferroviaire Sécurisé (FRMCS)',
		description: 'Déploiement FRMCS Lot Télécom & Sol-Bord pour circulation ferroviaire à haute densité.',
		preset: {
			id: 'frmcs-rail-2027',
			title: 'Système FRMCS Ferroviaire · Lot Sol-Bord & Cœur Télécom',
			shortName: 'FRMCS Sol-Bord',
			type: 'project_rfp',
			badge: 'FRMCS · RFP Haute Criticité',
			description: 'Appel d\'offres réseau critique ferroviaire : transition GSM-R vers 5G SA FRMCS, double adduction et temps de bascule sub-50ms.',
			strategy: {
				objectives: [
					'Zéro coupure de signalisation ETCS Niveau 2/3',
					'Latence sol-bord < 10 ms garantie à 320 km/h',
					'Hébergement 100% souverain certifié SecNumCloud'
				],
				principles: [
					'Double couverture radio géoredondante étanche',
					'Chiffrement hybride post-quantique sur liaisons critiques',
					'Validation formelle des énoncés sans complaisance'
				],
				constraints: [
					'Plafond budgétaire infrastructure 2.4 M€',
					'Mise en service pilote T4 2027',
					'Interdiction de tout protocole propriétaire non interopérable'
				],
				targetDate: '2027-12-15',
				budget: '2.4 M€'
			},
			participants: DEFAULT_PARTICIPANTS,
			upstreamDocuments: [
				{
					title: 'CCTP Lot 1 · Infrastructure Télécom Ferroviaire & Transmission Bord',
					category: 'cctp',
					categoryLabel: 'CCTP Contractuel',
					sourceOrAuthor: 'Direction de l\'Ingénierie Ferroviaire (MOA)',
					version: 'v1.3',
					pageCount: 160,
					summary: 'Cahier des charges pour le remplacement du réseau GSM-R par la norme 5G FRMCS sur les lignes à grande vitesse.',
					keyIdeas: [
						'Continuité de transmission impérative pour la signalisation des circulations.',
						'Étanchéité totale des flux de sécurité sol-bord vis-à-vis des services passagers.'
					],
					clauses: [
						{
							clauseRef: 'Art. 3.1.4',
							title: 'Gigue temporelle sol-bord',
							text: 'La gigue temporelle entre stations de base et antennes embarquées ne doit pas excéder 500 µs.',
							criticality: 'bloquant',
							impactSummary: 'Conditionne le choix du profil PTP ferroviaire'
						},
						{
							clauseRef: 'Art. 5.2.1',
							title: 'Redondance des centres de contrôle',
							text: 'Les deux cœurs de réseau nodaux doivent être distants d\'au moins 80 km avec bascule sans perte de contexte.',
							criticality: 'bloquant',
							impactSummary: 'Impose une double adduction optique active-active'
						}
					]
				}
			],
			linkedStandardIds: ['DOC-EXT-01', 'DOC-EXT-02', 'DOC-EXT-03'],
			initialSubjects: [
				{
					sectionRef: '§2.1',
					name: 'Synchronisation Sol-Bord PTP & Holdover',
					waitingForRole: 'infra_expert_architect',
					effort: 'M',
					initialRetenu: ['Horloge atomique Rubidium sol', 'Profil PTP G.8275.1'],
					initialHypothesis: 'Holdover de 14 jours suffisant sur tronçon secondaire',
					initialConflict: 'Option double rubidium (+120 k€) vs GNSS secouru',
					initialQuestion: 'Quel niveau de gigue toléré par le module ETCS embarqué ?'
				},
				{
					sectionRef: '§3.1',
					name: 'Cœur 5G SA Hybride & Tranches Prioritaires',
					waitingForRole: 'lead_architect',
					effort: 'L',
					initialRetenu: ['Tranche MCX dédiée signalisation ferroviaire'],
					initialHypothesis: 'Priorité préemptive ARP niveau 1 sur tous les relais radio',
					initialQuestion: 'Bande de fréquence 1900 MHz harmonisée UIC garantie ?'
				},
				{
					sectionRef: '§4.1',
					name: 'Chiffrement PQC & Conformité Homologation Défense',
					waitingForRole: 'security_architect',
					effort: 'S',
					initialRetenu: ['Tunnel IPsec durci ML-KEM + AES-GCM'],
					initialHypothesis: 'Chiffrement en couche 2 transparent sans impacter le débit',
					initialQuestion: 'Validation préalable ANSSI requise avant déploiement bord ?'
				}
			]
		}
	},
	{
		id: 'cloud-souverain',
		name: 'Cloud Souverain & IA Régulée (Défense/Santé)',
		description: 'Socle d\'architecture de référence pour hébergement sécurisé SecNumCloud et inférence IA locale.',
		preset: {
			id: 'cloud-souverain-ia',
			title: 'Socle Cloud Souverain & Plateforme d\'Inférence IA Régulée',
			shortName: 'Cloud Souverain IA',
			type: 'generic_blueprint',
			badge: 'CLOUD IA · Blueprint Souverain',
			description: 'Patrimoine d\'architecture pour déploiement d\'infrastructures air-gapped, conformité SecNumCloud 3.2 et orchestration d\'agents IA sous contrainte étatique.',
			strategy: {
				objectives: [
					'Isolation physique totale (Air-gapped ou enclave certifiée)',
					'Interdiction absolue de télémétrie vers des tiers non souverains',
					'Vérification formelle des inférences et traçabilité causale'
				],
				principles: [
					'Zero-Trust strict au niveau conteneur et micro-segmentation',
					'Approche reproductible GitOps avec signatures Sigstore',
					'Multi-tenancy étanche et journalisation immuable WORM'
				],
				constraints: [
					'Qualification SecNumCloud 3.2 exigée',
					'Serveurs certifiés ANSSI / FIPS 140-3',
					'Conformité Directive NIS2 entité essentielle'
				],
				targetDate: '2027-06-30',
				budget: '1.8 M€'
			},
			participants: DEFAULT_PARTICIPANTS,
			upstreamDocuments: [
				{
					title: 'Référentiel d\'Exigences Cloud Souverain & Enclave Sécurisée',
					category: 'regulation',
					categoryLabel: 'Référentiel Étatique',
					sourceOrAuthor: 'Agence Nationale de la Sécurité des Systèmes d\'Information',
					version: 'v3.2',
					pageCount: 110,
					summary: 'Critères de qualification SecNumCloud pour l\'hébergement de données d\'intérêt public et sensibles.',
					clauses: [
						{
							clauseRef: 'SecNumCloud §5.1',
							title: 'Immunité extraterritoriale',
							text: 'L\'opérateur et ses sous-traitants doivent être immunisés contre toute loi à portée extraterritoriale étrangère.',
							criticality: 'bloquant',
							impactSummary: 'Exclut l\'usage de services gérés sous Cloud Act'
						}
					]
				}
			],
			linkedStandardIds: ['DOC-EXT-03', 'DOC-EXT-04', 'DOC-SUSE-RKE2-SEC'],
			initialSubjects: [
				{
					sectionRef: '§2.1',
					name: 'Enclave de Calcul & Chiffrement Confidentiel',
					waitingForRole: 'security_architect',
					effort: 'M',
					initialRetenu: ['AMD SEV-SNP confidential computing', 'Chiffrement mémoire matériel'],
					initialQuestion: 'Pénalité CPU estimée lors de l\'inférence LLM en enclave ?'
				},
				{
					sectionRef: '§3.1',
					name: 'Socle Kubernetes & Registre GitOps Air-gapped',
					waitingForRole: 'infra_expert_architect',
					effort: 'L',
					initialRetenu: ['Cluster RKE2 durci FIPS 140-3', 'Miroir d\'images signé'],
					initialQuestion: 'Procédure de mise à jour des modèles sans accès internet direct ?'
				}
			]
		}
	}
];

export function buildEngagementProfileFromWorkspaceInput(
	input: WorkspaceCreationInput,
	availableCommonStandards: CorpusDocument[] = []
): {
	engagement: EngagementProfile;
	newUpstreamDocuments: CorpusDocument[];
} {
	const cleanId =
		(input.id || input.title)
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || `workspace-${Date.now()}`;

	const shortName = input.shortName?.trim() || (input.title.length > 22 ? input.title.slice(0, 20) + '…' : input.title);
	const badge =
		input.badge?.trim() ||
		`${shortName.toUpperCase()} · ${
			input.type === 'project_rfp'
				? 'RFP Réel'
				: input.type === 'generic_blueprint'
					? 'Socle Blueprint'
					: input.type === 'audit_resilience'
						? 'Audit NIS2'
						: 'POC & Cadrage'
		}`;

	// 1. Transformer les documents amonts fournis
	const newUpstreamDocuments: CorpusDocument[] = (input.upstreamDocuments || []).map((doc, idx) => {
		const docId = doc.id?.trim() || `DOC-${cleanId.toUpperCase()}-${String(idx + 1).padStart(2, '0')}`;
		const clauses = (doc.clauses || []).map((c, cIdx) => ({
			id: `cl-${cleanId}-${idx + 1}-${cIdx + 1}`,
			clauseRef: c.clauseRef,
			title: c.title,
			text: c.text,
			criticality: c.criticality,
			impactSummary: c.impactSummary || `Exigence amont projet ${shortName}`
		}));

		return {
			id: docId,
			title: doc.title,
			origin: 'client',
			category: doc.category,
			categoryLabel: doc.categoryLabel || 'Document Amont Projet',
			sourceOrAuthor: doc.sourceOrAuthor || 'Donneur d\'ordre / MOA',
			version: doc.version || 'v1.0',
			pageCount: doc.pageCount || 40,
			extractedClausesCount: clauses.length,
			relatedSubjectIds: [],
			summary: doc.summary,
			keyIdeas: doc.keyIdeas || [doc.summary],
			keyClauses: clauses,
			isGlobalStandard: false,
			engagementIds: [cleanId],
			addedDate: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		};
	});

	// 2. Sélectionner les standards liés dans le patrimoine commun
	const linkedStandards =
		input.linkedStandardIds && input.linkedStandardIds.length > 0
			? availableCommonStandards.filter((s) => input.linkedStandardIds!.includes(s.id))
			: availableCommonStandards.filter((s) => s.isGlobalStandard || s.origin === 'contributor_external');

	// 3. Sujets initiaux de réflexion
	const initialSubjectInputs =
		input.initialSubjects && input.initialSubjects.length > 0
			? input.initialSubjects
			: [
					{
						sectionRef: '§1.1',
						name: 'Cadrage Stratégique & Exigences Globales',
						waitingForRole: 'lead_architect' as ArchitectRole,
						effort: 'M' as const,
						initialRetenu:
							input.strategy.principles.length > 0
								? [input.strategy.principles[0]]
								: ['Validation formelle des principes'],
						initialHypothesis:
							input.strategy.objectives.length > 0
								? input.strategy.objectives[0]
								: 'Objectifs prioritaires validés',
						initialQuestion: 'Quels sont les jalons de validation du comité de direction ?'
					},
					{
						sectionRef: '§2.1',
						name: 'Architecture Cible & Composants Centraux',
						waitingForRole: 'infra_expert_architect' as ArchitectRole,
						effort: 'L' as const,
						initialRetenu: ['Architecture hautement disponible N+1'],
						initialHypothesis: 'Hébergement souverain sans dépendance hyperscaler',
						initialQuestion: 'Quelle matrice de compatibilité matérielle minimale ?'
					},
					{
						sectionRef: '§3.1',
						name: 'Sécurité Zero-Trust & Homologation Réglementaire',
						waitingForRole: 'security_architect' as ArchitectRole,
						effort: 'M' as const,
						initialRetenu: ['Chiffrement systématique au repos et en transit'],
						initialHypothesis: 'Conformité NIS2 et guide d\'hygiène ANSSI',
						initialQuestion: 'Quelles exigences de chiffrement pour les flux d\'administration ?'
					}
			  ];

	const subjects: MaturitySubject[] = [];
	const drafts: Record<string, TelegraphicDraft> = {};
	const initialStatements: Statement[] = [];

	initialSubjectInputs.forEach((sInput, idx) => {
		const sId = sInput.id || `sub_${cleanId}_${idx + 1}`;
		const sectionRef = sInput.sectionRef || `§${idx + 1}.1`;

		subjects.push({
			id: sId,
			section_ref: sectionRef,
			name: sInput.name,
			level: idx === 0 ? 'L1_framed' : 'L0_named',
			blocking_count: 0,
			unlocks_count: Math.max(0, initialSubjectInputs.length - 1 - idx),
			waiting_for_role: sInput.waitingForRole,
			relative_effort: sInput.effort || 'M',
			last_transition_date: new Date().toISOString(),
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: []
		});

		drafts[sId] = {
			section_id: sectionRef,
			subject: sInput.name,
			maturity: idx === 0 ? 'L1_framed' : 'L0_named',
			is_provisional: true,
			retenu:
				sInput.initialRetenu && sInput.initialRetenu.length > 0
					? sInput.initialRetenu
					: [`${shortName} : Spécification initiale`],
			suppose: sInput.initialHypothesis
				? [
						{
							text: sInput.initialHypothesis,
							consequence: 'Conditionne la validation des dépendances en aval',
							cost_hint: 'À arbitrer'
						}
				  ]
				: [],
			conflit: sInput.initialConflict
				? [
						{
							text: sInput.initialConflict,
							opposing_reference: 'À instruire en séance',
							requires_arbitration: true
						}
				  ]
				: [],
			manque: sInput.initialQuestion
				? [
						{
							id: `Q-${cleanId.toUpperCase()}-${idx + 1}`,
							question: sInput.initialQuestion,
							assigned_role: sInput.waitingForRole
						}
				  ]
				: []
		};
	});

	// Relier les documents amonts aux sujets créés
	const subjectIds = subjects.map((s) => s.id);
	newUpstreamDocuments.forEach((doc) => {
		doc.relatedSubjectIds = subjectIds;
	});

	// Énoncé initial
	if (subjects.length > 0) {
		const firstDoc = newUpstreamDocuments[0] || linkedStandards[0];
		initialStatements.push({
			id: `STMT-${cleanId.toUpperCase()}-01`,
			section: subjects[0].section_ref,
			triplet: {
				subject: subjects[0].id,
				predicate: 'strategic_alignment',
				value: input.strategy.objectives[0] || input.title
			},
			justification: { basedOn: firstDoc ? [firstDoc.id] : [] },
			authority: {
				author: input.participants.find((p) => p.isLead)?.name || 'Lead Architect',
				role: 'lead_architect',
				productionMode: 'human-authored'
			},
			maturity: { subjectLevel: 'L1_framed', confidence: 'designed' },
			revisability: { antecedents: [] },
			status: 'active',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	// Message dialectique d'ouverture
	const leadParticipant =
		input.participants.find((p) => p.isLead) ||
		input.participants[0] || { name: 'Lead Architect', role: 'lead_architect' as const };
	const dialogueMessages: DialogueMessage[] = [
		{
			id: `msg-${cleanId}-01`,
			channel: 'internal',
			author: `${leadParticipant.name} (Lead Architect)`,
			role: 'lead_architect',
			content: `Ouverture de l'espace de délibération pour le projet "${input.title}". Objectifs stratégiques : ${input.strategy.objectives.join(' ; ')}. Documents amonts enregistrés et versés au patrimoine commun. Début de l'instruction sur les premiers sujets.`,
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			isAi: false,
			subjectId: subjects[0]?.id
		}
	];

	// Tous les documents disponibles pour cet engagement = amonts + standards liés
	const corpusDocuments: CorpusDocument[] = [...newUpstreamDocuments, ...linkedStandards];

	const engagement: EngagementProfile = {
		id: cleanId,
		title: input.title,
		shortName,
		type: input.type,
		badge,
		description: input.description,
		defaultSubjectId: subjects[0]?.id || 'sub_default',
		defaultDocId: corpusDocuments[0]?.id || 'doc_default',
		strategy: input.strategy,
		participants: input.participants,
		subjects,
		drafts,
		statements: initialStatements,
		corpusDocuments,
		dialogueMessages,
		createdAt: new Date().toISOString()
	};

	return {
		engagement,
		newUpstreamDocuments
	};
}

