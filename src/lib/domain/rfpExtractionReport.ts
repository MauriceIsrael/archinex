import type { ExtractedClause } from './corpus';

export type ExtractionAnomalyType =
	| 'numbering_gap'
	| 'duplicate_ref'
	| 'unnumbered_ref'
	| 'atypical_ref'
	| 'abnormally_short'
	| 'abnormally_long'
	| 'empty_page'
	| 'low_coverage';

export interface ExtractionAnomaly {
	id: string;
	type: ExtractionAnomalyType;
	severity: 'warning' | 'info';
	label: string;
	details: string;
	clauseRef?: string;
	pageNumber?: number;
	expectedPattern?: string;
}

export interface DetectedPatternSummary {
	prefix: string;
	count: number;
	sampleRefs: string[];
	isDominant: boolean;
}

export interface NumberingGap {
	prefix: string;
	expectedRange: string;
	missingNumbers: number[];
	precedingRef: string;
	followingRef: string;
}

export interface ExtractionReport {
	pageCount: number;
	clauseCount: number;
	totalCharacters: number;
	extractedCharacters: number;
	coverageRate: number; // 0 à 100 (%)
	detectedPatterns: DetectedPatternSummary[];
	gaps: NumberingGap[];
	duplicates: Array<{ baseRef: string; count: number; refs: string[] }>;
	unnumbered: string[];
	atypical: string[];
	abnormallyShortClauses: Array<{ clauseRef: string; length: number; textSnippet: string }>;
	abnormallyLongClauses: Array<{ clauseRef: string; length: number; textSnippet: string }>;
	pagesWithoutClauses: number[];
	anomalies: ExtractionAnomaly[];
	qualityScore: number; // 0 à 100
}

export interface VerificationSampleItem {
	id: string;
	clauseRef: string;
	title: string;
	text: string;
	pageNumber?: number;
	sourceExcerpt: string;
	isAnomaly: boolean;
	anomalyReasons: string[];
	status: 'pending' | 'accepted' | 'flagged';
	flagNote?: string;
}

export interface HumanExtractionValidation {
	validated: boolean;
	validatedAt?: string;
	validatedBy?: string;
	sampleSize: number;
	sampleItems: Array<{
		clauseRef: string;
		pageNumber?: number;
		status: 'accepted' | 'flagged';
		note?: string;
	}>;
	acceptedAnomaliesCount: number;
	flaggedIssuesCount: number;
	notes?: string;
	reportSummary: {
		pageCount: number;
		clauseCount: number;
		coverageRate: number;
		anomaliesCount: number;
	};
}

const PAGE_MARKER_REGEX = /^--\s*(\d+)\s+of\s+(\d+)\s*--$/im;

/**
 * Découpe un texte brut en pages selon les marqueurs standardisés `-- X of Y --`.
 * Si aucun marqueur n'est trouvé, la totalité du texte est associée à la page 1.
 */
export function splitTextIntoPages(rawText: string): Map<number, string> {
	const pagesMap = new Map<number, string>();
	if (!rawText || !rawText.trim()) return pagesMap;

	const lines = rawText.split(/\r?\n/);
	const hasMarkers = lines.some((l) => /^--\s*\d+\s+of\s+\d+\s*--$/i.test(l.trim()));

	if (!hasMarkers) {
		pagesMap.set(1, rawText.trim());
		return pagesMap;
	}

	let currentPage = 1;
	let currentLines: string[] = [];

	for (const line of lines) {
		const match = line.trim().match(/^--\s*(\d+)\s+of\s+(\d+)\s*--$/i);
		if (match) {
			if (currentLines.length > 0) {
				pagesMap.set(currentPage, currentLines.join('\n').trim());
				currentLines = [];
			}
			currentPage = parseInt(match[1], 10);
		} else {
			currentLines.push(line);
		}
	}

	if (currentLines.length > 0) {
		pagesMap.set(currentPage, currentLines.join('\n').trim());
	}

	return pagesMap;
}

