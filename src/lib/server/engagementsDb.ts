import { prisma } from './prisma';
import type { EngagementProfile, EngagementType, ProjectParticipant, ProjectStrategy } from '$lib/domain/engagements';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import type { DialogueMessage } from '$lib/domain/dialectic';
import type { CorpusDocument, DocumentCategory, DocumentOrigin, ExtractedClause, InducedRule } from '$lib/domain/corpus';
import {
	SUSE_TELCO_SUBJECTS,
	SUSE_TELCO_DRAFTS,
	SUSE_TELCO_STATEMENTS,
	SUSE_TELCO_CORPUS,
	SUSE_TELCO_DIALOGUE_MESSAGES,
	CCTP_DIALOGUE_MESSAGES,
	DEFAULT_PARTICIPANTS
} from '$lib/domain/engagements';
import { INITIAL_CORPUS_DOCUMENTS } from '$lib/domain/corpus';

function parseJsonSafe<T>(val: string | null | undefined, fallback: T): T {
	if (!val) return fallback;
	try {
		return JSON.parse(val) as T;
	} catch {
		return fallback;
	}
}

/**
 * Convertit un enregistrement Prisma Engagement vers le type métier EngagementProfile
 */
export function mapPrismaToEngagementProfile(row: any): EngagementProfile {
	return {
		id: row.id,
		title: row.title,
		shortName: row.shortName,
		type: row.type as EngagementType,
		badge: row.badge,
		description: row.description,
		defaultSubjectId: row.defaultSubjectId || '',
		defaultDocId: row.defaultDocId || '',
		strategy: parseJsonSafe<ProjectStrategy>(row.strategy, {
			objectives: [],
			principles: [],
			constraints: []
		}),
		participants: parseJsonSafe<ProjectParticipant[]>(row.participants, []),
		subjects: parseJsonSafe<MaturitySubject[]>(row.subjects, []),
		drafts: parseJsonSafe<Record<string, TelegraphicDraft>>(row.drafts, {}),
		statements: parseJsonSafe<Statement[]>(row.statements, []),
		corpusDocuments: [], // Complété par la base de connaissances liée
		dialogueMessages: parseJsonSafe<DialogueMessage[]>(row.dialogueMessages, []),
		createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString()
	};
}

/**
 * Convertit un enregistrement Prisma CorpusDocument vers le type métier CorpusDocument
 */
export function mapPrismaToCorpusDocument(row: any): CorpusDocument {
	return {
		id: row.id,
		title: row.title,
		origin: row.origin as DocumentOrigin,
		category: row.category as DocumentCategory,
		categoryLabel: row.categoryLabel,
		sourceOrAuthor: row.sourceOrAuthor,
		contributorRole: row.contributorRole || undefined,
		version: row.version,
		pageCount: row.pageCount || 0,
		extractedClausesCount: row.extractedClausesCount || 0,
		relatedSubjectIds: parseJsonSafe<string[]>(row.relatedSubjectIds, []),
		summary: row.summary,
		keyIdeas: parseJsonSafe<string[]>(row.keyIdeas, []),
		inducedRules: parseJsonSafe<InducedRule[]>(row.inducedRules, []),
		keyClauses: parseJsonSafe<ExtractedClause[]>(row.keyClauses, []),
		isGlobalStandard: Boolean(row.isGlobalStandard),
		engagementIds: parseJsonSafe<string[]>(row.engagementIds, []),
		addedDate: row.addedDate ? new Date(row.addedDate).toISOString() : new Date().toISOString(),
		lastUpdated: row.lastUpdated ? new Date(row.lastUpdated).toISOString() : new Date().toISOString()
	};
}

/**
 * Récupère tous les engagements persistés dans Prisma
 */
export async function getAllEngagementsFromDb(): Promise<EngagementProfile[]> {
	const [rows, allDocs] = await Promise.all([
		prisma.engagement.findMany({
			where: { status: { not: 'deleted' } },
			orderBy: { createdAt: 'desc' }
		}),
		getAllCorpusDocumentsFromDb()
	]);

	return rows.map((r) => {
		const profile = mapPrismaToEngagementProfile(r);
		// Relie les documents du corpus pertinents à cet engagement
		profile.corpusDocuments = allDocs.filter(
			(d) =>
				d.isGlobalStandard ||
				(d.engagementIds && d.engagementIds.includes(profile.id)) ||
				(profile.id === 'suse-telco-cloud-generic' && d.id.startsWith('DOC-SUSE')) ||
				(profile.id === 'cctp-mcx-nordwave' && !d.id.startsWith('DOC-SUSE'))
		);
		return profile;
	});
}

/**
 * Récupère un engagement par son identifiant
 */
