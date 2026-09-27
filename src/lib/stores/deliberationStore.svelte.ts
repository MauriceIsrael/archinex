import type { MaturityLevel, ArchitectRole, Statement } from '$lib/types/epistemic';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import {
	sortMaturityBoard,
	resolveSubjectArbitration,
	canTransitionMaturity,
	type MaturitySubject
} from '$lib/domain/maturityBoard';
import {
	captureTextDiffAsStatement,
	createVariantExclusionStatement
} from '$lib/domain/diffSensor';
import {
	detectProactiveDoctrineRecalls,
	type DialogueMessage,
	type DoctrineRecallRule
} from '$lib/domain/dialectic';
import { executeRetractionCascade, findTransitiveDependents, buildCausalDAG } from '$lib/domain/retractation';
import {
	canFreezeSection,
	freezeSectionAndGenerateSnapshot,
	type SealedSnapshot,
	type FreezeGatingResult
} from '$lib/domain/freezeExport';
import {
	generateMermaidDiagram,
	generateStructurizrDSL,
	generateStructurizrVisualMermaid,
	generateSysMLv2,
	generateSysMLVisualMermaid,
	generatePtpConfigJSON
} from '$lib/domain/artifactProjections';
import {
	type CandidateRule,
	INITIAL_CANDIDATE_RULES
} from '$lib/domain/smartMemoryRules';
import {
	type CorpusDocument,
	type CorpusStats,
	type DocumentOrigin,
	type DocumentCategory,
	type ExtractedClause,
	INITIAL_CORPUS_DOCUMENTS,
	computeCorpusStats
} from '$lib/domain/corpus';
import {
	createDefaultEngagements,
	type EngagementProfile,
	type WorkspaceCreationInput,
	buildEngagementProfileFromWorkspaceInput,
	SUSE_TELCO_SUBJECTS,
	SUSE_TELCO_DRAFTS,
	SUSE_TELCO_STATEMENTS,
	SUSE_TELCO_CORPUS,
	SUSE_TELCO_DIALOGUE_MESSAGES,
	CCTP_DIALOGUE_MESSAGES
} from '$lib/domain/engagements';
import type {
	LLMOpsHealth,
	LLMOpsSyncPayload,
	LLMOpsConflict,
	LLMOpsBoardItem,
	LLMOpsStatement
} from '$lib/types/llmops';

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

const INITIAL_STATEMENTS: Statement[] = [
	{
		id: 'S-0031',
		section: '§3.1',
		triplet: { subject: 'sub_dc_resilience', predicate: 'power_redundancy', value: 'Double adduction secourue 72h' },
		justification: { basedOn: ['KH:ADR-0008'] },
		authority: { author: 'M. Israel', role: 'infra_expert_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L0_named', confidence: 'designed' },
		revisability: { antecedents: ['KH:ADR-0008'] },
		status: 'active',
		createdAt: '2026-09-01T10:00:00Z',
		updatedAt: '2026-09-01T10:00:00Z'
	},
	{
		id: 'S-0042',
		section: '§4.2',
		triplet: { subject: 'sub_sync', predicate: 'holdover', value: 'Holdover ≥ 30 j sans GNSS' },
		justification: { basedOn: ['S-0031', 'KH:ADR-0014'] },
		authority: { author: 'P. Durand', role: 'infra_expert_architect', productionMode: 'human-authored' },
		maturity: { subjectLevel: 'L2_decomposed', confidence: 'designed' },
		revisability: { antecedents: ['S-0031'] },
		status: 'active',
		createdAt: '2026-09-02T14:30:00Z',
		updatedAt: '2026-09-02T14:30:00Z'
	}
];

class DeliberationStore {
	engagements = $state<EngagementProfile[]>(
		createDefaultEngagements(INITIAL_SUBJECTS, INITIAL_DRAFTS, INITIAL_STATEMENTS)
	);
	activeEngagementId = $state<string>('suse-telco-cloud-generic');

	get activeEngagement(): EngagementProfile {
		return (
			this.engagements.find(
				(e) =>
					e.id === this.activeEngagementId ||
					(this.activeEngagementId === 'nordwave-mcx-2027' && e.id === 'cctp-mcx-nordwave')
			) || this.engagements[0]
		);
	}

