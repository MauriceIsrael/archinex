/**
 * Pipeline d'audit des exigences d'un RFP, par raffinements successifs (inspiré d'ArcKit).
 *
 * Étapes :
 *  1. Classement de chaque exigence (LLM, par lots) : à délibérer / commodité / à clarifier.
 *  2. Contrôles déterministes : une clause ne tombe jamais entre deux chaises, et une évacuation
 *     n'est acceptée que motivée et jamais pour une clause bloquante.
 *  3. Regroupement des clauses à délibérer en sujets d'architecture (LLM), ancré sur la doctrine
 *     de la base de connaissances fournie.
 *  4. Contrôles déterministes : chaque clause à délibérer appartient à exactement un sujet.
 *
 * Principes (constitution) :
 *  - Le modèle PROPOSE, l'humain dispose : rien de produit ici n'est `verified`.
 *  - Dans le doute, une clause est « à qualifier » : elle n'est JAMAIS évacuée par défaut.
 *  - Aucune donnée propre à un RFP n'est codée ici : tout vient des clauses reçues et du modèle.
 */

import { z } from 'zod';
import type { ExtractedClause } from '$lib/domain/corpus';
import type { FactorizedArchitecturalSubject, KnowledgeAlignment } from '$lib/domain/factorization';
import type { ArchitectRole } from '$lib/types/epistemic';
import { localLlmClient } from '$lib/server/llm/localLlmClient';
import { cleanJsonString, inferTargetSubjectsCount, type KbItemSummary } from '$lib/server/llm/rfpFactorizer';
import type { ChatOptions } from '$lib/server/llm/types';
import type { RequirementDisposition } from '$lib/domain/requirementAudit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArcKitRequirementCategory = 'FR' | 'NFR' | 'INT' | 'FAC' | 'BR' | 'DR';

/** `to_qualify` : le pipeline n'a pas pu (ou pas osé) trancher ; un humain doit qualifier la clause. */
export type { RequirementDisposition };

export interface AuditedRequirement {
	id: string;
	clauseRef: string;
	title: string;
	text: string;
	category?: ArcKitRequirementCategory;
	criticality: 'bloquant' | 'majeur' | 'info';
	disposition: RequirementDisposition;
	/** Motif de l'évacuation proposée (obligatoire pour `evacuated`). */
	evacuationReason?: string;
	/** Question précise au donneur d'ordre (obligatoire pour `clarification_needed`). */
	clarificationQuestion?: string;
	/** Tension d'architecture identifiée (pour `deliberated`). */
	deliberationReason?: string;
	/** Pourquoi la clause n'a pas pu être classée automatiquement (pour `to_qualify`). */
	qualifyReason?: string;
	linkedSubjectId?: string;
}

export interface ArcKitAuditReport {
	totalCount: number;
	evacuatedCount: number;
	deliberatedCount: number;
	clarificationCount: number;
	toQualifyCount: number;
	categoryDistribution: Record<ArcKitRequirementCategory, number>;
	requirements: AuditedRequirement[];
	clarifications: Array<{ clauseRef: string; title: string; question: string }>;
	warnings: string[];
}

/** Port minimal vers le LLM : permet d'injecter un faux modèle dans les tests. */
export interface LlmPort {
	chat(options: ChatOptions): Promise<string>;
}

export interface RequirementsAuditOptions {
	llm?: LlmPort;
	model?: string;
	kbStandards?: KbItemSummary[];
	/** Nombre de clauses classées par appel LLM. */
	classifyBatchSize?: number;
	/** Nombre maximal de clauses à délibérer regroupées par appel LLM. */
	groupChunkSize?: number;
	/** Nombre d'appels de classement menés en parallèle. */
	concurrency?: number;
}

export interface StagedAuditResult {
	/**
	 * ok          : toutes les étapes ont abouti.
	 * partial     : au moins un lot ou le regroupement a échoué (le rapport est fiable mais incomplet).
	 * unavailable : aucun lot n'a pu être classé (LLM injoignable) ; tout est « à qualifier ».
	 */
	status: 'ok' | 'partial' | 'unavailable';
	report: ArcKitAuditReport;
	subjects: FactorizedArchitecturalSubject[];
	warnings: string[];
	modelUsed: string;
}

