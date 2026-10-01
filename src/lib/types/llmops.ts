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
  kind: 'new_asset' | 'amendment' | 'rex';
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
  status: 'ok' | 'error' | 'unavailable';
  data?: KbUserProfile;
  error?: string;
}


