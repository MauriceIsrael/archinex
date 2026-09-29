import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement, ArchitectRole } from '$lib/types/epistemic';
import type { CorpusDocument, DocumentCategory } from '$lib/domain/corpus';
import type { DialogueMessage } from '$lib/domain/dialectic';

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
	status?: 'active' | 'archived';
	archivedAt?: string;
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
		name: 'Architecte Référent',
		role: 'lead_architect',
		email: 'lead@archinex.local',
		isLead: true
	},
	{
		id: 'part-infra',
		name: 'Architecte Infrastructure',
		role: 'infra_expert_architect',
		email: 'infra@archinex.local'
	},
	{
		id: 'part-sec',
		name: 'Architecte Sécurité',
		role: 'security_architect',
		email: 'security@archinex.local'
	},
	{
		id: 'part-domain',
		name: 'Architecte Métier',
		role: 'domain_architect',
		email: 'domain@archinex.local'
	}
];

export const WORKSPACE_PRESETS: Array<{
	id: string;
	name: string;
	description: string;
	preset: WorkspaceCreationInput;
}> = [
	{
		id: 'rail-transport',
		name: 'Système de Transport Ferroviaire Sécurisé',
		description: 'Déploiement télécom & transmission sol-bord pour circulation à haute densité.',
		preset: {
			id: 'rail-transport-2027',
			title: 'Système Ferroviaire · Lot Sol-Bord & Cœur Télécom',
			shortName: 'Transport Ferroviaire',
			type: 'project_rfp',
			badge: 'RAIL · RFP Haute Criticité',
			description: 'Appel d\'offres réseau critique ferroviaire : transition vers 5G SA, double adduction et bascule sub-50ms.',
			strategy: {
				objectives: [
					'Zéro coupure de signalisation sol-bord',
					'Latence sol-bord < 10 ms garantie à 320 km/h',
					'Hébergement souverain certifié'
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
					summary: 'Cahier des charges pour le réseau télécom ferroviaire sol-bord sur lignes à grande vitesse.',
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
							impactSummary: 'Conditionne le choix du profil de synchronisation'
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
					name: 'Synchronisation Sol-Bord & Maintien Temporel',
					waitingForRole: 'infra_expert_architect',
					effort: 'M',
					initialRetenu: ['Horloge atomique sol haute précision', 'Profil temporel télécom standard'],
					initialHypothesis: 'Autonomie de maintien de 14 jours suffisante sur tronçon secondaire',
					initialConflict: 'Option double oscillateur secouru vs GNSS secouru',
					initialQuestion: 'Quel niveau de gigue toléré par le module embarqué ?'
				},
				{
					sectionRef: '§3.1',
					name: 'Cœur 5G SA Hybride & Tranches Prioritaires',
					waitingForRole: 'lead_architect',
					effort: 'L',
					initialRetenu: ['Tranche mission-critique dédiée signalisation ferroviaire'],
					initialHypothesis: 'Priorité préemptive ARP niveau 1 sur tous les relais radio',
					initialQuestion: 'Bande de fréquence harmonisée garantie ?'
				},
				{
					sectionRef: '§4.1',
					name: 'Chiffrement PQC & Homologation de Sécurité',
					waitingForRole: 'security_architect',
					effort: 'S',
					initialRetenu: ['Tunnel IPsec durci ML-KEM + AES-GCM'],
					initialHypothesis: 'Chiffrement en couche 2 transparent sans impacter le débit',
					initialQuestion: 'Validation préalable requise avant déploiement bord ?'
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
			linkedStandardIds: ['DOC-EXT-03', 'DOC-EXT-04'],
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
					initialRetenu: ['Cluster Kubernetes durci FIPS 140-3', 'Miroir d\'images signé'],
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
