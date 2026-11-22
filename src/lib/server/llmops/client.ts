/**
 * Client d'intégration LLMOps (Knowledge Hub) pour Archinex.
 * Façade unifiée composant la couche transport (négociation de version, air-gap, cache)
 * et les modules métier par domaine : doctrine, frameworks, knowledge, knowledgeAdmin,
 * evaluations et engagements.
 * Conforme à CONTRAT-KH-API-V1 et ADR-0015.
 */

import {
	LLMOpsTransport,
	HubApiError,
	LLMOPS_DEFAULT_TIMEOUT_MS,
	LLMOPS_GOVERNANCE_TIMEOUT_MS,
	HUB_CONTRACT_ID,
	HUB_CONTRACT_SPEC_VERSION,
	HUB_CONTRACT_VERSION,
	HUB_SUPPORTED_CONTRACT_VERSIONS,
	hostMatchesAllowList,
	isContractVersionCompatible,
	type LLMOpsClientConfig,
	type HubContractVersionNegotiation
} from './transport';
import { DoctrineDomainClient } from './domains/doctrine';
import { FrameworksDomainClient } from './domains/frameworks';
import { KnowledgeDomainClient } from './domains/knowledge';
import { KnowledgeAdminDomainClient } from './domains/knowledgeAdmin';
import { EvaluationsDomainClient } from './domains/evaluations';
import { EngagementsDomainClient } from './domains/engagements';
import { configuredModel } from '../similarity/encoder';
import type { HubFactVocabulary } from '$lib/domain/hubFactVocabulary';
import type {
  CheckClausesList,
  CheckClauseRow,
  CheckClauseDecision,
  CheckClauseMatcher,
  AssetClauseTrialVerdict,
  LLMOpsHealth,
  LLMOpsSnapshot,
  LLMOpsBoardItem,
  LLMOpsStatement,
  LLMOpsConflict,
  LLMOpsRfpShredResponse,
  LLMOpsResponseEnvelope,
  LLMOpsSyncPayload,
  DoctrineContext,
  DoctrineItem,
  CheckResult,
  OptionVerdict,
  FrameworkCoverage,
  FrameworkStatus,
  KbCandidate,
  KbRole,
  KbOwner,
  KbOwnersRegistry,
  KbUserProfile,
  KbMeResponse,
  KbReviewInboxItem,
  KbCandidateDetail,
  KbComment,
  KbEvent,
  KbInboxResponse,
  KbEventsResponse,
  KbAssetType,
  KbAssetTemplate,
  TestablePredicates,
  CandidateValidationResult,
  ClauseSimulationRequest,
  ClauseSimulationResult,
  FrameworkIngestion,
  FrameworkRequirement,
  FrameworkRequirementStatus,
  FrameworkLinkSuggestionResult,
  CoverageDeclarationResult,
  ComplianceFrameworkOverview,
  EvalTestCase,
  EvalDataset,
  EvalBenchmarkRunResult,
  VerdictFeedbackRequest,
  VerdictFeedbackItem,
  KbHealthMetrics,
  KbPublication,
  AssetHistoryResponse,
  KbCampaign,
  EmbeddingPendingItem,
  EmbeddingDeposit,
  SimilarKnowledgeRequest,
  SimilarKnowledgeResponse,
  SimilarKnowledgeItem,
  ReuseConfirmationRequest,
  ReuseConfirmation,
  SimilarityCase,
  SimilarityRun,
  HubEngagementRole,
  HubConfidentiality,
  HubMember,
  HubPublicMember,
  HubEngagementMe,
  HubAuditEvent,
  HubSubjectInput,
  HubSubjectResult,
  HubMaturityInput,
  HubMaturityResult,
  HubConfidence,
  HubOrigin,
  HubStatementStatus,
  HubStatementInput,
  HubStatementResult,
  HubAddStatementResponse,
  HubAssertStatementResponse,
  HubWithdrawStatementResponse,
  HubQuestionInput,
  HubQuestionResult,
  HubAddQuestionResponse,
  HubAnswerInput,
  HubRequirementItem,
  HubRequirementsInput,
  HubRequirementDispositionInput,
  HubRequirementDecisionResult,
  HubCarryRequirementsResult,
  HubRequirementsResult,
  HubArbitrateConflictInput,
  HubConflictResult,
  HubSnapshotRef,
  HubExportIssueResult,
  HubExportListingItem,
  HubExportEnvelope,
  HubDecisionInput,
  HubDecisionResult,
  HubDecisionFactInput
} from './types';

