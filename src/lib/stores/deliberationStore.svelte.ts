import { untrack } from 'svelte';
import type { RequirementAuditInput } from '$lib/domain/requirementAudit';
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
	createVariantExclusionStatement,
	createCustomVariantProposalStatement
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
	generateConfigJSON
} from '$lib/domain/artifactProjections';
import {
	type CorpusDocument,
	type CorpusStats,
	type DocumentOrigin,
	type DocumentCategory,
	type ExtractedClause,
	computeCorpusStats
} from '$lib/domain/corpus';
import {
	type EngagementProfile,
	type WorkspaceCreationInput,
	buildEngagementProfileFromWorkspaceInput
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

class DeliberationStore {
	engagements = $state<EngagementProfile[]>([]);
	activeEngagementId = $state<string>('');
	isLoading = $state<boolean>(false);

	constructor() {
		if (typeof window !== 'undefined') {
			try {
				const savedId = localStorage.getItem('archinex:activeEngagementId');
				if (savedId) {
					this.activeEngagementId = savedId;
				}
			} catch {}
			this.loadFromServer();
		}
	}

	async loadFromServer() {
		this.isLoading = true;
		try {
			const res = await fetch('/api/engagements');
			if (res.ok) {
				const data = (await res.json()) as EngagementProfile[];
				if (Array.isArray(data) && data.length > 0) {
					this.initFromDb(data, []);
				}
			}
		} catch (err) {
			console.warn('[Archinex] Impossible de charger les projets depuis le serveur:', err);
		} finally {
			this.isLoading = false;
		}
	}

	private emptyEngagement: EngagementProfile = {
		id: '',
		title: 'Aucun projet sélectionné',
		shortName: 'Aucun projet',
		type: 'generic_blueprint',
		badge: 'PROJET',
		description: 'Aucun projet actif. Créez un projet ou chargez un exemple.',
		defaultSubjectId: '',
		defaultDocId: '',
		subjects: [],
		drafts: {},
		statements: [],
		corpusDocuments: [],
		dialogueMessages: []
	};

	get activeEngagements(): EngagementProfile[] {
		return this.engagements.filter((e) => e.status !== 'archived');
	}

	get archivedEngagements(): EngagementProfile[] {
		return this.engagements.filter((e) => e.status === 'archived');
	}

	get activeEngagement(): EngagementProfile {
		return (
			this.engagements.find((e) => e.id === this.activeEngagementId) ||
			this.engagements[0] ||
			this.emptyEngagement
		);
	}

	activeSubjectId = $state<string>('');
	activePosture = $state<DeliberationPosture>('deliberation');
	deliberationViewMode = $state<'board' | 'conversation'>('board');
	currentRole = $state<ArchitectRole>('lead_architect');
	isHuman = $state<boolean>(true);
	subjects = $state<MaturitySubject[]>([]);
	drafts = $state<Record<string, TelegraphicDraft>>({});
	notifications = $state<Array<{ id: string; timestamp: string; message: string; type: 'info' | 'success' | 'warning' }>>([]);
	statements = $state<Statement[]>([]);
	dialogueMessages = $state<DialogueMessage[]>([]);
	activeRecalls = $state<DoctrineRecallRule[]>([]);
	frozenSnapshots = $state<Record<string, SealedSnapshot>>({});
	selectedStatementForWhy = $state<Statement | null>(null);
	isFreezeDialogOpen = $state<boolean>(false);
	isWhyInspectorOpen = $state<boolean>(false);

	corpusDocuments = $state<CorpusDocument[]>([]);
	activeDocumentId = $state<string>('');

	// Base de connaissances commune enrichie au gré des engagements (invariante & partagée de facto)
	commonKnowledgeBase = $state<CorpusDocument[]>([]);

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
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem('archinex:activeEngagementId', targetId);
			} catch {}
		}

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

		engagement.status = 'active';

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

		// 4. Sauvegarder côté serveur ; l'audit des exigences ne part qu'après la création du projet
		const persisted = this.persistCustomState();
		if (input.requirementAudit) {
			const audit = input.requirementAudit;
			void persisted.then((ok) => {
				if (ok) return this.persistRequirementAudit(engagement.id, audit);
				this.logNotification(`Projet non enregistré : l'audit des exigences n'a pas été envoyé.`, 'warning');
			});
		}

		this.logNotification(
			`Nouvel espace de travail initialisé : "${engagement.title}" (${newUpstreamDocuments.length} doc(s) amont(s) versés au patrimoine commun)`,
			'success'
		);

		return engagement;
	}

	/**
	 * Initialise le store avec les données réelles persistées dans Prisma SQLite
	 */
	initFromDb(engagements: EngagementProfile[], commonDocs: CorpusDocument[]) {
		untrack(() => {
			if (engagements && engagements.length > 0) {
				// Préserver les engagements en mémoire s'ils n'existent pas encore dans la DB (ex: nouvel espace créé)
				const existingIds = new Set(engagements.map((e) => e.id));
				const localOnly = this.engagements.filter((e) => !existingIds.has(e.id));
				this.engagements = [...engagements, ...localOnly];

				const savedId = typeof window !== 'undefined' ? localStorage.getItem('archinex:activeEngagementId') : null;
				if (savedId && this.engagements.some((e) => e.id === savedId)) {
					this.activeEngagementId = savedId;
				} else if (!this.engagements.some((e) => e.id === this.activeEngagementId)) {
					this.activeEngagementId = this.engagements[0].id;
				}
			}

			if (commonDocs && commonDocs.length > 0) {
				const existingDocIds = new Set(this.commonKnowledgeBase.map((d) => d.id));
				const newDocs = commonDocs.filter((d) => !existingDocIds.has(d.id));
				this.commonKnowledgeBase = [...this.commonKnowledgeBase, ...newDocs];
			}

			// Met à jour l'engagement actif
			const current = this.activeEngagement;
			if (current) {
				this.subjects = current.subjects || [];
				this.drafts = current.drafts || {};
				this.statements = current.statements || [];
				this.corpusDocuments = current.corpusDocuments || [];
				this.activeSubjectId = current.defaultSubjectId || current.subjects[0]?.id || '';
				this.activeDocumentId = current.defaultDocId || current.corpusDocuments[0]?.id || '';
				this.dialogueMessages = current.dialogueMessages || [];
			}
		});
	}
	subjectVersions = $state<Record<string, number>>({});

	/**
	 * Persiste l'état de l'espace de travail sur le serveur centralisé
	 */
	persistCustomState(): Promise<boolean> {
		if (typeof window === 'undefined' || !window.fetch) return Promise.resolve(false);
		const activeProfile = this.activeEngagement;
		if (!activeProfile) return Promise.resolve(false);
		// Persistance asynchrone centralisée dans Prisma SQLite
		return window
			.fetch('/api/engagements', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ engagement: $state.snapshot(activeProfile) })
			})
			.then((res) => res.ok)
			.catch((err) => {
				console.warn('[Archinex] Sync Prisma en arrière-plan non disponible:', err);
				return false;
			});
	}

	/**
	 * Enregistre l'audit des exigences d'un RFP importé. À appeler une fois le projet persisté
	 * (la ligne Project est créée par /api/engagements). Un échec est signalé, jamais masqué :
	 * sans audit enregistré, le dossier scellé ne contiendrait pas les exigences.
	 */
	async persistRequirementAudit(projectId: string, audit: RequirementAuditInput): Promise<boolean> {
		if (typeof window === 'undefined') return false;
		try {
			const res = await window.fetch(`/api/projects/${encodeURIComponent(projectId)}/requirements`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(audit)
			});
			if (!res.ok) {
				const detail = await res.json().catch(() => ({}));
				this.logNotification(
					`Audit des exigences non enregistré (${res.status}) : ${detail.error ?? 'erreur serveur'}. Le dossier scellé n'inclura pas les clauses.`,
					'warning'
				);
				return false;
			}
			return true;
		} catch (err) {
			this.logNotification(`Audit des exigences non enregistré : ${err instanceof Error ? err.message : String(err)}`, 'warning');
			return false;
		}
	}

	/**
	 * Charge les espaces de travail depuis le serveur centralisé
	 */
	loadPersistedState() {
		// Persistance assurée par le serveur (/api/engagements et /api/projects)
	}

	/**
	 * Synchronise un sujet avec l'API normalisée /api/projects/[id]/subjects/[id]
	 * Gère la concurrence optimiste et notifie en cas de conflit 409
	 */
	async syncSubjectToServer(
		subjectId: string,
		updates: Partial<MaturitySubject & { deliberationStatus?: string }>
	): Promise<boolean> {
		if (typeof window === 'undefined' || !this.activeEngagementId) return true;

		const expectedVersion = this.subjectVersions[subjectId] || 1;
		try {
			const res = await fetch(`/api/projects/${this.activeEngagementId}/subjects/${subjectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					expectedVersion,
					maturityLevel: updates.level,
					deliberationStatus: updates.deliberationStatus,
					name: updates.name,
					waitingForRole: updates.waiting_for_role,
					relativeEffort: updates.relative_effort
				})
			});

			if (res.status === 409) {
				const conflictData = await res.json().catch(() => ({}));
				this.logNotification(
					`⚠️ Conflit de concurrence sur le sujet ${subjectId} : version serveur plus récente (${conflictData.currentVersion || 'inconnue'}). Veuillez recharger.`,
					'warning'
				);
				return false;
			}

			if (res.ok) {
				const data = await res.json();
				if (data.subject?.version) {
					this.subjectVersions[subjectId] = data.subject.version;
				}
				return true;
			}
		} catch (err) {
			console.warn(`[Archinex] Échec sync sujet ${subjectId} vers API serveur:`, err);
		}
		return true;
	}

	/**
	 * Archive un espace de travail
	 */
	archiveEngagement(targetId: string): boolean {
		const eng = this.engagements.find((e) => e.id === targetId);
		if (!eng) return false;

		eng.status = 'archived';
		eng.archivedAt = new Date().toISOString();

		this.persistCustomState();
		if (typeof window !== 'undefined') {
			fetch(`/api/engagements/${targetId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'archived' })
			}).catch((err) => {
				console.warn(`[Archinex] Erreur archivage serveur engagement ${targetId}:`, err);
			});
		}
		this.logNotification(`Espace de travail archivé : "${eng.title}"`, 'info');
		return true;
	}

	/**
	 * Désarchive / Réactive un espace de travail
	 */
	unarchiveEngagement(targetId: string): boolean {
		const eng = this.engagements.find((e) => e.id === targetId);
		if (!eng) return false;

		eng.status = 'active';
		eng.archivedAt = undefined;

		this.persistCustomState();
		if (typeof window !== 'undefined') {
			fetch(`/api/engagements/${targetId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'active' })
			}).catch((err) => {
				console.warn(`[Archinex] Erreur réactivation serveur engagement ${targetId}:`, err);
			});
		}
		this.logNotification(`Espace de travail réactivé : "${eng.title}"`, 'success');
		return true;
	}

	/**
	 * Supprime définitivement un espace de travail
	 */
	deleteEngagement(targetId: string): boolean {
		const index = this.engagements.findIndex((e) => e.id === targetId);
		if (index === -1) return false;
		if (this.engagements.length <= 1) {
			this.logNotification('Impossible de supprimer le dernier espace de travail disponible', 'warning');
			return false;
		}

		const deletedTitle = this.engagements[index].title;

		// Si l'espace supprimé est l'espace actif, basculer sur un autre projet
		if (this.activeEngagementId === targetId) {
			const nextActive =
				this.engagements.find((e, idx) => idx !== index && e.status !== 'archived') ||
				this.engagements.find((e, idx) => idx !== index) ||
				this.engagements[0];
			if (nextActive) {
				this.switchEngagement(nextActive.id);
			}
		}

		this.engagements.splice(index, 1);
		delete this.engagementCache[targetId];

		this.persistCustomState();

		if (typeof window !== 'undefined') {
			fetch(`/api/engagements/${targetId}`, { method: 'DELETE' }).catch((err) => {
				console.warn(`[Archinex] Erreur suppression serveur engagement ${targetId}:`, err);
			});
		}

		this.logNotification(`Espace de travail supprimé définitivement : "${deletedTitle}"`, 'info');
		return true;
	}

	/**
	 * Exporte la configuration et l'état complet d'un espace de travail en JSON souverain
	 */
	exportWorkspaceJSON(targetId?: string): string {
		const id = targetId || this.activeEngagementId;
		const eng = this.engagements.find((e) => e.id === id);
		if (!eng) return '{}';
		return JSON.stringify($state.snapshot(eng), null, 2);
	}

	/**
	 * Rétablit les espaces de travail d'usine par défaut
	 */
	async resetToDefaults() {
		await this.loadFromServer();
	}

	// Tri réactif automatique par déblocages (effet multiplicateur)
	sortedSubjects = $derived(sortMaturityBoard(this.subjects));

	get activeSubject(): MaturitySubject | undefined {
		return this.subjects.find((s) => s.id === this.activeSubjectId);
	}

	get activeDraft(): TelegraphicDraft | null {
		const existing = this.drafts[this.activeSubjectId];
		if (existing) return existing;

		const subj = this.activeSubject;
		if (!subj) return null;

		return {
			section_id: subj.section_ref,
			subject: subj.name,
			maturity: subj.level,
			is_provisional: subj.level !== 'L3_decided' && subj.level !== 'L4_specified' && subj.level !== 'L5_archived',
			retenu: [`Spécification de référence pour ${subj.name}`],
			suppose: [
				{
					text: `Cadrage architectural et dimensionnement cible (${subj.name})`,
					consequence: `Attente de délibération ou d'arbitrage par le rôle ${subj.waiting_for_role}`,
					cost_hint: `Effort estimé : ${subj.relative_effort}`
				}
			],
			conflit: [],
			manque: [
				{
					id: `Q-AUTO-${subj.id}`,
					question: `Quelles sont les contraintes et métriques clés à valider sur la section ${subj.section_ref} ?`,
					assigned_role: subj.waiting_for_role
				}
			]
		};
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
		this.deliberationViewMode = 'conversation';
	}

	setDeliberationViewMode(mode: 'board' | 'conversation') {
		this.deliberationViewMode = mode;
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

	/**
	 * Ajoute un nouveau sujet de délibération au tableau de maturité de l'espace actif
	 */
	addMaturitySubject(input: {
		sectionRef?: string;
		name: string;
		waitingForRole?: ArchitectRole;
		effort?: 'S' | 'M' | 'L' | 'XL';
		initialRetenu?: string[];
		initialHypothesis?: string;
		initialConflict?: string;
		initialQuestion?: string;
		parentSubjectId?: string;
		parentSubjectName?: string;
		/** Identifiants dossier-scellé des exigences portées par ce sujet (`SRC-xxxx:clause`). */
		requirementIds?: string[];
	}): MaturitySubject {
		const newId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
		const sectionRef = input.sectionRef || `§${this.subjects.length + 1}.0`;
		const role = input.waitingForRole || 'lead_architect';

		const newSubject: MaturitySubject = {
			id: newId,
			section_ref: sectionRef,
			name: input.name,
			level: 'L0_named',
			blocking_count: 1,
			unlocks_count: 2,
			waiting_for_role: role,
			relative_effort: input.effort || 'M',
			last_transition_date: new Date().toISOString(),
			stall_days: 0,
			is_stalled: false,
			dependent_subject_ids: [],
			parent_subject_id: input.parentSubjectId,
			parent_subject_name: input.parentSubjectName,
			...(input.requirementIds && input.requirementIds.length > 0 ? { requirement_ids: input.requirementIds } : {})
		};

		this.subjects.push(newSubject);

		if (input.parentSubjectId) {
			const parent = this.subjects.find((s) => s.id === input.parentSubjectId);
			if (parent && !parent.dependent_subject_ids.includes(newId)) {
				parent.dependent_subject_ids.push(newId);
			}
		}

		// Initialiser le brouillon télégraphique associé
		this.drafts[newId] = {
			section_id: sectionRef,
			subject: input.name,
			maturity: 'L0_named',
			is_provisional: true,
			retenu: input.initialRetenu && input.initialRetenu.length > 0 ? input.initialRetenu : [`Cadrage initial pour ${input.name}`],
			suppose: input.initialHypothesis
				? [
						{
							text: input.initialHypothesis,
							consequence: `Nécessite instruction et validation formelle`,
							cost_hint: `Effort ${input.effort || 'M'}`
						}
					]
				: [],
			conflit: input.initialConflict
				? [
						{
							text: input.initialConflict,
							opposing_reference: 'RFP Client vs Doctrines du Patrimoine Commun',
							requires_arbitration: true
						}
					]
				: [],
			manque: input.initialQuestion
				? [
						{
							id: `Q-${newId}`,
							question: input.initialQuestion,
							assigned_role: role
						}
					]
				: []
		};

		// Synchroniser avec l'engagement actif et persister
		this.activeEngagement.subjects = $state.snapshot(this.subjects);
		this.activeEngagement.drafts = $state.snapshot(this.drafts);
		this.persistCustomState();

		this.logNotification(`Nouveau sujet ajouté au tableau de maturité : "${input.name}" (${sectionRef})`, 'success');
		return newSubject;
	}

	/**
	 * Scinde un macro-sujet en 2 sous-problèmes d'architecture distincts (A32 / Élicitation)
	 * Fait progresser le parent à L2_decomposed et crée les deux sujets enfants reliés.
	 */
	splitSubject(
		parentId: string,
		subA: { name: string; question: string; role?: ArchitectRole; effort?: 'S' | 'M' | 'L' | 'XL' },
		subB: { name: string; question: string; role?: ArchitectRole; effort?: 'S' | 'M' | 'L' | 'XL' }
	): { subA: MaturitySubject; subB: MaturitySubject } | null {
		const parent = this.subjects.find((s) => s.id === parentId);
		if (!parent) return null;

		const parentDraft = this.drafts[parentId];

		// Calcul des références de section enfants (ex: §1.1 et §1.2 si parent est §1.0)
		const baseSection = parent.section_ref.replace(/\.0$/, '');
		const refA = `${baseSection}.1`;
		const refB = `${baseSection}.2`;

		const childA = this.addMaturitySubject({
			name: subA.name,
			sectionRef: refA,
			waitingForRole: subA.role || parent.waiting_for_role,
			effort: subA.effort || 'M',
			initialQuestion: subA.question,
			initialHypothesis: parentDraft?.suppose?.[0]?.text,
			initialRetenu: parentDraft?.retenu,
			parentSubjectId: parent.id,
			parentSubjectName: parent.name
		});

		const childB = this.addMaturitySubject({
			name: subB.name,
			sectionRef: refB,
			waitingForRole: subB.role || parent.waiting_for_role,
			effort: subB.effort || 'M',
			initialQuestion: subB.question,
			initialHypothesis: parentDraft?.suppose?.[0]?.text,
			initialRetenu: parentDraft?.retenu,
			parentSubjectId: parent.id,
			parentSubjectName: parent.name
		});

		// Faire évoluer le sujet parent à L2_decomposed
		parent.level = 'L2_decomposed';
		parent.last_transition_date = new Date().toISOString();
		if (this.drafts[parentId]) {
			this.drafts[parentId].maturity = 'L2_decomposed';
		}

		// Enregistrer et persister
		this.activeEngagement.subjects = $state.snapshot(this.subjects);
		this.activeEngagement.drafts = $state.snapshot(this.drafts);
		this.persistCustomState();

		this.logNotification(
			`✂️ Macro-sujet "${parent.name}" scindé en 2 sous-problèmes : "${childA.name}" (${refA}) et "${childB.name}" (${refB})`,
			'success'
		);

		return { subA: childA, subB: childB };
	}

	/**
	 * Met à jour la question principale d'architecture du brouillon télégraphique
	 */
	updateDraftQuestion(subjectId: string, question: string) {
		const draft = this.drafts[subjectId];
		if (!draft) return;
		if (!draft.manque || draft.manque.length === 0) {
			draft.manque = [
				{
					id: `Q-${subjectId}`,
					question,
					assigned_role: this.activeSubject?.waiting_for_role || 'lead_architect'
				}
			];
		} else {
			draft.manque[0].question = question;
		}
		this.activeEngagement.drafts = $state.snapshot(this.drafts);
		this.persistCustomState();
	}

	/**
	 * Met à jour l'hypothèse principale d'architecture du brouillon télégraphique
	 */
	updateDraftHypothesis(subjectId: string, hypothesis: string) {
		const draft = this.drafts[subjectId];
		if (!draft) return;
		if (!draft.suppose || draft.suppose.length === 0) {
			draft.suppose = [
				{
					text: hypothesis,
					consequence: 'Instruction et arbitrage requis',
					cost_hint: 'Effort M'
				}
			];
		} else {
			draft.suppose[0].text = hypothesis;
		}
		this.activeEngagement.drafts = $state.snapshot(this.drafts);
		this.persistCustomState();
	}

	/**
	 * Enregistre la réponse d'un expert/sachant métier et la convertit
	 * en Hypothèse de cadrage, Choix Retenu ou Argument de débat.
	 */
	answerExpertQuestion(
		subjectId: string,
		question: string,
		answer: string,
		mode: 'hypothesis' | 'retenu' | 'argument'
	) {
		const draft = this.drafts[subjectId];
		if (!draft) return;
		if (!draft.expertAnswers) {
			draft.expertAnswers = {};
		}
		draft.expertAnswers[question] = { answer, mode };

		if (mode === 'hypothesis') {
			if (!draft.suppose) draft.suppose = [];
			draft.suppose.unshift({
				text: `${answer} (Réponse métier à : ${question.slice(0, 60)}...)`,
				consequence: 'Hypothèse de cadrage posée par le sachant métier',
				cost_hint: 'Précision métier'
			});
			this.sendSubjectMessage(
				`💡 Précision Sachant Métier (Hypothèse) : à la question « ${question} », la réponse est : « ${answer} ».`,
				subjectId
			);
			this.logNotification('Réponse enregistrée et injectée comme hypothèse de travail !', 'success');
		} else if (mode === 'retenu') {
			if (!draft.retenu) draft.retenu = [];
			draft.retenu.unshift(`[Précision Métier] ${answer}`);
			this.sendSubjectMessage(
				`📌 Précision Sachant Métier (Choix Retenu) : « ${answer} » (Question : ${question}).`,
				subjectId
			);
			this.logNotification('Réponse enregistrée et actée dans les choix retenus !', 'success');
		} else {
			this.sendSubjectMessage(
				`💬 Éclairage Sachant Métier : « ${answer} » (Question : ${question}).`,
				subjectId
			);
			this.logNotification('Réponse publiée dans le fil de délibération !', 'info');
		}

		this.activeEngagement.drafts = $state.snapshot(this.drafts);
		this.persistCustomState();
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

		// Vérification de la Porte G3 (arbitrage humain)
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
	 * Proposition d'une alternative libre / variante innovante par un expert.
	 * Positionne la variante B sur le sujet, passe le sujet à L2_decomposed si nécessaire,
	 * consigne l'énoncé auditable et notifie le fil de discussion.
	 */
	proposeCustomVariant(
		subjectId: string,
		variant: { title: string; cost_delta?: string; trade_off?: string },
		authorName: string = 'Architecte'
	): { success: boolean; message: string; statement?: Statement } {
		let draft = this.drafts[subjectId];
		if (!draft) {
			const subj = this.subjects.find((s) => s.id === subjectId);
			draft = {
				section_id: subj?.section_ref || '§x.x',
				subject: subj?.name || subjectId,
				maturity: subj?.level || 'L0_named',
				is_provisional: true,
				retenu: [`Spécification initiale pour ${subj?.name || subjectId}`],
				suppose: [],
				conflit: [],
				manque: []
			};
		}

		const cleanTitle = variant.title.trim();
		const cleanCost = variant.cost_delta?.trim() || 'À évaluer en séance';
		const cleanTradeOff = variant.trade_off?.trim() || 'Alternative innovante soumise au débat contradictoire';

		if (!cleanTitle) {
			return { success: false, message: "Le titre de l'alternative technique est obligatoire." };
		}

		// 1. Affectation réactive de la variante B au brouillon
		this.drafts = {
			...this.drafts,
			[subjectId]: {
				...draft,
				maturity: 'L2_decomposed',
				variante_b: {
					title: cleanTitle,
					cost_delta: cleanCost,
					trade_off: cleanTradeOff
				}
			}
		};

		// 2. Si le sujet était en L0 ou L1, il passe en L2_decomposed car il y a confrontation d'options
		const targetSubject = this.subjects.find((s) => s.id === subjectId);
		if (targetSubject && (targetSubject.level === 'L0_named' || targetSubject.level === 'L1_framed')) {
			targetSubject.level = 'L2_decomposed';
		}

		// 3. Consignation de l'énoncé auditable
		const effectiveAuthor = this.isHuman
			? (this.currentRole === 'lead_architect' ? 'M. Israel (Lead Architect)' : authorName)
			: 'Agent IA';

		const statement = createCustomVariantProposalStatement({
			subjectId,
			sectionRef: draft.section_id,
			variantTitle: cleanTitle,
			costDelta: cleanCost,
			tradeOff: cleanTradeOff,
			authorName: effectiveAuthor,
			role: this.currentRole
		});

		this.statements = [statement, ...this.statements];

		// 4. Notification et message dans le fil de délibération du sujet
		this.sendSubjectMessage(
			`💡 Nouvelle alternative innovante proposée par ${effectiveAuthor} : "${cleanTitle}" (${cleanCost}). Compromis : « ${cleanTradeOff} ».`,
			subjectId
		);

		const msg = `💡 Alternative libre enregistrée : "${cleanTitle}". Débat d'arbitrage ouvert en L2_decomposed.`;
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

		if (typeof window !== 'undefined' && this.activeEngagementId) {
			fetch(`/api/projects/${this.activeEngagementId}/statements/${statementId}/retract`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason })
			}).catch((err) => console.warn('[Archinex] Erreur sync rétractation serveur:', err));
		}

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

		const sealedAt = this.frozenSnapshots[subjectId]?.sealedAt;
		return {
			mermaid: generateMermaidDiagram(subject, draft, sectionStatements),
			structurizrDSL: generateStructurizrDSL(subject, draft, sectionStatements),
			structurizrVisual: generateStructurizrVisualMermaid(subject, draft, sectionStatements),
			sysmlV2: generateSysMLv2(subject, draft, sectionStatements),
			sysmlVisual: generateSysMLVisualMermaid(subject, draft, sectionStatements),
			configJSON: generateConfigJSON(subject, draft, sectionStatements, sealedAt)
		};
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
	 * Récupère le board de maturité, les énoncés et les conflits depuis LLMOps (aucune donnée de repli si injoignable)
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

			if (!this.activeEngagementId) {
				this.activeEngagementId = payload.engagement;
			}
			this.llmopsStatus = payload.source === 'live' ? 'connected' : 'offline';
			this.llmopsSyncSource = payload.source;
			this.llmopsHealth = payload.health;
			this.lastSyncTime = payload.syncedAt;
			this.llmopsConflicts = payload.conflicts || [];

			if (payload.source === 'live') {
				this.logNotification(
					`Synchronisation réussie avec LLMOps (${payload.engagement}) · En direct`,
					'success'
				);
			} else {
				this.logNotification(
					`LLMOps injoignable : aucune donnée synchronisée pour ${payload.engagement}. Vos données locales sont conservées.`,
					'info'
				);
			}

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

	/**
	 * Acter directement une réponse factuelle, de gouvernance ou organisationnelle (Fast-track)
	 * Idéal pour les questions de processus ou de gouvernance ne nécessitant pas de débat contradictoire.
	 */
	actDirectDecision(subjectId: string, answerText: string, gapIdToClose?: string) {
		const target = this.subjects.find((s) => s.id === subjectId);
		if (!target || !answerText.trim()) return { success: false, message: 'Texte requis' };

		const cleanText = answerText.trim();
		const draft = this.drafts[subjectId];
		if (draft) {
			// 1. Ajouter la réponse aux acquis (RETENU)
			if (!draft.retenu.includes(cleanText)) {
				draft.retenu = [cleanText, ...draft.retenu];
			}

			// 2. Si une sous-question spécifique était ciblée, la fermer
			if (gapIdToClose && draft.manque) {
				draft.manque = draft.manque.filter((m) => m.id !== gapIdToClose);
			}

			// 3. Clôture des contradictions si existantes
			draft.conflit = [];
			draft.maturity = 'L3_decided';
			draft.is_provisional = false;

			// 4. Mettre à jour le sujet vers L3_decided
			target.level = 'L3_decided';
			target.last_transition_date = new Date().toISOString();
			target.is_stalled = false;
			target.stall_days = 0;
		}

		// 5. Injecter un énoncé formel d'architecture (Statement)
		const stmtId = `STMT-${Date.now().toString(36).toUpperCase()}`;
		this.statements = [
			{
				id: stmtId,
				section: target.section_ref,
				triplet: {
					subject: target.id,
					predicate: 'governance_decision',
					value: cleanText
				},
				justification: { basedOn: [] },
				authority: {
					author: 'Lead Architect',
					role: this.currentRole,
					productionMode: 'human-authored'
				},
				maturity: { subjectLevel: 'L3_decided', confidence: 'designed' },
				revisability: { antecedents: [] },
				status: 'active',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			},
			...this.statements
		];

		// 6. Historiser dans le dialogue dialectique
		this.sendSubjectMessage(
			`📌 **[Décision Actée Directe - ${this.currentRole}]** : ${cleanText}`,
			subjectId
		);

		this.persistCustomState();
		const msg = `Décision validée et actée pour "${target.name}". Versée aux acquis (RETENU) au niveau L3.`;
		this.logNotification(msg, 'success');
		return { success: true, message: msg };
	}

	/**
	 * Répondre à une sous-question ouverte (MANQUE) et la verser aux acquis.
	 */
	answerOpenQuestion(subjectId: string, gapId: string, answerText: string) {
		return this.actDirectDecision(subjectId, answerText, gapId);
	}

	/**
	 * Change le niveau de maturité d'un sujet (ex: passage à L2_decomposed lors de l'élicitation)
	 */
	setSubjectLevel(subjectId: string, level: MaturityLevel) {
		const subj = this.subjects.find((s) => s.id === subjectId);
		if (subj) {
			subj.level = level;
			subj.last_transition_date = new Date().toISOString();
			const draft = this.drafts[subjectId];
			if (draft) {
				draft.maturity = level;
			}
			this.persistCustomState();
		}
	}

	logNotification(message: string, type: 'info' | 'success' | 'warning' = 'info') {
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
