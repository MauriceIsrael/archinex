import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { shredRfpTextToClauses } from '$lib/domain/rfpConfrontation';
import {
	computeExtractionReport,
	generateVerificationSample,
	createHumanValidationRecord,
	splitTextIntoPages,
	detectNumberingGaps,
	detectReferencePatterns,
	type ExtractionReport
} from '$lib/domain/rfpExtractionReport';
import type { ExtractedClause } from '$lib/domain/corpus';

describe('RFP Extraction Report & Anomaly Detection Contract', () => {
	it('détecte explicitement les trous dans la numérotation des exigences', () => {
		const mockClauses: ExtractedClause[] = [
			{ id: '1', clauseRef: 'REQ-Lot1-10', title: 'T10', text: 'Text 10', criticality: 'info' },
			{ id: '2', clauseRef: 'REQ-Lot1-11', title: 'T11', text: 'Text 11', criticality: 'info' },
			{ id: '3', clauseRef: 'REQ-Lot1-12', title: 'T12', text: 'Text 12', criticality: 'info' },
			// Trou ici : manque 13 et 14
			{ id: '4', clauseRef: 'REQ-Lot1-15', title: 'T15', text: 'Text 15', criticality: 'info' },
			{ id: '5', clauseRef: 'REQ-Lot1-16', title: 'T16', text: 'Text 16', criticality: 'info' },
			// Trou ici : manque 17
			{ id: '6', clauseRef: 'REQ-Lot1-18', title: 'T18', text: 'Text 18', criticality: 'info' }
		];

		const gaps = detectNumberingGaps(mockClauses);
		expect(gaps.length).toBe(2);

		expect(gaps[0].prefix).toBe('REQ-Lot1-');
		expect(gaps[0].precedingRef).toBe('REQ-Lot1-12');
		expect(gaps[0].followingRef).toBe('REQ-Lot1-15');
		expect(gaps[0].missingNumbers).toEqual([13, 14]);
		expect(gaps[0].expectedRange).toBe('REQ-Lot1-13 .. REQ-Lot1-14');

		expect(gaps[1].precedingRef).toBe('REQ-Lot1-16');
		expect(gaps[1].followingRef).toBe('REQ-Lot1-18');
		expect(gaps[1].missingNumbers).toEqual([17]);
		expect(gaps[1].expectedRange).toBe('REQ-Lot1-17');
	});

	it('identifie les doublons, références sans numéro et atypiques dans le rapport', () => {
		const rawText = `
Clause 1.1 - Début
Contenu 1.1
REQ-Lot1-1 - Exigence 1
Contenu 1
REQ-Lot1-2 - Exigence 2
Contenu 2
REQ-Lot1-2#2 - Exigence 2 en double
Rappel dans un tableau
REQ-Lot1-? - Exigence sans numéro
Contenu sans numéro
REQ-Lot1-3 - Exigence 3
C
`.trim();

		const clauses = shredRfpTextToClauses(rawText);
		const report = computeExtractionReport(rawText, clauses);

		expect(report.duplicates.length).toBeGreaterThanOrEqual(1);
		expect(report.duplicates.some((d) => d.baseRef === 'REQ-Lot1-2')).toBe(true);

		expect(report.unnumbered).toContain('REQ-Lot1-?');
		expect(report.atypical).toContain('§1.1');

		// Vérification des anomalies explicites
		const anomalyTypes = report.anomalies.map((a) => a.type);
		expect(anomalyTypes).toContain('duplicate_ref');
		expect(anomalyTypes).toContain('unnumbered_ref');
		expect(anomalyTypes).toContain('atypical_ref');
		expect(anomalyTypes).toContain('abnormally_short'); // 'C' est très court (< 25 car.)
	});

	it('génère un échantillon de vérification avec anomalies prioritaires et extrait source', () => {
		const rawPagesText = `
-- 1 of 3 --
En-tête Document Page 1
REQ-Lot1-1 Titre 1
Corps d'exigence 1 sur page 1
REQ-Lot1-2 Titre 2
Corps d'exigence 2 sur page 1
-- 2 of 3 --
En-tête Document Page 2
REQ-Lot1-2 Titre 2 (rappel)
Corps rappel
REQ-Lot1-? Titre Sans Numéro
Corps sans numéro
-- 3 of 3 --
En-tête Document Page 3
REQ-Lot1-5 Titre 5
Court
`.trim();

		const clauses = shredRfpTextToClauses(rawPagesText);
		const pagesMap = splitTextIntoPages(rawPagesText);
		const report = computeExtractionReport(rawPagesText, clauses, pagesMap);

		const sample = generateVerificationSample(report, clauses, pagesMap, 5);
		expect(sample.length).toBeGreaterThanOrEqual(3);

		// Les anomalies doivent être présentes dans l'échantillon
		const anomalySampleItems = sample.filter((s) => s.isAnomaly);
		expect(anomalySampleItems.length).toBeGreaterThanOrEqual(2);

		// Chaque item a son extrait source et ses raisons
		for (const item of sample) {
			expect(item.sourceExcerpt).toBeTruthy();
			expect(item.status).toBe('pending');
			expect(item.anomalyReasons.length).toBeGreaterThan(0);
		}

		// Validation humaine de l'échantillon
		sample.forEach((s) => (s.status = 'accepted'));
		const validation = createHumanValidationRecord({
			validated: true,
			validatedBy: 'architecte@entreprise.fr',
			sample,
			report,
			notes: 'Découpage validé après relecture de l’échantillon'
		});

		expect(validation.validated).toBe(true);
		expect(validation.validatedBy).toBe('architecte@entreprise.fr');
		expect(validation.sampleSize).toBe(sample.length);
		expect(validation.acceptedAnomaliesCount).toBe(anomalySampleItems.length);
		expect(validation.flaggedIssuesCount).toBe(0);
		expect(validation.reportSummary.clauseCount).toBe(clauses.length);
	});

	it('analyse avec succès la mise en page Markdown de lumicc-noc (exemple 1)', () => {
		const mdPath = resolve('examples/lumicc-noc/rfp-section4-noc.md');
		expect(existsSync(mdPath)).toBe(true);

		const rawMd = readFileSync(mdPath, 'utf-8');
		const clauses = shredRfpTextToClauses(rawMd);
		const report = computeExtractionReport(rawMd, clauses);

		expect(report.clauseCount).toBe(92);
		expect(report.pageCount).toBe(1); // Document Markdown sans marqueurs de page PDF
		expect(report.detectedPatterns.length).toBeGreaterThanOrEqual(1);

		// Vérification du motif REQ-Lot1-
		const dominant = report.detectedPatterns[0];
		expect(dominant.prefix).toBe('REQ-Lot1-');
		expect(dominant.count).toBe(92);

		// Pas de trous anormaux dans cette section contiguë (191 à 282)
		expect(report.gaps.length).toBe(0);
		expect(report.duplicates.length).toBe(0);
		expect(report.unnumbered.length).toBe(0);
		expect(report.qualityScore).toBeGreaterThanOrEqual(90);

		// L'échantillon de vérification doit être généré correctement
		const sample = generateVerificationSample(report, clauses, undefined, 10);
		expect(sample.length).toBeGreaterThanOrEqual(10);
		expect(sample[0].sourceExcerpt).toContain('REQ-Lot1-');
	});

	it('analyse avec succès le RFP PDF complexe Lulu.pdf de 194 pages (exemple 2)', async () => {
		const pdfPath = resolve('examples/Lulu.pdf');
		if (!existsSync(pdfPath)) {
			console.warn('examples/Lulu.pdf non trouvé, test ignoré');
			return;
		}

		const parser = new PDFParse({ data: readFileSync(pdfPath) });
		const pdfResult = await parser.getText();
		await parser.destroy();

		const rawText = pdfResult.text || '';
		const clauses = shredRfpTextToClauses(rawText);
		const pagesMap = splitTextIntoPages(rawText);
		const report = computeExtractionReport(rawText, clauses, pagesMap);

		// Critères du RFP réel : 194 pages, ~1 393 clauses extraites
		expect(report.pageCount).toBe(194);
		expect(report.clauseCount).toBeGreaterThanOrEqual(1380);

		// Détection du motif dominant REQ-Lot1-
		const dominant = report.detectedPatterns.find((p) => p.prefix === 'REQ-Lot1-');
		expect(dominant).toBeDefined();
		expect(dominant?.count).toBeGreaterThanOrEqual(1380);

		// L'exigence sans numéro connue est identifiée
		expect(report.unnumbered).toContain('REQ-Lot1-?');

		// Des pages sans clause (page de garde, sommaire) sont identifiées
		expect(report.pagesWithoutClauses.length).toBeGreaterThan(0);
		expect(report.pagesWithoutClauses).toContain(1); // Page de garde

		// Clauses courtes identifiées
		expect(report.abnormallyShortClauses.length).toBeGreaterThan(0);

		// Échantillon de vérification
		const sample = generateVerificationSample(report, clauses, pagesMap, 10);
		expect(sample.length).toBeGreaterThanOrEqual(15);

		// L'exigence sans numéro doit figurer dans l'échantillon
		const unnumberedSample = sample.find((s) => s.clauseRef === 'REQ-Lot1-?');
		expect(unnumberedSample).toBeDefined();
		expect(unnumberedSample?.isAnomaly).toBe(true);

		// L'échantillon associe la clause à sa page source correspondante
		const sampleWithPage = sample.find((s) => typeof s.pageNumber === 'number');
		expect(sampleWithPage).toBeDefined();
		expect(sampleWithPage?.sourceExcerpt.length).toBeGreaterThan(50);
	});
});