/**
 * Au-delà de cette taille (caractères de titres + textes), la factorisation directe en un seul appel ne peut pas
 * aboutir : elle envoie tout le RFP d'un bloc et dépasse le délai. On n'y bascule donc pas, pour ne pas masquer
 * la vraie cause de l'échec de l'audit par un second échec 5 minutes plus tard.
 */
export const DIRECT_FALLBACK_MAX_CHARS = 60000;

export function totalClauseChars(clauses: ReadonlyArray<{ title?: string; text?: string }>): number {
	return clauses.reduce((n, c) => n + (c.title?.length ?? 0) + (c.text?.length ?? 0), 0);
}

/**
 * Taille maximale (caractères) pour la passe directe « grand contexte » : tout le RFP en un seul appel, sans
 * découpage ni flux. Constaté : 477 000 caractères dépassent le délai de 300 s (le temps est dominé par la
 * génération de la réponse). Le seuil par défaut est une estimation prudente, NON mesurée : à ajuster d'après
 * vos essais via `RFP_DIRECT_MAX_CHARS`. Au-delà, l'audit en étapes (appels courts, en parallèle) prend le relais.
 */
export function directPassMaxChars(): number {
	const fromEnv = Number.parseInt(process.env.RFP_DIRECT_MAX_CHARS ?? '', 10);
	return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 120000;
}

export function canUseDirectHolisticPass(clauses: ReadonlyArray<{ title?: string; text?: string }>): boolean {
	return totalClauseChars(clauses) <= directPassMaxChars();
}

export function canFallBackToDirectFactorization(clauses: ReadonlyArray<{ title?: string; text?: string }>): boolean {
	return totalClauseChars(clauses) <= DIRECT_FALLBACK_MAX_CHARS;
}

export const CATEGORIES: ArcKitRequirementCategory[] = ['FR', 'NFR', 'INT', 'FAC', 'BR', 'DR'];

const DEFAULT_CLASSIFY_BATCH = 40;
const DEFAULT_GROUP_CHUNK = 120;
const DEFAULT_CONCURRENCY = 3;
const MIN_REASON_CHARS = 12;
const CLAUSE_TEXT_BUDGET = 700;
const ALLOWED_ROLES: ArchitectRole[] = [
	'lead_architect',
	'infra_expert_architect',
	'security_architect',
	'domain_architect',
	'data_architect',
	'domain_expert'
];

// ─── Appel LLM avec JSON strict ───────────────────────────────────────────────

class StageError extends Error {}

/**
 * Appelle le LLM et exige un JSON valide conforme au schéma. Une seule relance est faite,
 * en rappelant l'erreur au modèle. Aucune réparation « créative » : un JSON douteux est refusé
 * plutôt que reconstitué (une réparation pourrait inventer des sujets).
 */
async function callJson<T>(
	llm: LlmPort,
	base: Pick<ChatOptions, 'model' | 'messages'>,
	schema: z.ZodType<T>
): Promise<T> {
	let lastError = 'réponse vide';
	let messages = base.messages;
	for (let attempt = 0; attempt < 2; attempt++) {
		const raw = await llm.chat({
			model: base.model,
			messages,
			format: 'json',
			maxTokens: 16000,
			temperature: 0,
			timeoutMs: 300000
		});
		try {
			const parsed = JSON.parse(cleanJsonString(raw));
			const checked = schema.safeParse(parsed);
			if (checked.success) return checked.data;
			lastError = checked.error.issues
				.slice(0, 3)
				.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
				.join(' ; ');
		} catch (err) {
			lastError = `JSON invalide (${err instanceof Error ? err.message.slice(0, 80) : 'erreur'})`;
		}
		messages = [
			...base.messages,
			{
				role: 'user',
				content: `Ta réponse précédente est inutilisable (${lastError}). Recommence en respectant strictement le format JSON demandé, sans aucun texte autour.`
			}
		];
	}
	throw new StageError(lastError);
}

// ─── Étape 1 : classement ─────────────────────────────────────────────────────