	activeSubjectId = $state<string>('suse_cni_sriov');
	activePosture = $state<DeliberationPosture>('deliberation');
	currentRole = $state<ArchitectRole>('lead_architect');
	isHuman = $state<boolean>(true);
	subjects = $state<MaturitySubject[]>(SUSE_TELCO_SUBJECTS);
	drafts = $state<Record<string, TelegraphicDraft>>(SUSE_TELCO_DRAFTS);
	notifications = $state<Array<{ id: string; timestamp: string; message: string; type: 'info' | 'success' | 'warning' }>>([]);
	statements = $state<Statement[]>(SUSE_TELCO_STATEMENTS);
	dialogueMessages = $state<DialogueMessage[]>(SUSE_TELCO_DIALOGUE_MESSAGES);
	activeRecalls = $state<DoctrineRecallRule[]>([]);
	frozenSnapshots = $state<Record<string, SealedSnapshot>>({});
	candidateRules = $state<CandidateRule[]>(INITIAL_CANDIDATE_RULES);
	selectedStatementForWhy = $state<Statement | null>(null);
	isFreezeDialogOpen = $state<boolean>(false);
	isWhyInspectorOpen = $state<boolean>(false);

	corpusDocuments = $state<CorpusDocument[]>(SUSE_TELCO_CORPUS);
	activeDocumentId = $state<string>('DOC-SUSE-ARCH-01');

	// Base de connaissances commune enrichie au gré des engagements (invariante & partagée de facto)
	commonKnowledgeBase = $state<CorpusDocument[]>([
		...INITIAL_CORPUS_DOCUMENTS,
		...SUSE_TELCO_CORPUS
	]);

	get sharedKnowledgeBase(): CorpusDocument[] {
		return this.commonKnowledgeBase;
	}

	// État d'intégration LLMOps (Dual-Mode)
	llmopsStatus = $state<'idle' | 'connected' | 'offline' | 'syncing' | 'error'>('idle');
	llmopsHealth = $state<LLMOpsHealth | null>(null);
	lastSyncTime = $state<string | null>(null);
	llmopsSyncSource = $state<'live' | 'offline-fallback' | null>(null);
	llmopsConflicts = $state<LLMOpsConflict[]>([]);
	isSyncingLLMOps = $state<boolean>(false);

	private engagementCache: Record<
		string,
		{
			subjects: MaturitySubject[];
			drafts: Record<string, TelegraphicDraft>;
			statements: Statement[];
			corpusDocuments: CorpusDocument[];
			activeSubjectId: string;
			activeDocumentId: string;
			dialogueMessages: DialogueMessage[];
		}
	> = {};

	/**
	 * Basculement instantané d'instance de projet / engagement (100% Local)
	 */
	switchEngagement(targetId: string) {
		if (targetId === this.activeEngagementId) return;

		// 1. Sauvegarder l'état de l'instance courante en cache local
		this.engagementCache[this.activeEngagementId] = {
			subjects: $state.snapshot(this.subjects),
			drafts: $state.snapshot(this.drafts),
			statements: $state.snapshot(this.statements),
			corpusDocuments: $state.snapshot(this.corpusDocuments),
			activeSubjectId: this.activeSubjectId,
			activeDocumentId: this.activeDocumentId,
			dialogueMessages: $state.snapshot(this.dialogueMessages)
		};

		// 2. Trouver la cible
		const targetProfile = this.engagements.find((e) => e.id === targetId);
		if (!targetProfile) {
			this.logNotification(`Engagement introuvable : ${targetId}`, 'warning');
			return;
		}

		// 3. Charger depuis le cache ou initialiser depuis le profil
		const cached = this.engagementCache[targetId];
		if (cached) {
			this.subjects = cached.subjects;
			this.drafts = cached.drafts;
			this.statements = cached.statements;
			this.corpusDocuments = cached.corpusDocuments;
			this.activeSubjectId = cached.activeSubjectId;
			this.activeDocumentId = cached.activeDocumentId;
			this.dialogueMessages = cached.dialogueMessages;
		} else {
			this.subjects = [...targetProfile.subjects];
			this.drafts = { ...targetProfile.drafts };
			this.statements = [...targetProfile.statements];
			this.corpusDocuments = [...targetProfile.corpusDocuments];
			this.activeSubjectId = targetProfile.defaultSubjectId;
			this.activeDocumentId = targetProfile.defaultDocId;
			this.dialogueMessages = [...(targetProfile.dialogueMessages || [])];
		}

		this.activeEngagementId = targetId;

		this.logNotification(
			`Bascule d'instance : "${targetProfile.title}" (${targetProfile.badge}) · 100% Local`,
			'info'
		);
	}

