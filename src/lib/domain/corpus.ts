export type DocumentOrigin = 'client' | 'contributor_external';

export type DocumentCategory =
	| 'cctp'
	| 'rfp_annex'
	| 'business_spec'
	| 'standard'
	| 'regulation'
	| 'vendor_whitepaper'
	| 'guideline'
	| 'benchmark';

export interface ExtractedClause {
	id: string;
	clauseRef: string;
	title: string;
	text: string;
	criticality: 'bloquant' | 'majeur' | 'info';
	impactSummary?: string;
}

export interface InducedRule {
	id: string;
	title: string;
	type: 'obligation' | 'interdiction' | 'recommandation';
	description: string;
	targetSubjectId?: string;
}

export interface CorpusDocument {
	id: string;
	title: string;
	origin: DocumentOrigin;
	category: DocumentCategory;
	categoryLabel: string;
	sourceOrAuthor: string;
	contributorRole?: string;
	version: string;
	pageCount?: number;
	extractedClausesCount: number;
	relatedSubjectIds: string[];
	summary: string;
	keyIdeas?: string[];
	inducedRules?: InducedRule[];
	keyClauses: ExtractedClause[];
	isGlobalStandard?: boolean;
	engagementIds?: string[];
	addedDate: string;
	lastUpdated: string;
}

export interface CorpusStats {
	totalDocuments: number;
	clientDocumentsCount: number;
	externalDocumentsCount: number;
	totalExtractedClauses: number;
	coveredSubjectsCount: number;
}

export function computeCorpusStats(
	documents: CorpusDocument[],
	allSubjectIds: string[]
): CorpusStats {
	const clientDocs = documents.filter((d) => d.origin === 'client');
	const externalDocs = documents.filter((d) => d.origin === 'contributor_external');
	const totalExtractedClauses = documents.reduce((acc, d) => acc + d.extractedClausesCount, 0);

	const coveredSubjectsSet = new Set<string>();
	for (const doc of documents) {
		for (const sId of doc.relatedSubjectIds) {
			if (allSubjectIds.includes(sId)) {
				coveredSubjectsSet.add(sId);
			}
		}
	}

	return {
		totalDocuments: documents.length,
		clientDocumentsCount: clientDocs.length,
		externalDocumentsCount: externalDocs.length,
		totalExtractedClauses,
		coveredSubjectsCount: coveredSubjectsSet.size
	};
}

export function filterCorpusDocuments(
	documents: CorpusDocument[],
	options: {
		filterOrigin?: 'all' | 'client' | 'external';
		searchQuery?: string;
		subjectId?: string;
	}
): CorpusDocument[] {
	const { filterOrigin = 'all', searchQuery = '', subjectId } = options;

	return documents.filter((doc) => {
		// Filter by origin
		if (filterOrigin === 'client' && doc.origin !== 'client') return false;
		if (filterOrigin === 'external' && doc.origin !== 'contributor_external') return false;

		// Filter by subject if specified
		if (subjectId && !doc.relatedSubjectIds.includes(subjectId)) {
			return false;
		}

		// Filter by search query
		if (searchQuery.trim().length > 0) {
			const query = searchQuery.toLowerCase().trim();
			const inTitle = doc.title.toLowerCase().includes(query);
			const inAuthor = doc.sourceOrAuthor.toLowerCase().includes(query);
			const inSummary = doc.summary.toLowerCase().includes(query);
			const inCategory = doc.categoryLabel.toLowerCase().includes(query);
			const inId = doc.id.toLowerCase().includes(query);
			const inClauses = doc.keyClauses.some(
				(c) =>
					c.clauseRef.toLowerCase().includes(query) ||
					c.title.toLowerCase().includes(query) ||
					c.text.toLowerCase().includes(query) ||
					(c.impactSummary && c.impactSummary.toLowerCase().includes(query))
			);

			if (!inTitle && !inAuthor && !inSummary && !inCategory && !inId && !inClauses) {
				return false;
			}
		}

		return true;
	});
}

export function getDocumentById(
	documents: CorpusDocument[],
	id: string
): CorpusDocument | undefined {
	return documents.find((doc) => doc.id === id);
}

export function getDocumentsForSubject(
	documents: CorpusDocument[],
	subjectId: string
): CorpusDocument[] {
	return documents.filter((doc) => doc.relatedSubjectIds.includes(subjectId));
}