export async function getEngagementByIdFromDb(id: string): Promise<EngagementProfile | null> {
	const row = await prisma.engagement.findUnique({ where: { id } });
	if (!row) return null;

	const allDocs = await getAllCorpusDocumentsFromDb();
	const profile = mapPrismaToEngagementProfile(row);
	profile.corpusDocuments = allDocs.filter(
		(d) =>
			d.isGlobalStandard ||
			(d.engagementIds && d.engagementIds.includes(profile.id)) ||
			(profile.id === 'suse-telco-cloud-generic' && d.id.startsWith('DOC-SUSE')) ||
			(profile.id === 'cctp-mcx-nordwave' && !d.id.startsWith('DOC-SUSE'))
	);
	return profile;
}

/**
 * Persiste ou met à jour un engagement complet dans Prisma
 */
export async function saveEngagementToDb(profile: EngagementProfile): Promise<EngagementProfile> {
	const data = {
		id: profile.id,
		title: profile.title,
		shortName: profile.shortName,
		type: profile.type,
		badge: profile.badge,
		description: profile.description,
		defaultSubjectId: profile.defaultSubjectId || null,
		defaultDocId: profile.defaultDocId || null,
		strategy: JSON.stringify(profile.strategy || {}),
		participants: JSON.stringify(profile.participants || []),
		subjects: JSON.stringify(profile.subjects || []),
		drafts: JSON.stringify(profile.drafts || {}),
		statements: JSON.stringify(profile.statements || []),
		dialogueMessages: JSON.stringify(profile.dialogueMessages || [])
	};

	await prisma.engagement.upsert({
		where: { id: profile.id },
		create: data,
		update: data
	});

	// Sauvegarder également ses documents amonts s'il y en a
	if (profile.corpusDocuments && profile.corpusDocuments.length > 0) {
		for (const doc of profile.corpusDocuments) {
			await saveCorpusDocumentToDb(doc);
		}
	}

	return profile;
}

/**
 * Met à jour partiellement un engagement dans Prisma
 */
export async function updateEngagementInDb(
	id: string,
	updates: Partial<EngagementProfile>
): Promise<EngagementProfile | null> {
	const existing = await getEngagementByIdFromDb(id);
	if (!existing) return null;

	const updatedProfile: EngagementProfile = {
		...existing,
		...updates,
		id // l'identifiant reste immuable
	};

	return saveEngagementToDb(updatedProfile);
}

/**
 * Récupère tous les documents du patrimoine de connaissances depuis Prisma
 */
export async function getAllCorpusDocumentsFromDb(): Promise<CorpusDocument[]> {
	const rows = await prisma.corpusDocument.findMany({
		orderBy: { addedDate: 'asc' }
	});

	return rows.map(mapPrismaToCorpusDocument);
}

/**
 * Sauvegarde un document du corpus dans Prisma
 */
export async function saveCorpusDocumentToDb(doc: CorpusDocument): Promise<CorpusDocument> {
	const data = {
		id: doc.id,
		title: doc.title,
		origin: doc.origin,
		category: doc.category,
		categoryLabel: doc.categoryLabel,
		sourceOrAuthor: doc.sourceOrAuthor,
		contributorRole: doc.contributorRole || null,
		version: doc.version || 'v1.0',
		pageCount: doc.pageCount || 0,
		extractedClausesCount: doc.extractedClausesCount || doc.keyClauses?.length || 0,
		summary: doc.summary,
		relatedSubjectIds: JSON.stringify(doc.relatedSubjectIds || []),
		keyIdeas: JSON.stringify(doc.keyIdeas || []),
		inducedRules: JSON.stringify(doc.inducedRules || []),
		keyClauses: JSON.stringify(doc.keyClauses || []),
		engagementIds: JSON.stringify(doc.engagementIds || []),
		isGlobalStandard: Boolean(doc.isGlobalStandard),
		addedDate: doc.addedDate ? new Date(doc.addedDate) : new Date()
	};

	await prisma.corpusDocument.upsert({
		where: { id: doc.id },
		create: data,
		update: data
	});

	return doc;
}

/**
 * Initialise le socle persistant dans Prisma s'il est vide
 */
