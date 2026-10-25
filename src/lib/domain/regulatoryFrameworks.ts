/**
 * Référentiels réglementaires et normatifs reconnus dans un RFP.
 *
 * Les codes sont ceux des référentiels de la base LLMOps (data/kb/controls/<CODE>). La détection est
 * déterministe (expressions sur le texte du RFP) : elle propose, l'architecte confirme à la création de l'espace.
 */
export interface RegulatoryFrameworkDef {
	code: string;
	label: string;
	defaultVersion: string;
	patterns: RegExp[];
}

export const REGULATORY_FRAMEWORKS: RegulatoryFrameworkDef[] = [
	{ code: 'NIS2', label: 'Directive NIS 2 (UE) 2022/2555', defaultVersion: '2022/2555', patterns: [/\bNIS\s?2\b/i, /2022\/2555/] },
	{ code: 'RGPD', label: 'RGPD (UE) 2016/679', defaultVersion: '2016/679', patterns: [/\bRGPD\b/, /\bGDPR\b/, /2016\/679/, /general data protection regulation/i, /règlement général sur la protection des données/i] },
	{ code: 'CRA', label: 'Cyber Resilience Act (UE) 2024/2847', defaultVersion: '2024/2847', patterns: [/cyber resilience act/i, /2024\/2847/] },
	{ code: 'DORA', label: 'DORA (UE) 2022/2554', defaultVersion: '2022/2554', patterns: [/\bDORA\b/, /2022\/2554/, /digital operational resilience/i] },
	{ code: 'CER', label: 'Directive CER (UE) 2022/2557', defaultVersion: '2022/2557', patterns: [/2022\/2557/, /resilience of critical entities/i, /résilience des entités critiques/i] },
	{ code: 'SecNumCloud', label: 'SecNumCloud (ANSSI)', defaultVersion: '3.2', patterns: [/secnumcloud/i] },
	{ code: 'ISO27001', label: 'ISO/IEC 27001', defaultVersion: '2022', patterns: [/ISO(?:\/IEC)?\s?27001/i] },
	{ code: 'ISO27005', label: 'ISO/IEC 27005', defaultVersion: '2022', patterns: [/ISO(?:\/IEC)?\s?27005/i] },
	{ code: 'ISO22301', label: 'ISO 22301', defaultVersion: '2019', patterns: [/ISO\s?22301/i] },
	{ code: 'ISO14001', label: 'ISO 14001', defaultVersion: '2015', patterns: [/ISO\s?14001/i] }
];

/**
 * Versions manifestement génériques à rejeter lors du téléversement d'un référentiel (#93).
 */
export const GENERIC_FRAMEWORK_VERSIONS = [
	'1.0',
	'1',
	'1.0.0',
	'v1',
	'v1.0',
	'v1.0.0',
	'0.1',
	'0.0.1',
	'latest',
	'draft',
	'brouillon',
	'default'
];

/**
 * Détermine si une chaîne de version est manifestement générique ou vide.
 */
export function isGenericFrameworkVersion(version: string | undefined | null): boolean {
	if (!version) return true;
	const norm = version.trim().toLowerCase();
	return !norm || GENERIC_FRAMEWORK_VERSIONS.includes(norm);
}

/**
 * Recherche la version par défaut / officielle d'un référentiel d'après son code, son libellé ou un texte.
 * Vérifie d'abord complianceFrameworks si fourni (issus de GET /api/compliance/frameworks),
 * puis le catalogue REGULATORY_FRAMEWORKS.
 */
export function lookupDefaultFrameworkVersion(
	frameworkCodeOrName: string,
	complianceFrameworks?: Array<{ framework: string; version: string }>
): string | undefined {
	if (!frameworkCodeOrName) return undefined;
	const trimmed = frameworkCodeOrName.trim();
	const upper = trimmed.toUpperCase();

	// 1. Recherche dans complianceFrameworks
	if (complianceFrameworks && complianceFrameworks.length > 0) {
		const found = complianceFrameworks.find(
			(cf) => cf.framework.toUpperCase() === upper || cf.version.toUpperCase() === upper
		);
		if (found?.version && !isGenericFrameworkVersion(found.version)) {
			return found.version;
		}
	}

	// 2. Recherche directe par code
	const byCode = REGULATORY_FRAMEWORKS.find((f) => f.code.toUpperCase() === upper);
	if (byCode) return byCode.defaultVersion;

	// 3. Recherche par libellé ou patterns regex
	const byPattern = REGULATORY_FRAMEWORKS.find(
		(f) => f.label.toUpperCase() === upper || f.patterns.some((p) => p.test(trimmed))
	);
	if (byPattern) return byPattern.defaultVersion;

	return undefined;
}

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


/**
 * Détermine si un expert possède un domaine selon les règles de gouvernance LLMOps :
 * - Un mainteneur (rôle 'kb:maintain') relit tous les domaines.
 * - Sinon, le domaine doit correspondre exactement à un domaine possédé, ou être un sous-domaine
 *   hiérarchique délimité par '/' (ex: 'it-infrastructure/virtualization' pour 'it-infrastructure').
 * - Note : un tiret '-' ne constitue PAS un séparateur hiérarchique (ex: 'security-governance' n'est pas un sous-domaine de 'security').
 */
export function userOwnsDomain(
	expert: { kbRoles?: string[]; ownedDomains?: string[] },
	domain: string
): boolean {
	if (expert.kbRoles?.includes('kb:maintain')) return true;
	if (!domain || !expert.ownedDomains?.length) return false;
	const d = domain.toLowerCase();
	return expert.ownedDomains.some((o) => {
		const owned = o.toLowerCase();
		return d === owned || d.startsWith(owned + '/');
	});
}