const ClassifyResponseSchema = z.object({
	items: z.array(
		z.object({
			ref: z.string(),
			category: z.string().optional().nullable(),
			disposition: z.string(),
			reason: z.string().optional().nullable(),
			question: z.string().optional().nullable()
		})
	)
});
export type ClassifyItem = z.infer<typeof ClassifyResponseSchema>['items'][number];

const CLASSIFY_SYSTEM = `Tu es architecte système senior (télécoms, infrastructures et systèmes critiques). Tu tries les exigences d'un appel d'offres pour décider lesquelles méritent un débat d'architecture.

Pour CHAQUE exigence reçue, choisis une disposition :
- "deliberate" : l'exigence engage un choix d'architecture avec des alternatives réelles (compromis coût / risque / performance), entre en tension avec une autre contrainte (souveraineté, sécurité, disponibilité, interopérabilité), ou a un impact transverse. Donne en "reason" la tension en une phrase.
- "commodity" : exigence nominale, entièrement couverte par des produits ou pratiques standard du marché, sans arbitrage d'architecture possible. Tu DOIS donner en "reason" un motif précis (une phrase).
- "clarify" : exigence ambiguë, incomplète ou contradictoire, qu'on ne peut pas traiter sans réponse du donneur d'ordre. Tu DOIS poser en "question" UNE question précise.

Règles impératives :
- En cas de doute, ne choisis JAMAIS "commodity".
- Une exigence de criticité "bloquant" n'est jamais "commodity".
- Toute valeur chiffrée exigeante (durées, disponibilité, délais, volumes), toute exigence de souveraineté, de sécurité ou de continuité de service relève de "deliberate".
- N'invente aucun fait absent du texte.

Catégorie ("category") : FR fonctionnelle, NFR non fonctionnelle (performance, disponibilité, résilience), INT interface ou interopérabilité, FAC installations physiques, BR règle de gestion ou gouvernance, DR donnée.

Réponds UNIQUEMENT par un objet JSON : {"items":[{"ref":"…","category":"…","disposition":"deliberate|commodity|clarify","reason":"…","question":"…"}]}
Un item par exigence, dans l'ordre reçu, sans en omettre aucune, avec "ref" recopié à l'identique.`;

function clip(text: string, max: number): string {
	const t = (text || '').replace(/\s+/g, ' ').trim();
	return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function buildClassifyUserMessage(batch: ExtractedClause[]): string {
	return [
		`Exigences à classer (${batch.length}) :`,
		...batch.map(
			(c) => `[${c.clauseRef}] (criticité : ${c.criticality}) ${clip(c.title, 120)} — ${clip(c.text, CLAUSE_TEXT_BUDGET)}`
		)
	].join('\n');
}

function normalizeDisposition(raw: string): 'deliberate' | 'commodity' | 'clarify' | null {
	const v = (raw || '').trim().toLowerCase();
	if (['deliberate', 'deliberated', 'deliberation'].includes(v)) return 'deliberate';
	if (['commodity', 'evacuate', 'evacuated', 'commodite'].includes(v)) return 'commodity';
	if (['clarify', 'clarification', 'clarification_needed'].includes(v)) return 'clarify';
	return null;
}

function normalizeCategory(raw?: string | null): ArcKitRequirementCategory | undefined {
	const v = (raw || '').trim().toUpperCase();
	return (CATEGORIES as string[]).includes(v) ? (v as ArcKitRequirementCategory) : undefined;
}

/**
 * Applique les contrôles déterministes sur les propositions du modèle. Fonction pure.
 * Garantit : une entrée par clause reçue, et aucune évacuation non motivée ou bloquante.
 */
export function applyClassificationInvariants(
	clauses: ExtractedClause[],
	items: ClassifyItem[],
	failureReasonByRef: Map<string, string> = new Map()
): AuditedRequirement[] {
	const byRef = new Map<string, ClassifyItem>();
	for (const item of items) {
		if (!byRef.has(item.ref)) byRef.set(item.ref, item); // doublon : le premier l'emporte
	}

	return clauses.map((clause): AuditedRequirement => {
		const base = {
			id: clause.id || clause.clauseRef.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
			clauseRef: clause.clauseRef,
			title: clause.title,
			text: clause.text,
			criticality: clause.criticality
		};
		const toQualify = (qualifyReason: string, category?: ArcKitRequirementCategory): AuditedRequirement => ({
			...base,
			category,
			disposition: 'to_qualify',
			qualifyReason
		});

		const failure = failureReasonByRef.get(clause.clauseRef);
		if (failure) return toQualify(failure);

		const item = byRef.get(clause.clauseRef);
		if (!item) return toQualify('Absente de la réponse du modèle : à classer par un humain.');

		const category = normalizeCategory(item.category);
		const disposition = normalizeDisposition(item.disposition);
		const reason = (item.reason || '').trim();
		const question = (item.question || '').trim();

		if (disposition === 'deliberate') {
			return { ...base, category, disposition: 'deliberated', deliberationReason: reason || undefined };
		}

		if (disposition === 'commodity') {
			if (reason.length < MIN_REASON_CHARS) {
				return toQualify('Évacuation proposée sans motif exploitable : à qualifier par un humain.', category);
			}
			if (clause.criticality === 'bloquant') {
				return toQualify(
					`Clause bloquante : le modèle proposait de l'évacuer (« ${clip(reason, 140)} »), ce qui exige une revue humaine.`,
					category
				);
			}
			return { ...base, category, disposition: 'evacuated', evacuationReason: reason };
		}

		if (disposition === 'clarify') {
			if (question.length < MIN_REASON_CHARS) {
				return toQualify('Clarification demandée sans question exploitable : à qualifier par un humain.', category);
			}
			return { ...base, category, disposition: 'clarification_needed', clarificationQuestion: question };
		}

		return toQualify(`Disposition inconnue renvoyée par le modèle (« ${clip(item.disposition, 40)} »).`, category);
	});
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	});
	await Promise.all(workers);
	return results;
}

