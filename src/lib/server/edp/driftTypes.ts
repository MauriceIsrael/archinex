/**
 * Types canoniques de détection de dérive (DriftFinding) et de verdict oracle
 * stocké à côté de l'EDP (Issue #377).
 */

export type DriftKind =
  | 'missing'
  | 'unexpected'
  | 'attribute_mismatch'
  | 'status_regression';

export type DriftSeverity = 'low' | 'medium' | 'high' | 'critical';

export type DriftState = 'open' | 'remediated' | 'amended' | 'waived';

export interface DriftObjectRef {
  /** Type de modèle Nautobot (ex. dcim.device, tenancy.tenant, ipam.prefix, ipam.vlan, ipam.ipaddress). */
  type: string;
  /** Identifiant Nautobot (UUID ou nom canonique si UUID absent). */
  id: string;
  /** Libellé lisible optionnel (nom ou préfixe). */
  name?: string;
}

/**
 * Marqueurs de traçabilité `archinex_*` extraits exclusivement de l'objet Nautobot
 * (custom_fields / _custom_field_data / tags), jamais du corps libre du webhook.
 */
export interface ArchinexTraceMarkers {
  projectId?: string;
  subjectId?: string;
  decisionId?: string;
  decisionRevision?: number;
  clauseRefs: string[];
  intentHash?: string;
}

/**
 * Écart structuré prêt à être persisté dans `drift_findings`.
 */
export interface DriftFindingDraft {
  projectId: string;
  subjectId: string | null;
  decisionId: string | null;
  clauseRefs: string[];
  objectRef: DriftObjectRef;
  kind: DriftKind;
  attributeKey: string;
  /** true lorsque l'objet Nautobot ne porte aucun marquage `archinex_*` (écart « hors décision »). */
  outOfDecision: boolean;
  expected: unknown;
  observed: unknown;
  severity: DriftSeverity;
  sourceEvent: string;
  summary?: string;
}

/**
 * Représentation hydratée d'un `DriftFinding` persisté en base.
 */
export interface DriftFindingRecord {
  id: string;
  projectId: string;
  subjectId: string | null;
  decisionId: string | null;
  clauseRefs: string[];
  objectRef: DriftObjectRef;
  attributeKey: string;
  fingerprint: string;
  kind: DriftKind;
  outOfDecision: boolean;
  expected: unknown;
  observed: unknown;
  severity: DriftSeverity;
  firstSeenAt: string;
  lastSeenAt: string;
  state: DriftState;
  sourceEvent: string;
}

export type OracleVerdictSource =
  | 'nautobot_webhook'
  | 'nautobot_live'
  | 'local_simulated'
  | 'local_fallback';

export interface OracleVerdictDraft {
  edpId: string;
  projectId: string;
  subjectId: string;
  decisionId: string;
  verdict: 'compliant' | 'violated' | 'error' | 'unknown';
  source: OracleVerdictSource;
  provenance: string;
  intentHash?: string | null;
  ontologyFingerprint?: string | null;
  webhookEventId?: string | null;
  violations: string[];
  detailedViolations?: unknown[];
  driftFindingIds?: string[];
  verifiedAt?: Date;
}

export interface OracleVerdictRecord {
  id: string;
  edpId: string;
  projectId: string;
  subjectId: string;
  decisionId: string;
  verdict: 'compliant' | 'violated' | 'error' | 'unknown';
  source: OracleVerdictSource;
  provenance: string;
  intentHash: string | null;
  ontologyFingerprint: string | null;
  webhookEventId: string | null;
  violations: string[];
  detailedViolations: unknown[];
  driftFindingIds: string[];
  verifiedAt: string;
}
