import type {
	QuestionTriggerAction,
	RuleCondition,
	ReferenceRule
} from './projectRules';

export type ReflexRuleStatus = 'draft' | 'published' | 'deprecated';
export type ReflexRuleSource = 'catalog' | 'promoted_agent' | 'admin_authored';
export type VocabularyValueType = 'enum' | 'number' | 'boolean' | 'string';

export interface CanonicalFactValue {
	canonical: string;
	label: string;
	aliases: string[];
}

export interface FactVocabularyItem {
	key: string;
	label: string;
	valueType: VocabularyValueType;
	canonicalValues: CanonicalFactValue[];
	description: string;
}

export interface ReflexRuleRecord {
	id: string;
	version: number;
	status: ReflexRuleStatus;
	title: string;
	domain: string;
	assetRef: string;
	assetType: 'pattern' | 'principle' | 'control' | 'standard';
	mandatory: boolean;
	conditions: RuleCondition[];
	semanticHints: string[];
	action: QuestionTriggerAction;
	source: ReflexRuleSource;
	createdBy?: string | null;
	updatedBy?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface ReflexProjectMetrics {
	ruleId: string;
	disabledCount: number;
	disabledJustifications: string[];
	triggeredCount: number;
}

export interface ReflexOverlapWarning {
	ruleAId: string;
	ruleATitle: string;
	ruleBId: string;
	ruleBTitle: string;
	reason: string;
	severity: 'warning' | 'info';
}

export interface ReflexSimulationMatch {
	ruleId: string;
	title: string;
	domain: string;
	status: ReflexRuleStatus;
	mandatory: boolean;
	matchKind: 'deterministic' | 'semantic_suggestion' | 'unmatched';
	semanticScore: number;
	matchedAliases: string[];
	triggeredSubjectName: string;
	triggeredQuestion: string;
	conditionDetails: string[];
}

export interface AgentBlindspotCandidate {
	fingerprint: string;
	subjectName: string;
	questionText: string;
	grounds: string;
	occurrences: number;
	sampleFacts: Array<{ key: string; value: string }>;
	lastProposedAt: string;
}

export const REFLEX_DOMAINS = [
	{ id: 'resilience', label: 'Résilience & Continuité' },
	{ id: 'security', label: 'Sécurité & Cyber' },
	{ id: 'sovereignty', label: 'Souveraineté & Conformité' },
	{ id: 'network', label: 'Réseau & Interconnexion' },
	{ id: 'data', label: 'Données & Stockage' },
	{ id: 'cost', label: 'FinOps & Exploitation' },
	{ id: 'general', label: 'Transverse' }
] as const;

export const DEFAULT_FACT_VOCABULARY_ITEMS: FactVocabularyItem[] = [
	{
		key: 'resilience_mode',
		label: 'Mode de résilience',
		valueType: 'enum',
		description: 'Stratégie de disponibilité et de bascule inter-sites ou inter-zones.',
		canonicalValues: [
			{
				canonical: 'actif/actif',
				label: 'Actif / Actif (synchrone)',
				aliases: ['active/active', 'active-active', 'actif-actif', 'bi-site actif', 'multi-site actif']
			},
			{
				canonical: 'actif/passif',
				label: 'Actif / Passif (bascule)',
				aliases: ['active/passive', 'active-passive', 'actif-passif', 'standby', 'chaud-froid']
			},
			{
				canonical: 'mono-site',
				label: 'Mono-site tolérant aux pannes locales',
				aliases: ['single-site', 'mono site', 'single zone']
			}
		]
	},
	{
		key: 'site_count',
		label: 'Nombre de sites / datacenters',
		valueType: 'number',
		description: 'Nombre de localisations physiques ou régions actives.',
		canonicalValues: [
			{ canonical: '1', label: '1 site', aliases: ['un site', 'mono-site', '1 site'] },
			{ canonical: '2', label: '2 sites', aliases: ['deux sites', 'bi-site', 'dual-site', '2 sites', '2 dc'] },
			{ canonical: '3', label: '3 sites ou plus', aliases: ['trois sites', 'tri-site', '3 sites', '3 dc'] }
		]
	},
	{
		key: 'sovereignty_level',
		label: 'Niveau de souveraineté',
		valueType: 'enum',
		description: 'Exigence de qualification ou d’hébergement souverain.',
		canonicalValues: [
			{
				canonical: 'secnumcloud',
				label: 'SecNumCloud (ANSSI)',
				aliases: ['secnumcloud 3.2', 'qualifié anssi', 'cloud de confiance', 'souverain anssi']
			},
			{
				canonical: 'hds',
				label: 'Hébergeur Données de Santé (HDS)',
				aliases: ['données de santé', 'certification hds']
			},
			{
				canonical: 'eu_only',
				label: 'Résidence UE stricte',
				aliases: ['ue uniquement', 'gdpr eu', 'europe only', 'hors cloud act']
			},
			{
				canonical: 'standard',
				label: 'Cloud public standard',
				aliases: ['commercial cloud', 'public standard']
			}
		]
	},
	{
		key: 'security_level',
		label: 'Criticité réglementaire (NIS2 / DORA)',
		valueType: 'enum',
		description: 'Classification de criticité cybersécurité du SI.',
		canonicalValues: [
			{
				canonical: 'essential',
				label: 'Entité Essentielle (NIS2 / OIV)',
				aliases: ['essentielle', 'entité essentielle', 'oiv', 'ose', 'nis2 essentiel', 'critical']
			},
			{
				canonical: 'important',
				label: 'Entité Importante (NIS2)',
				aliases: ['importante', 'entité importante', 'nis2 important']
			},
			{
				canonical: 'standard',
				label: 'Standard entreprise',
				aliases: ['baseline', 'normal']
			}
		]
	},
	{
		key: 'topology',
		label: 'Topologie de déploiement',
		valueType: 'enum',
		description: 'Architecture globale d’hébergement.',
		canonicalValues: [
			{ canonical: 'baremetal', label: 'Baremetal', aliases: ['bare-metal', 'serveurs nus', 'on-premise baremetal'] },
			{ canonical: 'hybrid', label: 'Cloud Hybride', aliases: ['hybride', 'hybrid cloud', 'multi-cloud hybride'] },
			{ canonical: 'cloud_native', label: 'Cloud Natif', aliases: ['cloud-native', 'managed cloud', 'saas/paas'] }
		]
	},
	{
		key: 'cloud_provider',
		label: 'Fournisseur d’infrastructure',
		valueType: 'string',
		description: 'Hébergeur ou pile d’infrastructure cible.',
		canonicalValues: [
			{ canonical: 'on_prem', label: 'On-Premise / Privé', aliases: ['on-premise', 'datacenter privé', 'interne'] },
			{ canonical: 'sovereign_csp', label: 'CSP Souverain', aliases: ['bleu', 's3ns', 'ovh secnumcloud', 'cloud temple'] },
			{ canonical: 'hyperscaler', label: 'Hyperscaler', aliases: ['aws', 'azure', 'gcp'] }
		]
	},
	{
		key: 'latency_target',
		label: 'Latence cible (ms)',
		valueType: 'number',
		description: 'Exigence de latence maximale bout-en-bout.',
		canonicalValues: [
			{ canonical: '10', label: '≤ 10 ms (Temps réel)', aliases: ['ultra faible latence', '<10ms', '10ms'] },
			{ canonical: '50', label: '≤ 50 ms', aliases: ['50ms', 'faible latence'] }
		]
	},
	{
		key: 'storage_engine',
		label: 'Moteur de stockage',
		valueType: 'string',
		description: 'Technologie de persistance distribuée ou locale.',
		canonicalValues: [
			{ canonical: 'ceph', label: 'Ceph distribué', aliases: ['rook-ceph', 'ceph rbd'] },
			{ canonical: 'san', label: 'SAN / Baie entreprise', aliases: ['fc san', 'iscsi san'] }
		]
	},
	{
		key: 'network_stack',
		label: 'Pile réseau',
		valueType: 'string',
		description: 'CNI, routage ou overlay réseau.',
		canonicalValues: [
			{ canonical: 'cilium', label: 'Cilium eBPF', aliases: ['ebpf', 'cilium bgp'] },
			{ canonical: 'bgp_anycast', label: 'BGP Anycast', aliases: ['anycast', 'bgp'] }
		]
	},
	{
		key: 'isolation_mode',
		label: 'Mode d’isolation',
		valueType: 'enum',
		description: 'Cloisonnement logique ou physique des charges.',
		canonicalValues: [
			{ canonical: 'physical', label: 'Isolation physique / dédiée', aliases: ['air-gap', 'dédié', 'physique'] },
			{ canonical: 'multi_tenant', label: 'Multi-tenant logique', aliases: ['namespace', 'vrf', 'vlan'] }
		]
	},
	{
		key: 'disaster_recovery',
		label: 'Stratégie PRA / DR',
		valueType: 'string',
		description: 'Plan de reprise d’activité et cible RPO/RTO.',
		canonicalValues: [
			{ canonical: 'rpo_zero', label: 'RPO = 0 (Zéro perte)', aliases: ['rpo=0', 'rpo 0', 'zéro perte'] },
			{ canonical: 'warm_standby', label: 'Warm Standby', aliases: ['pra chaud', 'reprise rapide'] }
		]
	},
	{
		key: 'ha_replicas',
		label: 'Nombre de réplicas HA',
		valueType: 'number',
		description: 'Facteur de réplication des composants critiques.',
		canonicalValues: [
			{ canonical: '3', label: '3 réplicas', aliases: ['tri-replica', '3 nœuds'] }
		]
	},
	{
		key: 'floor_control',
		label: 'Contrôle plancher / socle',
		valueType: 'string',
		description: 'Exigence minimale non négociable imposée au socle.',
		canonicalValues: []
	}
];

function stripLoosePunctuation(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[\s_-]+/g, ' ')
		.trim();
}

