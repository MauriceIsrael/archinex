import { prisma } from '../prisma';
import type { ActorInfo } from '../projects/projectsDb';
import { UnauthorizedArbitrationError } from '../projects/arbitrationDb';
import {
	DEFAULT_REFERENCE_RULES,
	type ReferenceRule,
	type ProjectRuleOverride,
	type LocalRule,
	type RuleCondition,
	type QuestionTriggerAction,
	validateRuleConditionsVocabulary,
	previewRuleEvaluation,
	buildAnonymizedCandidateFromLocalRule
} from '$lib/domain/projectRules';
import { doctrineService } from '$lib/server/doctrine/doctrineService';

export function isDeciderRole(role: string): boolean {
	const normalized = (role || '').toLowerCase().replace(/[\s-]+/g, '_');
	return [
		'lead_architect',
		'admin',
		'decider',
		'domain_expert',
		'domain_architect',
		'security_officer',
		'compliance_officer'
	].includes(normalized);
}

interface ProjectStrategyRules {
	ruleOverrides?: Record<string, ProjectRuleOverride>;
	localRules?: LocalRule[];
	[key: string]: any;
}

function parseProjectStrategy(project: { strategy?: string | null }): ProjectStrategyRules {
	if (!project || !project.strategy) return {};
	try {
		return JSON.parse(project.strategy);
	} catch {
		return {};
	}
}

/**
 * Récupère l'état complet des règles pour un projet :
 * - Règles de référence avec leur état effectif (active ou désactivée avec justification)
 * - Règles locales créées pour ce projet
 */
export async function getProjectRules(projectId: string): Promise<{
	referenceRules: Array<ReferenceRule & { status: 'active' | 'disabled'; override?: ProjectRuleOverride }>;
	localRules: LocalRule[];
	disabledOverrides: ProjectRuleOverride[];
}> {
	const project = await prisma.project.findUnique({
		where: { id: projectId }
	});

	if (!project) {
		throw new Error(`Projet ${projectId} introuvable.`);
	}

	const strategy = parseProjectStrategy(project);
	const overrides = strategy.ruleOverrides || {};
	const localRules = strategy.localRules || [];

	const referenceRules = DEFAULT_REFERENCE_RULES.map((refRule) => {
		const override = overrides[refRule.id];
		const status = override?.status === 'disabled' ? 'disabled' : 'active';
		return {
			...refRule,
			status: status as 'active' | 'disabled',
			override: override || undefined
		};
	});

	const disabledOverrides = Object.values(overrides).filter((o) => o.status === 'disabled');

	return {
		referenceRules,
		localRules,
		disabledOverrides
	};
}

/**
 * Désactive une règle de référence pour le projet avec justification obligatoire.
 * RÈGLE STRICTE (A30) :
 * - Réservé au rôle decider ou lead_architect.
 * - Justification obligatoire (au moins 5 caractères).
 */
export async function disableReferenceRule(params: {
	projectId: string;
	ruleId: string;
	justification: string;
	actor: ActorInfo;
}): Promise<ProjectRuleOverride> {
	const { projectId, ruleId, justification, actor } = params;

	if (!isDeciderRole(actor.role)) {
		throw new UnauthorizedArbitrationError(
			`Rôle insuffisant (${actor.role}) : seul un arbitre / décideur ('decider' ou 'lead_architect') peut désactiver une règle.`
		);
	}

	if (!justification || justification.trim().length < 5) {
		throw new Error(
			'Une justification explicite (au moins 5 caractères) est strictement obligatoire pour désactiver une règle.'
		);
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId }
	});
	if (!project) {
		throw new Error(`Projet ${projectId} introuvable.`);
	}

	const refRule = DEFAULT_REFERENCE_RULES.find((r) => r.id === ruleId);
	if (!refRule) {
		throw new Error(`Règle de référence introuvable : ${ruleId}`);
	}

	const strategy = parseProjectStrategy(project);
	const overrides = strategy.ruleOverrides || {};

	const override: ProjectRuleOverride = {
		ruleId,
		status: 'disabled',
		justification: justification.trim(),
		disabledBy: actor.userId,
		disabledByRole: actor.role,
		disabledAt: new Date().toISOString()
	};

	overrides[ruleId] = override;
	strategy.ruleOverrides = overrides;

	await prisma.project.update({
		where: { id: projectId },
		data: {
			strategy: JSON.stringify(strategy)
		}
	});

	await prisma.domainEvent.create({
		data: {
			projectId,
			entityType: 'rule',
			entityId: ruleId,
			type: 'RULE_DISABLED',
			actorId: actor.userId,
			actorRole: actor.role,
			productionMode: actor.productionMode || 'human-authored',
			payload: JSON.stringify(override)
		}
	});

	return override;
}

/**
 * Réactive une règle de référence précédemment désactivée.
 */
