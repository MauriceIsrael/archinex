/**
 * Spécification des types d'intégration LLMOps pour Archinex
 * Types partagés (client/serveur) conformes à CONTRAT-KH-API-V1 et ADR-0015.
 */

export interface LLMOpsKbMeta {
  snapshot_id?: string;
  source_revision?: string;
  payload_sha256?: string;
  created_at?: string;
}

export interface LLMOpsHealth {
  status: 'ok' | 'error';
  plane: string;
  schema_version: string;
  service: string;
  engine_version: string;
  engine_commit: string;
  kb?: LLMOpsKbMeta;
}

export interface LLMOpsResponseEnvelope<T> {
  status: 'ok' | 'error' | 'not_found' | 'invalid_argument';
  count?: number;
  data: T;
  error?: string;
}

export interface LLMOpsBoardItem {
  subject: string;
  name: string;
  level: 'L0_named' | 'L1_framed' | 'L2_decomposed' | 'L3_arbitrated' | 'L4_specified';
  origin: 'discovered' | 'blueprint' | 'inferred';
  days_at_level: number;
  updated_at: string;
  is_stalled: boolean;
  open_question_ref: string | null;
  assigned_role: string | null;
  dependent_sections: string[];
}

export interface LLMOpsStatement {
  id: string;
  section: string;
  subject: string;
  subject_direct?: string;
  predicate: string;
  value: string;
  unit: string | null;
  author: string;
  role: string;
  confidence: 'verified' | 'designed' | 'observed' | 'stated-by-client' | 'assumed';
  verbatim: string;
  status: 'active' | 'under_review' | 'contested' | 'retracted';
  based_on?: string[];
}

export interface LLMOpsConflict {
  id: string;
  kind: 'contradiction' | 'tradeoff' | 'gap';
  detail: string;
  status: 'open' | 'resolved' | 'waived' | 'arbitrated';
  origin: 'detected' | 'architect_declared';
  statement_a_id?: string;
  statement_b_id?: string;
  suggested_arbitration?: string;
  resolution?: string;
  arbitrated_by?: string;
}

export interface LLMOpsCandidate {
  id: string;
  sourceFragment: {
    id: string;
    documentId: string;
    documentVersion: string;
    sectionPath: string[];
    originalText: string;
    hash: string;
  };
  originalText: string;
  normalizedText: string;
  candidateKind: string;
  suggestedDestination: string;
  routingConfidence: number;
  verificationModes: string[];
  matched_controls?: string[];
  section?: string;
  category?: string;
  status?: string;
  matched_assets?: string[];
  rationale?: string;
}

export interface LLMOpsRfpShredResponse {
  status: 'ok' | 'error';
  documentId: string;
  documentVersion: string;
  count: number;
  candidates: LLMOpsCandidate[];
  requirements?: Array<{
    id: string;
    section: string;
    category: string;
    text: string;
    criticality: string;
    status: string;
    matched_assets: string[];
    matched_controls: string[];
    rationale: string;
  }>;
  error?: string;
}

