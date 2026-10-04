import type { KbCandidate } from '$lib/types/llmops';

export type RuleOperator = 'eq' | 'neq' | 'gte' | 'lte' | 'in';

export interface RuleCondition {
	key: string;
	op: RuleOperator;
	value: string | number | string[];
}

export interface QuestionTriggerAction {
	question: string;
	subjectName: string;
	rationale: string;
	initialLevel: 'L0_named' | 'L1_framed';
	suggestedRole: string;
	mandatory: boolean;
	assetRef?: string;
}

export interface ReferenceRule {
	id: string;
	version: string;
	title: string;
	assetRef: string;
	assetType: 'pattern' | 'principle' | 'control' | 'standard';
	mandatory: boolean;
	conditions: RuleCondition[];
	action: QuestionTriggerAction;
}

export interface ProjectRuleOverride {
	ruleId: string;
	status: 'active' | 'disabled';
	justification: string;
	disabledBy: string;
	disabledByRole?: string;
	disabledAt: string;
}

export interface LocalRule {
	id: string;
	name: string;
	projectId: string;
	conditions: RuleCondition[];
	action: QuestionTriggerAction;
	status: 'proposed' | 'affirmed';
	authorId: string;
	authorRole: string;
	affirmedById?: string;
	affirmedByRole?: string;
	affirmedAt?: string;
	createdAt: string;
}

export const ARCHINEX_FACT_VOCABULARY = [
	'topology',
	'resilience_mode',
	'site_count',
	'cloud_provider',
	'sovereignty_level',
	'latency_target',
	'storage_engine',
	'network_stack',
	'security_level',
	'isolation_mode',
	'disaster_recovery',
	'ha_replicas',
	'floor_control'
] as const;

export type FactVocabularyKey = typeof ARCHINEX_FACT_VOCABULARY[number];

/**
 * Règles de référence par défaut de la base de connaissances (K19).
 */
export const DEFAULT_REFERENCE_RULES: ReferenceRule[] = [
	{
		id: 'DOC-HA-01',
		version: '1.0.0',
		title: 'Topologie de Continuité d’Activité Bi-Site',
		assetRef: 'DOC-HA-01',
		assetType: 'pattern',
		mandatory: true,
		conditions: [{ key: 'resilience_mode', op: 'eq', value: 'actif/actif' }],
		action: {
			question: 'Quelle stratégie de réplication synchrone et quel RPO cible garantissent le maintien des transactions ?',
			subjectName: 'Réplication et RPO',
			rationale: 'Le mode actif/actif impose une réplication synchrone et un RPO nul entre sites.',
			initialLevel: 'L1_framed',
			suggestedRole: 'lead_architect',
			mandatory: true,
			assetRef: 'DOC-HA-01'
		}
	},
	{
		id: 'SEC-RESIL-02',
		version: '1.0.0',
		title: 'Quorum d’Arbitrage et Témoin Indépendant',
		assetRef: 'SEC-RESIL-02',
		assetType: 'control',
		mandatory: true,
		conditions: [{ key: 'site_count', op: 'gte', value: '2' }],
		action: {
			question: 'Comment prévenir le split-brain et assurer le quorum d’arbitrage entre les deux sites ?',
			subjectName: 'Split-Brain et Quorum',
			rationale: 'Au moins 2 sites exigent un arbitre tiers indépendant pour éviter le split-brain.',
			initialLevel: 'L1_framed',
			suggestedRole: 'security_officer',
			mandatory: true,
			assetRef: 'SEC-RESIL-02'
		}
	},
	{
		id: 'NIS2-CONT-01',
		version: '1.0.0',
		title: 'Continuité d’activité et gestion de crise NIS2',
		assetRef: 'NIS2-DIR-11',
		assetType: 'standard',
		mandatory: true,
		conditions: [{ key: 'security_level', op: 'eq', value: 'essential' }],
		action: {
			question: 'Quel plan de continuité des opérations et canal de crise out-of-band déployer pour la conformité NIS2 ?',
			subjectName: 'Continuité et Crise NIS2',
			rationale: 'Exigence formelle pour les entités essentielles au sens de la directive NIS2.',
			initialLevel: 'L1_framed',
			suggestedRole: 'compliance_officer',
			mandatory: true,
			assetRef: 'NIS2-DIR-11'
		}
	},
	{
		id: 'SOV-DATA-01',
		version: '1.0.0',
		title: 'Souveraineté et isolation SecNumCloud',
		assetRef: 'SOV-CLOUD-SEC',
		assetType: 'principle',
		mandatory: true,
		conditions: [{ key: 'sovereignty_level', op: 'eq', value: 'secnumcloud' }],
		action: {
			question: 'Quelle architecture d’isolation et d’hébergement qualifié garantit le niveau SecNumCloud ?',
			subjectName: 'Conformité Souveraine SecNumCloud',
			rationale: 'Obligation de qualification SecNumCloud pour les données souveraines d’intérêt vital.',
			initialLevel: 'L1_framed',
			suggestedRole: 'lead_architect',
			mandatory: true,
			assetRef: 'SOV-CLOUD-SEC'
		}
	}
];