	/**
	 * Créer et initialiser un nouvel espace de travail pour un projet (Mini-App Onboarding)
	 * Verse les documents amonts dans la base de connaissance commune
	 */
	createNewWorkspace(input: WorkspaceCreationInput): EngagementProfile {
		const { engagement, newUpstreamDocuments } = buildEngagementProfileFromWorkspaceInput(
			input,
			this.commonKnowledgeBase
		);

		// 1. Enrichir la base de connaissances commune avec les nouveaux documents amonts
		for (const doc of newUpstreamDocuments) {
			if (!this.commonKnowledgeBase.some((d) => d.id === doc.id)) {
				this.commonKnowledgeBase.push(doc);
			}
		}

		// 2. Enregistrer l'engagement dans la liste des projets
		this.engagements.push(engagement);

		// 3. Basculer immédiatement sur ce nouvel espace de travail
		this.switchEngagement(engagement.id);

		this.logNotification(
			`Nouvel espace de travail initialisé : "${engagement.title}" (${newUpstreamDocuments.length} doc(s) amont(s) versés au patrimoine commun)`,
			'success'
		);

		return engagement;
	}

	// Tri réactif automatique par déblocages (effet multiplicateur)
	sortedSubjects = $derived(sortMaturityBoard(this.subjects));

	get activeSubject(): MaturitySubject | undefined {
		return this.subjects.find((s) => s.id === this.activeSubjectId);
	}

	get activeDraft(): TelegraphicDraft | null {
		return this.drafts[this.activeSubjectId] || null;
	}

	stalledSubjects = $derived(this.subjects.filter((s) => s.is_stalled));

	totalUnlocks = $derived(this.subjects.reduce((sum, s) => sum + s.unlocks_count, 0));

	totalBlocking = $derived(this.subjects.reduce((sum, s) => sum + s.blocking_count, 0));

	// Propriétés dérivées du corpus documentaire
	get activeDocument(): CorpusDocument {
		return (
			this.corpusDocuments.find((d) => d.id === this.activeDocumentId) || this.corpusDocuments[0]
		);
	}

	corpusStats = $derived(
		computeCorpusStats(this.corpusDocuments, this.subjects.map((s) => s.id))
	);

	get documentsForActiveSubject(): CorpusDocument[] {
		return this.corpusDocuments.filter((d) => d.relatedSubjectIds.includes(this.activeSubjectId));
	}

	get clientDocuments(): CorpusDocument[] {
		return this.corpusDocuments.filter((d) => d.origin === 'client');
	}

	get externalDocuments(): CorpusDocument[] {
		return this.corpusDocuments.filter((d) => d.origin === 'contributor_external');
	}

	get messagesForActiveSubject(): DialogueMessage[] {
		return this.dialogueMessages.filter((m) => m.subjectId === this.activeSubjectId);
	}

	get generalDialogueMessages(): DialogueMessage[] {
		return this.dialogueMessages.filter((m) => !m.subjectId);
	}

	sendSubjectMessage(content: string, subjectId?: string) {
		const targetSubjectId = subjectId || this.activeSubjectId;
		const authorName = this.isHuman
			? (this.currentRole === 'lead_architect' ? 'M. Israel (Lead Architect)' : `Architecte (${this.currentRole})`)
			: 'Agent Élicitation IA';

		const newMsg: DialogueMessage = {
			id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
			channel: 'internal',
			author: authorName,
			role: this.currentRole,
			content,
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			isAi: !this.isHuman,
			subjectId: targetSubjectId
		};

		this.dialogueMessages = [...this.dialogueMessages, newMsg];
		const recalls = detectProactiveDoctrineRecalls(content);
		this.activeRecalls = recalls;
	}

	selectSubject(id: string) {
		this.activeSubjectId = id;
	}

	setActiveDocument(id: string) {
		this.activeDocumentId = id;
	}