export async function enableReferenceRule(params: {
	projectId: string;
	ruleId: string;
	actor: ActorInfo;
}): Promise<{ success: boolean; ruleId: string }> {
	const { projectId, ruleId, actor } = params;

	if (!isDeciderRole(actor.role)) {
		throw new UnauthorizedArbitrationError(
			`Rôle insuffisant (${actor.role}) : seul un arbitre / décideur peut modifier le statut d'une règle.`
		);
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId }
	});
	if (!project) {
		throw new Error(`Projet ${projectId} introuvable.`);
	}

	const strategy = parseProjectStrategy(project);
	const overrides = strategy.ruleOverrides || {};

	if (overrides[ruleId]) {
		delete overrides[ruleId];
		strategy.ruleOverrides = overrides;

		await prisma.project.update({
			where: { id: projectId },
			data: {
				strategy: JSON.stringify(strategy)
			}
		});

		await prisma.domainEvent.create({
			data: {
				projectId,
				entityType: 'rule',
				entityId: ruleId,
				type: 'RULE_ENABLED',
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: actor.productionMode || 'human-authored',
				payload: JSON.stringify({ ruleId, reenabledAt: new Date().toISOString() })
			}
		});
	}

	return { success: true, ruleId };
}

/**
 * Propose une règle locale au projet.
 * Validation stricte sur le vocabulaire K18 (DEFAULT_ARCHINEX_VOCABULARY).
 * Statut initial : 'proposed'.
 */
