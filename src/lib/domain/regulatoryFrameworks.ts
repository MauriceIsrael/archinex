/**
 * Référentiels réglementaires et normatifs reconnus dans un RFP.
 *
 * Les codes sont ceux des référentiels de la base LLMOps (data/kb/controls/<CODE>). La détection est
 * déterministe (expressions sur le texte du RFP) : elle propose, l'architecte confirme à la création de l'espace.
 */
export interface RegulatoryFrameworkDef {
	code: string;
	label: string;
	patterns: RegExp[];
}

export const REGULATORY_FRAMEWORKS: RegulatoryFrameworkDef[] = [
	{ code: 'NIS2', label: 'Directive NIS 2 (UE) 2022/2555', patterns: [/\bNIS\s?2\b/i, /2022\/2555/] },
	{ code: 'RGPD', label: 'RGPD (UE) 2016/679', patterns: [/\bRGPD\b/, /\bGDPR\b/, /2016\/679/, /general data protection regulation/i, /règlement général sur la protection des données/i] },
	{ code: 'CRA', label: 'Cyber Resilience Act (UE) 2024/2847', patterns: [/cyber resilience act/i, /2024\/2847/] },
	{ code: 'DORA', label: 'DORA (UE) 2022/2554', patterns: [/\bDORA\b/, /2022\/2554/, /digital operational resilience/i] },
	{ code: 'CER', label: 'Directive CER (UE) 2022/2557', patterns: [/2022\/2557/, /resilience of critical entities/i, /résilience des entités critiques/i] },
	{ code: 'SecNumCloud', label: 'SecNumCloud (ANSSI)', patterns: [/secnumcloud/i] },
	{ code: 'ISO27001', label: 'ISO/IEC 27001', patterns: [/ISO(?:\/IEC)?\s?27001/i] },
	{ code: 'ISO27005', label: 'ISO/IEC 27005', patterns: [/ISO(?:\/IEC)?\s?27005/i] },
	{ code: 'ISO22301', label: 'ISO 22301', patterns: [/ISO\s?22301/i] },
	{ code: 'ISO14001', label: 'ISO 14001', patterns: [/ISO\s?14001/i] }
];

export interface DetectedFramework {
	code: string;
	label: string;
	mentions: number;
	/** Premier passage du RFP qui le cite, pour que l'architecte juge en connaissance de cause. */
	excerpt: string;
}

/** Référentiels cités par le texte, du plus cité au moins cité. */
export function detectApplicableFrameworks(text: string): DetectedFramework[] {
	const flat = text.replace(/\s+/g, ' ');
	const found: DetectedFramework[] = [];
	for (const fw of REGULATORY_FRAMEWORKS) {
		let mentions = 0;
		let first = -1;
		for (const pattern of fw.patterns) {
			const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
			for (const m of flat.matchAll(global)) {
				mentions++;
				if (first < 0 || (m.index ?? 0) < first) first = m.index ?? 0;
			}
		}
		if (mentions > 0) {
			const start = Math.max(0, first - 80);
			found.push({ code: fw.code, label: fw.label, mentions, excerpt: `${start > 0 ? '…' : ''}${flat.slice(start, first + 120).trim()}…` });
		}
	}
	return found.sort((a, b) => b.mentions - a.mentions);
}
