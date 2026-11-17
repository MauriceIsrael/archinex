import type { ExtractedClause } from './corpus';
import type { ArchitectRole } from '$lib/types/epistemic';

export interface LocalLlmModel {
	id: string;
	name: string;
	size?: number;
	parameterSize?: string;
	contextLength?: number;
	family?: string;
}

export interface LocalLlmConfig {
	endpoint: string;
	defaultModel: string;
	timeoutMs: number;
	temperature: number;
	anthropicApiKey?: string;
	provider?: 'local' | 'anthropic' | 'auto';
	anthropicModel?: string;
	/** Chemin explicite vers un fichier .env (ou false pour désactiver la lecture disque). */
	envFilePath?: string | false;
}

export type KnowledgeAlignment = 'standard_established' | 'conflict_detected' | 'novel_requirement';

/**
 * Synthèse transverse d'un sujet (inspirée de l'arbre d'utilité ATAM) : où commencer, et dans quel ordre.
 * Proposition du modèle, à relire comme le reste.
 */
export interface SubjectTriage {
	/** Poids pour le donneur d'ordre et l'issue de l'offre. */
	importance: 'H' | 'M' | 'L';
	/** Difficulté d'architecture : incertitude, compromis entre attributs de qualité, dépendance à des tiers. */
	difficulty: 'H' | 'M' | 'L';
	nature: 'architecture' | 'contractuel' | 'organisationnel';
	/** Sujets dont la décision conditionne celle-ci (à trancher avant). */
	dependsOn: string[];
	/** Sujets traitant en partie de la même décision (candidats à fusion). */
	overlapsWith: string[];
	rationale: string;
	/** Rang de priorité (1 = à délibérer en premier) : importance, puis difficulté. */
	rank: number;
}

/**
 * Proposition du modèle pour préparer la délibération : options, critères qui les départagent et évaluations.
 * Point de départ à valider ou corriger par l'équipe ; une option unique est admise si elle est justifiée.
 */
export interface SubjectProposal {
	options: Array<{ title: string; summary: string }>;
	/** Pourquoi il n'y a pas d'alternative réelle (option unique). */
	singleOptionRationale?: string;
	criteria: Array<{ name: string; kind: 'functional' | 'nfr' | 'cost' | 'risk' | 'compliance'; weight: number; description: string }>;
	evaluations: Array<{ option: string; criterion: string; score: number; justification: string }>;
}

export interface RawProposalInput {
	options?: Array<{ title?: string | null; summary?: string | null }> | null;
	singleOptionRationale?: string | null;
	criteria?: Array<{ name?: string | null; kind?: string | null; weight?: number | null; description?: string | null }> | null;
	evaluations?: Array<{ option?: string | null; criterion?: string | null; score?: number | null; justification?: string | null }> | null;
}

const CRITERION_KINDS = ['functional', 'nfr', 'cost', 'risk', 'compliance'] as const;
const sameProposalLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Contrôles déterministes d'une proposition d'options, critères et évaluations. Fonction pure.
 * Les évaluations ne sont gardées que si elles visent une option et un critère proposés, avec une justification ;
 * la justification « pas d'alternative » n'a de sens qu'avec une option unique. Sans option, pas de proposition.
 */
export function normalizeProposal(raw: RawProposalInput | null | undefined): SubjectProposal | undefined {
	const options: SubjectProposal['options'] = [];
	for (const o of raw?.options ?? []) {
		const title = (o.title || '').trim();
		if (title && !options.some((x) => sameProposalLabel(x.title, title)) && options.length < 4) {
			options.push({ title, summary: (o.summary || '').trim() });
		}
	}
	if (options.length === 0) return undefined;

	const criteria: SubjectProposal['criteria'] = [];
	for (const c of raw?.criteria ?? []) {
		const name = (c.name || '').trim();
		if (!name || criteria.some((x) => sameProposalLabel(x.name, name)) || criteria.length >= 5) continue;
		const kind = (CRITERION_KINDS as readonly string[]).includes((c.kind || '').trim())
			? (c.kind!.trim() as SubjectProposal['criteria'][number]['kind'])
			: 'nfr';
		const weight = Math.max(1, Math.min(5, Math.round(c.weight ?? 3)));
		criteria.push({ name, kind, weight, description: (c.description || '').trim() });
	}

	const evaluations: SubjectProposal['evaluations'] = [];
	for (const e of raw?.evaluations ?? []) {
		const option = options.find((o) => sameProposalLabel(o.title, e.option || ''));
		const criterion = criteria.find((c) => sameProposalLabel(c.name, e.criterion || ''));
		const justification = (e.justification || '').trim();
		if (!option || !criterion || !justification || typeof e.score !== 'number' || !Number.isFinite(e.score)) continue;
		if (evaluations.some((x) => x.option === option.title && x.criterion === criterion.name)) continue;
		evaluations.push({
			option: option.title,
			criterion: criterion.name,
			score: Math.max(-2, Math.min(2, Math.round(e.score))),
			justification
		});
	}

	const singleOptionRationale = options.length === 1 ? (raw?.singleOptionRationale || '').trim() || undefined : undefined;
	return { options, criteria, evaluations, ...(singleOptionRationale ? { singleOptionRationale } : {}) };
}

export interface FactorizedArchitecturalSubject {
	id: string;
	lotId: string;
	name: string;
	sectionRef: string;
	coveredClauseRefs: string[];
	matchedKbItemIds: string[];
	knowledgeAlignment: KnowledgeAlignment;
	alignmentRationale: string;
	initialLevel: 'L0_unassessed' | 'L1_dilemma' | 'L2_decomposed' | 'L3_retained';
	waitingForRole: ArchitectRole;
	effort: 'S' | 'M' | 'L' | 'XL';
	seed: {
		initialRetenu: string[];
		initialHypothesis: string;
		initialConflict?: string;
		initialQuestion: string;
		expertQuestions?: string[];
	};
	triage?: SubjectTriage;
	proposal?: SubjectProposal;
}

export interface RfpFactorizationRequest {
	clauses: ExtractedClause[];
	engagementId?: string;
	model?: string;
	customPromptDirectives?: string;
	documentTitle?: string;
}

export interface RfpFactorizationResponse {
	status: 'ok' | 'fallback';
	engine: string;
	modelUsed: string;
	summary: string;
	totalClauses: number;
	coveredClausesCount: number;
	coverageRate: number;
	subjects: FactorizedArchitecturalSubject[];
	unassignedClauses: ExtractedClause[];
	warning?: string;
	wasCondensed?: boolean;
	errorDetail?: string;
	auditReport?: any;
	evacuatedCount?: number;
	deliberatedCount?: number;
	clarificationCount?: number;
	toQualifyCount?: number;
	clarifications?: Array<{ clauseRef: string; title: string; question: string }>;
	allAuditedRequirements?: any[];
	/** Exécution persistée côté serveur (rechargeable via /api/rfp/factorize/runs/[runId]). */
	runId?: string | null;
	/** Résultat renvoyé depuis une exécution antérieure sur les mêmes entrées, sans recalcul. */
	reusedRun?: boolean;
	/** État partiel d'une exécution encore en cours (dispositions, puis périmètre des sujets). */
	inProgress?: boolean;
	/** Validation humaine préalable du découpage PDF (qui, quand, échantillon, statut). */
	extractionValidation?: import('./rfpExtractionReport').HumanExtractionValidation;
}