export async function proposeLocalRule(params: {
	projectId: string;
	name: string;
	conditions: RuleCondition[];
	action: QuestionTriggerAction;
	actor: ActorInfo;
}): Promise<LocalRule> {
	const { projectId, name, conditions, action, actor } = params;

	if (!name || name.trim().length < 3) {
		throw new Error('Le nom de la règle locale doit comporter au moins 3 caractères.');
	}

	if (!conditions || conditions.length === 0) {
		throw new Error('Au moins une condition sur les faits est obligatoire.');
	}

	const vocabCheck = validateRuleConditionsVocabulary(conditions);
	if (!vocabCheck.valid) {
		throw new Error(
			`Vocabulaire invalide : la ou les clés [${vocabCheck.invalidKeys.join(', ')}] ne font pas partie du dictionnaire de faits autorisé.`
		);
	}

	if (!action.question || action.question.trim().length < 5) {
		throw new Error('La question à ouvrir doit comporter au moins 5 caractères.');
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId }
	});
	if (!project) {
		throw new Error(`Projet ${projectId} introuvable.`);
	}

	const strategy = parseProjectStrategy(project);
	const localRules = strategy.localRules || [];

	const ruleId = `loc-rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
	const newRule: LocalRule = {
		id: ruleId,
		name: name.trim(),
		projectId,
		conditions,
		action: {
			...action,
			initialLevel: action.initialLevel || 'L1_framed',
			suggestedRole: action.suggestedRole || 'lead_architect',
			mandatory: Boolean(action.mandatory)
		},
		status: 'proposed',
		authorId: actor.userId,
		authorRole: actor.role,
		createdAt: new Date().toISOString()
	};

	localRules.push(newRule);
	strategy.localRules = localRules;

	await prisma.project.update({
		where: { id: projectId },
		data: {
			strategy: JSON.stringify(strategy)
		}
	});

	await prisma.domainEvent.create({
		data: {
			projectId,
			entityType: 'local_rule',
			entityId: ruleId,
			type: 'LOCAL_RULE_PROPOSED',
			actorId: actor.userId,
			actorRole: actor.role,
			productionMode: actor.productionMode || 'human-authored',
			payload: JSON.stringify(newRule)
		}
	});

	return newRule;
}

/**
 * Affirme une règle locale proposée.
 * INVARIANT K16 (Séparation des pouvoirs) :
 * - Réservé à un arbitre / décideur ('decider' ou 'lead_architect').
 * - L'affirmateur DOIT être distinct de l'auteur de la règle.
 */
export async function affirmLocalRule(params: {
	projectId: string;
	ruleId: string;
	actor: ActorInfo;
}): Promise<LocalRule> {
	const { projectId, ruleId, actor } = params;

	if (!isDeciderRole(actor.role)) {
		throw new UnauthorizedArbitrationError(
			`Rôle insuffisant (${actor.role}) : seul un arbitre / décideur peut affirmer une règle locale.`
		);
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId }
	});
	if (!project) {
		throw new Error(`Projet ${projectId} introuvable.`);
	}

	const strategy = parseProjectStrategy(project);
	const localRules = strategy.localRules || [];
	const ruleIndex = localRules.findIndex((r) => r.id === ruleId);

	if (ruleIndex === -1) {
		throw new Error(`Règle locale introuvable : ${ruleId}`);
	}

	const rule = localRules[ruleIndex];

	// Invariant K16 : auteur !== affirmateur
	if (rule.authorId === actor.userId) {
		throw new Error(
			`Invariant K16 violé : la règle locale ne peut pas être affirmée par son propre auteur (${actor.userId}). Un arbitre distinct est requis.`
		);
	}

	rule.status = 'affirmed';
	rule.affirmedById = actor.userId;
	rule.affirmedByRole = actor.role;
	rule.affirmedAt = new Date().toISOString();

	localRules[ruleIndex] = rule;
	strategy.localRules = localRules;

	await prisma.project.update({
		where: { id: projectId },
		data: {
			strategy: JSON.stringify(strategy)
		}
	});

	await prisma.domainEvent.create({
		data: {
			projectId,
			entityType: 'local_rule',
			entityId: ruleId,
			type: 'LOCAL_RULE_AFFIRMED',
			actorId: actor.userId,
			actorRole: actor.role,
			productionMode: actor.productionMode || 'human-authored',
			payload: JSON.stringify(rule)
		}
	});

	return rule;
}

/**
 * Aperçu dynamique d'une règle locale ou de référence sur les faits actuels du sujet/projet.
 */
export async function previewRuleAgainstProjectFacts(params: {
	projectId: string;
	ruleId?: string;
	customRule?: { conditions: RuleCondition[]; action: QuestionTriggerAction };
	subjectId?: string;
}): Promise<{
	matches: boolean;
	triggeredSubjectName?: string;
	triggeredQuestion?: string;
	details: string[];
	currentFacts: Array<{ key: string; value: string }>;
}> {
	const { projectId, ruleId, customRule, subjectId } = params;

	// Récupérer les faits affirmés du projet ou sujet
	const stmts = await prisma.statement.findMany({
		where: {
			projectId,
			...(subjectId ? { subjectId } : {}),
			status: 'active'
		}
	});

	const currentFacts: Array<{ key: string; value: string }> = stmts.map((s) => ({
		key: s.predicate,
		value: s.value
	}));

	// Ajouter les faits des événements DECISION_ASSERTED s'il y en a
	const lastAssertion = await prisma.domainEvent.findFirst({
		where: {
			projectId,
			entityType: 'decision',
			type: 'DECISION_ASSERTED'
		},
		orderBy: { createdAt: 'desc' }
	});

	if (lastAssertion) {
		try {
			const payload = JSON.parse(lastAssertion.payload || '{}');
			if (Array.isArray(payload.facts)) {
				for (const f of payload.facts) {
					if (!currentFacts.some((cf) => cf.key === f.key)) {
						currentFacts.push(f);
					}
				}
			}
		} catch {
			// ignore
		}
	}

	let targetRule: {
		id: string;
		name?: string;
		title?: string;
		conditions: RuleCondition[];
		action: QuestionTriggerAction;
	} | null = null;

	if (customRule) {
		targetRule = {
			id: 'custom-preview',
			name: 'Aperçu personnalisé',
			conditions: customRule.conditions,
			action: customRule.action
		};
	} else if (ruleId) {
		const project = await prisma.project.findUnique({ where: { id: projectId } });
		const strategy = parseProjectStrategy(project || {});
		const localRule = (strategy.localRules || []).find((r) => r.id === ruleId);
		if (localRule) {
			targetRule = localRule;
		} else {
			const refRule = DEFAULT_REFERENCE_RULES.find((r) => r.id === ruleId);
			if (refRule) {
				targetRule = refRule;
			}
		}
	}

	if (!targetRule) {
		throw new Error('Règle à évaluer introuvable.');
	}

	const evalResult = previewRuleEvaluation(targetRule, currentFacts);

	return {
		...evalResult,
		currentFacts
	};
}

/**
 * Propose une règle locale au référentiel de connaissances (LLMOps K22 / K7).
 * INVARIANT K13 : retire toute ancre de programme (aucun identifiant de projet, aucun handle de membre).
 */
export async function proposeLocalRuleToKnowledgeBase(params: {
	projectId: string;
	ruleId: string;
	actor: ActorInfo;
}): Promise<{ candidateId: string; status: string; candidate: any }> {
	const { projectId, ruleId, actor } = params;

	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: { members: true }
	});

	if (!project) {
		throw new Error(`Projet ${projectId} introuvable.`);
	}

	const strategy = parseProjectStrategy(project);
	const localRule = (strategy.localRules || []).find((r) => r.id === ruleId);

	if (!localRule) {
		throw new Error(`Règle locale ${ruleId} introuvable.`);
	}

	// Extraction du contexte pour nettoyage
	const projectNames = [project.title, project.shortName].filter(Boolean);
	const participantNames = project.members.map((m) => m.userId).filter(Boolean);

	const candidate = buildAnonymizedCandidateFromLocalRule(localRule, {
		projectNames,
		participantNames
	});

	const submissionResult = await doctrineService.submitKbCandidate(candidate);

	await prisma.domainEvent.create({
		data: {
			projectId,
			entityType: 'local_rule',
			entityId: ruleId,
			type: 'LOCAL_RULE_CAPITALIZED',
			actorId: actor.userId,
			actorRole: actor.role,
			productionMode: actor.productionMode || 'human-authored',
			payload: JSON.stringify({
				candidateId: submissionResult.candidate_id,
				status: submissionResult.status
			})
		}
	});

	return {
		candidateId: submissionResult.candidate_id,
		status: submissionResult.status,
		candidate
	};
}
