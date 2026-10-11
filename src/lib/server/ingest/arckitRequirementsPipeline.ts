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

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExtractedClause } from '$lib/domain/corpus';
import type { FactorizedArchitecturalSubject, KnowledgeAlignment, SubjectProposal, SubjectTriage } from '$lib/domain/factorization';
import type { ArchitectRole } from '$lib/types/epistemic';
import { anthropicCapabilities, localLlmClient } from '$lib/server/llm/localLlmClient';
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
	/** Nombre maximal de clauses à délibérer cartographiées par appel LLM (modèles à petite fenêtre). */
	groupChunkSize?: number;
	/** Nombre d'appels LLM menés en parallèle. */
	concurrency?: number;
	/**
	 * Modèle à grande fenêtre (1M de jetons) : la cartographie voit tout le RFP d'un seul tenant.
	 * Par défaut, déduit du modèle.
	 */
	largeContext?: boolean;
	/** Cache des résultats d'étapes : une relance ne refait que ce qui manque. */
	cache?: StageCache;
	/** Suivi en direct de l'avancement, avec des états partiels exploitables aux étapes clés. */
	onProgress?: (progress: AuditProgress) => void;
	/**
	 * Doctrine ciblée par sujet (LLMOps interrogé avec le dilemme du sujet), ajoutée aux règles globales lors de
	 * l'instruction. En cas d'échec, l'instruction se fait avec les seules règles globales.
	 */
	doctrineFor?: (topic: string) => Promise<KbItemSummary[]>;
}

export interface AuditProgress {
	stage: 'classify' | 'partition' | 'instruct' | 'triage';
	done: number;
	total: number;
	/** État exploitable à ce stade : dispositions après le tri, puis périmètre des sujets après la cartographie. */
	snapshot?: StagedAuditResult;
}

