import type { Statement, SubjectMaturity } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';

export interface RetractionCascadeResult {
	retractedId: string;
	retractedStatement?: Statement;
	impactedDescendantIds: string[];
	demotedStatements: Statement[];
	demotedSubjectIds: string[];
	updatedSubjects: MaturitySubject[];
	updatedDrafts: Record<string, TelegraphicDraft>;
	summaryMessage: string;
}

/**
 * Construit les tables d'adjacence du graphe de dérivation causal (DAG).
 * - `dependentsOf` : mappe un antécédent vers tous ses énoncés dérivés directs.
 * - `antecedentsOf` : mappe un énoncé vers tous ses antécédents directs.
 */
export function buildCausalDAG(statements: Statement[]): {
	dependentsOf: Map<string, Set<string>>;
	antecedentsOf: Map<string, Set<string>>;
} {
	const dependentsOf = new Map<string, Set<string>>();
	const antecedentsOf = new Map<string, Set<string>>();

	for (const stmt of statements) {
		if (!dependentsOf.has(stmt.id)) dependentsOf.set(stmt.id, new Set());
		if (!antecedentsOf.has(stmt.id)) antecedentsOf.set(stmt.id, new Set());

		// Rassemble tous les antécédents déclarés (based_on + revisability.antecedents)
		const rawAntecedents = [
			...(stmt.justification.basedOn || []),
			...(stmt.revisability.antecedents || [])
		];

		const cleanAntecedents = Array.from(new Set(rawAntecedents));

		for (const ante of cleanAntecedents) {
			antecedentsOf.get(stmt.id)!.add(ante);

			if (!dependentsOf.has(ante)) {
				dependentsOf.set(ante, new Set());
			}
			dependentsOf.get(ante)!.add(stmt.id);
		}
	}

	return { dependentsOf, antecedentsOf };
}

/**
 * Calcule la clôture transitive (l'ensemble de tous les descendants dépendants directs et indirects).
 */
export function findTransitiveDependents(
	rootId: string,
	dependentsOf: Map<string, Set<string>>
): string[] {
	const visited = new Set<string>();
	const queue: string[] = [];

	const directDependents = dependentsOf.get(rootId);
	if (directDependents) {
		for (const dep of directDependents) {
			queue.push(dep);
		}
	}

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (!visited.has(current) && current !== rootId) {
			visited.add(current);
			const nextLevel = dependentsOf.get(current);
			if (nextLevel) {
				for (const next of nextLevel) {
					if (!visited.has(next)) {
						queue.push(next);
					}
				}
			}
		}
	}

	return Array.from(visited);
}

/**
 * Rétrograde d'un cran le niveau de maturité d'un sujet impacté.
 */
function demoteSubjectMaturity(currentLevel: SubjectMaturity): SubjectMaturity {
	switch (currentLevel) {
		case 'L5_archived':
			return 'L4_specified';
		case 'L4_specified':
			return 'L3_decided';
		case 'L3_decided':
			return 'L2_decomposed';
		case 'L2_decomposed':
			return 'L1_framed';
		case 'L1_framed':
		case 'L0_named':
		default:
			return currentLevel;
	}
}

/**
 * Exécute l'invalidation de clôture logique en cascade (Truth Maintenance Engine).
 * 
 * Invariant : Si un énoncé antécédent S_source est invalidé ($S_{source} \bot$) :
 * 1. Tous ses descendants transitifs perdent leur justification formelle et sont rétrogradés à `assumed`.
 * 2. Tout sujet d'architecture L3+ affecté retombe à un niveau inférieur (L2 ou L1).
 * 3. Le badge `provisoire` est systématiquement réactivé sur les sections concernées.
 */
export function executeRetractionCascade(params: {
	targetStatementId: string;
	reason: string;
	statements: Statement[];
	subjects: MaturitySubject[];
	drafts: Record<string, TelegraphicDraft>;
}): RetractionCascadeResult {
	const { dependentsOf } = buildCausalDAG(params.statements);
	const impactedDescendantIds = findTransitiveDependents(params.targetStatementId, dependentsOf);

	const statementsMap = new Map<string, Statement>(params.statements.map((s) => [s.id, { ...s }]));

	const target = statementsMap.get(params.targetStatementId);
	if (target) {
		target.status = 'contested';
		target.maturity = {
			...target.maturity,
			confidence: 'assumed'
		};
		target.revisability = {
			...target.revisability,
			consequencesIfInvalidated: `Invalidé : ${params.reason.trim()}`
		};
		target.updatedAt = new Date().toISOString();
	}

	const demotedStatements: Statement[] = [];
	const impactedSubjectIds = new Set<string>();

	if (target && target.triplet.subject) {
		impactedSubjectIds.add(target.triplet.subject);
	}

	// 1. Rétrogradation des descendants en chaîne
	for (const descId of impactedDescendantIds) {
		const descStmt = statementsMap.get(descId);
		if (descStmt) {
			descStmt.maturity = {
				...descStmt.maturity,
				confidence: 'assumed'
			};
			descStmt.status = 'under_review';
			descStmt.revisability = {
				...descStmt.revisability,
				consequencesIfInvalidated: `Rétrogradé en assumed suite à l'invalidation de l'antécédent [${params.targetStatementId}]`
			};
			descStmt.updatedAt = new Date().toISOString();
			demotedStatements.push(descStmt);

			if (descStmt.triplet.subject) {
				impactedSubjectIds.add(descStmt.triplet.subject);
			}
		}
	}

	// 2. Rétrogradation des sujets sur le Board
	const updatedSubjects = params.subjects.map((sub) => {
		// Le sujet correspond soit à l'identifiant du triplet, soit à la référence de section
		const isAffected =
			impactedSubjectIds.has(sub.id) ||
			Array.from(impactedSubjectIds).some((id) => sub.name.toLowerCase().includes(id.toLowerCase()));

		if (isAffected) {
			const newLevel = demoteSubjectMaturity(sub.level);
			return {
				...sub,
				level: newLevel,
				blocking_count: sub.blocking_count + 1,
				last_transition_date: new Date().toISOString()
			};
		}
		return sub;
	});

	// 3. Mise à jour des brouillons télégraphiques
	const updatedDrafts = { ...params.drafts };
	for (const subId of impactedSubjectIds) {
		if (updatedDrafts[subId]) {
			const d = updatedDrafts[subId];
			updatedDrafts[subId] = {
				...d,
				is_provisional: true,
				maturity: demoteSubjectMaturity(d.maturity)
			};
		}
	}

	const demotedSubjectIds = Array.from(impactedSubjectIds);
	const summaryMessage = target
		? `💥 Rétraction de [${params.targetStatementId}] exécutée : ${impactedDescendantIds.length} énoncé(s) déclassé(s) à 'assumed'. ${demotedSubjectIds.length} sujet(s) rétrogradé(s) en provisoire.`
		: `⚠️ Énoncé [${params.targetStatementId}] introuvable.`;

	return {
		retractedId: params.targetStatementId,
		retractedStatement: target,
		impactedDescendantIds,
		demotedStatements,
		demotedSubjectIds,
		updatedSubjects,
		updatedDrafts,
		summaryMessage
	};
}
