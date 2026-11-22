import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
	buildCausalDAG,
	findTransitiveDependents,
	executeRetractionCascade
} from '$lib/domain/retractation';
import type { Statement, SubjectMaturity, ConfidenceLevel } from '$lib/types/epistemic';
import type { MaturitySubject } from '$lib/domain/maturityBoard';
import type { TelegraphicDraft } from '$lib/domain/telegraphic';

const MATURITY_LEVELS: SubjectMaturity[] = [
	'L0_named',
	'L1_framed',
	'L2_decomposed',
	'L3_decided',
	'L4_specified',
	'L5_archived'
];

const CONFIDENCE_LEVELS: ConfidenceLevel[] = [
	'verified',
	'designed',
	'vendor-stated',
	'stated-by-client',
	'assumed'
];

function makeStatement(
	id: string,
	subjectId: string,
	basedOn: string[],
	antecedents: string[],
	confidence: ConfidenceLevel = 'verified'
): Statement {
	return {
		id,
		section: '§1',
		triplet: {
			subject: subjectId,
			predicate: 'requires',
			value: 'spec'
		},
		justification: { basedOn },
		authority: {
			author: 'architect-a',
			role: 'lead_architect',
			productionMode: 'human-authored'
		},
		maturity: {
			subjectLevel: 'L3_decided',
			confidence
		},
		revisability: { antecedents },
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	};
}

function makeSubject(id: string, level: SubjectMaturity): MaturitySubject {
	return {
		id,
		section_ref: '§1',
		name: `Sujet ${id}`,
		level,
		blocking_count: 0,
		unlocks_count: 0,
		waiting_for_role: 'lead_architect',
		relative_effort: 'M',
		last_transition_date: '2026-01-01T00:00:00.000Z',
		stall_days: 0,
		is_stalled: false,
		dependent_subject_ids: []
	};
}

function makeDraft(subjectId: string, level: SubjectMaturity): TelegraphicDraft {
	return {
		section_id: subjectId,
		subject: `Sujet ${subjectId}`,
		maturity: level,
		is_provisional: false,
		retenu: [],
		suppose: [],
		conflit: [],
		manque: [],
		variantes: [],
		references: [],
		assumptions_count: 0,
		questions_count: 0,
		last_updated: '2026-01-01T00:00:00.000Z'
	} as TelegraphicDraft;
}

/** Génère un graphe dirigé arbitraire (DAG strict ou avec cycles éventuels) d'énoncés. */
function graphArbitrary(allowCycles: boolean) {
	return fc
		.integer({ min: 1, max: 14 })
		.chain((n) => {
			const ids = Array.from({ length: n }, (_, i) => `S-${i}`);
			const edgeSpecs = ids.map((id, i) => {
				const validParents = allowCycles ? ids : ids.slice(0, i);
				return fc.record({
					id: fc.constant(id),
					subjectId: fc.constant(`SUBJ-${i}`),
					basedOn:
						validParents.length > 0
							? fc.subarray(validParents, { minLength: 0, maxLength: Math.min(3, validParents.length) })
							: fc.constant([] as string[]),
					antecedents:
						validParents.length > 0
							? fc.subarray(validParents, { minLength: 0, maxLength: Math.min(3, validParents.length) })
							: fc.constant([] as string[]),
					confidence: fc.constantFrom(...CONFIDENCE_LEVELS),
					subjectLevel: fc.constantFrom(...MATURITY_LEVELS)
				});
			});
			return fc.tuple(fc.tuple(...edgeSpecs), fc.integer({ min: 0, max: n - 1 }));
		});
}