export interface LLMOpsSnapshot {
  snapshot_id: string;
  created_at: string;
  source_revision: string;
  payload_sha256: string;
  schema_version: string;
  applicability_index?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LLMOpsSyncPayload {
  source: 'live' | 'offline-fallback';
  engagement: string;
  syncedAt: string;
  health: LLMOpsHealth;
  board: LLMOpsBoardItem[];
  statements: LLMOpsStatement[];
  conflicts: LLMOpsConflict[];
  snapshotMeta?: LLMOpsKbMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATS LLMOps L1, L2, L3 (Conformes au plan d'implémentation Archinex)
// ─────────────────────────────────────────────────────────────────────────────

export interface DoctrineItem {
  id: string;
  type: 'rule' | 'adr' | 'principle' | 'pattern' | 'standard';
  title: string;
  content: string;
  domain?: string;
  framework?: string;
  confidence?: string;
  url?: string;
}

export interface DoctrineContext {
  subject?: string;
  domains?: string[];
  frameworks?: string[];
  items: DoctrineItem[];
  total_items: number;
  truncated: boolean;
  offline?: boolean;
}

export interface OptionVerdict {
  rule_id: string;
  status: 'supports' | 'violates' | 'unassessed';
  rationale: string;
  severity?: 'error' | 'warning' | 'info';
  exception_allowed?: boolean;
}

export interface CheckOptionRequest {
  option_id?: string;
  option_label: string;
  option_description?: string;
  rules?: string[];
  frameworks?: string[];
}

export interface CheckResult {
  verdicts: OptionVerdict[];
  offline?: boolean;
}

export interface FrameworkStatus {
  name: string;
  required: boolean;
  status: 'covered' | 'partial' | 'missing' | 'unknown';
  covered_count: number;
  total_count: number;
  missing_clauses?: string[];
}

export interface FrameworkCoverage {
  frameworks: FrameworkStatus[];
  overall_coverage: 'covered' | 'partial' | 'missing' | 'unknown';
  checked_at: string;
  offline?: boolean;
}

export interface KbCandidate {
  id?: string;
  kind: 'new_asset' | 'amendment' | 'rex' | 'principle';
  title: string;
  summary: string;
  suggested_change?: string;
  rationale: string;
  source: {
    system: 'archinex';
    engagement: string;
    decision_id?: string;
    subject_id?: string;
  };
  target_asset_ref?: string;
  accepted_violation_justification?: string;
  status?: 'proposed' | 'in_review' | 'accepted' | 'rejected' | 'promoted' | 'published' | 'checks_failed';
  published?: { snapshot_id: string; at: string };
  promoted_at?: string;
  promoted_by?: string;
  rejection_reason?: string;
  author: string;
  author_role?: string;
  production_mode: 'human-authored' | 'llm-proposed-human-approved' | 'llm-derived';
  created_at?: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATS GOUVERNANCE KB & COMPTES EXPERTS (Lot A6)
// ─────────────────────────────────────────────────────────────────────────────

export type KbRole = 'kb:review' | 'kb:evaluate' | 'kb:maintain' | 'kb:admin';

export interface KbOwner {
  handle: string;
  name: string;
  email: string;
  roles: KbRole[];
  domains: string[];
  delegated: boolean;
}

export interface KbOwnersRegistry {
  owners: KbOwner[];
  domains?: Record<string, string>;
  default_owner?: string;
  total?: number;
  offline?: boolean;
}

export interface KbUserProfile {
  handle: string;
  email: string;
  name?: string;
  kb_roles: KbRole[];
  owned_domains: string[];
  pending_reviews: number;
  delegated?: boolean;
  offline?: boolean;
}

export interface KbMeResponse {
  status: 'ok' | 'error' | 'unavailable' | 'forbidden';
  data?: KbUserProfile;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATS BOÎTE DE REVUE, ACTIONS EXPERTES & NOTIFICATIONS (Lot A7 - Porte G5)
// ─────────────────────────────────────────────────────────────────────────────

export type KbAutomaticCheckName =
  | 'schema_validity'
  | 'clarity_score'
  | 'testability'
  | 'non_duplication'
  | 'sovereign_compliance'
  | 'domain_alignment'
  | 'architectural_impact';

export interface KbAutomaticCheck {
  name: KbAutomaticCheckName;
  label: string;
  passed: boolean;
  score?: number; // 0 à 100
  details: string;
  severity: 'error' | 'warning' | 'info';
}

export type KbReviewReason = 'review' | 'second_review' | 'advice';

export interface KbReviewInboxItem {
  id: string; // ID de l'assignation de revue
  candidate_id: string;
  title: string;
  kind: 'new_asset' | 'amendment' | 'rex' | 'principle';
  domain: string;
  reason: KbReviewReason;
  waiting_since: string;
  due_at: string;
  is_overdue: boolean;
  author: string;
  author_role?: string;
  severity?: 'critical' | 'major' | 'minor' | 'info';
}

export interface KbCandidateHistoryEntry {
  timestamp: string;
  actor: string;
  actor_name?: string;
  action: 'submitted' | 'assigned' | 'review_requested' | 'amended' | 'accepted' | 'rejected' | 'commented';
  details?: string;
}

export interface KbCandidateDetail extends KbCandidate {
  checks: KbAutomaticCheck[];
  all_checks_passed: boolean;
  domain: string;
  assigned_to?: string;
  assigned_reviewers?: string[];
  reviews_count?: number;
  second_review_requested?: boolean;
  history: KbCandidateHistoryEntry[];
  amended_content?: string;
}

export interface KbComment {
  id: string;
  candidate_id: string;
  author_handle: string;
  author_name: string;
  message: string;
  created_at: string;
}

export type KbEventType =
  | 'candidate.submitted'
  | 'candidate.assigned'
  | 'review.requested'
  | 'candidate.reviewed'
  | 'candidate.commented'
  | 'reminder.due';

export interface KbEvent {
  id: string | number;
  type: KbEventType;
  cursor?: string;
  candidate_id?: string;
  recipients: string[]; // Handles ex: ["@sec-lead", "@cloud-architect"]
  payload: {
    title?: string;
    message?: string;
    domain?: string;
    actor?: string;
    action?: string;
    due_at?: string;
    [key: string]: any;
  };
  timestamp?: string;
  at?: string;
}

export interface KbInboxResponse {
  status: 'ok' | 'error' | 'unavailable';
  data?: KbReviewInboxItem[];
  error?: string;
}

export interface KbEventsResponse {
  status: 'ok' | 'error' | 'unavailable';
  data?: {
    events: KbEvent[];
    next_cursor: string;
  };
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATELIER DE DOCTRINE, CRÉATION & SIMULATION DE CLAUSES (Lot A8)
// ─────────────────────────────────────────────────────────────────────────────

export type KbAssetType =
  | 'principle'
  | 'pattern'
  | 'decision'
  | 'control'
  | 'glossary'
  | 'rule'
  | 'amendment';

export interface TestablePredicates {
  when: string;
  expect: string;
  requires?: string[];
  forbids?: string[];
}

export interface KbAssetTemplate {
  asset_type: KbAssetType;
  title: string;
  description: string;
  default_predicates: TestablePredicates;
  fields: Array<{
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'array';
    required: boolean;
    placeholder?: string;
  }>;
  skeleton: string;
}

export interface CandidateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: KbAutomaticCheck[];
  all_checks_passed: boolean;
}

export interface ClauseSimulationCase {
  id: string;
  label: string;
  description: string;
  expected_status: 'supports' | 'violates';
}

export interface ClauseSimulationRequest {
  asset_type: KbAssetType;
  title: string;
  domain: string;
  predicates: TestablePredicates;
  test_cases?: ClauseSimulationCase[];
}

export interface ClauseSimulationVerdict {
  case_id: string;
  case_label: string;
  status: 'supports' | 'violates' | 'unassessed';
  expected: 'supports' | 'violates';
  matched: boolean;
  rationale: string;
}

export interface ClauseSimulationResult {
  simulated_at: string;
  total_cases: number;
  passed_cases: number;
  precision: number;
  recall: number;
  regression_detected: boolean;
  regression_details?: string;
  verdicts: ClauseSimulationVerdict[];
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉFÉRENTIELS RÉGLEMENTAIRES : INGESTION & COUVERTURE (Lot A10)
// ─────────────────────────────────────────────────────────────────────────────

export type FrameworkIngestionFormat = 'pdf' | 'html' | 'txt' | 'md' | 'docx';
export type FrameworkRequirementStatus = 'pending' | 'accepted' | 'amended' | 'rejected';

export interface FrameworkRequirement {
  id: string;
  framework_id: string;
  section: string;
  title: string;
  text: string;
  domain: string;
  status: FrameworkRequirementStatus;
  mapped_assets: string[];
  amendment_notes?: string;
  rejection_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface FrameworkIngestion {
  id: string;
  framework_id: string;
  framework_name: string;
  version: string;
  file_name: string;
  file_format: FrameworkIngestionFormat;
  file_size_bytes: number;
  created_at: string;
  status: 'processing' | 'ready' | 'failed';
  total_requirements: number;
  total?: number;
  reviewed_requirements: number;
  requirements: FrameworkRequirement[];
}

export interface FrameworkLinkSuggestion {
  asset_id: string;
  title: string;
  confidence: number;
  rationale: string;
}

export interface FrameworkLinkSuggestionResult {
  suggested_assets: FrameworkLinkSuggestion[];
  llm_derived: true;
}

export interface CoverageDeclarationResult {
  success: boolean;
  framework_id: string;
  coverage_declared: boolean;
  declared_at: string;
  declared_by: string;
  total_requirements: number;
  covered_requirements: number;
  uncovered_requirements?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉVALUATIONS & BOUCLE DE RETOUR SUR VERDICTS (Lot A9 - Porte G6)
// ─────────────────────────────────────────────────────────────────────────────

export interface EvalTestCase {
  id: string;
  dataset_id?: string;
  option_title?: string;
  option_summary?: string;
  domain?: string;
  rule_id?: string;
  expected_status?: 'supports' | 'violates';
  human_annotated?: boolean;
  annotated_by?: string;
  annotated_at?: string;
  notes?: string;
  expected?: Record<string, 'violates' | 'supports'>;
  annotation_status?: 'proposed' | 'validated' | 'rejected';
  option?: { title: string; description?: string };
  subject?: string;
  sector?: string;
  frameworks?: string[];
}

export interface EvalDataset {
  id: string;
  name: string;
  version: string;
  description: string;
  total_cases: number;
  human_annotated_count: number;
  cases: EvalTestCase[];
}

export interface EvalBenchmarkRunResult {
  run_id: string;
  dataset_id: string;
  executed_at: string;
  executed_by: string;
  total_cases: number;
  human_verified_cases: number;
  passed_cases: number;
  precision: number;
  actual_recall: number;
  meets_target: boolean; // actual_recall >= 80%
  verdicts: Array<{
    case_id: string;
    option_title: string;
    rule_id: string;
    predicted_status: 'supports' | 'violates';
    expected_status: 'supports' | 'violates';
    matched: boolean;
    human_annotated: boolean;
  }>;
}

export interface VerdictFeedbackRequest {
  typed_id?: string;
  check_id?: string;
  feedback?: 'wrong_violation' | 'missed_violation' | 'correct';
  justification?: string;
  option?: { title: string; description?: string };
  subject?: string;
  subject_id?: string;
  option_id?: string;
  rule_id?: string;
  verdict_status?: string;
  disagree_rationale?: string;
  suggested_action?: 'add_test_case' | 'propose_amendment' | 'clarify_rule';
  author_email?: string;
}

export interface VerdictFeedbackItem {
  id: string | number;
  typed_id?: string;
  check_id?: string;
  feedback?: string;
  justification?: string;
  option?: { title: string; description?: string };
  subject?: string;
  reporter?: string;
  status: 'open' | 'converted' | 'dismissed' | 'pending' | 'converted_to_test_case' | 'converted_to_amendment';
  converted_to?: string;
  subject_id?: string;
  option_id?: string;
  rule_id?: string;
  verdict_status?: string;
  disagree_rationale?: string;
  suggested_action?: string;
  author_email?: string;
  created_at?: string;
  converted_ref?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLEAU DE BORD, PUBLICATION SCELLÉE ET CAMPAGNES (Lot A11 - Porte G7)
// ─────────────────────────────────────────────────────────────────────────────

export interface KbHealthMetrics {
  coverage?: Record<string, any>;
  assets?: any;
  doctrine_health: {
    total_assets: number;
    principles_count: number;
    patterns_count: number;
    decisions_count: number;
    controls_count: number;
    glossary_count: number;
  };
  reviews_summary: {
    pending_count: number;
    overdue_count: number;
    avg_review_duration_days: number;
  };
  regulatory_coverage: {
    total_frameworks: number;
    total_requirements: number;
    covered_requirements: number;
    coverage_percentage: number;
  };
  evals_summary: {
    latest_recall: number;
    gate_g6_passed: boolean;
    last_benchmark_at: string;
  };
  storage: {
    mode: 'demo' | 'normal' | 'persistent';
    persistent: boolean;
    provider?: string;
  };
  gate_g7_eligible: boolean;
  gate_g7_blockers: string[];
  last_snapshot?: {
    snapshot_id: string;
    created_at?: string;
    published_by?: string;
    sha256?: string;
    changelog?: string;
  };
  embeddings?: Array<{
    model_id: string;
    missing: number;
    stale: number;
    vectors: number;
    active_assets: number;
  }>;
}

export interface KbPublication {
  id: string;
  snapshot_id: string;
  version: string;
  published_at: string;
  published_by: string;
  sha256_checksum: string;
  changelog: string;
  assets_count: number;
  storage_persistent: boolean;
  published?: string[];
  published_candidates?: string[];
  warnings?: string[];
}

export interface KbCampaign {
  id: string;
  title: string;
  domain: string;
  target_asset_type?: string;
  target_count: number;
  created_at: string;
  created_by: string;
  due_at?: string;
  status: 'active' | 'completed' | 'cancelled' | 'archived';
  description?: string;
  current_count?: number;
  progress: {
    current: number;
    target: number;
  };
}

/* ============================================================================
 * CONTRATS 1.9, 1.10 & 1.11 : SIMILARITÉ SÉMANTIQUE, RÉUTILISATION, ÉVALUATION
 * ============================================================================ */

/* ---- Contract 1.9: semantic similarity (vectors computed by the client) ----- */

export type SimilarityZone = 'strong' | 'possible' | 'weak' | 'superseded';

export interface EmbeddingPendingItem {
  ref: string;
  type: 'principle' | 'pattern' | 'decision' | 'control';
  title: string;
  text: string;
  text_sha256: string;
  reason: 'missing' | 'stale';
}

export interface EmbeddingDepositItem {
  ref: string;
  text_sha256: string;
  vector: number[];
  language?: 'fr' | 'en';
}

export interface EmbeddingDeposit {
  model: string;
  model_version: string;
  items: EmbeddingDepositItem[];
}

export interface SimilarKnowledgeRequest {
  model: string;
  vector: number[];
  query_text?: string;
  types?: string[];
  domains?: string[];
  top_k?: number;
  subject_fingerprint?: string;
}

export interface SimilarityConfig {
  status: 'uncalibrated' | 'calibrated';
  thresholds?: {
    strong?: number;
    possible?: number;
    weak?: number;
  };
  boosts?: Record<string, number>;
}

/** A proposal, never a decision: requires_confirmation is always true, whatever the score. */
export interface SimilarKnowledgeItem {
  ref: string;
  type: string;
  title: string;
  score: number;
  scores: Record<string, number>;
  zone: SimilarityZone;
  requires_confirmation: true;
  stale: boolean;
  status: string;
  domain: string[];
  last_reviewed: string | null;
  review_by: string | null;
  validated_by: string[];
  validated_at: string | null;
  superseded_by: string | null;
  assumptions: string[];
  assumptions_documented: boolean;
  judgements?: PastJudgement[];
  previous_confirmation_outdated?: boolean;
  reuse_summary?: Record<string, number>;
}

export interface SimilarKnowledgeResponse {
  results: SimilarKnowledgeItem[];
  config: SimilarityConfig;
}

/* ---- Contract 1.10: reuse of validated knowledge ----------------------------- */

export type AssumptionStatus = 'holds' | 'does_not_hold' | 'unknown';
export type ReuseOutcome =
  | 'reused'
  | 'reused_with_exception'
  | 'rejected_not_same'
  | 'rejected_assumption_fails'
  | 'deferred';

export interface AssumptionJudgement {
  text: string;
  status: AssumptionStatus;
  note?: string | null;
}

/** assumptions must be exactly the asset's current ones; reused needs all of them to hold. */
export interface ReuseConfirmationRequest {
  subject_fingerprint: string; // SHA-256 (64 hex) of the normalised subject
  subject_label: string; // short and anonymised
  matched_ref: string;
  model?: string;
  scores?: Record<string, number>;
  outcome: ReuseOutcome;
  assumptions: AssumptionJudgement[];
  comment?: string; // required for reused_with_exception and rejected_not_same
}

export interface ReuseConfirmation extends ReuseConfirmationRequest {
  id: number;
  at: string;
  actor: string;
  assumptions_digest: string;
}

export interface PastJudgement {
  id: number;
  at: string;
  actor: string;
  outcome: ReuseOutcome;
  comment: string | null;
  assumptions_changed_since: boolean;
}

/* ---- Contract 1.11: similarity evaluation (FR/EN dataset) -------------------- */

export type SimilarityFamily =
  | 'cross_lingual'
  | 'same_words_different_subject'
  | 'same_topic_different_assumptions'
  | 'out_of_base';

export type SimilarityRelation =
  | 'same_subject'
  | 'related_not_same'
  | 'same_topic_different_assumptions'
  | 'unrelated';

export interface SimilarityCaseExpected {
  ref: string;
  relation: SimilarityRelation;
}

export interface SimilarityCase {
  id: string;
  family: SimilarityFamily;
  language: 'fr' | 'en';
  query_text: string;
  expected: SimilarityCaseExpected[];
  annotation_status: 'proposed' | 'validated' | 'rejected';
  annotated_by: string | null;
  annotated_at: string | null;
}

export interface SimilarityRunBucket {
  cases: number;
  same_subject_expected: number;
  recall_at_3: number | null;
  false_strong: number;
  reuse_trap_strong: number;
  missed_strong: number;
}

export interface SimilarityRunSweepItem {
  threshold: number;
  false_strong: number;
  recall: number | null;
}

export interface SimilarityRunCaseDetail {
  case_id: string;
  family: string;
  language: string;
  false_strong: string[];
  reuse_trap_strong: string[];
  missed_strong: string[];
  top: Array<{ ref: string; score: number; zone: SimilarityZone }>;
}

/** false_strong is the number that matters: a wrong strong proposal is the failure the design exists to prevent. */
export interface SimilarityRun extends SimilarityRunBucket {
  id: number;
  dataset: string;
  at: string;
  run_by: string;
  model: string;
  validated_cases: number;
  by_family: Record<SimilarityFamily, SimilarityRunBucket>;
  by_language: Record<'fr' | 'en', SimilarityRunBucket>;
  sweep: SimilarityRunSweepItem[];
  recommended_strong_threshold: number | null;
  recommendation_note: string;
  per_case: SimilarityRunCaseDetail[];
}

/* ---- Contract 1.16: managed engagements (K14) -------------------------------- */

export type HubEngagementRole = 'reader' | 'contributor' | 'decider' | 'admin';
export type HubConfidentiality = 'public' | 'internal' | 'confidential';

export interface HubMember {
  email: string;
  handle: string;
  role: HubEngagementRole;
}

export interface HubPublicMember {
  handle: string;
  role: HubEngagementRole;
}

export interface HubEngagementMe {
  engagement: string;
  managed: boolean;
  handle: string | null;
  role: HubEngagementRole | null;
  actions: Array<'read' | 'contribute' | 'decide' | 'export' | 'members'>;
  confidentiality: HubConfidentiality | null;
}

export interface HubAuditEvent {
  id: number;
  at: string;
  actor: string;
  action: string;
  verdict: 'allowed' | 'refused';
  detail: Record<string, unknown>;
}

/* ---- Contract 1.17: managed engagement writes (K15) -------------------------- */

export interface HubSubjectInput {
  name: string;
  definition?: string;
}

export interface HubSubjectResult {
  created: boolean;
  subject: string;
}

export interface HubMaturityInput {
  level: 'L0_named' | 'L1_framed' | 'L2_decomposed' | 'L3_decided' | 'L4_specified';
}

export interface HubMaturityResult {
  subject: string;
  level: string;
}

export type HubConfidence = 'verified' | 'designed' | 'vendor-stated' | 'stated-by-client' | 'assumed';
export type HubOrigin = 'human' | 'llm-derived';
export type HubStatementStatus = 'proposed' | 'active' | 'withdrawn';

export interface HubStatementInput {
  subject: string;
  value: string;
  confidence: HubConfidence;
  section?: string;
  predicate?: string;
  role?: string;
  verbatim?: string;
  based_on?: Array<{ id: string; resolved?: boolean }>;
  origin?: HubOrigin;
  idempotency_key?: string;
}

export interface HubStatementResult {
  id: string;
  subject: string;
  section: string;
  predicate: string;
  value: string;
  author: string;
  role: string;
  confidence: HubConfidence;
  status: HubStatementStatus;
  origin: HubOrigin;
  validated_by: string | null;
  validated_at: string | null;
}

export interface HubAddStatementResponse {
  created: boolean;
  statement: HubStatementResult;
}

export interface HubAssertStatementResponse {
  statement: HubStatementResult;
  conflicts_opened: string[];
}

export interface HubWithdrawStatementResponse {
  statement: HubStatementResult;
}

export interface HubQuestionInput {
  question: string;
  why_it_matters?: string;
  subject?: string;
  section?: string;
  gap_type?: string;
  expected_shape?: string;
  routed_to?: string;
  idempotency_key?: string;
}

export interface HubQuestionResult {
  id: string;
  engagement: string;
  question: string;
  why_it_matters?: string;
  subject?: string;
  section: string;
  gap_type: string;
  expected_shape: string;
  routed_to: string;
  status: 'open' | 'answered' | 'declined' | 'rerouted';
}

export interface HubAddQuestionResponse {
  created: boolean;
  question: HubQuestionResult;
}

export interface HubAnswerInput {
  value: string;
  confidence: HubConfidence;
  subject?: string;
  section?: string;
  predicate?: string;
  role?: string;
  verbatim?: string;
  based_on?: Array<{ id: string; resolved?: boolean }>;
  origin?: HubOrigin;
  idempotency_key?: string;
}

export interface HubRequirementItem {
  id: string;
  text: string;
  section?: string;
  category?: string;
  criticality?: string;
}

export interface HubRequirementsInput {
  requirements: HubRequirementItem[];
  origin?: HubOrigin;
}

export interface HubRequirementsResult {
  created: string[];
  unchanged: string[];
  origin: HubOrigin;
}

export interface HubArbitrateConflictInput {
  keep_statement_id: string;
  reason: string;
}

export interface HubConflictDetail {
  id: string;
  status: 'open' | 'resolved' | 'waived' | 'arbitrated';
  statement_ids?: string[];
  keep_statement_id?: string;
  resolution_reason?: string;
  arbitrated_by?: string;
  arbitrated_at?: string;
  [key: string]: unknown;
}

export interface HubConflictResult {
  conflict: HubConflictDetail;
}

/* ---- Contract 1.18: sealed engagement snapshot (K11) ------------------------- */

export interface HubSnapshotRef {
  sourceSystem: string; // 'knowledge-hub'
  snapshotId: string; // 'eng-<engagement>-<12hex>'
  checksum: string; // 'sha256:<64hex>'
  producedAt: string;
}

export interface HubExportIssueResult {
  snapshotRef: HubSnapshotRef;
  created: boolean;
  is_provisional: boolean;
}

export interface HubExportListingItem {
  snapshot_id: string;
  checksum: string;
  created_at: string;
  actor: string;
  is_provisional: boolean;
}

export interface HubExportEnvelope {
  schemaVersion: string;
  snapshotId: string;
  sourceSystem: string;
  emitter: string;
  createdAt: string;
  sourceRevision: string;
  checksum: string;
  data: {
    engagement: {
      id: string;
      confidentiality: HubConfidentiality;
    };
    pins: {
      contract_version: string;
      kb_snapshot_id: string;
    };
    is_provisional: boolean;
    provisional_reasons: {
      unripe_subjects: number;
      open_conflicts: number;
    };
    requirements: Array<Record<string, unknown>>;
    subjects: Array<Record<string, unknown>>;
    statements: Array<Record<string, unknown>>;
    conflicts: Array<Record<string, unknown>>;
    gaps: Array<Record<string, unknown>>;
    kb_references: Array<Record<string, unknown>>;
    unresolved_references: Array<Record<string, unknown>>;
  };
}

export class HubApiError extends Error {
  status: number;
  code: string;
  reason?: string;
  argument?: string;
  problems?: Array<{ code: string; path?: string; message?: string }>;

  constructor(status: number, code: string, reason?: string, details?: any) {
    super(reason || code);
    this.name = 'HubApiError';
    this.status = status;
    this.code = code;
    this.reason = reason;
    this.argument = details?.argument;
    this.problems = details?.problems;
  }
}
