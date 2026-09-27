import { describe, it, expect } from 'vitest';
import {
	INITIAL_CORPUS_DOCUMENTS,
	computeCorpusStats,
	filterCorpusDocuments,
	getDocumentById,
	getDocumentsForSubject,
	type CorpusDocument
} from '$lib/domain/corpus';

describe('Corpus Domain Logic & Separation', () => {
	it('should clearly distinguish client documents from contributor external documents', () => {
		const clientDocs = INITIAL_CORPUS_DOCUMENTS.filter((d) => d.origin === 'client');
		const externalDocs = INITIAL_CORPUS_DOCUMENTS.filter((d) => d.origin === 'contributor_external');

		expect(clientDocs.length).toBeGreaterThanOrEqual(4);
		expect(externalDocs.length).toBeGreaterThanOrEqual(5);

		// Every client doc must have a client-oriented category
		for (const doc of clientDocs) {
			expect(doc.origin).toBe('client');
			expect(doc.sourceOrAuthor).toMatch(/MOA|Client|RSSI|État-Major|Direction/i);
		}

		// Every external doc must specify the contributor / author
		for (const doc of externalDocs) {
			expect(doc.origin).toBe('contributor_external');
			expect(doc.sourceOrAuthor).toBeTruthy();
			expect(doc.contributorRole).toBeTruthy();
		}
	});

	it('should compute comprehensive corpus statistics', () => {
		const allSubjectIds = ['sub_sync', 'sub_dc_resilience', 'sub_radio', 'sub_core', 'sub_ppdr', 'sub_pqc'];
		const stats = computeCorpusStats(INITIAL_CORPUS_DOCUMENTS, allSubjectIds);

		expect(stats.totalDocuments).toBe(INITIAL_CORPUS_DOCUMENTS.length);
		expect(stats.clientDocumentsCount).toBe(4);
		expect(stats.externalDocumentsCount).toBe(5);
		expect(stats.totalExtractedClauses).toBeGreaterThan(100);
		expect(stats.coveredSubjectsCount).toBe(6);
	});

	it('should filter documents by origin correctly', () => {
		const clientOnly = filterCorpusDocuments(INITIAL_CORPUS_DOCUMENTS, { filterOrigin: 'client' });
		expect(clientOnly.every((d) => d.origin === 'client')).toBe(true);
		expect(clientOnly.length).toBe(4);

		const externalOnly = filterCorpusDocuments(INITIAL_CORPUS_DOCUMENTS, { filterOrigin: 'external' });
		expect(externalOnly.every((d) => d.origin === 'contributor_external')).toBe(true);
		expect(externalOnly.length).toBe(5);
	});

	it('should filter documents by related subject', () => {
		const syncDocs = getDocumentsForSubject(INITIAL_CORPUS_DOCUMENTS, 'sub_sync');
		expect(syncDocs.length).toBeGreaterThanOrEqual(3);

		// sub_sync should be covered by both client CCTP and external 3GPP / NIS2 / PTP standards
		const hasClient = syncDocs.some((d) => d.origin === 'client');
		const hasExternal = syncDocs.some((d) => d.origin === 'contributor_external');
		expect(hasClient).toBe(true);
		expect(hasExternal).toBe(true);
	});

	it('should retrieve a specific document by its unique ID', () => {
		const doc = getDocumentById(INITIAL_CORPUS_DOCUMENTS, 'DOC-CLI-01');
		expect(doc).toBeDefined();
		expect(doc?.title).toContain('CCTP Lot 2');
		expect(doc?.keyClauses.length).toBeGreaterThan(0);
	});

	it('should search documents by keywords across title, summary and clauses', () => {
		const searchResults = filterCorpusDocuments(INITIAL_CORPUS_DOCUMENTS, { searchQuery: 'rubidium' });
		expect(searchResults.length).toBeGreaterThan(0);
		expect(searchResults.some((d) => d.id === 'DOC-CLI-01' || d.id === 'DOC-EXT-02')).toBe(true);
	});

	it('should provide key ideas and induced engineering rules for comprehension in appropriation phase', () => {
		const cctpDoc = getDocumentById(INITIAL_CORPUS_DOCUMENTS, 'DOC-CLI-01');
		expect(cctpDoc).toBeDefined();
		expect(cctpDoc?.keyIdeas).toBeDefined();
		expect(cctpDoc?.keyIdeas?.length).toBeGreaterThanOrEqual(2);
		expect(cctpDoc?.inducedRules).toBeDefined();
		expect(cctpDoc?.inducedRules?.length).toBeGreaterThanOrEqual(1);

		const firstRule = cctpDoc!.inducedRules![0];
		expect(firstRule.id).toBeTruthy();
		expect(firstRule.type).toBe('obligation');
		expect(firstRule.targetSubjectId).toBe('sub_sync');
	});

	it('should match relevant organizational knowledge base rules (SmartMemory / ADRs) applicable to client documents', async () => {
		const { getApplicableDoctrineRules } = await import('$lib/domain/dialectic');
		const cctpDoc = getDocumentById(INITIAL_CORPUS_DOCUMENTS, 'DOC-CLI-01')!;
		const applicable = getApplicableDoctrineRules(cctpDoc);

		expect(applicable.length).toBeGreaterThanOrEqual(1);
		// DOC-CLI-01 (CCTP Lot 2) mentions synchronisation, holdover, phase precision -> must match ADR-0014
		const hasAdr14 = applicable.some((r) => r.id === 'KH:ADR-0014');
		expect(hasAdr14).toBe(true);
	});
});

