import { prisma } from '../prisma';
import {
	DEFAULT_REFERENCE_RULES,
	evaluateCondition,
	type ReferenceRule,
	type RuleCondition,
	type QuestionTriggerAction
} from '$lib/domain/projectRules';
import {
	DEFAULT_FACT_VOCABULARY_ITEMS,
	DEFAULT_RULE_SEMANTIC_HINTS,
	detectOverlappingReflexes,
	evaluateSemanticReflexMatch,
	extractFactsHeuristicallyFromText,
	normalizeFactValue,
	toReferenceRule,
	type AgentBlindspotCandidate,
	type CanonicalFactValue,
	type FactVocabularyItem,
	type ReflexOverlapWarning,
	type ReflexProjectMetrics,
	type ReflexRuleRecord,
	type ReflexRuleSource,
	type ReflexRuleStatus,
	type ReflexSimulationMatch,
	type VocabularyValueType
} from '$lib/domain/reflexStudio';
import type { CascadeQuestion } from '$lib/domain/cascade';

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function mapDbRule(row: {
	id: string;
	version: number;
	status: string;
	title: string;
	domain: string;
	assetRef: string;
	assetType: string;
	mandatory: boolean;
	conditions: string;
	semanticHints: string;
	action: string;
	source: string;
	createdBy: string | null;
	updatedBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}): ReflexRuleRecord {
	return {
		id: row.id,
		version: row.version,
		status: (row.status as ReflexRuleStatus) || 'draft',
		title: row.title,
		domain: row.domain,
		assetRef: row.assetRef,
		assetType: (row.assetType as ReflexRuleRecord['assetType']) || 'pattern',
		mandatory: row.mandatory,
		conditions: parseJsonSafe<RuleCondition[]>(row.conditions, []),
		semanticHints: parseJsonSafe<string[]>(row.semanticHints, []),
		action: parseJsonSafe<QuestionTriggerAction>(row.action, {
			question: '',
			subjectName: '',
			rationale: '',
			initialLevel: 'L1_framed',
			suggestedRole: 'lead_architect',
			mandatory: row.mandatory
		}),
		source: (row.source as ReflexRuleSource) || 'catalog',
		createdBy: row.createdBy,
		updatedBy: row.updatedBy,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

function mapDbVocabulary(row: {
	key: string;
	label: string;
	valueType: string;
	canonicalValues: string;
	description: string;
}): FactVocabularyItem {
	return {
		key: row.key,
		label: row.label,
		valueType: (row.valueType as VocabularyValueType) || 'string',
		canonicalValues: parseJsonSafe<CanonicalFactValue[]>(row.canonicalValues, []),
		description: row.description
	};
}

/**
 * Initialise paresseusement le catalogue de réflexes et le vocabulaire canonique
 * à partir des valeurs par défaut si les tables sont encore vides.
 */
export async function ensureReflexCatalogSeeded(): Promise<void> {
	const [ruleCount, vocabCount] = await Promise.all([
		prisma.reflexRule.count(),
		prisma.factVocabularyEntry.count()
	]);

	if (ruleCount === 0) {
		for (const ref of DEFAULT_REFERENCE_RULES) {
			const meta = DEFAULT_RULE_SEMANTIC_HINTS[ref.id] || {
				domain: 'general',
				semanticHints: []
			};
			await prisma.reflexRule.upsert({
				where: { id: ref.id },
				create: {
					id: ref.id,
					version: 1,
					status: 'published',
					title: ref.title,
					domain: meta.domain,
					assetRef: ref.assetRef,
					assetType: ref.assetType,
					mandatory: ref.mandatory,
					conditions: JSON.stringify(ref.conditions),
					semanticHints: JSON.stringify(meta.semanticHints),
					action: JSON.stringify(ref.action),
					source: 'catalog',
					createdBy: 'system',
					updatedBy: 'system'
				},
				update: {}
			});
		}
	}

	if (vocabCount === 0) {
		for (const item of DEFAULT_FACT_VOCABULARY_ITEMS) {
			await prisma.factVocabularyEntry.upsert({
				where: { key: item.key },
				create: {
					key: item.key,
					label: item.label,
					valueType: item.valueType,
					canonicalValues: JSON.stringify(item.canonicalValues),
					description: item.description
				},
				update: {}
			});
		}
	}
}

export async function listPublishedVocabulary(): Promise<FactVocabularyItem[]> {
	await ensureReflexCatalogSeeded();
	const rows = await prisma.factVocabularyEntry.findMany({ orderBy: { key: 'asc' } });
	return rows.map(mapDbVocabulary);
}

export async function listPublishedReferenceRules(): Promise<ReferenceRule[]> {
	await ensureReflexCatalogSeeded();
	const rows = await prisma.reflexRule.findMany({
		where: { status: 'published' },
		orderBy: { createdAt: 'asc' }
	});
	return rows.map((r) => toReferenceRule(mapDbRule(r)));
}

/**
 * Charge l'état complet du Studio Admin des Réflexes.
 */
export async function getAdminReflexStudioState(): Promise<{
	rules: ReflexRuleRecord[];
	vocabulary: FactVocabularyItem[];
	metrics: Record<string, ReflexProjectMetrics>;
	overlaps: ReflexOverlapWarning[];
	blindspotCandidates: AgentBlindspotCandidate[];
}> {
	await ensureReflexCatalogSeeded();

	const [ruleRows, vocabRows, projects, proposedEvents] = await Promise.all([
		prisma.reflexRule.findMany({ orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] }),
		prisma.factVocabularyEntry.findMany({ orderBy: { key: 'asc' } }),
		prisma.project.findMany({ select: { id: true, strategy: true } }),
		prisma.domainEvent.findMany({
			where: { entityType: 'cascade_question', type: 'CASCADE_QUESTION_PROPOSED' },
			orderBy: { createdAt: 'desc' },
			take: 150
		})
	]);

	const rules = ruleRows.map(mapDbRule);
	const vocabulary = vocabRows.map(mapDbVocabulary);

	const metrics: Record<string, ReflexProjectMetrics> = {};
	for (const r of rules) {
		metrics[r.id] = {
			ruleId: r.id,
			disabledCount: 0,
			disabledJustifications: [],
			triggeredCount: 0
		};
	}

	for (const p of projects) {
		const strat = parseJsonSafe<Record<string, any>>(p.strategy, {});
		const overrides = strat.ruleOverrides || {};
		for (const [ruleId, ov] of Object.entries<any>(overrides)) {
			if (ov?.status === 'disabled') {
				if (!metrics[ruleId]) {
					metrics[ruleId] = {
						ruleId,
						disabledCount: 0,
						disabledJustifications: [],
						triggeredCount: 0
					};
				}
				metrics[ruleId].disabledCount++;
				if (ov.justification) {
					metrics[ruleId].disabledJustifications.push(String(ov.justification));
				}
			}
		}
	}

	const existingNames = new Set(
		rules.map((r) => r.action.subjectName.trim().toLowerCase())
	);
	const candidateGroups = new Map<string, AgentBlindspotCandidate>();

	for (const ev of proposedEvents) {
		const q = parseJsonSafe<CascadeQuestion | null>(ev.payload, null);
		if (!q || !q.subjectName || !q.text) continue;
		const fp = q.subjectName
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		if (!fp || existingNames.has(q.subjectName.trim().toLowerCase())) continue;

		const existing = candidateGroups.get(fp);
		if (existing) {
			existing.occurrences++;
		} else {
			candidateGroups.set(fp, {
				fingerprint: fp,
				subjectName: q.subjectName,
				questionText: q.text,
				grounds: q.grounds || 'Angle mort identifié par l’agent Proposeur',
				occurrences: 1,
				sampleFacts: (q.lineage?.triggeringFacts || []).slice(0, 4),
				lastProposedAt: ev.createdAt.toISOString()
			});
		}
	}

	const blindspotCandidates = Array.from(candidateGroups.values()).sort(
		(a, b) => b.occurrences - a.occurrences
	);

	const overlaps = detectOverlappingReflexes(rules);

	return {
		rules,
		vocabulary,
		metrics,
		overlaps,
		blindspotCandidates
	};
}

export async function createReflexRule(params: {
	id?: string;
	title: string;
	domain?: string;
	assetRef?: string;
	assetType?: 'pattern' | 'principle' | 'control' | 'standard';
	mandatory?: boolean;
	status?: ReflexRuleStatus;
	conditions: RuleCondition[];
	semanticHints?: string[];
	action: QuestionTriggerAction;
	source?: ReflexRuleSource;
	actorId?: string;
}): Promise<ReflexRuleRecord> {
	await ensureReflexCatalogSeeded();
	const id =
		params.id?.trim().toUpperCase() ||
		`RFX-${Date.now().toString(36).toUpperCase()}`;

	const created = await prisma.reflexRule.create({
		data: {
			id,
			version: 1,
			status: params.status || 'draft',
			title: params.title.trim(),
			domain: params.domain || 'general',
			assetRef: (params.assetRef || id).trim(),
			assetType: params.assetType || 'pattern',
			mandatory: Boolean(params.mandatory),
			conditions: JSON.stringify(params.conditions),
			semanticHints: JSON.stringify(params.semanticHints || []),
			action: JSON.stringify({
				...params.action,
				mandatory: Boolean(params.mandatory ?? params.action.mandatory),
				assetRef: params.assetRef || id
			}),
			source: params.source || 'admin_authored',
			createdBy: params.actorId || 'admin',
			updatedBy: params.actorId || 'admin'
		}
	});

	return mapDbRule(created);
}

export async function updateReflexRule(
	ruleId: string,
	patch: Partial<{
		title: string;
		domain: string;
		assetRef: string;
		assetType: 'pattern' | 'principle' | 'control' | 'standard';
		mandatory: boolean;
		status: ReflexRuleStatus;
		conditions: RuleCondition[];
		semanticHints: string[];
		action: QuestionTriggerAction;
	}>,
	actorId?: string
): Promise<ReflexRuleRecord> {
	await ensureReflexCatalogSeeded();
	const existing = await prisma.reflexRule.findUnique({ where: { id: ruleId } });
	if (!existing) {
		throw new Error(`Réflexe ${ruleId} introuvable.`);
	}

	const substantiveChange =
		patch.conditions !== undefined || patch.action !== undefined || patch.title !== undefined;
	const nextVersion =
		existing.status === 'published' && substantiveChange
			? existing.version + 1
			: existing.version;

	const currentAction = parseJsonSafe<QuestionTriggerAction>(existing.action, {
		question: '',
		subjectName: '',
		rationale: '',
		initialLevel: 'L1_framed',
		suggestedRole: 'lead_architect',
		mandatory: existing.mandatory
	});

	const nextAction: QuestionTriggerAction = patch.action
		? {
				...currentAction,
				...patch.action,
				mandatory: patch.mandatory ?? patch.action.mandatory ?? existing.mandatory,
				assetRef: patch.assetRef ?? existing.assetRef
			}
		: {
				...currentAction,
				mandatory: patch.mandatory ?? currentAction.mandatory,
				assetRef: patch.assetRef ?? currentAction.assetRef
			};

	const updated = await prisma.reflexRule.update({
		where: { id: ruleId },
		data: {
			version: nextVersion,
			...(patch.status !== undefined ? { status: patch.status } : {}),
			...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
			...(patch.domain !== undefined ? { domain: patch.domain } : {}),
			...(patch.assetRef !== undefined ? { assetRef: patch.assetRef.trim() } : {}),
			...(patch.assetType !== undefined ? { assetType: patch.assetType } : {}),
			...(patch.mandatory !== undefined ? { mandatory: patch.mandatory } : {}),
			...(patch.conditions !== undefined ? { conditions: JSON.stringify(patch.conditions) } : {}),
			...(patch.semanticHints !== undefined
				? { semanticHints: JSON.stringify(patch.semanticHints) }
				: {}),
			action: JSON.stringify(nextAction),
			updatedBy: actorId || 'admin'
		}
	});

	return mapDbRule(updated);
}

export async function deleteReflexRule(ruleId: string): Promise<void> {
	await prisma.reflexRule.delete({ where: { id: ruleId } });
}

export async function upsertVocabularyEntry(entry: FactVocabularyItem): Promise<FactVocabularyItem> {
	await ensureReflexCatalogSeeded();
	const saved = await prisma.factVocabularyEntry.upsert({
		where: { key: entry.key },
		create: {
			key: entry.key,
			label: entry.label,
			valueType: entry.valueType,
			canonicalValues: JSON.stringify(entry.canonicalValues),
			description: entry.description
		},
		update: {
			label: entry.label,
			valueType: entry.valueType,
			canonicalValues: JSON.stringify(entry.canonicalValues),
			description: entry.description
		}
	});
	return mapDbVocabulary(saved);
}

/**
 * Bac à sable d'administration :
 * 1. Extrait et normalise les faits depuis un texte libre grâce au vocabulaire + alias.
 * 2. Évalue les réflexes (déterministe + filet sémantique).
 * 3. Optionnellement, rejoue sur l'historique anonymisé des décisions en base.
 */
export async function simulateReflexes(params: {
	text: string;
	facts?: Array<{ key: string; value: string }>;
	ruleId?: string;
	ruleDraft?: Partial<ReflexRuleRecord>;
	includeHistoricalReplay?: boolean;
}): Promise<{
	extractedFacts: Array<{ key: string; rawValue?: string; canonicalValue: string; matchedAlias?: string }>;
	matches: ReflexSimulationMatch[];
	replaySummary?: {
		totalDecisions: number;
		deterministicHits: number;
		semanticSuggestions: number;
		samples: Array<{ sectionRef: string; domain: string; matchKind: 'deterministic' | 'semantic_suggestion'; factsCount: number }>;
	};
}> {
	await ensureReflexCatalogSeeded();
	const [ruleRows, vocabRows] = await Promise.all([
		prisma.reflexRule.findMany({ orderBy: { createdAt: 'asc' } }),
		prisma.factVocabularyEntry.findMany({ orderBy: { key: 'asc' } })
	]);

	const vocabulary = vocabRows.map(mapDbVocabulary);
	const allRules = ruleRows.map(mapDbRule).filter((r) => r.status !== 'deprecated');

	if (params.ruleDraft && params.ruleDraft.conditions && params.ruleDraft.action) {
		allRules.unshift({
			id: params.ruleDraft.id || 'DRAFT-PREVIEW',
			version: 1,
			status: (params.ruleDraft.status as ReflexRuleStatus) || 'draft',
			title: params.ruleDraft.title || 'Brouillon en cours d’édition',
			domain: params.ruleDraft.domain || 'general',
			assetRef: params.ruleDraft.assetRef || 'DRAFT',
			assetType: params.ruleDraft.assetType || 'pattern',
			mandatory: Boolean(params.ruleDraft.mandatory),
			conditions: params.ruleDraft.conditions,
			semanticHints: params.ruleDraft.semanticHints || [],
			action: params.ruleDraft.action,
			source: 'admin_authored'
		});
	}

	const heuristicFacts = extractFactsHeuristicallyFromText(params.text || '', vocabulary);
	const mergedFactMap = new Map<
		string,
		{ key: string; rawValue?: string; canonicalValue: string; matchedAlias?: string }
	>();

	for (const hf of heuristicFacts) {
		mergedFactMap.set(hf.key, {
			key: hf.key,
			rawValue: hf.matchedAlias,
			canonicalValue: hf.value,
			matchedAlias: hf.matchedAlias
		});
	}

	for (const f of params.facts || []) {
		if (!f.key || f.value === undefined) continue;
		const norm = normalizeFactValue(f.key, f.value, vocabulary);
		mergedFactMap.set(f.key, {
			key: f.key,
			rawValue: f.value,
			canonicalValue: norm.canonical,
			matchedAlias: norm.matchedAlias
		});
	}

	const extractedFacts = Array.from(mergedFactMap.values());

	const matches: ReflexSimulationMatch[] = allRules.map((rule) => {
		const condDetails: string[] = [];
		const matchedAliases: string[] = [];
		let allPass = rule.conditions.length > 0;

		for (const cond of rule.conditions) {
			const factItem = mergedFactMap.get(cond.key);
			const passed = evaluateCondition(cond, factItem?.canonicalValue, vocabulary);
			if (passed) {
				if (factItem?.matchedAlias) matchedAliases.push(`${cond.key}: "${factItem.matchedAlias}" → ${factItem.canonicalValue}`);
				condDetails.push(`✓ [${cond.key} ${cond.op} ${cond.value}] (normalisé: "${factItem?.canonicalValue}")`);
			} else {
				allPass = false;
				condDetails.push(
					factItem === undefined
						? `○ Fait absent : [${cond.key} ${cond.op} ${cond.value}]`
						: `✗ Valeur divergente : [${cond.key} ${cond.op} ${cond.value}] (reçu: "${factItem.canonicalValue}")`
				);
			}
		}

		const sem = evaluateSemanticReflexMatch(params.text || '', rule);
		const matchKind: ReflexSimulationMatch['matchKind'] = allPass
			? 'deterministic'
			: sem.score >= 0.35
				? 'semantic_suggestion'
				: 'unmatched';

		return {
			ruleId: rule.id,
			title: rule.title,
			domain: rule.domain,
			status: rule.status,
			mandatory: rule.mandatory,
			matchKind,
			semanticScore: sem.score,
			matchedAliases,
			triggeredSubjectName: rule.action.subjectName,
			triggeredQuestion: rule.action.question,
			conditionDetails: condDetails
		};
	});

	let replaySummary: Awaited<ReturnType<typeof simulateReflexes>>['replaySummary'];
	if (params.includeHistoricalReplay) {
		const targetRule =
			(params.ruleId ? allRules.find((r) => r.id === params.ruleId) : undefined) || allRules[0];
		const decisions = await prisma.decision.findMany({
			take: 100,
			orderBy: { createdAt: 'desc' },
			include: {
				subject: {
					select: { id: true, sectionRef: true, domain: true, name: true }
				}
			}
		});

		const subjectIds = decisions.map((d) => d.subjectId);
		const stmts = subjectIds.length
			? await prisma.statement.findMany({
					where: { subjectId: { in: subjectIds }, status: 'active' }
				})
			: [];
		const stmtsBySubject = new Map<string, Array<{ key: string; value: string }>>();
		for (const st of stmts) {
			if (!st.subjectId) continue;
			const arr = stmtsBySubject.get(st.subjectId) || [];
			arr.push({ key: st.predicate, value: st.value });
			stmtsBySubject.set(st.subjectId, arr);
		}

		let deterministicHits = 0;
		let semanticSuggestions = 0;
		const samples: NonNullable<typeof replaySummary>['samples'] = [];

		if (targetRule) {
			for (const dec of decisions) {
				const rawFacts = stmtsBySubject.get(dec.subjectId) || [];
				const decFacts = rawFacts.length > 0
					? rawFacts
					: extractFactsHeuristicallyFromText(`${dec.subject.name} ${dec.rationale}`, vocabulary).map((f) => ({
							key: f.key,
							value: f.value
						}));
				const factMap = new Map(decFacts.map((f) => [f.key, f.value]));
				const passes =
					targetRule.conditions.length > 0 &&
					targetRule.conditions.every((c) => evaluateCondition(c, factMap.get(c.key), vocabulary));

				if (passes) {
					deterministicHits++;
					if (samples.length < 6) {
						samples.push({
							sectionRef: dec.subject.sectionRef,
							domain: dec.subject.domain || 'general',
							matchKind: 'deterministic',
							factsCount: decFacts.length
						});
					}
				} else {
					const sem = evaluateSemanticReflexMatch(`${dec.subject.name} ${dec.rationale}`, targetRule);
					if (sem.score >= 0.35) {
						semanticSuggestions++;
						if (samples.length < 6) {
							samples.push({
								sectionRef: dec.subject.sectionRef,
								domain: dec.subject.domain || 'general',
								matchKind: 'semantic_suggestion',
								factsCount: decFacts.length
							});
						}
					}
				}
			}
		}

		replaySummary = {
			totalDecisions: decisions.length,
			deterministicHits,
			semanticSuggestions,
			samples
		};
	}

	return {
		extractedFacts,
		matches,
		replaySummary
	};
}