/**
 * Normalise une valeur de fait brute à l'aide du dictionnaire canonique et de ses alias.
 */
export function normalizeFactValue(
	key: string,
	rawValue: string,
	vocabulary: FactVocabularyItem[] = DEFAULT_FACT_VOCABULARY_ITEMS
): { canonical: string; matchedAlias?: string } {
	const trimmed = String(rawValue).trim();
	const lowered = trimmed.toLowerCase();
	const loose = stripLoosePunctuation(trimmed);
	const entry = vocabulary.find((v) => v.key === key);

	if (!entry) {
		return { canonical: lowered };
	}

	for (const cv of entry.canonicalValues) {
		if (cv.canonical.toLowerCase() === lowered || stripLoosePunctuation(cv.canonical) === loose) {
			return { canonical: cv.canonical.toLowerCase() };
		}
		for (const alias of cv.aliases) {
			if (alias.toLowerCase() === lowered || stripLoosePunctuation(alias) === loose) {
				return { canonical: cv.canonical.toLowerCase(), matchedAlias: alias };
			}
		}
	}

	if (entry.valueType === 'number') {
		const numMatch = trimmed.match(/-?\d+(?:[.,]\d+)?/);
		if (numMatch) {
			return { canonical: numMatch[0].replace(',', '.') };
		}
	}

	return { canonical: lowered };
}