// ─── Étape 3 : regroupement en sujets ─────────────────────────────────────────

const SubjectsResponseSchema = z.object({
	subjects: z.array(
		z.object({
			name: z.string(),
			sectionRef: z.string().optional().nullable(),
			coveredClauseRefs: z.array(z.string()),
			waitingForRole: z.string().optional().nullable(),
			effort: z.string().optional().nullable(),
			knowledgeAlignment: z.string().optional().nullable(),
			matchedKbItemIds: z.array(z.string()).optional().nullable(),
			alignmentRationale: z.string().optional().nullable(),
			seed: z
				.object({
					initialQuestion: z.string().optional().nullable(),
					initialHypothesis: z.string().optional().nullable(),
					initialConflict: z.string().optional().nullable(),
					initialRetenu: z.array(z.string()).optional().nullable(),
					expertQuestions: z.array(z.string()).optional().nullable()
				})
				.optional()
				.nullable()
		})
	)
});
export type RawSubject = z.infer<typeof SubjectsResponseSchema>['subjects'][number];

function buildGroupSystem(targetCountDesc: string): string {
	return `Tu es architecte système senior. On te donne des exigences d'un appel d'offres déjà jugées « à délibérer », et éventuellement des règles de doctrine de l'entreprise.

Regroupe ces exigences en ${targetCountDesc} sujets d'architecture cohérents, chacun formulé comme un dilemme à trancher (pas comme un thème). Chaque exigence doit figurer dans exactement UN sujet.

Pour chaque sujet fournis :
- "name" : titre court du dilemme ;
- "sectionRef" : section du RFP concernée ;
- "coveredClauseRefs" : références EXACTES des exigences rattachées ;
- "waitingForRole" : lead_architect | infra_expert_architect | security_architect | domain_architect | data_architect | domain_expert ;
- "effort" : S | M | L | XL ;
- "knowledgeAlignment" : standard_established si une règle de doctrine fournie couvre le sujet, conflict_detected si une exigence la contredit, sinon novel_requirement ; "matchedKbItemIds" : ids EXACTS parmi les règles fournies, sinon [] ; "alignmentRationale" : une phrase ;
- "seed.initialQuestion" : la question d'architecture à trancher ;
- "seed.initialHypothesis" : une hypothèse de départ, présentée comme telle ;
- "seed.initialConflict" : la tension principale ;
- "seed.initialRetenu" : uniquement des exigences du RFP reprises telles quelles ("REF : formulation courte"), jamais une décision d'architecture ;
- "seed.expertQuestions" : 1 à 3 questions précises à poser au sachant métier.

N'invente aucun chiffre absent des exigences. Réponds UNIQUEMENT par un objet JSON : {"subjects":[…]}.`;
}

