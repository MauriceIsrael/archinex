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
