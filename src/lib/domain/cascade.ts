export type CascadeSourceType = 'doctrine' | 'control' | 'local_rule' | 'agent';

export interface CascadeLineage {
	ruleRef?: string;
	ruleName?: string;
	assetRef?: string;
	triggeringFacts: Array<{ key: string; value: string }>;
	parentDecisionId: string;
	parentSubjectId: string;
	parentSubjectName: string;
}

export interface CascadePrefillFraming {
	problemStatement?: string;
	scope?: string;
	kbRefs?: string[];
}

export interface CascadePossibleDuplicate {
	subjectId: string;
	subjectName: string;
	sectionRef?: string;
	score: number;
	threshold: number;
}

export interface CascadeQuestion {
	id: string;
	text: string;
	subjectName: string;
	subjectSectionRef?: string;
	sourceType: CascadeSourceType;
	mandatory: boolean;
	status: 'open' | 'assigned' | 'merged' | 'closed';
	assignedTo?: string | null;
	assignedRole?: string;
	closedReason?: string | null;
	mergedWithSubjectId?: string | null;
	childSubjectId?: string;
	lineage: CascadeLineage;
	initialLevel?: 'L0_named' | 'L1_framed';
	prefillFraming?: CascadePrefillFraming;
	productionMode?: 'human-authored' | 'llm-proposed-human-approved' | 'llm-derived';
	grounds?: string;
	possibleDuplicate?: CascadePossibleDuplicate | null;
}

export interface CascadeResult {
	decisionId: string;
	parentSubjectId: string;
	parentSubjectName: string;
	questions: CascadeQuestion[];
}

/**
 * Valide et applique la clôture d'une question de cascade.
 * RÈGLE STRICTE (A28) : Clore une question obligatoire (mandatory) sans justification est impossible.
 */
export function closeCascadeQuestion(
	question: CascadeQuestion,
	justification?: string | null
): { success: boolean; question: CascadeQuestion; error?: string } {
	if (question.mandatory) {
		if (!justification || justification.trim().length < 5) {
			return {
				success: false,
				question,
				error: 'Une justification détaillée (au moins 5 caractères) est strictement obligatoire pour clore une question impérative.'
			};
		}
	}

	return {
		success: true,
		question: {
			...question,
			status: 'closed',
			closedReason: justification?.trim() || 'Question close sans réserve.'
		}
	};
}

/**
 * Formate l'icône et l'étiquette de la source de la question.
 */
export function formatSourceType(sourceType: CascadeSourceType): { icon: string; label: string; badgeClass: string } {
	switch (sourceType) {
		case 'doctrine':
			return {
				icon: '📐',
				label: 'Doctrine',
				badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
			};
		case 'control':
			return {
				icon: '⚖️',
				label: 'Contrôle',
				badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
			};
		case 'local_rule':
			return {
				icon: '🔧',
				label: 'Règle locale',
				badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
			};
		case 'agent':
			return {
				icon: '🤖',
				label: 'Agent IA',
				badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
			};
	}
}

/**
 * Construit les données pour l'Arbre de Découverte (KnowledgeTreeChart).
 * Généalogie : Sujets Parents → Décisions → Sujets Enfants.
 */
export function buildDiscoveryTreeData(params: {
	parentSubject: { id: string; name: string; sectionRef?: string; level?: string };
	decision?: { id: string; retainedOptionTitle?: string; rationale?: string } | null;
	childSubjects: Array<{
		id: string;
		name: string;
		sectionRef?: string;
		level?: string;
		foundationContested?: boolean;
	}>;
}): any {
	const childrenNodes: any[] = [];

	for (const child of params.childSubjects) {
		childrenNodes.push({
			name: `${child.sectionRef || '§'} ${child.name}`,
			category: child.foundationContested ? 'Contesté ⚠️' : 'Sujet Enfant',
			typeLabel: child.foundationContested ? 'Fondement remis en cause' : 'Sujet Cascade',
			value: child.level || 'L1_framed',
			itemStyle: {
				color: child.foundationContested ? '#f43f5e' : '#10b981',
				borderColor: child.foundationContested ? '#fda4af' : '#6ee7b7'
			},
			match: {
				isMatched: true,
				score: child.foundationContested ? 40 : 100,
				reasons: child.foundationContested
					? ['Fondement remis en cause par changement de décision parente']
					: ['Branche de cascade ouverte activement']
			}
		});
	}

	const decisionNode: any = {
		name: params.decision?.retainedOptionTitle
			? `Décision : ${params.decision.retainedOptionTitle}`
			: 'Décision Affirmée',
		category: 'Décision (L3)',
		typeLabel: 'Porte G3',
		itemStyle: {
			color: '#6366f1',
			borderColor: '#a5b4fc'
		},
		children: childrenNodes
	};

	const rootNode: any = {
		name: `${params.parentSubject.sectionRef || '§'} ${params.parentSubject.name}`,
		category: 'Sujet Parent',
		typeLabel: 'Sujet Racine',
		itemStyle: {
			color: '#0284c7',
			borderColor: '#38bdf8'
		},
		children: [decisionNode]
	};

	return [
		{
			type: 'tree',
			data: [rootNode],
			top: '5%',
			left: '10%',
			bottom: '5%',
			right: '20%',
			symbolSize: 10,
			orient: 'LR',
			label: {
				position: 'left',
				verticalAlign: 'middle',
				align: 'right',
				fontSize: 11
			},
			leaves: {
				label: {
					position: 'right',
					verticalAlign: 'middle',
					align: 'left'
				}
			},
			emphasis: {
				focus: 'descendant'
			},
			expandAndCollapse: true,
			animationDuration: 550,
			animationDurationUpdate: 750
		}
	];
}