/**
 * Valide que toutes les clés d'une condition appartiennent strictement au vocabulaire autorisé.
 */
export function validateRuleConditionsVocabulary(conditions: RuleCondition[]): {
	valid: boolean;
	invalidKeys: string[];
} {
	const allowed = new Set<string>(ARCHINEX_FACT_VOCABULARY);
	const invalidKeys = conditions.map((c) => c.key).filter((k) => !allowed.has(k));
	return {
		valid: invalidKeys.length === 0,
		invalidKeys
	};
}

/**
 * Évalue une condition unitaire sur un fait donné.
 */
export function evaluateCondition(
	condition: RuleCondition,
	factValue: string | undefined
): boolean {
	if (factValue === undefined) {
		return false;
	}

	const normalizedFact = String(factValue).trim().toLowerCase();
	const op = condition.op;

	switch (op) {
		case 'eq':
			return normalizedFact === String(condition.value).trim().toLowerCase();
		case 'neq':
			return normalizedFact !== String(condition.value).trim().toLowerCase();
		case 'gte': {
			const factNum = parseFloat(normalizedFact);
			const targetNum = parseFloat(String(condition.value));
			return !isNaN(factNum) && !isNaN(targetNum) && factNum >= targetNum;
		}
		case 'lte': {
			const factNum = parseFloat(normalizedFact);
			const targetNum = parseFloat(String(condition.value));
			return !isNaN(factNum) && !isNaN(targetNum) && factNum <= targetNum;
		}
		case 'in': {
			const targetList = Array.isArray(condition.value)
				? condition.value.map((v) => String(v).trim().toLowerCase())
				: String(condition.value)
						.split(',')
						.map((v) => v.trim().toLowerCase());
			return targetList.includes(normalizedFact);
		}
		default:
			return false;
	}
}

/**
 * Évalue une conjonction (AND) de conditions sur un ensemble de faits.
 * Donne le même résultat que le moteur déterministe du Hub.
 */
export function evaluateRuleConditions(
	conditions: RuleCondition[],
	facts: Array<{ key: string; value: string }>
): boolean {
	if (!conditions || conditions.length === 0) return false;

	const factsMap = new Map<string, string>();
	for (const f of facts) {
		factsMap.set(f.key, f.value);
	}

	for (const cond of conditions) {
		const factVal = factsMap.get(cond.key);
		if (!evaluateCondition(cond, factVal)) {
			return false;
		}
	}

	return true;
}

/**
 * Aperçu dynamique d'une règle (locale ou référence) :
 * « Avec les faits actuels, voici ce qui s'ouvrirait ».
 */