/** Port de cache des étapes LLM (persistant en production, en mémoire dans les tests). */
export interface StageCache {
	get(key: string): Promise<unknown | undefined>;
	set(key: string, stage: string, value: unknown): Promise<void>;
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
// Modèles à petite fenêtre (LLM local) : la cartographie se fait par parties de 40 clauses consécutives.
const DEFAULT_GROUP_CHUNK = 40;
const DEFAULT_CONCURRENCY = 4;
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
	base: Pick<ChatOptions, 'model' | 'messages' | 'effort' | 'maxTokens' | 'timeoutMs'>,
	schema: z.ZodType<T>
): Promise<T> {
	let lastError = 'réponse vide';
	let messages = base.messages;
	for (let attempt = 0; attempt < 2; attempt++) {
		const raw = await llm.chat({
			model: base.model,
			messages,
			format: 'json',
			maxTokens: base.maxTokens,
			temperature: 0,
			effort: base.effort,
			timeoutMs: base.timeoutMs
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

/** Version des prompts : la changer invalide les résultats intermédiaires mis en cache. */
const PROMPT_VERSION = 'v2';

interface StageContext {
	llm: LlmPort;
	model: string;
	cache?: StageCache;
}

interface StageCall {
	stage: 'classify' | 'partition' | 'instruct' | 'triage';
	system: string;
	user: string;
	effort: NonNullable<ChatOptions['effort']>;
	maxTokens: number;
	timeoutMs: number;
}

/**
 * `callJson` précédé d'une lecture du cache des étapes : un lot ou un sujet déjà traité avec exactement
 * les mêmes entrées (prompt, modèle, contenu) n'est pas recalculé lors d'une relance.
 */
async function callStage<T>(ctx: StageContext, call: StageCall, schema: z.ZodType<T>): Promise<T> {
	const key = createHash('sha256')
		.update(JSON.stringify([call.stage, PROMPT_VERSION, ctx.model, call.system, call.user]))
		.digest('hex');
	if (ctx.cache) {
		const hit = await ctx.cache.get(key).catch(() => undefined);
		const checked = hit === undefined ? null : schema.safeParse(hit);
		if (checked?.success) return checked.data;
	}
	const data = await callJson(
		ctx.llm,
		{
			model: ctx.model,
			messages: [
				{ role: 'system', content: call.system },
				{ role: 'user', content: call.user }
			],
			effort: call.effort,
			maxTokens: call.maxTokens,
			timeoutMs: call.timeoutMs
		},
		schema
	);
	if (ctx.cache) {
		await ctx.cache.set(key, call.stage, data).catch((err) => {
			console.warn(`   ⚠️ [Audit Exigences ArcKit] Point de reprise non enregistré (${call.stage}) :`, err instanceof Error ? err.message : err);
		});
	}
	return data;
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

// ─── Étape 3 : cartographie des décisions puis instruction des sujets ─────────

const ProposalSchema = z.object({
	options: z.array(z.object({ title: z.string(), summary: z.string().optional().nullable() })).optional().nullable(),
	singleOptionRationale: z.string().optional().nullable(),
	criteria: z
		.array(z.object({ name: z.string(), kind: z.string().optional().nullable(), weight: z.number().optional().nullable(), description: z.string().optional().nullable() }))
		.optional()
		.nullable(),
	evaluations: z
		.array(z.object({ option: z.string(), criterion: z.string(), score: z.number(), justification: z.string().optional().nullable() }))
		.optional()
		.nullable()
});

const SubjectItemSchema = z.object({
	name: z.string(),
	sectionRef: z.string().optional().nullable(),
	coveredClauseRefs: z.array(z.string()),
	waitingForRole: z.string().optional().nullable(),
	effort: z.string().optional().nullable(),
	knowledgeAlignment: z.string().optional().nullable(),
	matchedKbItemIds: z.array(z.string()).optional().nullable(),
	alignmentRationale: z.string().optional().nullable(),
	proposal: ProposalSchema.optional().nullable(),
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
});
export type RawSubject = z.infer<typeof SubjectItemSchema>;

/** 3a. Cartographie : uniquement le partitionnement, sortie compacte. */
const PartitionResponseSchema = z.object({
	subjects: z.array(
		z.object({
			name: z.string(),
			dilemma: z.string().optional().nullable(),
			sectionRef: z.string().optional().nullable(),
			coveredClauseRefs: z.array(z.string())
		})
	)
});

/** 3b. Instruction d'un sujet : tout sauf le périmètre, fixé par la cartographie. */

const InstructResponseSchema = SubjectItemSchema.omit({ coveredClauseRefs: true, sectionRef: true }).extend({
	name: z.string().optional().nullable()
});

const CRITERION_KINDS = ['functional', 'nfr', 'cost', 'risk', 'compliance'] as const;
const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Contrôles déterministes de la proposition d'options et de critères. Fonction pure.
 * Les évaluations ne sont gardées que si elles visent une option et un critère proposés, avec une justification ;
 * la justification « pas d'alternative » n'a de sens qu'avec une option unique. Sans option, pas de proposition.
 */
export function normalizeProposal(raw: z.infer<typeof ProposalSchema> | null | undefined): SubjectProposal | undefined {
	const options: SubjectProposal['options'] = [];
	for (const o of raw?.options ?? []) {
		const title = (o.title || '').trim();
		if (title && !options.some((x) => sameLabel(x.title, title)) && options.length < 4) {
			options.push({ title, summary: (o.summary || '').trim() });
		}
	}
	if (options.length === 0) return undefined;

	const criteria: SubjectProposal['criteria'] = [];
	for (const c of raw?.criteria ?? []) {
		const name = (c.name || '').trim();
		if (!name || criteria.some((x) => sameLabel(x.name, name)) || criteria.length >= 5) continue;
		const kind = (CRITERION_KINDS as readonly string[]).includes((c.kind || '').trim()) ? (c.kind!.trim() as SubjectProposal['criteria'][number]['kind']) : 'nfr';
		const weight = Math.max(1, Math.min(5, Math.round(c.weight ?? 3)));
		criteria.push({ name, kind, weight, description: (c.description || '').trim() });
	}

	const evaluations: SubjectProposal['evaluations'] = [];
	for (const e of raw?.evaluations ?? []) {
		const option = options.find((o) => sameLabel(o.title, e.option || ''));
		const criterion = criteria.find((c) => sameLabel(c.name, e.criterion || ''));
		const justification = (e.justification || '').trim();
		if (!option || !criterion || !justification || !Number.isFinite(e.score)) continue;
		if (evaluations.some((x) => x.option === option.title && x.criterion === criterion.name)) continue;
		evaluations.push({ option: option.title, criterion: criterion.name, score: Math.max(-2, Math.min(2, Math.round(e.score))), justification });
	}

	const singleOptionRationale = options.length === 1 ? (raw?.singleOptionRationale || '').trim() || undefined : undefined;
	return { options, criteria, evaluations, ...(singleOptionRationale ? { singleOptionRationale } : {}) };
}

/**
 * Au-delà de cette taille, la cartographie est découpée en parties (dans l'ordre du document).
 * ~330 000 jetons : tient largement dans la fenêtre d'un modèle à 1M de jetons, tout en laissant le
 * modèle voir d'un seul tenant l'ensemble des exigences d'un très gros RFP.
 */
const PARTITION_MAX_CHARS = 1_200_000;
const PARTITION_TEXT_BUDGET = 400;
const INSTRUCT_TEXT_BUDGET = 2000;

function targetSubjectsRange(count: number): string {
	if (count <= 200) return inferTargetSubjectsCount(count, true);
	return `${Math.round(count / 30)} à ${Math.round(count / 12)}`;
}

function buildPartitionSystem(targetCountDesc: string, isPartial: boolean): string {
	return `Tu es architecte d'entreprise senior. Tu prépares la délibération d'architecture d'une réponse à appel d'offres. On te donne ${
		isPartial ? 'une partie' : "l'ensemble"
	} des exigences jugées « à délibérer », chacune avec sa criticité, sa catégorie et la tension relevée lors du tri.

Ta tâche : cartographier les DÉCISIONS d'architecture que ces exigences obligent à prendre.

Méthode :
1. Lis toutes les exigences avant de regrouper : les contraintes qui pèsent sur une même décision sont souvent dispersées dans le document (une exigence de disponibilité, une contrainte de souveraineté et un délai de bascule situés dans des sections différentes peuvent relever du même choix).
2. Un sujet = UNE décision d'architecture avec des alternatives réelles, formulée comme un dilemme (« X ou Y, sous la contrainte Z »), et non un thème ou un chapitre du document.
3. Rattache chaque exigence au sujet dont elle contraint le plus directement la décision ; une exigence transverse va au sujet où elle est la plus discriminante.
4. Pas de sujet fourre-tout (« Divers », « Exigences générales »).
5. Granularité : un sujet doit pouvoir être tranché par une équipe d'architectes en un atelier. Scinde un sujet qui mêle des décisions indépendantes ; fusionne deux sujets qui ne peuvent pas être tranchés séparément.
Vise ${targetCountDesc} sujets.

Pour chaque sujet : "name" (titre court du dilemme, 12 mots au plus), "dilemma" (le choix à trancher et ce qui le rend difficile, deux phrases au plus), "sectionRef" (sections du RFP principalement concernées), "coveredClauseRefs" (références EXACTES).
Chaque exigence reçue figure dans exactement UN sujet. Réponds UNIQUEMENT par un objet JSON : {"subjects":[{"name":"…","dilemma":"…","sectionRef":"…","coveredClauseRefs":["…"]}]}`;
}

function partitionLine(r: AuditedRequirement): string {
	return (
		`[${r.clauseRef}] (criticité : ${r.criticality}${r.category ? `, catégorie : ${r.category}` : ''}) ${clip(r.title, 120)} — ${clip(r.text, PARTITION_TEXT_BUDGET)}` +
		(r.deliberationReason ? ` | tension : ${clip(r.deliberationReason, 160)}` : '')
	);
}

function buildPartitionUserMessage(part: AuditedRequirement[]): string {
	return [`Exigences à cartographier (${part.length}) :`, ...part.map(partitionLine)].join('\n');
}

const INSTRUCT_SYSTEM = `Tu es architecte d'entreprise senior. Tu instruis UN sujet d'architecture d'une réponse à appel d'offres, avant sa délibération par l'équipe. On te donne le dilemme pressenti, le texte des exigences rattachées, la liste des autres sujets du RFP (pour situer les interfaces) et, le cas échéant, les règles de doctrine de l'entreprise.

Instruis le sujet comme le ferait un architecte expérimenté :
- identifie la décision réellement à prendre et les options crédibles, avec ce qui les départage. S'il n'existe pas d'alternative réelle (contrainte imposée, choix qui s'impose), propose une seule option et dis pourquoi plutôt que d'inventer une alternative factice ;
- relève les contraintes chiffrées et les exigences bloquantes qui éliminent ou imposent une option ;
- repère les tensions entre exigences du sujet, et les dépendances avec les autres sujets ;
- confronte le sujet à la doctrine fournie : couvert, contredit ou nouveau ;
- formule ce qu'il faut demander au sachant métier ou au donneur d'ordre pour trancher.
Ne tranche pas à la place de l'équipe : l'hypothèse de départ est présentée comme telle, avec sa justification.
N'invente aucun chiffre, produit ou fait absent des exigences.

Réponds UNIQUEMENT par un objet JSON :
{"name": titre du dilemme (affine celui reçu si nécessaire, 12 mots au plus),
 "waitingForRole": "lead_architect" | "infra_expert_architect" | "security_architect" | "domain_architect" | "data_architect" | "domain_expert",
 "effort": "S" | "M" | "L" | "XL" (charge d'instruction du sujet),
 "knowledgeAlignment": "standard_established" si une règle fournie couvre le sujet, "conflict_detected" si une exigence la contredit, sinon "novel_requirement",
 "matchedKbItemIds": ids EXACTS parmi les règles fournies, sinon [],
 "alignmentRationale": une phrase,
 "seed": {
   "initialQuestion": la question d'architecture à trancher, précise et décidable,
   "initialHypothesis": l'hypothèse de départ et sa justification, en nommant les options écartées et pourquoi (3 à 5 phrases),
   "initialConflict": la tension principale, en nommant les exigences qui s'opposent,
   "initialRetenu": 3 à 6 exigences structurantes reprises telles quelles ("REF : formulation courte"), jamais une décision,
   "expertQuestions": 2 à 4 questions précises dont la réponse change la décision
 },
 "proposal": {
   "options": 1 à 4 options crédibles [{"title": nom court, "summary": en quoi elle consiste (1 à 2 phrases)}],
   "singleOptionRationale": si une seule option, pourquoi il n'y a pas d'alternative réelle ; sinon null,
   "criteria": 2 à 5 critères qui départagent réellement les options [{"name": nom court, "kind": "functional" | "nfr" | "cost" | "risk" | "compliance", "weight": 1 à 5, "description": une phrase}],
   "evaluations": une évaluation par option et par critère [{"option": titre EXACT de l'option, "criterion": nom EXACT du critère, "score": entier de -2 à 2, "justification": une phrase appuyée sur les exigences}]
 }}
La proposition (options, critères, évaluations) est un point de départ que l'équipe validera ou corrigera.`;

function buildInstructUserMessage(
	draft: RawSubject,
	clauses: AuditedRequirement[],
	otherSubjects: string[],
	kb: KbItemSummary[]
): string {
	const lines = [`Sujet : ${draft.name}`];
	if (draft.seed?.initialQuestion) lines.push(`Dilemme pressenti : ${draft.seed.initialQuestion}`);
	lines.push('', `Exigences rattachées (${clauses.length}) :`);
	for (const r of clauses) {
		lines.push(`[${r.clauseRef}] (criticité : ${r.criticality}${r.category ? `, catégorie : ${r.category}` : ''}) ${clip(r.title, 160)}`);
		lines.push(`  ${clip(r.text, INSTRUCT_TEXT_BUDGET)}`);
		if (r.deliberationReason) lines.push(`  Tension relevée au tri : ${clip(r.deliberationReason, 240)}`);
	}
	if (otherSubjects.length > 0) {
		lines.push('', 'Autres sujets du RFP (pour situer les interfaces ; ne pas les instruire) :', ...otherSubjects.map((n) => `- ${n}`));
	}
	if (kb.length > 0) {
		lines.push('', `Règles de doctrine disponibles (${Math.min(kb.length, 40)}) :`);
		for (const k of kb.slice(0, 40)) {
			lines.push(`[${k.id}] ${clip(k.title, 100)} — ${clip(k.ruleOrStatement, 300)}`);
		}
	} else {
		lines.push('', 'Aucune règle de doctrine fournie : le sujet est "novel_requirement" avec matchedKbItemIds = [].');
	}
	return lines.join('\n');
}

// ─── Étape 5 : synthèse transverse (priorités, nature, dépendances) ───────────

const TriageResponseSchema = z.object({
	subjects: z.array(
		z.object({
			id: z.string(),
			importance: z.string().optional().nullable(),
			difficulty: z.string().optional().nullable(),
			nature: z.string().optional().nullable(),
			dependsOn: z.array(z.string()).optional().nullable(),
			overlapsWith: z.array(z.string()).optional().nullable(),
			rationale: z.string().optional().nullable()
		})
	)
});
export type TriageItem = z.infer<typeof TriageResponseSchema>['subjects'][number];

const TRIAGE_SYSTEM = `Tu es architecte d'entreprise senior. Tu prépares le plan de délibération d'une réponse à appel d'offres : on te donne la liste des sujets d'architecture déjà instruits (dilemme, tension, volume et criticité des exigences).

Ton rôle n'est pas de trancher les sujets, mais d'aider l'équipe à savoir par où commencer, en t'inspirant de l'arbre d'utilité ATAM. Pour CHAQUE sujet reçu :
- "importance" : H, M ou L — poids pour le donneur d'ordre et l'issue de l'offre (exigences bloquantes, disponibilité ou sécurité engagée, pénalités, risque de non-conformité éliminatoire) ;
- "difficulty" : H, M ou L — difficulté d'architecture (incertitude technique, compromis entre attributs de qualité, nombre de contraintes croisées, dépendance à des tiers ou à d'autres lots) ;
- "nature" : "architecture" (choix de conception technique), "contractuel" (engagement de service, pénalités, licences, pérennité, réversibilité) ou "organisationnel" (équipe, processus d'exploitation, gouvernance, logistique, formation) ;
- "dependsOn" : ids des sujets dont la décision conditionne réellement celle-ci et doit être prise avant ; [] sinon. Pas de dépendance thématique vague ;
- "overlapsWith" : ids des sujets qui portent la MÊME décision, au point qu'on ne peut pas les trancher séparément (doublons à fusionner). Un thème commun, une interface ou une dépendance ne sont PAS un recouvrement. C'est rare : [] dans la grande majorité des cas ;
- "rationale" : une phrase qui justifie l'importance et la difficulté.

Sois discriminant : tous les sujets ne peuvent pas être H/H. Réponds UNIQUEMENT par un objet JSON {"subjects":[{"id":"…","importance":"H|M|L","difficulty":"H|M|L","nature":"…","dependsOn":[],"overlapsWith":[],"rationale":"…"}]}, un item par sujet reçu, "id" recopié à l'identique.`;

function buildTriageUserMessage(part: FactorizedArchitecturalSubject[], byRef: Map<string, AuditedRequirement>): string {
	const lines = [`Sujets à positionner (${part.length}) :`];
	for (const s of part) {
		const blocking = s.coveredClauseRefs.filter((ref) => byRef.get(ref)?.criticality === 'bloquant').length;
		lines.push(
			`[${s.id}] ${s.name} | question : ${clip(s.seed.initialQuestion, 260)}` +
				(s.seed.initialConflict ? ` | tension : ${clip(s.seed.initialConflict, 200)}` : '') +
				` | ${s.coveredClauseRefs.length} exigence(s) dont ${blocking} bloquante(s) | rôle : ${s.waitingForRole} | charge : ${s.effort}`
		);
	}
	return lines.join('\n');
}

const LEVEL_WEIGHT = { H: 3, M: 2, L: 1 } as const;

function pickLevel(raw?: string | null): 'H' | 'M' | 'L' {
	const v = (raw || '').trim().toUpperCase().charAt(0);
	return v === 'H' || v === 'L' ? v : 'M';
}

function pickNature(raw?: string | null): SubjectTriage['nature'] {
	const v = (raw || '').trim().toLowerCase();
	if (v.startsWith('contract')) return 'contractuel';
	if (v.startsWith('organi')) return 'organisationnel';
	return 'architecture';
}

/**
 * Contrôles déterministes de la synthèse transverse. Fonction pure.
 * Ne conserve que des références à des sujets existants (jamais le sujet lui-même), rend les recouvrements
 * symétriques, et classe les sujets par importance puis difficulté (ordre du document à égalité).
 * Un sujet absent de la réponse du modèle reste sans synthèse plutôt que de recevoir une valeur inventée.
 */
export function applyTriageInvariants(subjects: FactorizedArchitecturalSubject[], items: TriageItem[]): FactorizedArchitecturalSubject[] {
	const ids = new Set(subjects.map((s) => s.id));
	const byId = new Map<string, TriageItem>();
	for (const item of items) if (ids.has(item.id) && !byId.has(item.id)) byId.set(item.id, item);

	const refs = (list: string[] | null | undefined, self: string) => [...new Set((list || []).filter((id) => ids.has(id) && id !== self))];
	const overlaps = new Map<string, Set<string>>();
	for (const [id, item] of byId) {
		for (const other of refs(item.overlapsWith, id)) {
			(overlaps.get(id) ?? overlaps.set(id, new Set()).get(id)!).add(other);
			(overlaps.get(other) ?? overlaps.set(other, new Set()).get(other)!).add(id);
		}
	}

	const order = new Map(subjects.map((s, i) => [s.id, i]));
	const ranked = [...byId.entries()]
		.map(([id, item]) => ({ id, importance: pickLevel(item.importance), difficulty: pickLevel(item.difficulty) }))
		.sort(
			(a, b) =>
				LEVEL_WEIGHT[b.importance] - LEVEL_WEIGHT[a.importance] ||
				LEVEL_WEIGHT[b.difficulty] - LEVEL_WEIGHT[a.difficulty] ||
				order.get(a.id)! - order.get(b.id)!
		);
	const rankOf = new Map(ranked.map((r, i) => [r.id, i + 1]));

	return subjects.map((s) => {
		const item = byId.get(s.id);
		if (!item) return s;
		return {
			...s,
			triage: {
				importance: pickLevel(item.importance),
				difficulty: pickLevel(item.difficulty),
				nature: pickNature(item.nature),
				dependsOn: refs(item.dependsOn, s.id),
				overlapsWith: [...(overlaps.get(s.id) ?? [])].sort((a, b) => order.get(a)! - order.get(b)!),
				rationale: (item.rationale || '').trim(),
				rank: rankOf.get(s.id)!
			}
		};
	});
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
		const proposal = normalizeProposal(raw.proposal);
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
			},
			...(proposal ? { proposal } : {})
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

/** Découpe en parties consécutives dont la taille rendue (caractères) ne dépasse pas `maxChars`. */
function chunkByChars<T>(items: T[], maxChars: number, render: (item: T) => string): T[][] {
	const out: T[][] = [];
	let current: T[] = [];
	let size = 0;
	for (const item of items) {
		const len = render(item).length + 1;
		if (current.length > 0 && size + len > maxChars) {
			out.push(current);
			current = [];
			size = 0;
		}
		current.push(item);
		size += len;
	}
	if (current.length > 0) out.push(current);
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
	const ctx: StageContext = { llm, model, cache: options.cache };
	// Le suivi d'avancement ne doit jamais faire échouer l'audit.
	const progress = (p: AuditProgress) => {
		try {
			options.onProgress?.(p);
		} catch (err) {
			console.warn(`   ⚠️ [Audit Exigences ArcKit] Suivi d'avancement en erreur :`, err instanceof Error ? err.message : err);
		}
	};

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

	let classifiedBatches = 0;
	progress({ stage: 'classify', done: 0, total: batches.length });
	await mapWithConcurrency(batches, concurrency, async (batch, i) => {
		const batchStart = Date.now();
		console.log(`   ⏳ [Audit Exigences ArcKit] Lot ${i + 1}/${batches.length} (${batch.length} clauses) -> envoi au modèle...`);
		try {
			const data = await callStage(
				ctx,
				{
					stage: 'classify',
					system: CLASSIFY_SYSTEM,
					user: buildClassifyUserMessage(batch),
					effort: 'high',
					maxTokens: 32000,
					timeoutMs: 15 * 60_000
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
		progress({ stage: 'classify', done: ++classifiedBatches, total: batches.length });
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

	// Premier état exploitable : les dispositions clause par clause, avant tout regroupement.
	progress({
		stage: 'partition',
		done: 0,
		total: 1,
		snapshot: { status: 'partial', report: buildAuditReport(requirements, [...warnings]), subjects: [], warnings: [...warnings], modelUsed: model }
	});

	// Étape 3a : cartographie des décisions d'architecture (partitionnement des clauses à délibérer).
	// Avec un modèle à grande fenêtre, le RFP est vu d'un seul tenant : pas de sujets en doublon
	// d'une partie à l'autre, et les contraintes dispersées dans le document se retrouvent.
	const deliberated = requirements.filter((r) => r.disposition === 'deliberated');
	let groupingFailed = false;
	const largeContext = options.largeContext ?? anthropicCapabilities(model).adaptiveThinking;
	const parts = largeContext
		? chunkByChars(deliberated, PARTITION_MAX_CHARS, partitionLine)
		: chunk(deliberated, options.groupChunkSize ?? DEFAULT_GROUP_CHUNK);

	console.log(
		`🧩 [Audit Exigences ArcKit] Étape 3a : Cartographie de ${deliberated.length} clauses à délibérer en décisions (${parts.length} partie(s), concurrence: ${concurrency})...`
	);

	type PartitionOutcome = { data?: z.infer<typeof PartitionResponseSchema>; error?: unknown };
	const partitioned = await mapWithConcurrency(parts, concurrency, async (part): Promise<PartitionOutcome> => {
		try {
			const data = await callStage(
				ctx,
				{
					stage: 'partition',
					system: buildPartitionSystem(targetSubjectsRange(part.length), parts.length > 1),
					user: buildPartitionUserMessage(part),
					effort: 'high',
					maxTokens: 64000,
					timeoutMs: 45 * 60_000
				},
				PartitionResponseSchema
			);
			return { data };
		} catch (err) {
			return { error: err };
		}
	});

	// Contrôles déterministes, dans l'ordre du document, pour des identifiants stables.
	const drafts: RawSubject[] = [];
	for (const [i, part] of parts.entries()) {
		const { data, error } = partitioned[i];
		if (!data) {
			groupingFailed = true;
			const msg = clip(error instanceof Error ? error.message : String(error), 100);
			console.warn(`   ⚠️ [Audit Exigences ArcKit] Échec de la cartographie (partie ${i + 1}/${parts.length}) :`, msg);
			warnings.push(`Regroupement en sujets indisponible (${msg}).`);
			continue;
		}
		const proposed: RawSubject[] = data.subjects.map((s) => ({
			name: s.name,
			sectionRef: s.sectionRef,
			coveredClauseRefs: s.coveredClauseRefs,
			seed: { initialQuestion: s.dilemma }
		}));
		const res = applySubjectInvariants(part, proposed, kb);
		if (res.attachedByProximity.length > 0) {
			const shown = res.attachedByProximity.slice(0, 5).join(', ');
			warnings.push(
				`${res.attachedByProximity.length} clause(s) rattachée(s) à un sujet par proximité dans le document, à vérifier (${shown}${res.attachedByProximity.length > 5 ? '…' : ''}).`
			);
		}
		if (res.droppedEmpty > 0) warnings.push(`${res.droppedEmpty} sujet(s) vide(s) proposé(s) par le modèle ont été écartés.`);
		const covered = new Set(res.subjects.flatMap((s) => s.coveredClauseRefs));
		if (part.some((r) => !covered.has(r.clauseRef))) groupingFailed = true;
		drafts.push(
			...res.subjects.map((s) => ({
				name: s.name,
				sectionRef: s.sectionRef,
				coveredClauseRefs: s.coveredClauseRefs,
				seed: { initialQuestion: s.seed.initialQuestion }
			}))
		);
	}

	// Une partie de la cartographie a pu échouer : seules les clauses effectivement cartographiées sont regroupées,
	// pour qu'un échec ne soit jamais masqué par un rattachement par proximité.
	const mapped = new Set(drafts.flatMap((d) => d.coveredClauseRefs));
	const mappedDeliberated = deliberated.filter((r) => mapped.has(r.clauseRef));

	// Deuxième état exploitable : le périmètre des sujets, avant leur instruction.
	progress({
		stage: 'instruct',
		done: 0,
		total: drafts.length,
		snapshot: {
			status: 'partial',
			report: buildAuditReport(requirements, [...warnings]),
			subjects: applySubjectInvariants(mappedDeliberated, drafts, kb).subjects,
			warnings: [...warnings],
			modelUsed: model
		}
	});

	// Étape 3b : instruction de chaque sujet, sur le texte intégral de ses exigences.
	console.log(`🔬 [Audit Exigences ArcKit] Étape 3b : Instruction de ${drafts.length} sujets (concurrence: ${concurrency})...`);
	const byRef = new Map(requirements.map((r) => [r.clauseRef, r]));
	const names = drafts.map((d) => d.name);
	let notInstructed = 0;
	let instructedCount = 0;
	// Règles de doctrine vues pendant l'instruction : seules celles-ci peuvent être citées par un sujet.
	const doctrineSeen = new Map(kb.map((k) => [k.id, k]));
	const instructed = await mapWithConcurrency(drafts, concurrency, async (draft, i): Promise<RawSubject> => {
		const subjectStart = Date.now();
		let subjectKb = kb;
		if (options.doctrineFor) {
			const targeted = await options.doctrineFor(`${draft.name} ${draft.seed?.initialQuestion ?? ''}`.trim()).catch(() => []);
			const merged = new Map(kb.map((k) => [k.id, k]));
			for (const k of targeted) {
				merged.set(k.id, k);
				doctrineSeen.set(k.id, k);
			}
			subjectKb = [...merged.values()];
		}
		try {
			const data = await callStage(
				ctx,
				{
					stage: 'instruct',
					system: INSTRUCT_SYSTEM,
					user: buildInstructUserMessage(
						draft,
						draft.coveredClauseRefs.map((ref) => byRef.get(ref)!),
						names.filter((_, j) => j !== i),
						subjectKb
					),
					effort: 'high',
					maxTokens: 32000,
					timeoutMs: 20 * 60_000
				},
				InstructResponseSchema
			);
			const sec = ((Date.now() - subjectStart) / 1000).toFixed(1);
			console.log(`   ✅ [Audit Exigences ArcKit] Sujet ${i + 1}/${drafts.length} instruit en ${sec}s.`);
			progress({ stage: 'instruct', done: ++instructedCount, total: drafts.length });
			return {
				...data,
				name: data.name?.trim() || draft.name,
				sectionRef: draft.sectionRef,
				coveredClauseRefs: draft.coveredClauseRefs,
				seed: { ...data.seed, initialQuestion: data.seed?.initialQuestion || draft.seed?.initialQuestion }
			};
		} catch (err) {
			notInstructed++;
			console.warn(`   ⚠️ [Audit Exigences ArcKit] Sujet ${i + 1}/${drafts.length} non instruit :`, err instanceof Error ? err.message : err);
			progress({ stage: 'instruct', done: ++instructedCount, total: drafts.length });
			return draft;
		}
	});
	if (notInstructed > 0) {
		warnings.push(`${notInstructed} sujet(s) n'ont pas pu être instruits : seul leur périmètre est proposé, à instruire en atelier.`);
	}

	// Étape 4 : contrôles déterministes finaux.
	const instructedSubjects = applySubjectInvariants(mappedDeliberated, instructed, [...doctrineSeen.values()]).subjects;

	// Étape 5 : synthèse transverse — priorités, nature, dépendances et recouvrements entre sujets.
	// Avec une grande fenêtre, tous les sujets sont vus ensemble ; sinon par groupes (dépendances internes au groupe).
	let subjects = instructedSubjects;
	if (instructedSubjects.length > 1) {
		console.log(`🧭 [Audit Exigences ArcKit] Étape 5 : Synthèse transverse de ${instructedSubjects.length} sujets...`);
		progress({ stage: 'triage', done: 0, total: 1 });
		const triageParts = chunk(instructedSubjects, largeContext ? 400 : 30);
		const triageItems: TriageItem[] = [];
		let triageFailed = false;
		await mapWithConcurrency(triageParts, concurrency, async (part) => {
			try {
				const data = await callStage(
					ctx,
					{
						stage: 'triage',
						system: TRIAGE_SYSTEM,
						user: buildTriageUserMessage(part, byRef),
						effort: 'high',
						maxTokens: 32000,
						timeoutMs: 20 * 60_000
					},
					TriageResponseSchema
				);
				triageItems.push(...data.subjects);
			} catch (err) {
				triageFailed = true;
				console.warn(`   ⚠️ [Audit Exigences ArcKit] Synthèse transverse indisponible :`, err instanceof Error ? err.message : err);
			}
		});
		subjects = applyTriageInvariants(instructedSubjects, triageItems);
		const missing = subjects.filter((s) => !s.triage).length;
		if (triageFailed || missing > 0) {
			warnings.push(`Priorités et dépendances indisponibles pour ${missing} sujet(s) : à positionner en atelier.`);
		}
		progress({ stage: 'triage', done: 1, total: 1 });
	}

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
