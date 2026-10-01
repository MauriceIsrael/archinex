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
}

export interface LLMOpsRfpShredResponse {
  status: 'ok' | 'error';
  documentId: string;
  documentVersion: string;
  count: number;
  candidates: LLMOpsCandidate[];
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
  status?: 'in_review' | 'accepted' | 'rejected';
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
  dataset_id: string;
  option_title: string;
  option_summary: string;
  domain: string;
  rule_id: string;
  expected_status: 'supports' | 'violates';
  human_annotated: boolean;
  annotated_by?: string;
  annotated_at?: string;
  notes?: string;
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
  subject_id: string;
  option_id: string;
  rule_id?: string;
  verdict_status?: string;
  disagree_rationale: string;
  suggested_action: 'add_test_case' | 'propose_amendment' | 'clarify_rule';
  author_email?: string;
}

export interface VerdictFeedbackItem {
  id: string;
  subject_id: string;
  option_id: string;
  rule_id?: string;
  verdict_status?: string;
  disagree_rationale: string;
  suggested_action: 'add_test_case' | 'propose_amendment' | 'clarify_rule';
  author_email: string;
  status: 'pending' | 'converted_to_test_case' | 'converted_to_amendment' | 'dismissed';
  created_at: string;
  converted_ref?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLEAU DE BORD, PUBLICATION SCELLÉE ET CAMPAGNES (Lot A11 - Porte G7)
// ─────────────────────────────────────────────────────────────────────────────

export interface KbHealthMetrics {
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
    mode: 'demo' | 'persistent';
    persistent: boolean;
    provider: string;
  };
  gate_g7_eligible: boolean;
  gate_g7_blockers: string[];
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
}

export interface KbCampaign {
  id: string;
  title: string;
  domain: string;
  target_asset_type: string;
  target_count: number;
  created_at: string;
  created_by: string;
  due_at: string;
  status: 'active' | 'completed' | 'cancelled';
  description: string;
  progress: {
    current: number;
    target: number;
  };
}