export {
	HubApiError,
	LLMOPS_DEFAULT_TIMEOUT_MS,
	LLMOPS_GOVERNANCE_TIMEOUT_MS,
	HUB_CONTRACT_ID,
	HUB_CONTRACT_SPEC_VERSION,
	HUB_CONTRACT_VERSION,
	HUB_SUPPORTED_CONTRACT_VERSIONS,
	hostMatchesAllowList,
	isContractVersionCompatible,
	LLMOpsTransport,
	DoctrineDomainClient,
	FrameworksDomainClient,
	KnowledgeDomainClient,
	KnowledgeAdminDomainClient,
	EvaluationsDomainClient,
	EngagementsDomainClient,
	type LLMOpsClientConfig,
	type HubContractVersionNegotiation
};

export class LLMOpsClient extends LLMOpsTransport {
	public readonly doctrine: DoctrineDomainClient;
	public readonly frameworks: FrameworksDomainClient;
	public readonly knowledge: KnowledgeDomainClient;
	public readonly knowledgeAdmin: KnowledgeAdminDomainClient;
	public readonly evaluations: EvaluationsDomainClient;
	public readonly engagements: EngagementsDomainClient;

	constructor(config: LLMOpsClientConfig | string = {}, maybeAuthToken?: string) {
		super(config, maybeAuthToken);
		this.doctrine = new DoctrineDomainClient(this);
		this.frameworks = new FrameworksDomainClient(this);
		this.knowledge = new KnowledgeDomainClient(this);
		this.knowledgeAdmin = new KnowledgeAdminDomainClient(this);
		this.evaluations = new EvaluationsDomainClient(this);
		this.engagements = new EngagementsDomainClient(this);
	}

	get transport(): LLMOpsTransport {
		return this;
	}

	getBoard(engagement?: string): Promise<{ data: LLMOpsBoardItem[]; source: 'live' | 'offline-fallback' }> {
		return this.engagements.getBoard(engagement);
	}

	getStatements(engagement?: string, subject?: string): Promise<{ data: LLMOpsStatement[]; source: 'live' | 'offline-fallback' }> {
		return this.engagements.getStatements(engagement, subject);
	}

	getConflicts(engagement?: string, status = 'open'): Promise<{ data: LLMOpsConflict[]; source: 'live' | 'offline-fallback' }> {
		return this.engagements.getConflicts(engagement, status);
	}

	shredRfp(rfpText: string, documentId = 'cctp-archinex-input', documentVersion = '1.0', engagement?: string): Promise<LLMOpsRfpShredResponse> {
		return this.engagements.shredRfp(rfpText, documentId, documentVersion, engagement);
	}

	submitKnowledgeSuggestion(suggestion: {
    title: string;
    rationale: string;
    suggestedChange: string;
    author?: string;
    sourceEngagement?: string;
    contactEmail?: string;
  }): Promise<{ status: string; suggestionId?: string; message?: string }> {
		return this.doctrine.submitKnowledgeSuggestion(suggestion);
	}

	getOntologyExport(): Promise<any> {
		return this.doctrine.getOntologyExport();
	}

	getDoctrineContext(params: {
    subject?: string;
    domains?: string[];
    frameworks?: string[];
    max_items?: number;
    max_chars?: number;
  } = {}): Promise<DoctrineContext> {
		return this.doctrine.getDoctrineContext(params);
	}

	checkOption(params: {
    option: { id: string; title: string; summary: string; kbRefs?: string[] };
    subject?: string;
    domain?: string;
    domains?: string[];
    frameworks?: string[];
  }): Promise<CheckResult> {
		return this.doctrine.checkOption(params);
	}

	getFrameworkCoverage(engagement?: string): Promise<FrameworkCoverage> {
		return this.doctrine.getFrameworkCoverage(engagement);
	}

	setApplicableFrameworks(engagement: string, frameworks: string[]): Promise<{ status: string }> {
		return this.doctrine.setApplicableFrameworks(engagement, frameworks);
	}