/**
 * Extrait de manière déterministe et rapide des faits normalisés depuis un texte libre
 * (pour le bac à sable d'administration et l'évaluation hors-LLM).
 */
export function extractFactsHeuristicallyFromText(
	text: string,
	vocabulary: FactVocabularyItem[] = DEFAULT_FACT_VOCABULARY_ITEMS
): Array<{ key: string; value: string; matchedAlias: string }> {
	if (!text || !text.trim()) return [];

	const normalizedText = stripLoosePunctuation(text);
	const found = new Map<string, { value: string; matchedAlias: string }>();

	for (const entry of vocabulary) {
		for (const cv of entry.canonicalValues) {
			const candidates = [cv.canonical, ...cv.aliases];
			for (const candidate of candidates) {
				const cleanCandidate = stripLoosePunctuation(candidate);
				if (cleanCandidate.length < 2) continue;
				if (normalizedText.includes(cleanCandidate)) {
					found.set(entry.key, { value: cv.canonical, matchedAlias: candidate });
					break;
				}
			}
			if (found.has(entry.key)) break;
		}

		if (!found.has(entry.key) && entry.valueType === 'number') {
			if (entry.key === 'site_count') {
				const m = normalizedText.match(/(\d+)\s*(?:sites?|datacenters?|dc|salles?)/);
				if (m) found.set(entry.key, { value: m[1], matchedAlias: m[0] });
			} else if (entry.key === 'latency_target') {
				const m = normalizedText.match(/(\d+)\s*ms\b/);
				if (m) found.set(entry.key, { value: m[1], matchedAlias: m[0] });
			} else if (entry.key === 'ha_replicas') {
				const m = normalizedText.match(/(\d+)\s*(?:replicas?|noeuds?)/);
				if (m) found.set(entry.key, { value: m[1], matchedAlias: m[0] });
			}
		}
	}

	return Array.from(found.entries()).map(([key, item]) => ({
		key,
		value: item.value,
		matchedAlias: item.matchedAlias
	}));
}

/**
 * Score sémantique léger (filet de sécurité lorsque le match syntaxique sur fait échoue).
 */
