import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import type { CorpusDocument } from '$lib/domain/corpus';
import { INITIAL_CORPUS_DOCUMENTS } from '$lib/domain/corpus';

export interface EngagementProfile {
	id: string;
	title: string;
	shortName: string;
	type: 'generic_blueprint' | 'project_rfp';
	badge: string;
	description: string;
	defaultSubjectId: string;
	defaultDocId: string;
	subjects: MaturitySubject[];
	drafts: Record<string, TelegraphicDraft>;
	statements: Statement[];
	corpusDocuments: CorpusDocument[];
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
// REGISTRE DES ENGAGEMENTS DISPONIBLES
// ─────────────────────────────────────────────────────────────────────────────

export function createDefaultEngagements(initialCctpSubjects: MaturitySubject[], initialCctpDrafts: Record<string, TelegraphicDraft>, initialCctpStatements: Statement[]): EngagementProfile[] {
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
			corpusDocuments: SUSE_TELCO_CORPUS
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
			corpusDocuments: INITIAL_CORPUS_DOCUMENTS
		}
	];
}