describe('Propriétés — DAG de rétractation causale (fast-check)', () => {
	it('buildCausalDAG garantit la symétrie exacte entre dependentsOf et antecedentsOf', () => {
		fc.assert(
			fc.property(graphArbitrary(true), ([nodes]) => {
				const statements = nodes.map((n) =>
					makeStatement(n.id, n.subjectId, n.basedOn, n.antecedents, n.confidence)
				);
				const { dependentsOf, antecedentsOf } = buildCausalDAG(statements);

				for (const [child, parents] of antecedentsOf.entries()) {
					for (const parent of parents) {
						expect(dependentsOf.get(parent)?.has(child)).toBe(true);
					}
				}
				for (const [parent, children] of dependentsOf.entries()) {
					for (const child of children) {
						expect(antecedentsOf.get(child)?.has(parent)).toBe(true);
					}
				}
			}),
			{ numRuns: 100 }
		);
	});

	it('findTransitiveDependents termine même avec cycles, exclut rootId et vérifie la clôture transitive', () => {
		fc.assert(
			fc.property(graphArbitrary(true), ([nodes, rootIdx]) => {
				const statements = nodes.map((n) =>
					makeStatement(n.id, n.subjectId, n.basedOn, n.antecedents, n.confidence)
				);
				const rootId = nodes[rootIdx].id;
				const { dependentsOf } = buildCausalDAG(statements);

				const descendants = findTransitiveDependents(rootId, dependentsOf);
				const descSet = new Set(descendants);

				// Pas de doublons, jamais rootId
				expect(descSet.size).toBe(descendants.length);
				expect(descSet.has(rootId)).toBe(false);

				// Clôture transitive : tout dépendant direct d'un descendant (autre que rootId) est dans descSet
				for (const d of descSet) {
					for (const next of dependentsOf.get(d) ?? []) {
						if (next !== rootId) {
							expect(descSet.has(next)).toBe(true);
						}
					}
				}
			}),
			{ numRuns: 120 }
		);
	});

	it('executeRetractionCascade rétrograde uniquement le cône causal et préserve les bornes de maturité', () => {
		const levelOrder: Record<SubjectMaturity, number> = {
			L0_named: 0,
			L1_framed: 1,
			L2_decomposed: 2,
			L3_decided: 3,
			L4_specified: 4,
			L5_archived: 5
		};

		fc.assert(
			fc.property(graphArbitrary(false), ([nodes, rootIdx]) => {
				const statements = nodes.map((n) =>
					makeStatement(n.id, n.subjectId, n.basedOn, n.antecedents, n.confidence)
				);
				const subjects = nodes.map((n) => makeSubject(n.subjectId, n.subjectLevel));
				const drafts: Record<string, TelegraphicDraft> = {};
				for (const n of nodes) {
					drafts[n.subjectId] = makeDraft(n.subjectId, n.subjectLevel);
				}

				const targetId = nodes[rootIdx].id;
				const result = executeRetractionCascade({
					targetStatementId: targetId,
					reason: 'Hypothèse invalidée en revue',
					statements,
					subjects,
					drafts
				});

				// 1. La cible est contestée et rétrogradée à assumed
				expect(result.retractedStatement?.status).toBe('contested');
				expect(result.retractedStatement?.maturity.confidence).toBe('assumed');

				// 2. Tous les descendants impactés sont en under_review / assumed
				const impactedSet = new Set(result.impactedDescendantIds);
				expect(result.demotedStatements).toHaveLength(impactedSet.size);
				for (const stmt of result.demotedStatements) {
					expect(impactedSet.has(stmt.id)).toBe(true);
					expect(stmt.status).toBe('under_review');
					expect(stmt.maturity.confidence).toBe('assumed');
				}

				// 3. Aucun sujet ne progresse en maturité, et un sujet L0/L1 reste à son palier
				const impactedSubjs = new Set(result.demotedSubjectIds);
				for (let i = 0; i < subjects.length; i++) {
					const before = subjects[i];
					const after = result.updatedSubjects[i];
					expect(levelOrder[after.level]).toBeLessThanOrEqual(levelOrder[before.level]);
					if (!impactedSubjs.has(before.id)) {
						expect(after.level).toBe(before.level);
					} else {
						expect(result.updatedDrafts[before.id].is_provisional).toBe(true);
					}
				}
			}),
			{ numRuns: 100 }
		);
	});
});