	submitCandidate(candidate: KbCandidate, actorEmail?: string): Promise<{ candidate_id: string; status: string }> {
		return this.knowledge.submitCandidate(candidate, actorEmail);
	}

	listCandidates(filter: { source?: string; engagement?: string } = {}, actorEmail?: string): Promise<KbCandidate[]> {
		return this.knowledge.listCandidates(filter, actorEmail);
	}

	getMe(actorEmail: string): Promise<KbMeResponse> {
		return this.knowledgeAdmin.getMe(actorEmail);
	}

	getOwners(actorEmail?: string): Promise<KbOwnersRegistry> {
		return this.knowledgeAdmin.getOwners(actorEmail);
	}

	updateOwners(owners: KbOwner[], actorEmail?: string): Promise<{ success: boolean; updated_count: number; offline?: boolean; error?: string }> {
		return this.knowledgeAdmin.updateOwners(owners, actorEmail);
	}

	upsertOwnerInRegistry(input: {
      handle: string;
      email: string | null;
      roles: KbRole[];
      delegated?: boolean;
      domains?: string[];
      previousHandle?: string;
    }, actorEmail?: string): Promise<{
    success: boolean;
    handle: string;
    owners_count: number;
    domains_count: number;
    offline?: boolean;
    error?: string;
  }> {
		return this.knowledgeAdmin.upsertOwnerInRegistry(input, actorEmail);
	}

	getReviewInbox(actorEmail: string, filters?: { domain?: string; kind?: string; excludeOwn?: boolean; actorHandle?: string }): Promise<KbInboxResponse> {
		return this.knowledge.getReviewInbox(actorEmail, filters);
	}

	getCandidate(candidateId: string, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable' | 'not_registered'; data?: KbCandidateDetail; error?: string; reason?: string }> {
		return this.knowledge.getCandidate(candidateId, actorEmail);
	}

	reviewCandidate(candidateId: string, action: 'accept' | 'amend' | 'reject', payload: { reason?: string; amended_content?: string }, actorEmail: string): Promise<{
    status: 'ok' | 'error' | 'conflict' | 'forbidden' | 'unavailable';
    data?: KbCandidateDetail;
    error?: string;
    /** Code stable lorsque le Hub en donne un (ex. `separation_of_duties`). */
    code?: string;
  }> {
		return this.knowledge.reviewCandidate(candidateId, action, payload, actorEmail);
	}

