import { prisma } from './prisma';
import type { EngagementProfile, EngagementType, ProjectParticipant, ProjectStrategy } from '$lib/domain/engagements';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';
import type { Statement } from '$lib/types/epistemic';
import type { DialogueMessage } from '$lib/domain/dialectic';
import type { CorpusDocument, DocumentCategory, DocumentOrigin, ExtractedClause, InducedRule } from '$lib/domain/corpus';

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
				(d.engagementIds && d.engagementIds.includes(profile.id))
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
			(d.engagementIds && d.engagementIds.includes(profile.id))
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

	// Synchronisation avec les tables relationnelles (Project, ProjectMember, Subject)
	try {
		await prisma.project.upsert({
			where: { id: profile.id },
			create: {
				id: profile.id,
				title: profile.title,
				shortName: profile.shortName,
				type: profile.type,
				badge: profile.badge,
				description: profile.description,
				status: 'active',
				strategy: data.strategy,
				version: 1
			},
			update: {
				title: profile.title,
				shortName: profile.shortName,
				type: profile.type,
				badge: profile.badge,
				description: profile.description,
				status: 'active',
				strategy: data.strategy
			}
		});

		if (profile.subjects && profile.subjects.length > 0) {
			for (const s of profile.subjects) {
				const subjectId = s.id;
				if (!subjectId) continue;
				await prisma.subject.upsert({
					where: { id: subjectId },
					create: {
						id: subjectId,
						projectId: profile.id,
						sectionRef: s.section_ref || '§0.0',
						name: s.name || 'Sujet sans titre',
						domain: (s as any).domain || 'general',
						problemStatement: (s as any).problem_statement || (s as any).problemStatement || '',
						maturityLevel: s.level || 'L0_named',
						deliberationStatus: (s as any).deliberationStatus || 'open',
						waitingForRole: s.waiting_for_role || 'lead_architect',
						relativeEffort: s.relative_effort || 'M',
						blockingCount: s.blocking_count ?? 0,
						unlocksCount: s.unlocks_count ?? 0,
						requirementRefs: JSON.stringify(s.requirement_ids ?? []),
						version: 1
					},
					update: {
						sectionRef: s.section_ref || '§0.0',
						name: s.name || 'Sujet sans titre',
						domain: (s as any).domain || 'general',
						problemStatement: (s as any).problem_statement || (s as any).problemStatement || '',
						maturityLevel: s.level || 'L0_named',
						waitingForRole: s.waiting_for_role || 'lead_architect',
						relativeEffort: s.relative_effort || 'M',
						blockingCount: s.blocking_count ?? 0,
						unlocksCount: s.unlocks_count ?? 0,
						// Ne jamais effacer le lien aux exigences quand le profil client ne le porte pas.
						...(s.requirement_ids ? { requirementRefs: JSON.stringify(s.requirement_ids) } : {})
					}
				});
			}
		}

		if (profile.participants && profile.participants.length > 0) {
			for (const p of profile.participants) {
				const userId = p.id;
				if (!userId) continue;
				await prisma.projectMember.upsert({
					where: {
						projectId_userId: {
							projectId: profile.id,
							userId
						}
					},
					create: {
						projectId: profile.id,
						userId,
						role: p.role || 'lead_architect',
						domains: '[]'
					},
					update: {
						role: p.role || 'lead_architect'
					}
				});
			}
		}
	} catch (syncErr) {
		console.warn(`[engagementsDb] Échec de la synchronisation relationnelle pour ${profile.id}:`, syncErr);
	}

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
 * Supprime un engagement de la base Prisma (ou le marque deleted)
 */
export async function deleteEngagementFromDb(id: string): Promise<boolean> {
	try {
		await prisma.engagement.delete({ where: { id } });
		return true;
	} catch (err) {
		console.warn(`[engagementsDb] Échec suppression dure engagement ${id}, tentative soft-delete:`, err);
		try {
			await prisma.engagement.update({
				where: { id },
				data: { status: 'deleted' }
			});
			return true;
		} catch {
			return false;
		}
	}
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