function buildGroupUserMessage(part: AuditedRequirement[], kb: KbItemSummary[]): string {
	const lines = [`Exigences à regrouper (${part.length}) :`];
	for (const r of part) {
		lines.push(
			`[${r.clauseRef}] (criticité : ${r.criticality}) ${clip(r.title, 120)} — ${clip(r.text, CLAUSE_TEXT_BUDGET)}` +
				(r.deliberationReason ? ` | tension : ${clip(r.deliberationReason, 160)}` : '')
		);
	}
	if (kb.length > 0) {
		lines.push('', `Règles de doctrine disponibles (${Math.min(kb.length, 40)}) :`);
		for (const k of kb.slice(0, 40)) {
			lines.push(`[${k.id}] ${clip(k.title, 100)} — ${clip(k.ruleOrStatement, 220)}`);
		}
	} else {
		lines.push('', 'Aucune règle de doctrine fournie : tous les sujets sont "novel_requirement" avec matchedKbItemIds = [].');
	}
	return lines.join('\n');
}

function deriveLotId(refs: string[], sectionRef: string): string {
	const sample = `${refs[0] || ''} ${sectionRef || ''}`;
	const lot = sample.match(/lot\s*[-_ ]?(\d+)/i);
	if (lot) return `LOT-${lot[1]}`;
	const sec = sample.match(/§\s*(\d+)/);
	if (sec) return `LOT-§${sec[1]}`;
	return 'LOT-GEN';
}

function pickRole(raw?: string | null): ArchitectRole {
	return (ALLOWED_ROLES as string[]).includes(raw || '') ? (raw as ArchitectRole) : 'lead_architect';
}

function pickEffort(raw?: string | null): 'S' | 'M' | 'L' | 'XL' {
	return raw === 'S' || raw === 'M' || raw === 'L' || raw === 'XL' ? raw : 'M';
}

function pickAlignment(raw: string | null | undefined, matched: string[]): KnowledgeAlignment {
	if (raw === 'conflict_detected' && matched.length > 0) return 'conflict_detected';
	if (raw === 'standard_established' && matched.length > 0) return 'standard_established';
	return 'novel_requirement';
}

/**
 * Contrôles déterministes sur les sujets proposés. Fonction pure.
 * Garantit : chaque clause à délibérer appartient à exactement un sujet ; seuls des ids de doctrine
 * réellement fournis sont conservés ; une clause sans sujet est rattachée par proximité dans le document.
 */