	assignCandidate(candidateId: string, assignee: string, reason: string, actorEmail: string): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'unavailable'; data?: KbCandidateDetail; error?: string }> {
		return this.knowledge.assignCandidate(candidateId, assignee, reason, actorEmail);
	}

	requestReview(candidateId: string, req: { kind: 'second_review' | 'advice'; recipient: string; message: string; due_at?: string }, actorEmail: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; success?: boolean; error?: string }> {
		return this.knowledge.requestReview(candidateId, req, actorEmail);
	}

	getComments(candidateId: string, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbComment[]; error?: string }> {
		return this.knowledge.getComments(candidateId, actorEmail);
	}

	addComment(candidateId: string, message: string, actorEmail: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbComment; error?: string }> {
		return this.knowledge.addComment(candidateId, message, actorEmail);
	}

	pollEvents(sinceCursor?: string): Promise<KbEventsResponse> {
		return this.knowledge.pollEvents(sinceCursor);
	}

	getAssetTemplate(assetType: KbAssetType): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbAssetTemplate; error?: string }> {
		return this.knowledge.getAssetTemplate(assetType);
	}

	validateCandidate(candidateDraft: {
    title?: string;
    summary?: string;
    domain?: string;
    predicates?: TestablePredicates;
    [key: string]: any;
  }): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: CandidateValidationResult; error?: string }> {
		return this.knowledge.validateCandidate(candidateDraft);
	}

	listCheckClauses(filters: { status?: string; framework?: string; type?: string; asset_id?: string } = {}, actorEmail?: string, options: { bypassCache?: boolean } = {}): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: CheckClausesList; error?: string }> {
		return this.doctrine.listCheckClauses(filters, actorEmail, options);
	}

	decideCheckClause(assetId: string, checkId: string, body: { decision: CheckClauseDecision; comment?: string; clause?: { kind?: string; when?: CheckClauseMatcher; expect?: CheckClauseMatcher; message?: string } }, actorEmail: string): Promise<{ status: 'ok' | 'forbidden' | 'invalid' | 'not_found' | 'error' | 'unavailable'; data?: CheckClauseRow; error?: string }> {
		return this.doctrine.decideCheckClause(assetId, checkId, body, actorEmail);
	}

	submitDraftClause(assetId: string, clause: {
      kind: 'requires' | 'forbids';
      when: CheckClauseMatcher;
      expect?: CheckClauseMatcher | null;
      message: string;
      provenance?: string;
    }, actorEmail: string): Promise<{ status: 'ok' | 'forbidden' | 'invalid' | 'not_found' | 'error' | 'unavailable'; data?: any; channel?: 'asset_check' | 'candidate'; error?: string }> {
		return this.doctrine.submitDraftClause(assetId, clause, actorEmail);
	}

	tryAssetClauses(assetId: string, checks: unknown[], options: Array<{ title: string; description?: string }>): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: Array<{ title: string; after: AssetClauseTrialVerdict[] }>; error?: string }> {
		return this.doctrine.tryAssetClauses(assetId, checks, options);
	}

	simulateClause(req: ClauseSimulationRequest): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: ClauseSimulationResult; error?: string }> {
		return this.doctrine.simulateClause(req);
	}

	getComplianceFrameworks(options: { bypassCache?: boolean } = {}): Promise<{
    status: 'ok' | 'error' | 'unavailable';
    data: ComplianceFrameworkOverview[];
    error?: string;
  }> {
		return this.frameworks.getComplianceFrameworks(options);
	}

	listFrameworkIngestions(actorEmail?: string, status?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: FrameworkIngestion[]; error?: string }> {
		return this.frameworks.listFrameworkIngestions(actorEmail, status);
	}

	abandonFrameworkIngestion(ingestionId: string | number, reason: string, actorEmail?: string): Promise<{
    status: 'ok' | 'error' | 'forbidden' | 'conflict' | 'bad_request' | 'unavailable';
    data?: FrameworkIngestion;
    error?: string;
  }> {
		return this.frameworks.abandonFrameworkIngestion(ingestionId, reason, actorEmail);
	}

	getFrameworkIngestion(ingestionId: string, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: FrameworkIngestion; error?: string }> {
		return this.frameworks.getFrameworkIngestion(ingestionId, actorEmail);
	}

	ingestFramework(payload: {
      framework_id?: string;
      framework?: string;
      framework_name?: string;
      version?: string;
      tag?: string;
      domain?: string;
      file_name?: string;
      file_format?: string;
      file_size_bytes?: number;
      file_content?: Buffer | Uint8Array | Blob | string;
      raw_text?: string;
      requirements?: any[];
    }, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable' | 'too_large'; data?: FrameworkIngestion; error?: string }> {
		return this.frameworks.ingestFramework(payload, actorEmail);
	}

	reviewFrameworkRequirement(ingestionId: string, reqId: string, review: {
      status?: FrameworkRequirementStatus;
      decision?: 'accept' | 'amend' | 'reject' | '';
      links?: string[];
      mapped_assets?: string[];
      amendment_notes?: string;
      rejection_reason?: string;
      comment?: string;
      acceptance_criteria?: string | string[];
      title_fr?: string;
    }, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'bad_request' | 'unavailable'; data?: FrameworkRequirement; error?: string }> {
		return this.frameworks.reviewFrameworkRequirement(ingestionId, reqId, review, actorEmail);
	}

	suggestFrameworkRequirementLinks(ingestionId: string, reqId: string, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: FrameworkLinkSuggestionResult; error?: string }> {
		return this.frameworks.suggestFrameworkRequirementLinks(ingestionId, reqId, actorEmail);
	}

	declareFrameworkCoverage(frameworkId: string, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'conflict' | 'unavailable'; data?: CoverageDeclarationResult; error?: string; missing_requirements?: string[] }> {
		return this.frameworks.declareFrameworkCoverage(frameworkId, actorEmail);
	}

	applyFrameworkIngestion(ingestionId: string | number, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'conflict' | 'unavailable'; data?: any; error?: string; code?: string }> {
		return this.frameworks.applyFrameworkIngestion(ingestionId, actorEmail);
	}

	addFrameworkLinkProposals(ingestionId: string | number, bodyData: { model?: string; proposals: Array<{ requirement_id: string; satisfied_by?: string[]; acceptance_criteria?: string[] }> }, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'unavailable'; data?: any; error?: string }> {
		return this.frameworks.addFrameworkLinkProposals(ingestionId, bodyData, actorEmail);
	}

	getFrameworkLinkProposals(ingestionId: string | number, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'unavailable'; data?: any; error?: string }> {
		return this.frameworks.getFrameworkLinkProposals(ingestionId, actorEmail);
	}

	getEvalDataset(datasetId: string = 'check_option_v1', actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: EvalDataset; error?: string }> {
		return this.evaluations.getEvalDataset(datasetId, actorEmail);
	}

	annotateEvalTestCase(datasetId: string, caseId: string, payload: {
      expected?: Record<string, 'violates' | 'supports'>;
      annotation_status?: 'proposed' | 'validated' | 'rejected';
      expected_status?: 'supports' | 'violates';
      notes?: string;
    }, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'bad_request' | 'unavailable'; data?: EvalTestCase; error?: string }> {
		return this.evaluations.annotateEvalTestCase(datasetId, caseId, payload, actorEmail);
	}

	runEvalBenchmark(datasetId: string = 'check_option_v1', actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'unavailable'; data?: EvalBenchmarkRunResult; error?: string }> {
		return this.evaluations.runEvalBenchmark(datasetId, actorEmail);
	}

	submitVerdictFeedback(feedback: VerdictFeedbackRequest, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: VerdictFeedbackItem; error?: string }> {
		return this.evaluations.submitVerdictFeedback(feedback, actorEmail);
	}

	listVerdictFeedbacks(actorEmail?: string, status?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: VerdictFeedbackItem[]; error?: string }> {
		return this.evaluations.listVerdictFeedbacks(actorEmail, status);
	}

	convertVerdictFeedback(feedbackId: string | number, payload: {
      to: 'eval_case' | 'amendment' | 'dismiss';
      dataset?: string;
      expected?: 'violates' | 'supports' | string;
      asset_type?: string;
      target_asset_id?: string;
      proposed_content?: string;
    }, actorEmail?: string): Promise<{ status: 'ok' | 'forbidden' | 'conflict' | 'bad_request' | 'error' | 'unavailable'; data?: any; error?: string }> {
		return this.evaluations.convertVerdictFeedback(feedbackId, payload, actorEmail);
	}

	promoteKbCandidate(candidateId: string, actorEmail?: string): Promise<{ status: 'ok' | 'forbidden' | 'conflict' | 'error' | 'unavailable'; data?: any; warnings?: string[]; error?: string }> {
		return this.knowledge.promoteKbCandidate(candidateId, actorEmail);
	}

	getKbHealth(actorEmail?: string, options: { bypassCache?: boolean } = {}): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbHealthMetrics; error?: string }> {
		return this.knowledge.getKbHealth(actorEmail, options);
	}

	listKbPublications(optionsOrActorEmail?:
      | string
      | {
          entry_type?: string;
          type?: string;
          framework?: string;
          actorEmail?: string;
          bypassCache?: boolean;
        }, maybeActorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbPublication[]; error?: string }> {
		return this.knowledge.listKbPublications(optionsOrActorEmail, maybeActorEmail);
	}

	getAssetHistory(assetId: string, actorEmail?: string): Promise<{ status: 'ok' | 'not_found' | 'error' | 'unavailable'; data?: AssetHistoryResponse; error?: string }> {
		return this.doctrine.getAssetHistory(assetId, actorEmail);
	}

	publishKbDoctrine(data: { changelog?: string } = {}, actorEmail?: string): Promise<{
    status: 'ok' | 'forbidden' | 'conflict' | 'error' | 'unavailable';
    data?: KbPublication;
    error?: string;
    blockers?: string[];
    warnings?: string[];
  }> {
		return this.doctrine.publishKbDoctrine(data, actorEmail);
	}

	listKbCampaigns(actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCampaign[]; error?: string }> {
		return this.knowledge.listKbCampaigns(actorEmail);
	}

	createKbCampaign(campaign: {
      title: string;
      domain: string;
      target_asset_type?: string;
      target_count?: number;
      due_at?: string;
      description?: string;
    }, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCampaign; error?: string }> {
		return this.knowledge.createKbCampaign(campaign, actorEmail);
	}

	updateKbCampaign(campaignId: string, data: { status?: 'active' | 'completed' | 'cancelled'; progress_increment?: number }, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCampaign; error?: string }> {
		return this.knowledge.updateKbCampaign(campaignId, data, actorEmail);
	}

	getEmbeddingsPending(model: string = configuredModel(), actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; pending: EmbeddingPendingItem[]; error?: string }> {
		return this.knowledgeAdmin.getEmbeddingsPending(model, actorEmail);
	}

	depositEmbeddings(deposit: EmbeddingDeposit, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; dim?: number; count?: number; error?: string }> {
		return this.knowledgeAdmin.depositEmbeddings(deposit, actorEmail);
	}

	searchSimilarKnowledge(request: SimilarKnowledgeRequest, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: SimilarKnowledgeResponse; error?: string }> {
		return this.knowledgeAdmin.searchSimilarKnowledge(request, actorEmail);
	}

	postReuseConfirmation(confirmation: ReuseConfirmationRequest, actorEmail: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: ReuseConfirmation; error?: string }> {
		return this.knowledgeAdmin.postReuseConfirmation(confirmation, actorEmail);
	}

	getReuseConfirmations(params?: { subject_fingerprint?: string; matched_ref?: string }, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data: ReuseConfirmation[]; error?: string }> {
		return this.knowledgeAdmin.getReuseConfirmations(params, actorEmail);
	}

	getSimilarityDataset(datasetName: string = 'similarity_v1', actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: { cases: SimilarityCase[]; validated: number }; error?: string }> {
		return this.evaluations.getSimilarityDataset(datasetName, actorEmail);
	}

	patchSimilarityCase(datasetName: string, caseId: string, update: { annotation_status?: 'proposed' | 'validated' | 'rejected'; expected?: any[] }, actorEmail: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: SimilarityCase; error?: string }> {
		return this.evaluations.patchSimilarityCase(datasetName, caseId, update, actorEmail);
	}

	runSimilarityEvaluation(datasetName: string, req: { model: string; vectors: Record<string, number[]>; validated_only?: boolean }, actorEmail: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: SimilarityRun; error?: string }> {
		return this.evaluations.runSimilarityEvaluation(datasetName, req, actorEmail);
	}

	getSimilarityRun(datasetName: string, runId: number, actorEmail?: string): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: SimilarityRun; error?: string }> {
		return this.evaluations.getSimilarityRun(datasetName, runId, actorEmail);
	}

	createManagedEngagement(params: { engagement: string; confidentiality: HubConfidentiality; admin_email: string; admin_handle: string }, actorEmail?: string): Promise<{ engagement: string; confidentiality: HubConfidentiality; members: HubPublicMember[] }> {
		return this.engagements.createManagedEngagement(params, actorEmail);
	}

	getEngagementMembers(engagementId: string, actorEmail?: string): Promise<HubMember[] | HubPublicMember[]> {
		return this.engagements.getEngagementMembers(engagementId, actorEmail);
	}

	setEngagementMembers(engagementId: string, members: HubMember[], actorEmail?: string): Promise<HubMember[]> {
		return this.engagements.setEngagementMembers(engagementId, members, actorEmail);
	}

	getEngagementMe(engagementId: string, actorEmail?: string): Promise<HubEngagementMe> {
		return this.engagements.getEngagementMe(engagementId, actorEmail);
	}

	getEngagementAudit(engagementId: string, limit = 100, actorEmail?: string): Promise<HubAuditEvent[]> {
		return this.engagements.getEngagementAudit(engagementId, limit, actorEmail);
	}

	addSubject(engagementId: string, input: HubSubjectInput, actorEmail?: string): Promise<HubSubjectResult> {
		return this.engagements.addSubject(engagementId, input, actorEmail);
	}

	advanceSubjectMaturity(engagementId: string, subjectName: string, level: HubMaturityInput['level'], actorEmail?: string): Promise<HubMaturityResult> {
		return this.engagements.advanceSubjectMaturity(engagementId, subjectName, level, actorEmail);
	}

	addStatement(engagementId: string, input: HubStatementInput, actorEmail?: string, idempotencyKey?: string): Promise<HubAddStatementResponse> {
		return this.engagements.addStatement(engagementId, input, actorEmail, idempotencyKey);
	}

	assertStatement(engagementId: string, statementId: string, actorEmail?: string): Promise<HubAssertStatementResponse> {
		return this.engagements.assertStatement(engagementId, statementId, actorEmail);
	}

	withdrawStatement(engagementId: string, statementId: string, actorEmail?: string): Promise<HubWithdrawStatementResponse> {
		return this.engagements.withdrawStatement(engagementId, statementId, actorEmail);
	}

	addQuestion(engagementId: string, input: HubQuestionInput, actorEmail?: string, idempotencyKey?: string): Promise<HubAddQuestionResponse> {
		return this.engagements.addQuestion(engagementId, input, actorEmail, idempotencyKey);
	}

	answerQuestion(engagementId: string, questionId: string, input: HubAnswerInput, actorEmail?: string, idempotencyKey?: string): Promise<HubAddStatementResponse> {
		return this.engagements.answerQuestion(engagementId, questionId, input, actorEmail, idempotencyKey);
	}

	addRequirements(engagementId: string, input: HubRequirementsInput, actorEmail?: string): Promise<HubRequirementsResult> {
		return this.engagements.addRequirements(engagementId, input, actorEmail);
	}

	proposeRequirementDisposition(engagementId: string, requirementId: string, input: HubRequirementDispositionInput, actorEmail?: string): Promise<HubRequirementDecisionResult> {
		return this.engagements.proposeRequirementDisposition(engagementId, requirementId, input, actorEmail);
	}

	assertRequirementDisposition(engagementId: string, requirementId: string, actorEmail?: string): Promise<HubRequirementDecisionResult> {
		return this.engagements.assertRequirementDisposition(engagementId, requirementId, actorEmail);
	}

	withdrawRequirementDisposition(engagementId: string, requirementId: string, actorEmail?: string): Promise<HubRequirementDecisionResult> {
		return this.engagements.withdrawRequirementDisposition(engagementId, requirementId, actorEmail);
	}

	carrySubjectRequirements(engagementId: string, subjectName: string, input: { add?: string[]; remove?: string[] }, actorEmail?: string): Promise<HubCarryRequirementsResult> {
		return this.engagements.carrySubjectRequirements(engagementId, subjectName, input, actorEmail);
	}

	arbitrateConflict(engagementId: string, conflictId: string, input: HubArbitrateConflictInput, actorEmail?: string): Promise<HubConflictResult> {
		return this.engagements.arbitrateConflict(engagementId, conflictId, input, actorEmail);
	}

	getFactVocabulary(): Promise<HubFactVocabulary> {
		return this.engagements.getFactVocabulary();
	}

	addDecision(engagementId: string, input: HubDecisionInput, actorEmail?: string, idempotencyKey?: string): Promise<HubDecisionResult> {
		return this.engagements.addDecision(engagementId, input, actorEmail, idempotencyKey);
	}

	assertDecision(engagementId: string, decisionId: string, actorEmail?: string, idempotencyKey?: string): Promise<HubDecisionResult> {
		return this.engagements.assertDecision(engagementId, decisionId, actorEmail, idempotencyKey);
	}

	exportEngagementSnapshot(engagementId: string, actorEmail?: string): Promise<HubExportIssueResult> {
		return this.engagements.exportEngagementSnapshot(engagementId, actorEmail);
	}

	listEngagementExports(engagementId: string, actorEmail?: string): Promise<HubExportListingItem[]> {
		return this.engagements.listEngagementExports(engagementId, actorEmail);
	}

	getEngagementExport(engagementId: string, snapshotId: string, actorEmail?: string): Promise<HubExportEnvelope> {
		return this.engagements.getEngagementExport(engagementId, snapshotId, actorEmail);
	}

	syncEngagement(engagement?: string): Promise<LLMOpsSyncPayload> {
		return this.engagements.syncEngagement(engagement);
	}
}

export const llmopsClient = new LLMOpsClient();