export async function seedEngagementsIfEmpty(): Promise<void> {
	const count = await prisma.engagement.count();
	if (count > 0) return;

	console.log('🌱 [Archinex] Initialisation du socle persistant Prisma (Engagements & Corpus)...');

	// 1. Initialiser le corpus commun
	const allInitialDocs: CorpusDocument[] = [
		...INITIAL_CORPUS_DOCUMENTS,
		...SUSE_TELCO_CORPUS
	];

	for (const doc of allInitialDocs) {
		await saveCorpusDocumentToDb(doc);
	}

	// 2. Initialiser les 2 engagements de référence
	const cctpSubjects: MaturitySubject[] = [
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
			section_ref: '§5.1',
			name: 'Cœur 5G SA Hybride PPDR',
			level: 'L2_decomposed',
			blocking_count: 1,
			unlocks_count: 2,
			waiting_for_role: 'infra_expert_architect',
			relative_effort: 'L',
			last_transition_date: '2026-09-16T00:00:00Z',
			stall_days: 4,
			is_stalled: false,
			dependent_subject_ids: ['sub_pqc', 'sub_supervision']
		},
		{
			id: 'sub_ppdr',
			section_ref: '§6.2',
			name: 'Terminaux Durcis & Mission-Critical Voice/Video',
			level: 'L1_framed',
			blocking_count: 0,
			unlocks_count: 1,
			waiting_for_role: 'domain_architect',
			relative_effort: 'S',
			last_transition_date: '2026-09-17T00:00:00Z',
			stall_days: 3,
			is_stalled: false,
			dependent_subject_ids: []
		},
		{
			id: 'sub_pqc',
			section_ref: '§7.1',
			name: 'Chiffrement Hybride Post-Quantique (PQC)',
			level: 'L3_decided',
			blocking_count: 0,
			unlocks_count: 1,
			waiting_for_role: 'security_architect',
			relative_effort: 'M',
			last_transition_date: '2026-09-21T00:00:00Z',
			stall_days: 1,
			is_stalled: false,
			dependent_subject_ids: []
		},
		{
			id: 'sub_supervision',
			section_ref: '§8.1',
			name: 'Supervision & Observabilité eBPF Air-gapped',
			level: 'L0_named',
			blocking_count: 0,
			unlocks_count: 0,
			waiting_for_role: 'security_architect',
			relative_effort: 'S',
			last_transition_date: '2026-09-10T00:00:00Z',
			stall_days: 10,
			is_stalled: false,
			dependent_subject_ids: []
		}
	];

	const suseEngagement: EngagementProfile = {
		id: 'suse-telco-cloud-generic',
		title: 'SUSE Telco Cloud (Architecture Générique)',
		shortName: 'SUSE Telco Cloud',
		type: 'generic_blueprint',
		badge: 'SUSE Telco Cloud · Baseline',
		description: 'Patrimoine d\'architecture pour concevoir une pile Telco Cloud souveraine (Rancher, RKE2, SLERT, NeuVector, Harvester). 100% Local.',
		defaultSubjectId: 'suse_cni_sriov',
		defaultDocId: 'DOC-SUSE-ARCH-01',
		strategy: {
			objectives: ['Souveraineté européenne', 'Latence sub-milliseconde SLERT', 'Sécurité Zero-Trust'],
			principles: ['Open-source d\'entreprise vérifié', 'Immuabilité des déclarations', 'Reproductibilité GitOps'],
			constraints: ['Zéro dépendance hyperscaler US', 'Audit ANSSI CSPN', 'Budget 1.2 M€'],
			targetDate: '2027-04-30',
			budget: '1.2 M€'
		},
		participants: DEFAULT_PARTICIPANTS,
		subjects: SUSE_TELCO_SUBJECTS,
		drafts: SUSE_TELCO_DRAFTS,
		statements: SUSE_TELCO_STATEMENTS,
		corpusDocuments: SUSE_TELCO_CORPUS,
		dialogueMessages: SUSE_TELCO_DIALOGUE_MESSAGES
	};

	const cctpEngagement: EngagementProfile = {
		id: 'cctp-mcx-nordwave',
		title: 'CCTP 5G & MCX (Projet Réel RFP)',
		shortName: 'CCTP 5G & MCX',
		type: 'project_rfp',
		badge: 'CCTP 5G & CŒUR · RFP Réel',
		description: 'Appel d\'offres contractuel client : réseau fédérateur critique, tranches hybrides MCX, contraintes de résilience et arbitrages 3GPP.',
		defaultSubjectId: 'sub_sync',
		defaultDocId: 'DOC-CLI-01',
		strategy: {
			objectives: ['Couverture 98% régalienne PPDR', 'Alignement temporel ±1.5 µs UTC', 'Conformité NIS2 entité essentielle'],
			principles: ['Étanchéité des tranches critiques', 'Double adduction géographique active-active', 'Horloges atomiques de secours'],
			constraints: ['Mise en service T2 2027', 'Plafond budgétaire 3.0 M€'],
			targetDate: '2027-06-30',
			budget: '3.0 M€'
		},
		participants: DEFAULT_PARTICIPANTS,
		subjects: cctpSubjects,
		drafts: {},
		statements: [],
		corpusDocuments: INITIAL_CORPUS_DOCUMENTS,
		dialogueMessages: CCTP_DIALOGUE_MESSAGES
	};

	await saveEngagementToDb(suseEngagement);
	await saveEngagementToDb(cctpEngagement);

	console.log('✅ [Archinex] Socle persistant Prisma initialisé avec succès.');
}