/**
 * Détecte les motifs récurrents de référence (ex: REQ-Lot1-, Art. , Clause , §).
 */
export function detectReferencePatterns(clauses: ExtractedClause[]): DetectedPatternSummary[] {
	if (clauses.length === 0) return [];

	const patternMap = new Map<string, string[]>();

	for (const c of clauses) {
		const ref = c.clauseRef.replace(/#\d+$/, ''); // retire suffixe doublon #2
		let prefix = 'Autre';

		const mPrefix = ref.match(/^([a-zA-Z0-9_-]+[-_\s])/i);
		if (mPrefix) {
			prefix = mPrefix[1];
		} else if (/^art(?:icle|\.)?\s*/i.test(ref)) {
			const m = ref.match(/^(art(?:icle|\.)?\s*)/i);
			prefix = m ? m[1] : 'Art. ';
		} else if (/^clause\s*/i.test(ref)) {
			const m = ref.match(/^(clause\s*)/i);
			prefix = m ? m[1] : 'Clause ';
		} else if (/^exigence\s*/i.test(ref)) {
			const m = ref.match(/^(exigence\s*)/i);
			prefix = m ? m[1] : 'Exigence ';
		} else if (/^§\s*/i.test(ref)) {
			prefix = '§';
		}

		if (!patternMap.has(prefix)) {
			patternMap.set(prefix, []);
		}
		patternMap.get(prefix)!.push(c.clauseRef);
	}

	const totalClauses = clauses.length;
	const summaries: DetectedPatternSummary[] = [];

	for (const [prefix, sampleRefs] of patternMap.entries()) {
		const count = sampleRefs.length;
		summaries.push({
			prefix,
			count,
			sampleRefs: sampleRefs.slice(0, 5),
			isDominant: totalClauses >= 3 && count / totalClauses >= 0.6
		});
	}

	return summaries.sort((a, b) => b.count - a.count);
}

/**
 * Détecte les trous dans la numérotation des exigences séquentielles.
 */
export function detectNumberingGaps(clauses: ExtractedClause[]): NumberingGap[] {
	const prefixNumbers = new Map<string, Array<{ num: number; ref: string }>>();

	for (const c of clauses) {
		const cleanRef = c.clauseRef.replace(/#\d+$/, '');
		const m = cleanRef.match(/^([a-zA-Z0-9_-]+[-_\s])(\d+)$/i);
		if (m) {
			const prefix = m[1];
			const num = parseInt(m[2], 10);
			if (!prefixNumbers.has(prefix)) {
				prefixNumbers.set(prefix, []);
			}
			prefixNumbers.get(prefix)!.push({ num, ref: c.clauseRef });
		}
	}

	const gaps: NumberingGap[] = [];

	for (const [prefix, items] of prefixNumbers.entries()) {
		if (items.length < 2) continue;

		// Dédupliquer les numéros identiques (ex: doublons #2) et trier par ordre croissant
		const uniqueSorted = [...new Map(items.map((it) => [it.num, it])).values()].sort(
			(a, b) => a.num - b.num
		);

		for (let i = 0; i < uniqueSorted.length - 1; i++) {
			const current = uniqueSorted[i];
			const next = uniqueSorted[i + 1];

			if (next.num > current.num + 1) {
				const missingCount = next.num - current.num - 1;
				// Ne signaler les trous que s'ils sont raisonnables (<= 100), pour éviter les faux positifs lors de sauts de séries majeurs
				if (missingCount <= 100) {
					const missingNumbers: number[] = [];
					for (let n = current.num + 1; n < next.num; n++) {
						missingNumbers.push(n);
					}
					const expectedRange =
						missingNumbers.length === 1
							? `${prefix}${missingNumbers[0]}`
							: `${prefix}${missingNumbers[0]} .. ${prefix}${missingNumbers[missingNumbers.length - 1]}`;

					gaps.push({
						prefix,
						expectedRange,
						missingNumbers,
						precedingRef: current.ref,
						followingRef: next.ref
					});
				}
			}
		}
	}

	return gaps;
}

/**
 * Détecte les doublons, les références sans numéro et les références atypiques.
 */
export function detectDuplicatesAndUnnumbered(
	clauses: ExtractedClause[],
	dominantPrefix?: string
): {
	duplicates: Array<{ baseRef: string; count: number; refs: string[] }>;
	unnumbered: string[];
	atypical: string[];
} {
	const baseRefs = new Map<string, string[]>();
	const unnumbered: string[] = [];
	const atypical: string[] = [];

	for (const c of clauses) {
		const ref = c.clauseRef;
		if (ref.includes('?') || !/\d/.test(ref)) {
			unnumbered.push(ref);
		}

		const base = ref.replace(/#\d+$/, '');
		if (!baseRefs.has(base)) {
			baseRefs.set(base, []);
		}
		baseRefs.get(base)!.push(ref);

		// Atypique si un préfixe dominant couvre > 70% et que cette clause ne le respecte pas
		if (dominantPrefix && !ref.startsWith(dominantPrefix) && !ref.startsWith(dominantPrefix.trim())) {
			atypical.push(ref);
		} else if (/^§\d+\.0$/.test(ref) && dominantPrefix && dominantPrefix !== '§') {
			atypical.push(ref);
		}
	}

	const duplicates: Array<{ baseRef: string; count: number; refs: string[] }> = [];
	for (const [baseRef, refs] of baseRefs.entries()) {
		if (refs.length > 1) {
			duplicates.push({ baseRef, count: refs.length, refs });
		}
	}

	return { duplicates, unnumbered, atypical };
}

/**
 * Analyse complète de l'extraction d'un RFP.
 */
export function computeExtractionReport(
	rawText: string,
	clauses: ExtractedClause[],
	pageTexts?: Array<{ pageNumber: number; text: string }> | Map<number, string>
): ExtractionReport {
	let pagesMap: Map<number, string>;
	if (pageTexts instanceof Map) {
		pagesMap = pageTexts;
	} else if (Array.isArray(pageTexts)) {
		pagesMap = new Map(pageTexts.map((p) => [p.pageNumber, p.text]));
	} else {
		pagesMap = splitTextIntoPages(rawText);
	}

	const pageCount = Math.max(1, pagesMap.size);
	const clauseCount = clauses.length;

	// Calcul des caractères et couverture
	const cleanRawText = rawText
		.replace(/^--\s*\d+\s+of\s+\d+\s*--$/gim, '')
		.replace(/\s+/g, ' ')
		.trim();
	const totalCharacters = Math.max(1, cleanRawText.length);

	let extractedCharacters = 0;
	for (const c of clauses) {
		extractedCharacters += (c.title || '').length + (c.text || '').length;
	}

	const rawCoverage = (extractedCharacters / totalCharacters) * 100;
	const coverageRate = Math.min(100, Math.round(rawCoverage * 10) / 10);

	// Analyse des motifs et détection du préfixe dominant
	const detectedPatterns = detectReferencePatterns(clauses);
	const dominant = detectedPatterns.find((p) => p.isDominant)?.prefix;

	// Trous de numérotation
	const gaps = detectNumberingGaps(clauses);

	// Doublons, sans numéro et atypiques
	const { duplicates, unnumbered, atypical } = detectDuplicatesAndUnnumbered(clauses, dominant);

	// Clauses anormalement courtes ou longues
	const abnormallyShortClauses: Array<{ clauseRef: string; length: number; textSnippet: string }> = [];
	const abnormallyLongClauses: Array<{ clauseRef: string; length: number; textSnippet: string }> = [];

	for (const c of clauses) {
		const len = (c.text || '').trim().length;
		const snippet = (c.text || '').trim().slice(0, 80);
		if (len < 25) {
			abnormallyShortClauses.push({ clauseRef: c.clauseRef, length: len, textSnippet: snippet });
		} else if (len > 2500) {
			abnormallyLongClauses.push({ clauseRef: c.clauseRef, length: len, textSnippet: snippet });
		}
	}

	// Pages sans aucune clause
	const pagesWithoutClauses: number[] = [];
	if (pageCount > 1) {
		const pagesWithClauses = new Set<number>();
		for (const c of clauses) {
			if (typeof c.pageNumber === 'number') {
				pagesWithClauses.add(c.pageNumber);
			}
		}

		for (const [pageNum, pageText] of pagesMap.entries()) {
			if (!pagesWithClauses.has(pageNum)) {
				// Ne signaler que les pages avec un volume textuel substantiel (> 60 caractères)
				if (pageText.trim().length > 60) {
					pagesWithoutClauses.push(pageNum);
				}
			}
		}
		pagesWithoutClauses.sort((a, b) => a - b);
	}

	// Assemblage des anomalies explicites
	const anomalies: ExtractionAnomaly[] = [];

	for (const gap of gaps) {
		anomalies.push({
			id: `gap-${gap.prefix}-${gap.missingNumbers.join('_')}`,
			type: 'numbering_gap',
			severity: 'warning',
			label: `Trou de numérotation : ${gap.expectedRange}`,
			details: `Exigences manquantes entre ${gap.precedingRef} et ${gap.followingRef} (${gap.missingNumbers.length} manquante${gap.missingNumbers.length > 1 ? 's' : ''})`,
			expectedPattern: gap.prefix
		});
	}

	for (const dup of duplicates) {
		anomalies.push({
			id: `dup-${dup.baseRef}`,
			type: 'duplicate_ref',
			severity: 'warning',
			label: `Référence en double : ${dup.baseRef}`,
			details: `Apparaît ${dup.count} fois dans le document (${dup.refs.join(', ')})`,
			clauseRef: dup.baseRef
		});
	}

	for (const un of unnumbered) {
		anomalies.push({
			id: `unnum-${un}`,
			type: 'unnumbered_ref',
			severity: 'warning',
			label: `Référence sans numéro : ${un}`,
			details: `L'exigence ne possède aucun numéro explicite dans le texte source`,
			clauseRef: un
		});
	}

	for (const aty of atypical) {
		anomalies.push({
			id: `atyp-${aty}`,
			type: 'atypical_ref',
			severity: 'info',
			label: `Référence atypique : ${aty}`,
			details: `Ne suit pas le motif dominant du document (${dominant || 'standard'})`,
			clauseRef: aty
		});
	}

	for (const sh of abnormallyShortClauses.slice(0, 10)) {
		anomalies.push({
			id: `short-${sh.clauseRef}`,
			type: 'abnormally_short',
			severity: 'warning',
			label: `Clause courte (${sh.length} car.) : ${sh.clauseRef}`,
			details: sh.textSnippet ? `Texte : "${sh.textSnippet}..."` : 'Contenu quasi-vide',
			clauseRef: sh.clauseRef
		});
	}

	for (const lg of abnormallyLongClauses.slice(0, 10)) {
		anomalies.push({
			id: `long-${lg.clauseRef}`,
			type: 'abnormally_long',
			severity: 'warning',
			label: `Clause très volumineuse (${lg.length.toLocaleString('fr-FR')} car.) : ${lg.clauseRef}`,
			details: `Possible concaténation de plusieurs exigences non délimitées`,
			clauseRef: lg.clauseRef
		});
	}

	if (pagesWithoutClauses.length > 0) {
		const samplePages = pagesWithoutClauses.slice(0, 6).join(', ');
		const extra = pagesWithoutClauses.length > 6 ? ` et ${pagesWithoutClauses.length - 6} autres` : '';
		anomalies.push({
			id: `empty-pages`,
			type: 'empty_page',
			severity: 'info',
			label: `${pagesWithoutClauses.length} page${pagesWithoutClauses.length > 1 ? 's' : ''} sans exigence`,
			details: `Pages : ${samplePages}${extra}. Vérifier s'il s'agit de pages de garde, sommaires ou annexes non découpées.`
		});
	}

	if (coverageRate < 60) {
		anomalies.push({
			id: `low-coverage`,
			type: 'low_coverage',
			severity: 'warning',
			label: `Faible couverture textuelle (${coverageRate} %)`,
			details: `Seulement ${coverageRate} % du texte du document est rattaché à une exigence. Des sections importantes risquent d'être ignorées lors de l'audit.`
		});
	}

	// Score de qualité du découpage (0 à 100)
	let qualityScore = 100;
	if (gaps.length > 0) qualityScore -= Math.min(25, gaps.length * 5);
	if (duplicates.length > 0) qualityScore -= Math.min(20, duplicates.length * 5);
	if (unnumbered.length > 0) qualityScore -= Math.min(15, unnumbered.length * 5);
	if (coverageRate < 70) qualityScore -= Math.round((70 - coverageRate) * 0.8);
	if (abnormallyShortClauses.length > 10) qualityScore -= 10;
	if (abnormallyLongClauses.length > 5) qualityScore -= 10;
	qualityScore = Math.max(0, Math.min(100, qualityScore));

	return {
		pageCount,
		clauseCount,
		totalCharacters,
		extractedCharacters,
		coverageRate,
		detectedPatterns,
		gaps,
		duplicates,
		unnumbered,
		atypical,
		abnormallyShortClauses,
		abnormallyLongClauses,
		pagesWithoutClauses,
		anomalies,
		qualityScore
	};
}

/**
 * Génère l'échantillon de vérification humaine :
 * - Toutes les clauses présentant une anomalie (trous, doublons, sans numéro, courtes, longues, atypiques)
 * - Complété par un échantillon aléatoire/représentatif de clauses normales (environ 10)
 * - Présenté côte à côte avec l'extrait de la page source correspondante
 */
export function generateVerificationSample(
	report: ExtractionReport,
	clauses: ExtractedClause[],
	pagesMap?: Map<number, string>,
	targetNormalSampleSize = 10
): VerificationSampleItem[] {
	if (clauses.length === 0) return [];

	const clausesByRef = new Map(clauses.map((c) => [c.clauseRef, c]));
	const anomalyClausesMap = new Map<string, string[]>();

	// 1. Enregistrer toutes les clauses liées à des anomalies
	for (const gap of report.gaps) {
		const addReason = (ref: string, reason: string) => {
			if (!anomalyClausesMap.has(ref)) anomalyClausesMap.set(ref, []);
			anomalyClausesMap.get(ref)!.push(reason);
		};
		addReason(gap.precedingRef, `Précède le trou de numérotation ${gap.expectedRange}`);
		addReason(gap.followingRef, `Suit le trou de numérotation ${gap.expectedRange}`);
	}

	for (const dup of report.duplicates) {
		for (const r of dup.refs) {
			if (!anomalyClausesMap.has(r)) anomalyClausesMap.set(r, []);
			anomalyClausesMap.get(r)!.push(`Référence en double (${dup.count} occurrences)`);
		}
	}

	for (const un of report.unnumbered) {
		if (!anomalyClausesMap.has(un)) anomalyClausesMap.set(un, []);
		anomalyClausesMap.get(un)!.push('Référence sans numéro explicite');
	}

	for (const aty of report.atypical) {
		if (!anomalyClausesMap.has(aty)) anomalyClausesMap.set(aty, []);
		anomalyClausesMap.get(aty)!.push('Référence atypique');
	}

	for (const sh of report.abnormallyShortClauses) {
		if (!anomalyClausesMap.has(sh.clauseRef)) anomalyClausesMap.set(sh.clauseRef, []);
		anomalyClausesMap.get(sh.clauseRef)!.push(`Clause anormalement courte (${sh.length} caractères)`);
	}

	for (const lg of report.abnormallyLongClauses) {
		if (!anomalyClausesMap.has(lg.clauseRef)) anomalyClausesMap.set(lg.clauseRef, []);
		anomalyClausesMap.get(lg.clauseRef)!.push(`Clause anormalement longue (${lg.length} caractères)`);
	}

	const sampleItems: VerificationSampleItem[] = [];
	const seenRefs = new Set<string>();

	// 2. Ajouter d'abord les clauses avec anomalies
	for (const [ref, reasons] of anomalyClausesMap.entries()) {
		const clause = clausesByRef.get(ref);
		if (!clause) continue;
		seenRefs.add(ref);

		const excerpt = getSourceExcerpt(clause, pagesMap);
		sampleItems.push({
			id: `sample-${clause.id}`,
			clauseRef: clause.clauseRef,
			title: clause.title,
			text: clause.text,
			pageNumber: clause.pageNumber,
			sourceExcerpt: excerpt,
			isAnomaly: true,
			anomalyReasons: reasons,
			status: 'pending'
		});
	}

	// 3. Compléter avec des clauses normales réparties uniformément
	const normalClauses = clauses.filter((c) => !seenRefs.has(c.clauseRef));
	if (normalClauses.length > 0) {
		const step = Math.max(1, Math.floor(normalClauses.length / targetNormalSampleSize));
		for (let i = 0; i < normalClauses.length && sampleItems.length < anomalyClausesMap.size + targetNormalSampleSize; i += step) {
			const c = normalClauses[i];
			if (seenRefs.has(c.clauseRef)) continue;
			seenRefs.add(c.clauseRef);

			const excerpt = getSourceExcerpt(c, pagesMap);
			sampleItems.push({
				id: `sample-${c.id}`,
				clauseRef: c.clauseRef,
				title: c.title,
				text: c.text,
				pageNumber: c.pageNumber,
				sourceExcerpt: excerpt,
				isAnomaly: false,
				anomalyReasons: ['Échantillon représentatif'],
				status: 'pending'
			});
		}
	}

	return sampleItems;
}

/**
 * Extrait le contexte ou la page source correspondante pour une clause donnée.
 */
function getSourceExcerpt(clause: ExtractedClause, pagesMap?: Map<number, string>): string {
	if (pagesMap && typeof clause.pageNumber === 'number' && pagesMap.has(clause.pageNumber)) {
		const fullPage = pagesMap.get(clause.pageNumber)!;
		return fullPage;
	}

	// Fallback : retourne le titre et le texte de la clause
	return `[Extrait de clause] ${clause.clauseRef} - ${clause.title}\n\n${clause.text}`;
}

/**
 * Fabrique l'objet de validation humaine à persister avec l'audit.
 */
export function createHumanValidationRecord(params: {
	validated: boolean;
	validatedBy?: string;
	sample: VerificationSampleItem[];
	report: ExtractionReport;
	notes?: string;
}): HumanExtractionValidation {
	const acceptedAnomaliesCount = params.sample.filter((s) => s.isAnomaly && s.status === 'accepted').length;
	const flaggedIssuesCount = params.sample.filter((s) => s.status === 'flagged').length;

	return {
		validated: params.validated,
		validatedAt: params.validated ? new Date().toISOString() : undefined,
		validatedBy: params.validatedBy || (params.validated ? 'architecte@archinex.local' : undefined),
		sampleSize: params.sample.length,
		sampleItems: params.sample.map((s) => ({
			clauseRef: s.clauseRef,
			pageNumber: s.pageNumber,
			status: s.status === 'flagged' ? 'flagged' : 'accepted',
			note: s.flagNote
		})),
		acceptedAnomaliesCount,
		flaggedIssuesCount,
		notes: params.notes,
		reportSummary: {
			pageCount: params.report.pageCount,
			clauseCount: params.report.clauseCount,
			coverageRate: params.report.coverageRate,
			anomaliesCount: params.report.anomalies.length
		}
	};
}