export function applySubjectInvariants(
	deliberated: AuditedRequirement[],
	rawSubjects: RawSubject[],
	kb: KbItemSummary[],
	startIndex = 0
): { subjects: FactorizedArchitecturalSubject[]; attachedByProximity: string[]; droppedEmpty: number } {
	const order = new Map(deliberated.map((r, i) => [r.clauseRef, i]));
	const kbIds = new Set(kb.map((k) => k.id));
	const claimed = new Set<string>();
	const kept: Array<{ raw: RawSubject; refs: string[] }> = [];

	for (const raw of rawSubjects) {
		const refs: string[] = [];
		for (const ref of raw.coveredClauseRefs) {
			if (order.has(ref) && !claimed.has(ref)) {
				claimed.add(ref);
				refs.push(ref);
			}
		}
		kept.push({ raw, refs });
	}

	const nonEmpty = kept.filter((k) => k.refs.length > 0);
	const droppedEmpty = kept.length - nonEmpty.length;

	// Rattachement par proximité des clauses non couvertes (voisin le plus proche déjà affecté)
	const attachedByProximity: string[] = [];
	if (nonEmpty.length > 0) {
		// Les ancres sont figées sur les affectations du modèle : une clause rattachée par proximité
		// ne sert pas elle-même d'ancre, sinon les rattachements se propageraient en chaîne.
		const anchorOf = new Map<string, number>();
		nonEmpty.forEach((k, idx) => k.refs.forEach((r) => anchorOf.set(r, idx)));
		for (const req of deliberated) {
			if (anchorOf.has(req.clauseRef)) continue;
			const pos = order.get(req.clauseRef)!;
			let target = -1;
			for (let d = 1; d < deliberated.length && target < 0; d++) {
				const before = deliberated[pos - d];
				const after = deliberated[pos + d];
				if (before && anchorOf.has(before.clauseRef)) target = anchorOf.get(before.clauseRef)!;
				else if (after && anchorOf.has(after.clauseRef)) target = anchorOf.get(after.clauseRef)!;
			}
			if (target >= 0) {
				nonEmpty[target].refs.push(req.clauseRef);
				attachedByProximity.push(req.clauseRef);
			}
		}
	}

	const subjects = nonEmpty.map(({ raw, refs }, idx): FactorizedArchitecturalSubject => {
		const sortedRefs = [...refs].sort((a, b) => order.get(a)! - order.get(b)!);
		const matched = (raw.matchedKbItemIds || []).filter((id) => kbIds.has(id));
		const sectionRef = (raw.sectionRef || '').trim() || sortedRefs[0];
		const n = startIndex + idx + 1;
		const name = raw.name.trim() || `Sujet d'architecture ${n}`;
		return {
			id: `SUBJ-${String(n).padStart(2, '0')}`,
			lotId: deriveLotId(sortedRefs, sectionRef),
			name,
			sectionRef,
			coveredClauseRefs: sortedRefs,
			matchedKbItemIds: matched,
			knowledgeAlignment: pickAlignment(raw.knowledgeAlignment, matched),
			alignmentRationale:
				(raw.alignmentRationale || '').trim() || 'Aucune règle de doctrine rapprochée : sujet à instruire.',
			initialLevel: 'L0_unassessed',
			waitingForRole: pickRole(raw.waitingForRole),
			effort: pickEffort(raw.effort),
			seed: {
				initialRetenu: (raw.seed?.initialRetenu || []).filter((s) => s.trim().length > 0),
				initialHypothesis: (raw.seed?.initialHypothesis || '').trim() || `Hypothèse à formuler pour « ${name} ».`,
				initialConflict: (raw.seed?.initialConflict || '').trim() || undefined,
				initialQuestion: (raw.seed?.initialQuestion || '').trim() || `Quelle architecture retenir pour « ${name} » ?`,
				expertQuestions: (raw.seed?.expertQuestions || []).filter((s) => s.trim().length > 0)
			}
		};
	});

	return { subjects, attachedByProximity, droppedEmpty };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

export function buildAuditReport(requirements: AuditedRequirement[], warnings: string[] = []): ArcKitAuditReport {
	const count = (d: RequirementDisposition) => requirements.filter((r) => r.disposition === d).length;
	const categoryDistribution = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<ArcKitRequirementCategory, number>;
	for (const r of requirements) if (r.category) categoryDistribution[r.category]++;
	return {
		totalCount: requirements.length,
		evacuatedCount: count('evacuated'),
		deliberatedCount: count('deliberated'),
		clarificationCount: count('clarification_needed'),
		toQualifyCount: count('to_qualify'),
		categoryDistribution,
		requirements,
		clarifications: requirements
			.filter((r) => r.disposition === 'clarification_needed')
			.map((r) => ({ clauseRef: r.clauseRef, title: r.title, question: r.clarificationQuestion! })),
		warnings
	};
}

/**
 * Audite les exigences d'un RFP : classement, regroupement en sujets et contrôles d'intégrité.
 * Ne lève jamais d'exception liée au LLM : en cas d'échec, les clauses concernées sont « à qualifier ».
 */
export async function runRequirementsAudit(
	clauses: ExtractedClause[],
	options: RequirementsAuditOptions = {}
): Promise<StagedAuditResult> {
	const auditStart = Date.now();
	const llm = options.llm ?? localLlmClient;
	const model = options.model || localLlmClient.getDefaultModel();
	const kb = options.kbStandards ?? [];
	const warnings: string[] = [];

	console.log(`\n--------------------------------------------------------------------------------`);
	console.log(`📋 [Audit Exigences ArcKit] Démarrage de l'audit pour ${clauses.length} clauses (Modèle: ${model})`);

	// Étape 1 : classement par lots
	const batchSize = options.classifyBatchSize ?? DEFAULT_CLASSIFY_BATCH;
	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const batches = chunk(clauses, batchSize);
	const failureByRef = new Map<string, string>();
	const items: ClassifyItem[] = [];
	let failedBatches = 0;

	console.log(`📦 [Audit Exigences ArcKit] Étape 1 : Classement par lots (${batches.length} lots de max ${batchSize} clauses, concurrence: ${concurrency})`);

	await mapWithConcurrency(batches, concurrency, async (batch, i) => {
		const batchStart = Date.now();
		console.log(`   ⏳ [Audit Exigences ArcKit] Lot ${i + 1}/${batches.length} (${batch.length} clauses) -> envoi au modèle...`);
		try {
			const data = await callJson(
				llm,
				{
					model,
					messages: [
						{ role: 'system', content: CLASSIFY_SYSTEM },
						{ role: 'user', content: buildClassifyUserMessage(batch) }
					]
				},
				ClassifyResponseSchema
			);
			items.push(...data.items);
			const batchSec = ((Date.now() - batchStart) / 1000).toFixed(1);
			console.log(`   ✅ [Audit Exigences ArcKit] Lot ${i + 1}/${batches.length} traité en ${batchSec}s (${data.items.length} items classés).`);
		} catch (err) {
			failedBatches++;
			const batchSec = ((Date.now() - batchStart) / 1000).toFixed(1);
			const msg = err instanceof Error ? err.message : String(err);
			const reason = `Classement indisponible pour le lot ${i + 1}/${batches.length} (${clip(msg, 100)}).`;
			console.warn(`   ⚠️ [Audit Exigences ArcKit] Échec du lot ${i + 1}/${batches.length} (${batchSec}s) :`, msg);
			for (const c of batch) failureByRef.set(c.clauseRef, reason);
			warnings.push(reason);
		}
	});

	// Étape 2 : contrôles déterministes
	const requirements = applyClassificationInvariants(clauses, items, failureByRef);
	const deliberatedCount = requirements.filter((r) => r.disposition === 'deliberated').length;
	const evacuatedCount = requirements.filter((r) => r.disposition === 'evacuated').length;
	const clarifyCount = requirements.filter((r) => r.disposition === 'clarification_needed').length;
	const toQualifyCount = requirements.filter((r) => r.disposition === 'to_qualify').length;

	console.log(`🔍 [Audit Exigences ArcKit] Étape 2 : Contrôles d'intégrité appliqués.`);
	console.log(`   - À délibérer : ${deliberatedCount} | Évacuées (commodités) : ${evacuatedCount} | À clarifier : ${clarifyCount} | À qualifier : ${toQualifyCount}`);

	const downgraded = requirements.filter((r) => r.disposition === 'to_qualify' && !failureByRef.has(r.clauseRef)).length;
	if (downgraded > 0) {
		warnings.push(
			`${downgraded} clause(s) laissée(s) « à qualifier » par les contrôles d'intégrité (motif manquant, clause bloquante ou réponse incomplète).`
		);
	}

	if (batches.length > 0 && failedBatches === batches.length) {
		console.warn(`❌ [Audit Exigences ArcKit] Tous les lots ont échoué, modèle indisponible.`);
		return { status: 'unavailable', report: buildAuditReport(requirements, warnings), subjects: [], warnings, modelUsed: model };
	}

	// Étape 3 : regroupement des clauses à délibérer en sujets
	const deliberated = requirements.filter((r) => r.disposition === 'deliberated');
	const subjects: FactorizedArchitecturalSubject[] = [];
	let groupingFailed = false;

	console.log(`🧩 [Audit Exigences ArcKit] Étape 3 : Regroupement de ${deliberated.length} clauses à délibérer en sujets...`);

	for (const part of chunk(deliberated, options.groupChunkSize ?? DEFAULT_GROUP_CHUNK)) {
		try {
			const data = await callJson(
				llm,
				{
					model,
					messages: [
						{ role: 'system', content: buildGroupSystem(inferTargetSubjectsCount(part.length, true)) },
						{ role: 'user', content: buildGroupUserMessage(part, kb) }
					]
				},
				SubjectsResponseSchema
			);
			// Étape 4 : contrôles déterministes
			const res = applySubjectInvariants(part, data.subjects, kb, subjects.length);
			subjects.push(...res.subjects);
			if (res.attachedByProximity.length > 0) {
				const shown = res.attachedByProximity.slice(0, 5).join(', ');
				warnings.push(
					`${res.attachedByProximity.length} clause(s) rattachée(s) à un sujet par proximité dans le document, à vérifier (${shown}${res.attachedByProximity.length > 5 ? '…' : ''}).`
				);
			}
			if (res.droppedEmpty > 0) warnings.push(`${res.droppedEmpty} sujet(s) vide(s) proposé(s) par le modèle ont été écartés.`);
			const covered = new Set(res.subjects.flatMap((s) => s.coveredClauseRefs));
			if (part.some((r) => !covered.has(r.clauseRef))) groupingFailed = true;
		} catch (err) {
			groupingFailed = true;
			const msg = clip(err instanceof Error ? err.message : String(err), 100);
			console.warn(`   ⚠️ [Audit Exigences ArcKit] Échec du regroupement en sujets :`, msg);
			warnings.push(`Regroupement en sujets indisponible (${msg}).`);
		}
	}

	const byRef = new Map(requirements.map((r) => [r.clauseRef, r]));
	for (const s of subjects) {
		for (const ref of s.coveredClauseRefs) {
			const req = byRef.get(ref);
			if (req) req.linkedSubjectId = s.id;
		}
	}

	const status = failedBatches > 0 || groupingFailed ? 'partial' : 'ok';
	const totalSec = ((Date.now() - auditStart) / 1000).toFixed(1);
	console.log(`✅ [Audit Exigences ArcKit] Terminé en ${totalSec}s (Statut: ${status}, ${subjects.length} sujets générés).`);
	console.log(`--------------------------------------------------------------------------------\n`);

	return { status, report: buildAuditReport(requirements, warnings), subjects, warnings, modelUsed: model };
}

/**
 * Construit la réponse de l'API de factorisation à partir d'un audit abouti (`status: 'ok'`).
 * Le taux de couverture mesure la part de clauses réellement classées : les clauses « à qualifier »
 * n'y comptent pas, afin de ne jamais afficher une couverture complète qui ne serait pas acquise.
 */
export function toFactorizationResponse(result: StagedAuditResult) {
	const { report, subjects, warnings, modelUsed } = result;
	const classified = report.totalCount - report.toQualifyCount;
	const coverageRate = report.totalCount === 0 ? 100 : Math.round((classified / report.totalCount) * 100);
	const pct = (n: number) => (report.totalCount === 0 ? 0 : Math.round((n / report.totalCount) * 100));

	return {
		status: 'ok' as const,
		engine: 'arckit-requirements-audit',
		modelUsed,
		summary:
			`Audit de ${report.totalCount} exigences : ${report.deliberatedCount} à délibérer (regroupées en ${subjects.length} sujets), ` +
			`${report.evacuatedCount} commodités proposées à l'évacuation (${pct(report.evacuatedCount)} %), ` +
			`${report.clarificationCount} à clarifier avec le donneur d'ordre et ${report.toQualifyCount} à qualifier par un humain. ` +
			`Toutes ces dispositions sont des propositions du modèle, à relire.`,
		totalClauses: report.totalCount,
		coveredClausesCount: classified,
		coverageRate,
		subjects,
		unassignedClauses: [],
		warning: warnings.length > 0 ? warnings.join(' ') : undefined,
		auditReport: report,
		evacuatedCount: report.evacuatedCount,
		deliberatedCount: report.deliberatedCount,
		clarificationCount: report.clarificationCount,
		toQualifyCount: report.toQualifyCount,
		clarifications: report.clarifications,
		allAuditedRequirements: report.requirements
	};
}