export function evaluateSemanticReflexMatch(
	text: string,
	rule: Pick<ReflexRuleRecord, 'title' | 'semanticHints' | 'action'>
): { score: number; matchedHints: string[] } {
	if (!text || !text.trim()) return { score: 0, matchedHints: [] };
	const cleanText = stripLoosePunctuation(text);
	const textTokens = new Set(cleanText.split(' ').filter((w) => w.length >= 3));

	const matchedHints: string[] = [];
	const hints = rule.semanticHints || [];
	for (const hint of hints) {
		const cleanHint = stripLoosePunctuation(hint);
		if (cleanHint.length >= 2 && cleanText.includes(cleanHint)) {
			matchedHints.push(hint);
		}
	}

	const ruleCorpus = stripLoosePunctuation(
		`${rule.title} ${rule.action.subjectName} ${rule.action.question} ${hints.join(' ')}`
	);
	const ruleTokens = Array.from(new Set(ruleCorpus.split(' ').filter((w) => w.length >= 4)));
	let overlap = 0;
	for (const t of ruleTokens) {
		if (textTokens.has(t)) overlap++;
	}

	const hintScore = hints.length > 0 ? Math.min(1, matchedHints.length / Math.min(2, hints.length)) * 0.65 : 0;
	const tokenScore = ruleTokens.length > 0 ? Math.min(1, overlap / 4) * 0.45 : 0;
	const score = Math.round(Math.min(1, hintScore + tokenScore) * 100) / 100;

	return { score, matchedHints };
}

/**
 * Détecte les recouvrements ou conflits potentiels entre réflexes du catalogue.
 */
export function detectOverlappingReflexes(rules: ReflexRuleRecord[]): ReflexOverlapWarning[] {
	const activeRules = rules.filter((r) => r.status !== 'deprecated');
	const warnings: ReflexOverlapWarning[] = [];

	for (let i = 0; i < activeRules.length; i++) {
		for (let j = i + 1; j < activeRules.length; j++) {
			const a = activeRules[i];
			const b = activeRules[j];

			const condKeyA = a.conditions.map((c) => `${c.key}:${c.op}:${String(c.value).toLowerCase()}`).sort().join('|');
			const condKeyB = b.conditions.map((c) => `${c.key}:${c.op}:${String(c.value).toLowerCase()}`).sort().join('|');

			if (condKeyA && condKeyA === condKeyB) {
				warnings.push({
					ruleAId: a.id,
					ruleATitle: a.title,
					ruleBId: b.id,
					ruleBTitle: b.title,
					reason: 'Conditions déclenchantes identiques — vérifier que les deux sous-sujets ne font pas doublon.',
					severity: 'warning'
				});
				continue;
			}

			const nameA = stripLoosePunctuation(a.action.subjectName);
			const nameB = stripLoosePunctuation(b.action.subjectName);
			if (nameA && nameB && (nameA === nameB || (nameA.length > 6 && nameB.includes(nameA)))) {
				warnings.push({
					ruleAId: a.id,
					ruleATitle: a.title,
					ruleBId: b.id,
					ruleBTitle: b.title,
					reason: `Ciblent un sous-sujet très proche (« ${a.action.subjectName} » / « ${b.action.subjectName} »).`,
					severity: 'info'
				});
			}
		}
	}

	return warnings;
}

export const DEFAULT_RULE_SEMANTIC_HINTS: Record<string, { domain: string; semanticHints: string[] }> = {
	'DOC-HA-01': {
		domain: 'resilience',
		semanticHints: ['actif/actif', 'active-active', 'réplication synchrone', 'rpo nul', 'bi-site', 'haute disponibilité']
	},
	'SEC-RESIL-02': {
		domain: 'security',
		semanticHints: ['split-brain', 'quorum', 'témoin', 'witness', 'bi-site', 'deux sites', '2 datacenters']
	},
	'NIS2-CONT-01': {
		domain: 'sovereignty',
		semanticHints: ['nis2', 'entité essentielle', 'plan de continuité', 'gestion de crise', 'out-of-band']
	},
	'SOV-DATA-01': {
		domain: 'sovereignty',
		semanticHints: ['secnumcloud', 'souveraineté', 'anssi', 'cloud de confiance', 'données sensibles']
	}
};

export function toReferenceRule(record: ReflexRuleRecord): ReferenceRule {
	return {
		id: record.id,
		version: `${record.version}.0.0`,
		title: record.title,
		assetRef: record.assetRef,
		assetType: record.assetType,
		mandatory: record.mandatory,
		conditions: record.conditions,
		action: record.action
	};
}
