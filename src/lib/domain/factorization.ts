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
}

export type KnowledgeAlignment = 'standard_established' | 'conflict_detected' | 'novel_requirement';

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
	clarifications?: Array<{ clauseRef: string; title: string; question: string }>;
	allAuditedRequirements?: any[];
}