	addContributorDocument(docData: {
		id?: string;
		title: string;
		origin?: DocumentOrigin;
		category: DocumentCategory;
		categoryLabel: string;
		sourceOrAuthor: string;
		contributorRole?: string;
		version: string;
		pageCount?: number;
		relatedSubjectIds: string[];
		summary: string;
		keyClauses: ExtractedClause[];
	}) {
		const newId = docData.id || `DOC-EXT-${String(this.externalDocuments.length + 1).padStart(2, '0')}`;
		const newDoc: CorpusDocument = {
			...docData,
			id: newId,
			origin: docData.origin || 'contributor_external',
			extractedClausesCount: docData.keyClauses.length || 1,
			addedDate: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		};
		this.corpusDocuments = [newDoc, ...this.corpusDocuments];
		if (!this.commonKnowledgeBase.some((d) => d.id === newDoc.id)) {
			this.commonKnowledgeBase.push(newDoc);
		}
		this.activeDocumentId = newId;
		this.logNotification(
			`Document ajouté au corpus : "${newDoc.title}" (${newDoc.categoryLabel})`,
			'success'
		);
	}

	linkDocumentToSubject(docId: string, subjectId: string) {
		this.corpusDocuments = this.corpusDocuments.map((doc) => {
			if (doc.id === docId && !doc.relatedSubjectIds.includes(subjectId)) {
				return {
					...doc,
					relatedSubjectIds: [...doc.relatedSubjectIds, subjectId],
					lastUpdated: new Date().toISOString()
				};
			}
			return doc;
		});
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

	/**
	 * Rectification manuelle d'une hypothèse du brouillon télégraphique (Capteur par le Diff - Lot 4).
	 * RÈGLE DU SILENCE : Si aucun changement n'est opéré, rien n'est créé.
	 */
	amendHypothesis(
		subjectId: string,
		hypothesisIndex: number,
		newText: string,
		authorName: string = 'Architecte'
	): { success: boolean; message: string; statement?: Statement } {
		const draft = this.drafts[subjectId];
		if (!draft || !draft.suppose[hypothesisIndex]) {
			return { success: false, message: 'Hypothèse introuvable' };
		}

		const originalHyp = draft.suppose[hypothesisIndex];
		const diffResult = captureTextDiffAsStatement({
			subjectId,
			sectionRef: draft.section_id,
			originalText: originalHyp.text,
			editedText: newText,
			authorName,
			role: this.currentRole,
			antecedentId: `HYP-${subjectId}-${hypothesisIndex}`,
			propertyPredicate: 'amended_hypothesis'
		});

		if (!diffResult.hasDiff || !diffResult.statement) {
			const info = 'Règle du silence : aucune modification textuelle, aucun énoncé généré.';
			this.logNotification(info, 'info');
			return { success: false, message: info };
		}

		// Mise à jour de l'hypothèse dans le brouillon
		draft.suppose[hypothesisIndex] = {
			...originalHyp,
			text: diffResult.newValue!
		};

		// Enregistrement de l'énoncé auditable
		this.statements = [diffResult.statement, ...this.statements];

		const msg = `✍️ Rectification capturée en énoncé auditable [${diffResult.statement.id}] par ${this.currentRole} (${diffResult.statement.triplet.value})`;
		this.logNotification(msg, 'success');
		return { success: true, message: msg, statement: diffResult.statement };
	}

	/**
	 * Contestation et rejet d'une variante divergente (Lot 4).
	 */
	rejectVariant(
		subjectId: string,
		rejectionReason: string,
		authorName: string = 'Architecte'
	): { success: boolean; message: string; statement?: Statement } {
		const draft = this.drafts[subjectId];
		if (!draft || !draft.variante_b) {
			return { success: false, message: 'Aucune variante B à contester' };
		}

		const variantTitle = draft.variante_b.title;
		const statement = createVariantExclusionStatement({
			subjectId,
			sectionRef: draft.section_id,
			variantTitle,
			rejectionReason,
			authorName,
			role: this.currentRole
		});

		// Retrait de la variante B du brouillon
		delete draft.variante_b;

		// Enregistrement de l'énoncé de rejet
		this.statements = [statement, ...this.statements];

		const msg = `⛔ ${variantTitle} rejetée. Énoncé d'exclusion consigné [${statement.id}].`;
		this.logNotification(msg, 'success');
		return { success: true, message: msg, statement };
	}

	/**
	 * Envoi d'un message dans le fil de délibération multi-acteurs / Discord.
	 * Analyse proactive des doctrines et ADRs.
	 */
	postDialogueMessage(
		content: string,
		channel: 'internal' | 'discord' = 'internal',
		author: string = 'Architecte',
		subjectId?: string
	) {
		const trimmed = content.trim();
		if (!trimmed) return;

		const msg: DialogueMessage = {
			id: `msg-${Date.now().toString(36)}`,
			channel,
			author,
			role: this.currentRole,
			content: trimmed,
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			isAi: false,
			subjectId
		};

		this.dialogueMessages = [...this.dialogueMessages, msg];

		// Détection de rappel proactif de doctrine
		const recalls = detectProactiveDoctrineRecalls(trimmed);
		if (recalls.length > 0) {
			for (const recall of recalls) {
				if (!this.activeRecalls.some((r) => r.id === recall.id)) {
					this.activeRecalls = [...this.activeRecalls, recall];
					this.logNotification(`💡 Rappel de doctrine activé : ${recall.id} - ${recall.title}`, 'info');
				}
			}
		}
	}

	dismissRecall(ruleId: string) {
		this.activeRecalls = this.activeRecalls.filter((r) => r.id !== ruleId);
	}

	alignWithDoctrine(ruleId: string) {
		const rule = this.activeRecalls.find((r) => r.id === ruleId);
		if (!rule) return;

		const activeDraft = this.drafts[this.activeSubjectId];
		if (activeDraft) {
			if (!activeDraft.retenu.includes(rule.id)) {
				activeDraft.retenu = [...activeDraft.retenu, `${rule.id} (${rule.title})`];
			}
		}

		this.dismissRecall(ruleId);
		const msg = `🎯 Alignement validé avec la doctrine ${rule.id} sur la section active.`;
		this.logNotification(msg, 'success');
	}

	/**
	 * Conteste et rétracte un énoncé (Moteur de Rétractation - Lot 5).
	 * Déclenche l'invalidation de clôture logique en cascade (Truth Maintenance).
	 */
	retractStatement(
		statementId: string,
		reason: string = 'Contestation de conformité ou remise en cause d\'hypothèse'
	) {
		const result = executeRetractionCascade({
			targetStatementId: statementId,
			reason,
			statements: this.statements,
			subjects: this.subjects,
			drafts: this.drafts
		});

		// Mise à jour des énoncés (statut + déclassement)
		this.statements = this.statements.map((s) => {
			if (s.id === result.retractedId && result.retractedStatement) {
				return result.retractedStatement;
			}
			const demoted = result.demotedStatements.find((d) => d.id === s.id);
			if (demoted) return demoted;
			return s;
		});

		// Mise à jour réactive des sujets sur le Board et des brouillons
		this.subjects = result.updatedSubjects;
		this.drafts = result.updatedDrafts;

		this.logNotification(result.summaryMessage, 'warning');
		return result;
	}

	/**
	 * Vérifie les critères de gel officiel pour une section.
	 */
	getGatingCheck(subjectId: string): FreezeGatingResult {
		const subject = this.subjects.find((s) => s.id === subjectId);
		const draft = this.drafts[subjectId];
		if (!subject || !draft) {
			return { allowed: false, code: 'MATURITY_INSUFFICIENT', reason: 'Section ou brouillon introuvable' };
		}
		return canFreezeSection(subject, draft, this.statements, this.currentRole);
	}

	/**
	 * Gèle officiellement une section et génère son snapshot scellé SHA-256 (Lot 6).
	 */
	freezeSection(
		subjectId: string,
		authorName: string = 'M. Israel'
	): { success: boolean; snapshot?: SealedSnapshot; error?: string } {
		const subject = this.subjects.find((s) => s.id === subjectId);
		const draft = this.drafts[subjectId];
		if (!subject || !draft) {
			return { success: false, error: 'Section ou sujet introuvable' };
		}

		const gating = this.getGatingCheck(subjectId);
		if (!gating.allowed) {
			const err = gating.reason || 'Barrière de certification non franchie';
			this.logNotification(`❌ Gel refusé : ${err}`, 'warning');
			return { success: false, error: err };
		}

		const snapshot = freezeSectionAndGenerateSnapshot({
			subject,
			draft,
			statements: this.statements,
			authorName,
			authorRole: this.currentRole
		});

		this.frozenSnapshots[subjectId] = snapshot;

		// Promotion du sujet au statut scellé / archivé sans dérive
		this.subjects = this.subjects.map((s) => {
			if (s.id === subjectId) {
				return {
					...s,
					level: 'L5_archived',
					blocking_count: 0
				};
			}
			return s;
		});

		if (this.drafts[subjectId]) {
			this.drafts[subjectId].is_provisional = false;
			this.drafts[subjectId].maturity = 'L5_archived';
		}

		const msg = `🔒 Section ${subject.section_ref} (${subject.name}) scellée avec succès. Empreinte SHA-256: ${snapshot.sealSha256.substring(0, 12)}...`;
		this.logNotification(msg, 'success');
		return { success: true, snapshot };
	}

	/**
	 * Récupère ou génère les projections déterministes d'une section (Lot 6).
	 */
	getProjections(subjectId: string) {
		const subject = this.subjects.find((s) => s.id === subjectId);
		const draft = this.drafts[subjectId];
		if (!subject || !draft) return null;

		const sectionStatements = this.statements.filter(
			(s) => s.section === subject.section_ref || s.triplet.subject === subject.id
		);

		return {
			mermaid: generateMermaidDiagram(subject, draft, sectionStatements),
			structurizrDSL: generateStructurizrDSL(subject, draft, sectionStatements),
			structurizrVisual: generateStructurizrVisualMermaid(subject, draft, sectionStatements),
			sysmlV2: generateSysMLv2(subject, draft, sectionStatements),
			sysmlVisual: generateSysMLVisualMermaid(subject, draft, sectionStatements),
			configJSON: generatePtpConfigJSON(subject, draft, sectionStatements)
		};
	}

	/**
	 * Tour 8 : Approbation d'une règle candidate induite par SmartMemory (Lot 4).
	 */
	approveCandidateRule(ruleId: string): { success: boolean; message: string } {
		const rule = this.candidateRules.find((r) => r.id === ruleId);
		if (!rule) return { success: false, message: 'Règle candidate introuvable' };

		rule.status = 'approved';

		// Inscription de la doctrine dans le brouillon actif si pertinent
		const activeDraft = this.drafts[this.activeSubjectId];
		if (activeDraft && !activeDraft.retenu.includes(rule.id)) {
			activeDraft.retenu = [...activeDraft.retenu, `KH:${rule.id} (${rule.title})`];
		}

		const msg = `✅ Règle doctrinale [${rule.id}] formellement validée par le Lead Architect et inscrite au graphe.`;
		this.logNotification(msg, 'success');
		return { success: true, message: msg };
	}

	/**
	 * Rejet d'une règle candidate induite.
	 */
	rejectCandidateRule(ruleId: string): { success: boolean; message: string } {
		const rule = this.candidateRules.find((r) => r.id === ruleId);
		if (!rule) return { success: false, message: 'Règle candidate introuvable' };

		rule.status = 'rejected';
		const msg = `⛔ Règle candidate [${rule.id}] rejetée par le modérateur.`;
		this.logNotification(msg, 'info');
		return { success: true, message: msg };
	}

	openWhyInspector(statement: Statement) {
		this.selectedStatementForWhy = statement;
		this.isWhyInspectorOpen = true;
	}

	closeWhyInspector() {
		this.isWhyInspectorOpen = false;
		this.selectedStatementForWhy = null;
	}

	openFreezeDialog() {
		this.isFreezeDialogOpen = true;
	}

	closeFreezeDialog() {
		this.isFreezeDialogOpen = false;
	}

	getTransitiveDependents(statementId: string): string[] {
		const dag = buildCausalDAG(this.statements);
		return findTransitiveDependents(statementId, dag.dependentsOf);
	}

	getDependentsCount(statementId: string): number {
		return this.getTransitiveDependents(statementId).length;
	}

	/**
	 * Synchronisation avec le moteur Knowledge Hub / LLMOps
	 * Récupère le board de maturité, les énoncés et les conflits réels (Live Cloud Run ou Snapshot Scellé local)
	 */
	async syncWithLLMOps(engagementId?: string, customFetch?: typeof fetch) {
		const eng = engagementId || this.activeEngagementId;
		this.isSyncingLLMOps = true;
		this.llmopsStatus = 'syncing';

		try {
			const fetcher = customFetch || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
			const res = await fetcher(`/api/llmops?action=sync&engagement=${encodeURIComponent(eng)}`);
			if (!res.ok) {
				throw new Error(`Erreur HTTP ${res.status}`);
			}
			const payload = (await res.json()) as LLMOpsSyncPayload;

			this.activeEngagementId = payload.engagement;
			this.llmopsStatus = payload.source === 'live' ? 'connected' : 'offline';
			this.llmopsSyncSource = payload.source;
			this.llmopsHealth = payload.health;
			this.lastSyncTime = payload.syncedAt;
			this.llmopsConflicts = payload.conflicts || [];

			// Fusionner / hydrater les sujets de LLMOps dans le board
			if (payload.board && payload.board.length > 0) {
				const updatedSubjects = [...this.subjects];

				for (const item of payload.board) {
					const existingIndex = updatedSubjects.findIndex((s) => s.id === item.subject);
					const sectionRef = item.dependent_sections?.[0] ? `§${item.dependent_sections[0]}` : '§4.x';
					const role: ArchitectRole = (item.assigned_role as ArchitectRole) || 'lead_architect';

					if (existingIndex >= 0) {
						updatedSubjects[existingIndex] = {
							...updatedSubjects[existingIndex],
							name: item.name,
							level: item.level as MaturityLevel,
							is_stalled: item.is_stalled,
							stall_days: item.days_at_level
						};
					} else {
						updatedSubjects.push({
							id: item.subject,
							name: item.name,
							section_ref: sectionRef,
							level: item.level as MaturityLevel,
							blocking_count: 0,
							unlocks_count: 1,
							waiting_for_role: role,
							relative_effort: 'M',
							last_transition_date: item.updated_at || new Date().toISOString(),
							stall_days: item.days_at_level,
							is_stalled: item.is_stalled,
							dependent_subject_ids: []
						});
					}
				}
				this.subjects = updatedSubjects;
			}

			// Fusionner / hydrater les énoncés
			if (payload.statements && payload.statements.length > 0) {
				const existingStatementIds = new Set(this.statements.map((s) => s.id));
				const newStatements: Statement[] = [];

				for (const s of payload.statements) {
					if (!existingStatementIds.has(s.id)) {
						newStatements.push({
							id: s.id,
							section: s.section.startsWith('§') ? s.section : `§${s.section}`,
							triplet: {
								subject: s.subject,
								predicate: s.predicate,
								value: s.value
							},
							justification: {
								basedOn: s.based_on || []
							},
							authority: {
								author: s.author,
								role: (s.role as ArchitectRole) || 'infra_expert_architect',
								productionMode: 'human-authored'
							},
							maturity: {
								subjectLevel: 'L2_decomposed',
								confidence: s.confidence as any
							},
							revisability: {
								antecedents: s.based_on || []
							},
							status: s.status === 'retracted' ? 'superseded' : (s.status as 'active' | 'under_review' | 'contested') || 'active',
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString()
						});
					}
				}
				if (newStatements.length > 0) {
					this.statements = [...this.statements, ...newStatements];
				}
			}

			// Hydrater les brouillons télégraphiques pour les sujets LLMOps
			for (const bItem of payload.board || []) {
				const stmts = (payload.statements || []).filter((s) => s.subject === bItem.subject);
				const subConflicts = (payload.conflicts || []).filter((c) => c.detail.includes(bItem.subject));

				if (!this.drafts[bItem.subject] || this.drafts[bItem.subject].retenu.length === 0) {
					this.drafts[bItem.subject] = {
						section_id: bItem.dependent_sections?.[0] ? `§${bItem.dependent_sections[0]}` : '§4.x',
						subject: bItem.name,
						maturity: bItem.level as MaturityLevel,
						is_provisional: bItem.level !== 'L4_specified',
						retenu: stmts.map((s) => `${s.predicate} : ${s.value}`),
						suppose: [],
						conflit: subConflicts.map((c) => ({
							text: c.detail,
							opposing_reference: c.id,
							requires_arbitration: c.status === 'open'
						})),
						manque: bItem.open_question_ref
							? [
									{
										id: bItem.open_question_ref,
										question: `Question bloquante ${bItem.open_question_ref}`,
										assigned_role: (bItem.assigned_role as ArchitectRole) || 'lead_architect'
									}
								]
							: []
					};
				}
			}

			const sourceLabel = payload.source === 'live' ? 'Cloud Run (Direct)' : 'Instantané Hors-Ligne';
			this.logNotification(
				`Synchronisation LLMOps réussie (${sourceLabel} · ${payload.engagement} · ${payload.board.length} sujets · ${payload.statements.length} énoncés)`,
				'success'
			);

			return { success: true, payload };
		} catch (err: unknown) {
			this.llmopsStatus = 'error';
			const msg = err instanceof Error ? err.message : 'Erreur inconnue';
			this.logNotification(`Échec synchronisation LLMOps : ${msg}`, 'warning');
			return { success: false, error: msg };
		} finally {
			this.isSyncingLLMOps = false;
		}
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