export function previewRuleEvaluation(
	rule: {
		id: string;
		name?: string;
		title?: string;
		conditions: RuleCondition[];
		action: QuestionTriggerAction;
	},
	facts: Array<{ key: string; value: string }>
): {
	matches: boolean;
	triggeredSubjectName?: string;
	triggeredQuestion?: string;
	details: string[];
} {
	const factsMap = new Map<string, string>();
	for (const f of facts) {
		factsMap.set(f.key, f.value);
	}

	const details: string[] = [];
	let allSatisfied = true;

	for (const cond of rule.conditions) {
		const factVal = factsMap.get(cond.key);
		const satisfied = evaluateCondition(cond, factVal);
		if (satisfied) {
			details.push(`✓ Condition satisfaite : [${cond.key} ${cond.op} ${cond.value}] (valeur actuelle: "${factVal}")`);
		} else {
			allSatisfied = false;
			if (factVal === undefined) {
				details.push(`✗ Condition non vérifiée : [${cond.key} ${cond.op} ${cond.value}] (fait absent)`);
			} else {
				details.push(`✗ Condition non vérifiée : [${cond.key} ${cond.op} ${cond.value}] (valeur actuelle: "${factVal}")`);
			}
		}
	}

	if (allSatisfied) {
		return {
			matches: true,
			triggeredSubjectName: rule.action.subjectName,
			triggeredQuestion: rule.action.question,
			details
		};
	}

	return {
		matches: false,
		details
	};
}

/**
 * Retire toute ancre de programme avant l'envoi au référentiel (K13).
 * Supprime :
 * - Tout identifiant de projet (ex: prj-xxx, engagementId)
 * - Tout handle de membre (ex: author, user handles, @xxx, usr-xxx)
 * - Nettoie le texte des mentions spécifiques.
 */
export function buildAnonymizedCandidateFromLocalRule(
	localRule: LocalRule,
	context?: {
		projectNames?: string[];
		clientNames?: string[];
		participantNames?: string[];
	}
): KbCandidate {
	let title = `Règle doctrinale proposée : ${localRule.name}`;
	let summary = `Déclenchement sur faits : ${localRule.conditions.map((c) => `${c.key} ${c.op} ${c.value}`).join(' ET ')} -> Sujet "${localRule.action.subjectName}" : ${localRule.action.question}`;
	let rationale = `Motivation architecturale : ${localRule.action.rationale}`;
	let suggestedChange = `Créer une règle de référence réutilisable ouvrant la question "${localRule.action.question}" lorsque les faits [${localRule.conditions.map((c) => `${c.key} ${c.op} ${c.value}`).join(', ')}] sont affirmés. Rôle suggéré : ${localRule.action.suggestedRole}. Niveau initial : ${localRule.action.initialLevel}.`;

	// Masquage K13 des noms spécifiques et handles
	const sensitiveTerms: string[] = [
		localRule.projectId,
		localRule.authorId,
		...(context?.projectNames || []),
		...(context?.clientNames || []),
		...(context?.participantNames || [])
	].filter(Boolean);

	for (const term of sensitiveTerms) {
		if (term.trim().length > 1) {
			const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
			title = title.replace(regex, '[REDACTED]');
			summary = summary.replace(regex, '[REDACTED]');
			rationale = rationale.replace(regex, '[REDACTED]');
			suggestedChange = suggestedChange.replace(regex, '[REDACTED]');
		}
	}

	// Masquage des identifiants d'utilisateurs et handles (@username, usr-xxx)
	const userPattern = /\b(?:usr-[a-zA-Z0-9_\-]+|@[a-zA-Z0-9_\-]+)\b/g;
	title = title.replace(userPattern, '[USER]');
	summary = summary.replace(userPattern, '[USER]');
	rationale = rationale.replace(userPattern, '[USER]');
	suggestedChange = suggestedChange.replace(userPattern, '[USER]');

	return {
		id: `cand-rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
		kind: 'new_asset',
		title,
		summary,
		suggested_change: suggestedChange,
		rationale,
		// Invariant K13 : aucune ancre de programme ni engagement dans source, aucun handle personnel
		source: {
			system: 'archinex',
			engagement: 'anonymized'
		},
		author: 'architect',
		author_role: 'lead_architect',
		production_mode: 'human-authored',
		status: 'in_review'
	};
}
