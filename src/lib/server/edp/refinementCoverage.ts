import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type OntologyCatalog,
  type OntologyBindingItem,
  type OntologyEntity,
  type OntologyTriplet,
  queryOntologyTriplets
} from './ontologyClient.js';
import { compileOntologyProjections } from './projectionCompiler.js';
import { runOpaEval } from './opaRunner.js';
import {
  DEFAULT_COMPONENT_CATALOG,
  DEFAULT_ENVIRONMENT_OVERLAYS,
  DEFAULT_URN_TO_COMPONENT,
  DEFAULT_VALUE_CATALOGS,
  instantiateCatalogFromOntologyBindings,
  lintBaseComponentNoHardcodedEnv,
  resolveTargetComponentsForUrns,
  validateComponentAgainstCatalogs,
  type BaseLintIssue
} from '../../domain/edp/componentCatalog.js';
import {
  buildReferenceGraph,
  resolveComponentInstance,
  verifyCatalogDanglingReferences,
  type CatalogDanglingReferenceReport,
  type ReferenceGraph,
  type ResolvedComponentInstance
} from '../../domain/edp/refResolver.js';
import {
  detectEmergentCapabilityNeed,
  resolveTogafDomain,
  type EmergentCapabilityDetection,
  type TogafDomainId
} from '../../domain/edp/togafTaxonomy.js';
import {
  runSylvaDigitalTwinMatrix,
  type SylvaTopologyProfileId,
  type SylvaTwinArbitrationReport,
  type TwinArbitrationMode
} from '../../domain/edp/sylvaTwin.js';
import { composeReconciliationGraph, type ReconciliationObjectGraph } from './reconciliationGraph.js';
import type { Encoder } from '../similarity/encoder.js';
import { matchEntitiesSemantically, tryResolveSemanticEncoder } from '../similarity/semanticClassifier.js';

export type AxisCoverageStatus = 'covered_executable' | 'covered_no_oracle' | 'missing_refinement';
export type BindingOrigin = 'explicit' | 'strong_link' | 'default_proposed' | 'none';
export type DecisionSlotStatus =
  | 'open'
  | 'default_proposed'
  | 'bound_unverified'
  | 'bound_verified'
  | 'waived';

export type AxisActivationSource =
  | 'explicit_binding'
  | 'strong_link'
  | 'concept_match'
  | 'axis_keyword_match'
  | 'emergent_capability'
  | 'manual_concept_selection'
  | 'prerequisite';

export type AxisRelevanceLevel = 'high' | 'medium' | 'low' | 'out_of_scope';

export interface AxisActivationReason {
  source: AxisActivationSource;
  summary: string;
  matchedConceptUrn?: string;
  matchedConceptTitle?: string;
  matchedKeywords: string[];
  matchedRequirementIds: string[];
  matchedClauseUrns: string[];
  matchedComponents: string[];
}

export interface CandidateLeafSummary {
  urn: string;
  title: string;
  domain: string;
  revision: number | string;
  oracleRules: string[];
  projections: Record<string, unknown>;
  targetComponents?: string[];
}

export interface AxisCoverageItem {
  axisUrn: string;
  axisTitle: string;
  domain: string;
  togafDomain?: TogafDomainId;
  rationale: string;
  status: AxisCoverageStatus;
  bindingOrigin?: BindingOrigin;
  requiresRatification?: boolean;
  boundLeaves: CandidateLeafSummary[];
  candidateLeaves: CandidateLeafSummary[];
  oracleRulesCount: number;
  executableOracleRules?: string[];
  phantomOracleRules?: string[];
  hasPhantomOracle?: boolean;
  instantiatedComponents?: string[];
  activationReason?: AxisActivationReason;
  relevanceScore?: number;
  relevanceLevel?: AxisRelevanceLevel;
  isOutOfScope?: boolean;
  isManuallyExcluded?: boolean;
}

export interface ClauseCoverageItem {
  clauseId: string;
  text: string;
  source?: 'k18_fact' | 'spec_clause';
  matchedAxisUrn?: string;
  matchedLeafUrn?: string;
  matchedLeafTitle?: string;
  status: 'covered' | 'unmapped';
  matchMethod?: 'strong_link' | 'heuristic';
  matchedClauseUrn?: string;
  matchedRequirementId?: string;
  tripletId?: string;
}

export interface CrossAxisDependencyIssue {
  tripletId: string;
  sourceUrn: string;
  predicate: 'depends_on' | 'constrains' | 'conflicts_with';
  targetUrn: string;
  message: string;
}

export interface HldConceptSummary {
  urn: string;
  title: string;
  domain: string;
  axesCount: number;
  score: number;
}

export interface DecisionSlotItem {
  slotId: string;
  axisUrn: string;
  axisTitle: string;
  togafDomain: TogafDomainId;
  status: DecisionSlotStatus;
  bindingOrigin: BindingOrigin;
  requiresRatification: boolean;
  boundLeafUrns: string[];
  candidateLeafUrns: string[];
  executableOracleRules: string[];
  phantomOracleRules: string[];
  instantiatedComponents: string[];
  isTransitivePrerequisite: boolean;
  triggeredByAxisUrn?: string;
}

export interface ConscientiousCoverageMetrics {
  totalSlots: number;
  openSlots: number;
  defaultProposedSlots: number;
  boundUnverifiedSlots: number;
  boundVerifiedSlots: number;
  waivedSlots: number;
  humanRatifiedRatio: number;
  verifiedOracleRatio: number;
  phantomOracleCount: number;
  transitivePrerequisitesCount: number;
  isConscientiouslyComplete: boolean;
}

export interface RefinementCoverageReport {
  matchedConcepts: Array<{ urn: string; title: string; score: number }>;
  allConcepts?: HldConceptSummary[];
  selectedConceptUrn?: string;
  emergentCapability?: EmergentCapabilityDetection;
  axes: AxisCoverageItem[];
  outOfScopeAxes?: AxisCoverageItem[];
  filteredOutAxesCount?: number;
  clauses: ClauseCoverageItem[];
  dependencyIssues: CrossAxisDependencyIssue[];
  composedBindings: OntologyBindingItem[];
  decisionSlots?: DecisionSlotItem[];
  conscientiousMetrics?: ConscientiousCoverageMetrics;
  metrics: {
    coveredExecutableAxes: number;
    coveredNoOracleAxes: number;
    missingAxes: number;
    totalMandatoryAxes: number;
    axisCoveragePercent: number;
    coveredClauses: number;
    totalClauses: number;
    clauseCoveragePercent: number;
    isComplete: boolean;
  };
}

export interface StructuredFactInput {
  id?: string;
  category?: string;
  statement: string;
  target?: string;
}

export interface SubjectRefinementInput {
  subjectId?: string;
  title?: string;
  problem?: string;
  decisionText?: string;
  detailedSpec?: string;
  structuredFacts?: StructuredFactInput[];
  explicitBindings?: OntologyBindingItem[];
  excludedLeafUrns?: string[];
  excludedAxisUrns?: string[];
  includeOutOfScopeAxes?: boolean;
  componentUrnMap?: Record<string, string>;
  autoBindFromText?: boolean;
  selectedConceptUrn?: string;
  isNovelSubject?: boolean;
  emergentCapability?: EmergentCapabilityDetection;
  availableComponents?: string[];
}

export interface LldHydrationOverrides {
  deviceType?: string;
  nodeRole?: string;
  deviceStatus?: string;
  oobIp?: string;
  bmcAddress?: string;
  interfacesCount?: number;
  oamIsolationLevel?: string;
  oamProxyRequired?: boolean;
  stagingIsoprod?: boolean;
  powerFeedsCount?: number;
  s6aDirectBypassDea?: boolean;
  orphanPartnerTenant?: boolean;
  rootCaKeyCustody?: string;
  vaultUnsealMode?: string;
  oamSessionRecording?: boolean;
  egressMode?: string;
  fabricUnderlayProtocol?: string;
  fabricOverlayProtocol?: string;
  torUplinksPerRack?: number;
  userPlaneIsolationLevel?: string;
  storageReplicationFactor?: number;
  objectVersioningEnabled?: boolean;
  storageEncryptionCipher?: string;
  backupImmutabilityMode?: string;
  iamAllowClusterAdminGroup?: boolean;
  iamMfaLevel?: string;
  workloadMtlsMode?: string;
  allowStaticK8sSecrets?: boolean;
  telemetryCollectorStandard?: string;
  siemTransport?: string;
  alertRequireRunbookAnnotation?: boolean;
  drpWitnessSitePresent?: boolean;
  /** Intervalle simulé (jours écoulés depuis le dernier GameDay) comparé à `max_days_between_drills`. */
  drpMaxDaysBetweenDrills?: number;
  drpRpoSeconds?: number;
  registryCosignVerification?: boolean;
  endpointMdmManaged?: boolean;
  endpointPkiProtocol?: string;
  endpointVerifiedBoot?: boolean;
  endpointLocalEncryptionMode?: string;
  endpointAppSandboxingMode?: string;
  endpointOtaSignedAb?: boolean;
  esimSasSmCertified?: boolean;
  esimFourEyesApproval?: boolean;
  ossNrmStandard?: string;
  smoHitlApproval?: boolean;
  cmdbSyncEnabled?: boolean;
  serviceAssuranceProbesNonInvasive?: boolean;
  non3gppIpsecEnforced?: boolean;
  core5gSliceIsolation?: boolean;
  embmsAuthenticated?: boolean;
  pqcHybridAgility?: boolean;
  twinArbitrationMode?: TwinArbitrationMode;
  twinMandatedProfileId?: SylvaTopologyProfileId;
  projectRequirementRefs?: string[];
}

export type { ReconciliationObjectGraph } from './reconciliationGraph';

export interface MultiAxisHydratedInventory {
  nautobot_planned_devices: Array<Record<string, unknown>>;
  k8s_manifests: Array<Record<string, unknown>>;
  sylva_workload_cluster_values?: Record<string, unknown>;
  security_zones: Array<Record<string, unknown>>;
  environments: Array<Record<string, unknown>>;
  power_feeds: string[];
  coveredDomains: string[];
  reconciliation_graph: ReconciliationObjectGraph;
  trust_chain?: {
    root_ca_key_custody: string;
    vault_unseal_mode: string;
    oam_session_recording: boolean;
    egress_mode: string;
  };
  extended_domains?: {
    network_fabric: {
      underlay_protocol: string;
      overlay_protocol: string;
      tor_uplinks_per_rack: number;
    };
    user_plane_zone: {
      isolation_level: string;
    };
    storage_csi: {
      replication_factor: number;
    };
    object_storage: {
      versioning_enabled: boolean;
    };
    encryption_at_rest: {
      cipher: string;
    };
    backup_vault: {
      immutability_mode: string;
    };
    iam_rbac: {
      forbid_cluster_admin_group: boolean;
      mfa_level: string;
    };
    workload_pki: {
      mtls_enforcement: string;
    };
    secrets_management: {
      allow_static_k8s_secrets: boolean;
    };
    observability: {
      collector_standard: string;
      siem_transport: string;
      require_runbook_annotation: boolean;
    };
    drp: {
      witness_site_present: boolean;
      rpo_seconds: number;
      days_since_last_drill: number;
    };
    oci_registry: {
      cosign_verification: boolean;
    };
    endpoint_mdm: {
      mdm_managed: boolean;
      pki_enrollment_protocol: string;
      verified_boot_enforced: boolean;
      local_encryption_mode: string;
      app_sandboxing_mode: string;
      ota_signed_ab_required: boolean;
    };
    telecom_oss_smdp: {
      esim_sas_sm_certified: boolean;
      esim_four_eyes_approval: boolean;
      oss_nrm_standard: string;
      smo_hitl_approval: boolean;
      cmdb_sync_enabled: boolean;
      non_invasive_probes: boolean;
      non3gpp_ipsec_enforced: boolean;
      slice_isolation_enforced: boolean;
      embms_authenticated: boolean;
      pqc_hybrid_agility: boolean;
    };
  };
  resolved_components?: ResolvedComponentInstance[];
  resolved_components_by_dc?: Record<string, ResolvedComponentInstance[]>;
  component_lint_issues?: BaseLintIssue[];
  reference_graph?: ReferenceGraph;
  dangling_references?: CatalogDanglingReferenceReport;
  satisfied_clauses?: string[];
  evaluated_triplets?: string[];
  sylva_twin_report?: SylvaTwinArbitrationReport;
}

export interface MultiAxisOracleViolation {
  rule: string;
  axis: string;
  message: string;
  violated_clause_urn?: string;
  violated_requirement_id?: string;
}

export type OracleVerdictSource = 'defaults' | 'catalogue' | 'inventaire_reel';

export interface MultiAxisOracleEvaluationResult {
  verdict: 'compliant' | 'violated';
  /** Provenance du verdict : valeurs par défaut (simulation non opposable), catalogue ratifié ou inventaire réel Nautobot (#380). */
  source: OracleVerdictSource;
  /** Horodatage ISO-8601 de l'évaluation de l'oracle. */
  evaluatedAt: string;
  /** Révision ou empreinte de l'ontologie utilisée pour l'évaluation. */
  ontologyRevision: string;
  violations: MultiAxisOracleViolation[];
  violationMessages: string[];
  evaluatedAxesCount: number;
  ontologyFingerprint: string;
  durationMs: number;
}

export function inferOracleVerdictSource(
  bindings: Array<OntologyBindingItem & { source?: string; ratificationStatus?: string }>,
  options?: { source?: OracleVerdictSource; hasRealInventory?: boolean; allRatified?: boolean }
): OracleVerdictSource {
  if (options?.source) return options.source;
  if (options?.hasRealInventory) return 'inventaire_reel';
  if (options?.allRatified && bindings.length > 0) return 'catalogue';
  if (
    bindings.length > 0 &&
    bindings.every(
      (b) =>
        b.source !== 'default' &&
        b.ratificationStatus !== 'default_proposed' &&
        (b.source !== undefined || b.ratificationStatus !== undefined)
    )
  ) {
    return 'catalogue';
  }
  return 'defaults';
}

export function sanitizeHostnameSegment(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const tail = cleaned.slice(-12).replace(/^-+|-+$/g, '');
  return tail || 'edge';
}

/**
 * Extrait les URNs de clauses doctrinales et identifiants d'exigences (ex: REQ-Lot1-1343) d'un texte ou d'un fait.
 */
export function extractClauseIdentifiers(text: string): string[] {
  const matches = new Set<string>();
  if (!text) return [];

  // URNs: urn:archinex:kb:clause:...
  const urnRegex = /urn:[a-zA-Z0-9._:-]+/g;
  let m: RegExpExecArray | null;
  while ((m = urnRegex.exec(text)) !== null) {
    const cleaned = m[0].replace(/[.,;:!?)]+$/, '');
    if (cleaned) matches.add(cleaned);
  }

  // Identifiants d'exigences ou clauses : REQ-..., EXIG-..., etc.
  const reqRegex = /\b(?:REQ|EXIG|CLAUSE)-[A-Za-z0-9_-]+\b/gi;
  while ((m = reqRegex.exec(text)) !== null) {
    const cleaned = m[0].replace(/[.,;:!?)]+$/, '');
    if (cleaned) matches.add(cleaned);
  }

  return Array.from(matches);
}

/**
 * Recherche un lien fort formel et déterministe entre une feuille d'ontologie et des identifiants de clauses/exigences.
 * Priorise `leaf.governed_by_clauses` et les triplets portant le prédicat `satisfies_clause`.
 */
export function findStrongLinkForLeaf(
  leaf: OntologyEntity,
  candidateIdentifiers: string[],
  catalog: OntologyCatalog
): { matchedIdentifier: string; tripletId?: string; isUrn: boolean } | null {
  const governed = Array.isArray(leaf.governed_by_clauses) ? leaf.governed_by_clauses : [];
  for (const id of candidateIdentifiers) {
    if (governed.includes(id)) {
      return { matchedIdentifier: id, isUrn: id.startsWith('urn:') };
    }
  }

  const triplets = queryOntologyTriplets(catalog, {
    subject: leaf.urn,
    predicate: 'satisfies_clause'
  });
  for (const id of candidateIdentifiers) {
    const matchingTriplet = triplets.find((t) => t.object === id);
    if (matchingTriplet) {
      return { matchedIdentifier: id, tripletId: matchingTriplet.id, isUrn: id.startsWith('urn:') };
    }
  }

  for (const id of candidateIdentifiers) {
    if (leaf.urn === id) {
      return { matchedIdentifier: id, isUrn: true };
    }
  }

  return null;
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface EntityMatchDetails {
  score: number;
  directKeywordScore: number;
  matchedKeywords: string[];
}

const CORPUS_STOP_WORDS = new Set([
  'avec',
  'pour',
  'dans',
  'sans',
  'sous',
  'vers',
  'entre',
  'tout',
  'tous',
  'toute',
  'toutes',
  'plus',
  'cette',
  'sont',
  'être',
  'etre',
  'avoir',
  'faire',
  'comme',
  'aussi',
  'afin',
  'selon',
  'ainsi',
  'dont',
  'leur',
  'leurs',
  'mode',
  'with',
  'from',
  'that',
  'this',
  'into',
  'only'
]);

function matchEntityAgainstCorpus(entity: OntologyEntity, normalizedCorpus: string): EntityMatchDetails {
  const keywords = Array.isArray(entity.keywords) ? entity.keywords : [];
  const paddedCorpus = ` ${normalizedCorpus.replace(/[^a-z0-9-]+/g, ' ')} `;
  let directKeywordScore = 0;
  let score = 0;
  const matchedKeywords: string[] = [];
  for (const kw of keywords) {
    const rawKw = String(kw);
    const normKw = normalizeText(rawKw).replace(/[^a-z0-9-]+/g, ' ').trim();
    if (!normKw) continue;
    if (paddedCorpus.includes(` ${normKw} `)) {
      directKeywordScore += 2;
      score += 2;
      matchedKeywords.push(rawKw);
    }
  }
  const titleWords = normalizeText(entity.title || '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !CORPUS_STOP_WORDS.has(w));
  for (const w of titleWords) {
    if (paddedCorpus.includes(` ${w} `)) {
      score += 1;
    }
  }
  return { score, directKeywordScore, matchedKeywords };
}

function scoreEntityAgainstCorpus(entity: OntologyEntity, normalizedCorpus: string): number {
  return matchEntityAgainstCorpus(entity, normalizedCorpus).score;
}

function toCandidateSummary(
  entity: OntologyEntity,
  catalog?: OntologyCatalog,
  customComponentMap?: Record<string, string>
): CandidateLeafSummary {
  const targetComponents = catalog
    ? collectInstantiatedComponents([entity.urn], catalog, customComponentMap)
    : resolveTargetComponentsForUrns([entity.urn], {
        customMap: customComponentMap,
        entities: { [entity.urn]: entity }
      });
  return {
    urn: entity.urn,
    title: entity.title || entity.urn,
    domain: entity.domain || 'general',
    revision: entity.revision ?? 1,
    oracleRules: Array.isArray(entity.oracle_rules) ? (entity.oracle_rules as string[]) : [],
    projections: (entity.projections as Record<string, unknown>) || {},
    targetComponents
  };
}

/**
 * Identifie les concepts de haut niveau (HLD) dans l'ontologie qui correspondent au sujet,
 * en interrogeant les triplets `requires_aspect` et les mots-clés/faits du graphe (sans aiguillage en dur).
 */
export function resolveSubjectConcepts(
  input: SubjectRefinementInput,
  catalog: OntologyCatalog
): Array<{ urn: string; title: string; score: number }> {
  const factsText = (input.structuredFacts || [])
    .map((f) => `${f.category || ''} ${f.statement} ${f.target || ''}`)
    .join(' ');

  const corpus = normalizeText(
    [
      input.title || '',
      input.problem || '',
      input.decisionText || '',
      input.detailedSpec || '',
      factsText,
      input.subjectId || ''
    ].join(' ')
  );

  const requiresTriplets = queryOntologyTriplets(catalog, { predicate: 'requires_aspect' });
  const conceptUrnSet = new Set<string>();

  for (const t of requiresTriplets) {
    conceptUrnSet.add(t.subject);
  }
  for (const [urn, entity] of Object.entries(catalog.entities)) {
    if (entity.kind === 'concept') {
      conceptUrnSet.add(urn);
    }
  }

  const scored: Array<{ urn: string; title: string; score: number }> = [];

  for (const conceptUrn of conceptUrnSet) {
    const conceptEntity = catalog.entities[conceptUrn];
    if (!conceptEntity) continue;

    let score = scoreEntityAgainstCorpus(conceptEntity, corpus);

    // Propagation ascendante depuis les feuilles rattachées aux sous-axes du concept
    const axisTriplets = queryOntologyTriplets(catalog, {
      subject: conceptUrn,
      predicate: 'requires_aspect'
    });
    for (const axT of axisTriplets) {
      const leafTriplets = queryOntologyTriplets(catalog, {
        subject: axT.object,
        predicate: 'implemented_by'
      });
      for (const lfT of leafTriplets) {
        const leafEntity = catalog.entities[lfT.object];
        if (leafEntity) {
          score += scoreEntityAgainstCorpus(leafEntity, corpus);
        }
      }
    }

    scored.push({
      urn: conceptUrn,
      title: conceptEntity.title || conceptUrn,
      score
    });
  }

  scored.sort((a, b) => b.score - a.score || a.urn.localeCompare(b.urn));

  if (input.selectedConceptUrn && input.selectedConceptUrn !== 'AUTO') {
    if (input.selectedConceptUrn === 'ALL') {
      return scored;
    }
    const exact = scored.find((s) => s.urn === input.selectedConceptUrn);
    if (exact) {
      return [exact];
    }
  }

  const positiveMatches = scored.filter((s) => s.score > 0);
  if (positiveMatches.length > 0) {
    const maxScore = positiveMatches[0].score;
    return positiveMatches.filter(
      (s, idx) => idx === 0 || s.score >= Math.max(4, Math.ceil(maxScore * 0.65))
    );
  }

  return [];
}

/**
 * Décompose les faits structurés K18 et l'énoncé de décision / spécification L4 en clauses d'intention atomiques
 * et vérifie leur ancrage sur les feuilles de l'ontologie.
 */
export function decomposeIntentionClauses(
  input: SubjectRefinementInput,
  catalog: OntologyCatalog,
  boundLeafUrns: Set<string>,
  semanticLeafBySegment?: Map<string, OntologyEntity>
): ClauseCoverageItem[] {
  const rawEntries: Array<{ text: string; source: 'k18_fact' | 'spec_clause' }> = [];

  for (const fact of input.structuredFacts || []) {
    if (fact.statement && fact.statement.trim().length >= 4) {
      rawEntries.push({ text: fact.statement.trim(), source: 'k18_fact' });
    }
  }

  const rawText = [input.decisionText || '', input.detailedSpec || '', input.problem || '']
    .filter(Boolean)
    .join('. ');

  const segments = rawText
    .split(/(?:[.;•\n]|\bavec\b|\bet\b|\bainsi que\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);

  const seen = new Set<string>(rawEntries.map((e) => normalizeText(e.text)));
  for (const seg of segments) {
    const norm = normalizeText(seg);
    if (!seen.has(norm)) {
      seen.add(norm);
      rawEntries.push({ text: seg, source: 'spec_clause' });
    }
  }

  if (rawEntries.length === 0 && input.title) {
    rawEntries.push({ text: input.title.trim(), source: 'spec_clause' });
  }

  const implTriplets = queryOntologyTriplets(catalog, { predicate: 'implemented_by' });
  const leafEntities = Object.values(catalog.entities).filter(
    (e) => e.kind === 'leaf' || implTriplets.some((t) => t.object === e.urn)
  );

  return rawEntries.map((entry, idx) => {
    const normSeg = normalizeText(entry.text);
    const candIds = extractClauseIdentifiers(entry.text);

    if (entry.source === 'k18_fact') {
      const matchingFact = (input.structuredFacts || []).find(
        (f) => f.statement && f.statement.trim() === entry.text
      );
      if (matchingFact) {
        if (matchingFact.id) candIds.push(matchingFact.id);
        if (matchingFact.target) candIds.push(...extractClauseIdentifiers(matchingFact.target));
      }
    }

    let bestLeaf: OntologyEntity | null = null;
    let matchMethod: 'strong_link' | 'heuristic' = 'heuristic';
    let matchedClauseUrn: string | undefined;
    let matchedRequirementId: string | undefined;
    let matchedTripletId: string | undefined;

    // 1. Priorisation stricte du Lien Fort formel (déterministe sans scoring heuristique flou)
    if (candIds.length > 0) {
      for (const leaf of leafEntities) {
        const link = findStrongLinkForLeaf(leaf, candIds, catalog);
        if (link) {
          bestLeaf = leaf;
          matchMethod = 'strong_link';
          matchedTripletId = link.tripletId;
          if (link.isUrn) {
            matchedClauseUrn = link.matchedIdentifier;
          } else {
            matchedRequirementId = link.matchedIdentifier;
          }

          if (Array.isArray(leaf.governed_by_clauses)) {
            if (!matchedClauseUrn) {
              matchedClauseUrn = leaf.governed_by_clauses.find((c) => c.startsWith('urn:'));
            }
            if (!matchedRequirementId) {
              matchedRequirementId = leaf.governed_by_clauses.find((c) => !c.startsWith('urn:'));
            }
          }
          break;
        }
      }
    }

    // 2. Repli sémantique (embeddings cosinus si pré-calculés) ou heuristique lexicale bornée
    if (!bestLeaf) {
      const semanticHit = semanticLeafBySegment?.get(entry.text);
      if (semanticHit) {
        bestLeaf = semanticHit;
      }
    }

    if (!bestLeaf) {
      let bestScore = 0;
      for (const leaf of leafEntities) {
        const sc = scoreEntityAgainstCorpus(leaf, normSeg);
        if (sc > bestScore) {
          bestScore = sc;
          bestLeaf = leaf;
        }
      }

      if (!bestLeaf && boundLeafUrns.size > 0) {
        for (const urn of boundLeafUrns) {
          const entity = catalog.entities[urn];
          if (entity && scoreEntityAgainstCorpus(entity, normSeg) > 0) {
            bestLeaf = entity;
            break;
          }
        }
      }

      if (bestLeaf) {
        matchMethod = 'heuristic';
        if (Array.isArray(bestLeaf.governed_by_clauses)) {
          matchedClauseUrn = bestLeaf.governed_by_clauses.find((c) => c.startsWith('urn:'));
          matchedRequirementId = bestLeaf.governed_by_clauses.find((c) => !c.startsWith('urn:'));
        }
      }
    }

    if (bestLeaf) {
      const parentAxisTriplet = implTriplets.find((t) => t.object === bestLeaf!.urn);
      const isBound = boundLeafUrns.has(bestLeaf.urn);
      return {
        clauseId: `CL-${idx + 1}`,
        text: entry.text,
        source: entry.source,
        matchedAxisUrn: parentAxisTriplet?.subject,
        matchedLeafUrn: bestLeaf.urn,
        matchedLeafTitle: bestLeaf.title || bestLeaf.urn,
        status: isBound ? 'covered' : 'unmapped',
        matchMethod,
        matchedClauseUrn,
        matchedRequirementId,
        tripletId: matchedTripletId
      };
    }

    return {
      clauseId: `CL-${idx + 1}`,
      text: entry.text,
      source: entry.source,
      status: 'unmapped'
    };
  });
}

/**
 * Extrait les règles OPA effectivement implémentées dans `edp/policies/multi_axis_refinement.rego`.
 * Permet de détecter les oracles fantômes déclarés dans l'ontologie sans règle exécutable correspondante.
 */
export function loadImplementedRegoRuleNames(policyPath?: string): Set<string> {
  const targetPath = policyPath ?? resolve(process.cwd(), 'edp/policies/multi_axis_refinement.rego');
  if (!existsSync(targetPath)) {
    return new Set();
  }
  const source = readFileSync(targetPath, 'utf8');
  const implemented = new Set<string>();
  const regex = /"rule"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    implemented.add(match[1]);
  }
  return implemented;
}

export interface TransitivePrerequisiteMatch {
  triggeredByAxisUrn: string;
  triplet: OntologyTriplet;
}

/**
 * Calcule la fermeture transitive des axes prérequis via les triplets `requires_prerequisite_axis`
 * (par ex. IPsec/mTLS -> PKI 3GPP -> Hiérarchie PKI -> HSM, ou OAM -> Bastion PAM -> IAM).
 */
export function computeTransitivePrerequisiteAxes(
  seedUrns: Iterable<string>,
  catalog: OntologyCatalog
): Map<string, TransitivePrerequisiteMatch> {
  const discovered = new Map<string, TransitivePrerequisiteMatch>();
  const visitedSeeds = new Set<string>();
  const queue: string[] = Array.from(seedUrns);
  const prereqTriplets = (catalog.triplets || []).filter(
    (t) => t.predicate === 'requires_prerequisite_axis'
  );

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visitedSeeds.has(current)) continue;
    visitedSeeds.add(current);

    for (const triplet of prereqTriplets) {
      if (triplet.subject !== current) continue;
      const targetAxisUrn = triplet.object;
      if (!discovered.has(targetAxisUrn)) {
        discovered.set(targetAxisUrn, {
          triggeredByAxisUrn: current,
          triplet
        });
      }
      if (!visitedSeeds.has(targetAxisUrn)) {
        queue.push(targetAxisUrn);
      }
    }
  }

  return discovered;
}

/**
 * Transforme les emplacements `default_proposed` (reconnus ou sélectionnés) en liaisons explicites ratifiées.
 */
export function ratifyDefaultDecisionSlots(
  report: RefinementCoverageReport,
  approvedSlotIds?: string[]
): OntologyBindingItem[] {
  const bindingMap = new Map<string, OntologyBindingItem>();
  for (const b of report.composedBindings) {
    bindingMap.set(b.urn, b);
  }

  const axisLeafRevisionMap = new Map<string, number | string>();
  for (const axis of report.axes) {
    for (const leaf of axis.candidateLeaves) {
      axisLeafRevisionMap.set(leaf.urn, leaf.revision);
    }
  }

  for (const slot of report.decisionSlots || []) {
    if (slot.status !== 'default_proposed') continue;
    if (approvedSlotIds && !approvedSlotIds.includes(slot.slotId)) continue;
    const leafUrn = slot.boundLeafUrns[0] || slot.candidateLeafUrns[0];
    if (!leafUrn || bindingMap.has(leafUrn)) continue;
    bindingMap.set(leafUrn, {
      urn: leafUrn,
      revision: axisLeafRevisionMap.get(leafUrn) ?? 1
    });
  }

  return Array.from(bindingMap.values()).sort((a, b) => a.urn.localeCompare(b.urn));
}

export function collectInstantiatedComponents(
  subjectUrns: string[],
  catalog: OntologyCatalog,
  customComponentMap?: Record<string, string>
): string[] {
  return resolveTargetComponentsForUrns(subjectUrns, {
    customMap: customComponentMap,
    entities: catalog.entities,
    triplets: catalog.triplets
  });
}

/**
 * Calcule la Matrice de Couverture du Raffinement (KAOS AND/OR Goal Refinement + Ontologie)
 * et compose les liaisons multi-axes d'un sujet.
 */
export function computeRefinementCoverage(
  input: SubjectRefinementInput,
  catalog: OntologyCatalog
): RefinementCoverageReport {
  const matchedConcepts = resolveSubjectConcepts(input, catalog);
  const implementedRegoRules = loadImplementedRegoRuleNames();
  const factsText = (input.structuredFacts || []).map((f) => f.statement).join(' ');
  const rawCombinedText = [
    input.title || '',
    input.problem || '',
    input.decisionText || '',
    input.detailedSpec || '',
    factsText
  ].join(' ');
  const corpus = normalizeText(rawCombinedText);

  const corpusCandidateIds = extractClauseIdentifiers(
    [
      rawCombinedText,
      ...(input.structuredFacts || []).map((f) => `${f.id || ''} ${f.target || ''}`)
    ].join(' ')
  );

  const explicitBindingSet = new Set<string>(
    (input.explicitBindings || []).map((b) => b.urn)
  );
  const excludedLeafSet = new Set<string>(input.excludedLeafUrns || []);
  const excludedAxisSet = new Set<string>(input.excludedAxisUrns || []);
  const customComponentMap = input.componentUrnMap;
  const boundLeafUrns = new Set<string>(explicitBindingSet);
  const shouldAutoBind = input.autoBindFromText ?? explicitBindingSet.size === 0;
  const isAutoConceptMode =
    !input.selectedConceptUrn ||
    input.selectedConceptUrn === 'AUTO' ||
    input.selectedConceptUrn === 'ALL';
  const isManualConceptSelection =
    Boolean(input.selectedConceptUrn && input.selectedConceptUrn !== 'AUTO');

  // 1. Collecte des axes de raffinement obligatoires (axes applicatifs contextuels + triplets `requires_aspect` des concepts retenus)
  const mandatoryAxisMap = new Map<string, OntologyTriplet>();

  const CONTEXTUAL_EXTENDED_AXIS_PREFIXES = [
    'urn:archinex:ontology:axis:endpoint_',
    'urn:archinex:ontology:axis:esim_',
    'urn:archinex:ontology:axis:oss_',
    'urn:archinex:ontology:axis:cmdb_',
    'urn:archinex:ontology:axis:service_assurance_',
    'urn:archinex:ontology:axis:non3gpp_',
    'urn:archinex:ontology:axis:core_5g_',
    'urn:archinex:ontology:axis:embms_',
    'urn:archinex:ontology:axis:pqc_'
  ];
  const isContextualExtendedAxis = (urn: string): boolean =>
    CONTEXTUAL_EXTENDED_AXIS_PREFIXES.some((p) => urn.startsWith(p));

  if (
    isAutoConceptMode ||
    Array.from(explicitBindingSet).some(
      (u) =>
        u.includes(':application:') ||
        u.includes(':endpoint:') ||
        u.includes(':esim:') ||
        u.includes(':oss:') ||
        u.includes(':smo:') ||
        u.includes(':cmdb:') ||
        u.includes(':assurance:') ||
        u.includes(':interworking:') ||
        u.includes(':pqc:')
    )
  ) {
    const isContextualDomainAxis = (e: OntologyEntity): boolean =>
      e.kind === 'axis' &&
      (e.domain === 'application' ||
        e.togaf_domain === 'application-business' ||
        isContextualExtendedAxis(e.urn));

    const appAxes = Object.values(catalog.entities).filter(isContextualDomainAxis);

    const paddedCorpus = ` ${corpus.replace(/[^a-z0-9-]+/g, ' ')} `;
    const matchesEntityKeywords = (entity: OntologyEntity): boolean => {
      const kws = Array.isArray(entity.keywords) ? entity.keywords : [];
      for (const kw of kws) {
        const normKw = normalizeText(String(kw)).replace(/[^a-z0-9-]+/g, ' ').trim();
        if (!normKw) continue;
        if (paddedCorpus.includes(` ${normKw} `) || (normKw.length >= 6 && corpus.includes(normKw))) {
          return true;
        }
      }
      return false;
    };

    const matchedAppAxisUrns = new Set<string>();
    for (const appAxis of appAxes) {
      const implTriplets = queryOntologyTriplets(catalog, {
        subject: appAxis.urn,
        predicate: 'implemented_by'
      });
      const axisMatched = isAutoConceptMode && matchesEntityKeywords(appAxis);
      let leafMatched = false;
      for (const t of implTriplets) {
        if (explicitBindingSet.has(t.object)) {
          leafMatched = true;
          break;
        }
        const leaf = catalog.entities[t.object];
        if (!leaf || !isAutoConceptMode || excludedLeafSet.has(leaf.urn)) continue;
        if (
          matchesEntityKeywords(leaf) ||
          (corpusCandidateIds.length > 0 && Boolean(findStrongLinkForLeaf(leaf, corpusCandidateIds, catalog)))
        ) {
          leafMatched = true;
          break;
        }
      }
      if (axisMatched || leafMatched) {
        matchedAppAxisUrns.add(appAxis.urn);
      }
    }

    // Inclure également tout axe prérequis des axes contextuels détectés
    if (matchedAppAxisUrns.size > 0) {
      const hasExtendedContextAxis = Array.from(matchedAppAxisUrns).some(isContextualExtendedAxis);
      const allowedPrereqTransverseAxes = new Set([
        'urn:archinex:ontology:axis:hsm_key_custody',
        'urn:archinex:ontology:axis:pki_hierarchy',
        'urn:archinex:ontology:axis:wan_interco_encryption',
        'urn:archinex:ontology:axis:oss_smo_mediation'
      ]);
      const appPrereqs = computeTransitivePrerequisiteAxes(matchedAppAxisUrns, catalog);
      for (const prereqUrn of appPrereqs.keys()) {
        const prereqEntity = catalog.entities[prereqUrn];
        if (
          prereqEntity?.kind === 'axis' &&
          (prereqEntity.domain === 'application' ||
            prereqEntity.togaf_domain === 'application-business' ||
            isContextualExtendedAxis(prereqEntity.urn) ||
            (hasExtendedContextAxis && allowedPrereqTransverseAxes.has(prereqEntity.urn)))
        ) {
          matchedAppAxisUrns.add(prereqUrn);
        }
      }
    }

    for (const appAxisUrn of matchedAppAxisUrns) {
      mandatoryAxisMap.set(appAxisUrn, {
        id: `tr-ctx-${appAxisUrn}`,
        subject: matchedConcepts[0]?.urn || 'urn:archinex:ontology:concept:application_allocation',
        predicate: 'requires_aspect',
        object: appAxisUrn,
        rationale:
          'Axe d’allocation fonctionnelle et de responsabilité de composant logique requis par le périmètre du sujet (Zéro Défaut Silencieux).'
      });
    }
  }

  for (const concept of matchedConcepts) {
    const reqTriplets = queryOntologyTriplets(catalog, {
      subject: concept.urn,
      predicate: 'requires_aspect'
    });
    for (const t of reqTriplets) {
      if (!mandatoryAxisMap.has(t.object)) {
        mandatoryAxisMap.set(t.object, t);
      }
    }
  }

  // Inclure tout axe contenant une feuille explicitement liée (même si aucun concept parent n'a scoré)
  for (const explicitUrn of explicitBindingSet) {
    const implTriplet = (catalog.triplets || []).find(
      (t) => t.predicate === 'implemented_by' && t.object === explicitUrn
    );
    if (implTriplet && !mandatoryAxisMap.has(implTriplet.subject)) {
      mandatoryAxisMap.set(implTriplet.subject, {
        id: `tr-explicit-${implTriplet.subject}`,
        subject: matchedConcepts[0]?.urn || 'urn:archinex:ontology:concept:explicit_binding',
        predicate: 'requires_aspect',
        object: implTriplet.subject,
        rationale: 'Axe activé par liaison explicite d’une feuille ontologique.'
      });
    }
  }

  const axes: AxisCoverageItem[] = [];
  const outOfScopeAxes: AxisCoverageItem[] = [];

  // 1bis. Détection d'un besoin fonctionnel inédit / émergent (ex: IoT / LoRaWAN / MQTT ou sujet `isNovelSubject`)
  const catalogComponentNames = Array.from(
    new Set(
      (input.availableComponents && input.availableComponents.length > 0
        ? input.availableComponents
        : Object.values(catalog.entities || {})
            .map((e) => (e.instantiated_component ? String(e.instantiated_component).replace(/^urn:archinex:component:/, '') : ''))
            .filter(Boolean))
    )
  );
  const explicitEmergentUrn = Array.from(explicitBindingSet).find((u) =>
    u.startsWith('urn:archinex:ontology:application:emergent:')
  );
  const hasExplicitEmergentBinding = Boolean(explicitEmergentUrn);
  const detectedEmergent =
    input.emergentCapability ??
    (isAutoConceptMode || hasExplicitEmergentBinding
      ? detectEmergentCapabilityNeed(rawCombinedText, undefined, {
          isNovelSubject: input.isNovelSubject,
          fallbackTitle: input.title,
          availableComponents: catalogComponentNames
        })
      : undefined);

  if (detectedEmergent || hasExplicitEmergentBinding) {
    const inferredNewCompMatch = explicitEmergentUrn
      ? /^urn:archinex:ontology:application:emergent:new_([a-z0-9_-]+)$/i.exec(explicitEmergentUrn)
      : null;
    const inferredCompName = inferredNewCompMatch
      ? inferredNewCompMatch[1].replace(/_/g, '-').toLowerCase()
      : 'custom-domain-service';
    const emergent = detectedEmergent ?? {
      isEmergent: true,
      capabilityId: `emergent-${inferredCompName}`,
      title: input.title || 'Capacité Fonctionnelle Émergente',
      togafDomain: 'application-business' as TogafDomainId,
      documentEngineLayer: 'application' as const,
      suggestedComponentName: inferredCompName,
      suggestedTier: 'application' as const,
      candidateExistingComponents: catalogComponentNames.slice(0, 6),
      rationale:
        'Besoin fonctionnel émergent exigeant une allocation explicite de responsabilité de composant logique.'
    };

    const emergentAxisUrn = 'urn:archinex:ontology:axis:emergent_component_allocation';
    const newCompSlug = emergent.suggestedComponentName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const emergentCandidates: CandidateLeafSummary[] = [
      {
        urn: `urn:archinex:ontology:application:emergent:new_${newCompSlug}`,
        title: `Instancier un nouveau composant logique dédié (${emergent.suggestedComponentName})`,
        domain: 'application',
        revision: 1,
        oracleRules: ['data.archinex.edp.multiaxis.deny_component_substrate_mismatch'],
        projections: {
          allocation_mode: 'new_dedicated_component',
          instantiated_component: emergent.suggestedComponentName,
          tier: emergent.suggestedTier
        },
        targetComponents: [emergent.suggestedComponentName]
      },
      ...emergent.candidateExistingComponents.map((compName) => ({
        urn: `urn:archinex:ontology:application:emergent:allocate_${compName.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`,
        title: `Allouer la responsabilité au composant existant (${compName})`,
        domain: 'application',
        revision: 1,
        oracleRules: ['data.archinex.edp.multiaxis.deny_component_substrate_mismatch'],
        projections: {
          allocation_mode: 'existing_component',
          instantiated_component: compName
        },
        targetComponents: [compName]
      }))
    ];

    const emergentBound: CandidateLeafSummary[] = [];
    let emergentHasExplicit = false;
    let emergentHasExcluded = false;
    for (const cand of emergentCandidates) {
      if (excludedLeafSet.has(cand.urn)) {
        emergentHasExcluded = true;
      }
      if (explicitBindingSet.has(cand.urn)) {
        emergentBound.push(cand);
        boundLeafUrns.add(cand.urn);
        emergentHasExplicit = true;
      }
    }

    if (!emergentHasExplicit && !emergentHasExcluded && shouldAutoBind && emergentCandidates.length > 0) {
      emergentBound.push(emergentCandidates[0]);
      boundLeafUrns.add(emergentCandidates[0].urn);
    }

    const emergentOrigin: BindingOrigin =
      emergentBound.length === 0
        ? 'none'
        : emergentHasExplicit
          ? 'explicit'
          : 'default_proposed';
    const emergentRequiresRatification = emergentOrigin === 'default_proposed';
    const emergentRules = Array.from(new Set(emergentBound.flatMap((l) => l.oracleRules)));
    const emergentExecRules = emergentRules.filter((r) => implementedRegoRules.has(r));
    const emergentPhantomRules = emergentRules.filter((r) => !implementedRegoRules.has(r));

    const emergentComponents = collectInstantiatedComponents(
      [emergentAxisUrn, ...emergentBound.map((l) => l.urn)],
      catalog,
      customComponentMap
    );
    const isEmergentExcluded = excludedAxisSet.has(emergentAxisUrn);
    const emergentAxisItem: AxisCoverageItem = {
      axisUrn: emergentAxisUrn,
      axisTitle: `Axe Émergent : ${emergent.title}`,
      domain: 'application',
      togafDomain: emergent.togafDomain,
      rationale: emergent.rationale,
      status:
        emergentBound.length === 0
          ? 'missing_refinement'
          : emergentRules.length > 0
            ? 'covered_executable'
            : 'covered_no_oracle',
      bindingOrigin: emergentOrigin,
      requiresRatification: emergentRequiresRatification,
      boundLeaves: emergentBound,
      candidateLeaves: emergentCandidates,
      oracleRulesCount: emergentRules.length,
      executableOracleRules: emergentExecRules,
      phantomOracleRules: emergentPhantomRules,
      hasPhantomOracle: emergentPhantomRules.length > 0,
      instantiatedComponents: emergentComponents,
      activationReason: {
        source: 'emergent_capability',
        summary: `Besoin fonctionnel émergent détecté (${emergent.suggestedComponentName})`,
        matchedKeywords: [],
        matchedRequirementIds: [],
        matchedClauseUrns: [],
        matchedComponents: emergentComponents
      },
      relevanceScore: 10,
      relevanceLevel: isEmergentExcluded ? 'out_of_scope' : 'high',
      isOutOfScope: isEmergentExcluded,
      isManuallyExcluded: isEmergentExcluded
    };

    if (isEmergentExcluded) {
      for (const l of emergentBound) {
        boundLeafUrns.delete(l.urn);
      }
      outOfScopeAxes.push(emergentAxisItem);
      if (input.includeOutOfScopeAxes) {
        axes.push(emergentAxisItem);
      }
    } else {
      axes.push(emergentAxisItem);
    }
  }

  for (const [axisUrn, reqTriplet] of mandatoryAxisMap.entries()) {
    const axisEntity = catalog.entities[axisUrn];
    const isApplicationAxis =
      axisEntity?.domain === 'application' || axisEntity?.togaf_domain === 'application-business';
    const implTriplets = queryOntologyTriplets(catalog, {
      subject: axisUrn,
      predicate: 'implemented_by'
    });

    const candidateLeaves: CandidateLeafSummary[] = [];
    const boundLeaves: CandidateLeafSummary[] = [];
    let hasExplicitBinding = false;
    let hasStrongLinkBinding = false;
    let bestAutoAppCandidate: { summary: CandidateLeafSummary; score: number } | null = null;
    const axisMatchDetails = axisEntity
      ? matchEntityAgainstCorpus(axisEntity, corpus)
      : { score: 0, directKeywordScore: 0, matchedKeywords: [] };
    const matchedKeywordsSet = new Set<string>(axisMatchDetails.matchedKeywords);
    const matchedRequirementIdsSet = new Set<string>();
    const matchedClauseUrnsSet = new Set<string>();
    let bestLeafCorpusScore = 0;
    let componentMentionedInCorpus = false;

    for (const implT of implTriplets) {
      const leafEntity = catalog.entities[implT.object];
      if (!leafEntity) continue;

      const summary = toCandidateSummary(leafEntity, catalog, customComponentMap);
      candidateLeaves.push(summary);

      const isExplicitlyBound = explicitBindingSet.has(leafEntity.urn);
      const isExcluded = excludedLeafSet.has(leafEntity.urn);
      const strongLinkMatch =
        !isExcluded && corpusCandidateIds.length > 0
          ? findStrongLinkForLeaf(leafEntity, corpusCandidateIds, catalog)
          : null;
      const hasStrongLinkInCorpus = shouldAutoBind && Boolean(strongLinkMatch);
      if (strongLinkMatch) {
        if (strongLinkMatch.isUrn) {
          matchedClauseUrnsSet.add(strongLinkMatch.matchedIdentifier);
        } else {
          matchedRequirementIdsSet.add(strongLinkMatch.matchedIdentifier);
        }
      }

      const leafMatchDetails = !isExcluded
        ? matchEntityAgainstCorpus(leafEntity, corpus)
        : { score: 0, directKeywordScore: 0, matchedKeywords: [] };
      for (const kw of leafMatchDetails.matchedKeywords) {
        matchedKeywordsSet.add(kw);
      }
      if (leafMatchDetails.score > bestLeafCorpusScore) {
        bestLeafCorpusScore = leafMatchDetails.score;
      }
      for (const comp of summary.targetComponents || []) {
        if (corpus.includes(normalizeText(comp))) {
          componentMentionedInCorpus = true;
        }
      }

      const semanticScore = shouldAutoBind ? leafMatchDetails.score : 0;
      // Liaison automatique sur un MOT-CLÉ de la feuille, jamais sur un simple mot de son titre : le titre est un libellé
      // éditorial du Knowledge Hub (il change sans que le sens change) et un seul mot courant (« alimentation ») liait
      // une variante concurrente (UPS N+1) en plus de la feuille 2N, qui en écrasait l'hydratation.
      const hasKeywordHit = shouldAutoBind && leafMatchDetails.directKeywordScore > 0;
      const isDefaultStandard =
        shouldAutoBind && !isExcluded && leafEntity.is_default_standard === true;

      if (isExplicitlyBound) {
        boundLeafUrns.add(leafEntity.urn);
        boundLeaves.push(summary);
        hasExplicitBinding = true;
      } else if (isApplicationAxis) {
        // Pour un axe d'allocation applicative (ex: SIG), on ne pré-sélectionne qu'une seule variante
        // proposée par défaut (jamais toutes les variantes contradictoires en même temps) et on exige la ratification humaine.
        const combinedScore = semanticScore + (hasStrongLinkInCorpus ? 5 : 0) + (isDefaultStandard ? 1 : 0);
        if (combinedScore > 0 && (!bestAutoAppCandidate || combinedScore > bestAutoAppCandidate.score)) {
          bestAutoAppCandidate = { summary, score: combinedScore };
        }
      } else if (hasStrongLinkInCorpus || hasKeywordHit || isDefaultStandard) {
        boundLeafUrns.add(leafEntity.urn);
        boundLeaves.push(summary);
        if (hasStrongLinkInCorpus) {
          hasStrongLinkBinding = true;
        }
      }
    }

    const axisHasExcludedLeaf = candidateLeaves.some((c) => excludedLeafSet.has(c.urn));

    const parentConceptEntity = catalog.entities[reqTriplet.subject];
    const conceptMatchDetails = parentConceptEntity
      ? matchEntityAgainstCorpus(parentConceptEntity, corpus)
      : { score: 0, directKeywordScore: 0, matchedKeywords: [] };
    const axisDirectScore =
      axisMatchDetails.score + bestLeafCorpusScore + (componentMentionedInCorpus ? 4 : 0);
    const isManuallyExcluded = excludedAxisSet.has(axisUrn);
    const isScopeRelevant =
      isManualConceptSelection ||
      hasExplicitBinding ||
      hasStrongLinkBinding ||
      matchedRequirementIdsSet.size > 0 ||
      matchedClauseUrnsSet.size > 0 ||
      isApplicationAxis ||
      reqTriplet.id.startsWith('tr-ctx-') ||
      axisDirectScore >= 2 ||
      conceptMatchDetails.directKeywordScore >= 4;
    const isOutOfScope = isManuallyExcluded || !isScopeRelevant;

    if (isOutOfScope) {
      for (const l of boundLeaves) {
        if (!explicitBindingSet.has(l.urn) || isManuallyExcluded) {
          boundLeafUrns.delete(l.urn);
        }
      }
    } else {
      if (
        isApplicationAxis &&
        !hasExplicitBinding &&
        !axisHasExcludedLeaf &&
        shouldAutoBind &&
        boundLeaves.length === 0
      ) {
        const chosen =
          bestAutoAppCandidate?.summary ||
          candidateLeaves.find((c) => c.oracleRules.length > 0) ||
          candidateLeaves[0];
        if (chosen) {
          boundLeafUrns.add(chosen.urn);
          boundLeaves.push(chosen);
        }
      }

      // Auto-raffinement par défaut (KAOS OR-Refinement) : tant qu'une feuille standard homologuée existe
      // dans l'ontologie pour cet axe obligatoire, on la propose comme défaut (à ratifier).
      if (!axisHasExcludedLeaf && shouldAutoBind && boundLeaves.length === 0 && candidateLeaves.length > 0) {
        const defaultCandidate =
          candidateLeaves.find((c) => c.oracleRules.length > 0) || candidateLeaves[0];
        boundLeafUrns.add(defaultCandidate.urn);
        boundLeaves.push(defaultCandidate);
      }
    }

    const effectiveBoundLeaves = isOutOfScope && isManuallyExcluded ? [] : boundLeaves;
    const oracleRulesCount = effectiveBoundLeaves.reduce((acc, l) => acc + l.oracleRules.length, 0);
    const uniqueAxisOracleRules = Array.from(
      new Set(effectiveBoundLeaves.flatMap((l) => l.oracleRules))
    );
    const executableOracleRules = uniqueAxisOracleRules.filter((r) => implementedRegoRules.has(r));
    const phantomOracleRules = uniqueAxisOracleRules.filter((r) => !implementedRegoRules.has(r));

    const bindingOrigin: BindingOrigin =
      effectiveBoundLeaves.length === 0
        ? 'none'
        : hasExplicitBinding
          ? 'explicit'
          : isApplicationAxis
            ? 'default_proposed'
            : hasStrongLinkBinding
              ? 'strong_link'
              : 'default_proposed';

    const requiresRatification = bindingOrigin === 'default_proposed';

    let status: AxisCoverageStatus = 'missing_refinement';
    if (effectiveBoundLeaves.length > 0) {
      status = oracleRulesCount > 0 ? 'covered_executable' : 'covered_no_oracle';
    }

    const instantiatedComponents = collectInstantiatedComponents(
      [axisUrn, ...effectiveBoundLeaves.map((l) => l.urn)],
      catalog,
      customComponentMap
    );
    const matchedKeywords = Array.from(matchedKeywordsSet);
    const matchedRequirementIds = Array.from(matchedRequirementIdsSet);
    const matchedClauseUrns = Array.from(matchedClauseUrnsSet);
    const relevanceScore =
      (hasExplicitBinding ? 10 : 0) +
      (hasStrongLinkBinding || matchedRequirementIds.length > 0 ? 8 : 0) +
      axisDirectScore +
      Math.min(4, conceptMatchDetails.directKeywordScore);
    const relevanceLevel: AxisRelevanceLevel = isOutOfScope
      ? 'out_of_scope'
      : relevanceScore >= 6
        ? 'high'
        : relevanceScore >= 2
          ? 'medium'
          : 'low';

    const conceptTitle = parentConceptEntity?.title || reqTriplet.subject;
    let activationSource: AxisActivationSource = 'concept_match';
    let activationSummary = '';
    if (hasExplicitBinding) {
      activationSource = 'explicit_binding';
      const boundNames = effectiveBoundLeaves
        .filter((l) => explicitBindingSet.has(l.urn))
        .map((l) => l.title);
      activationSummary = `Rattaché explicitement via « ${boundNames.join(', ')} »`;
    } else if (hasStrongLinkBinding || matchedRequirementIds.length > 0 || matchedClauseUrns.length > 0) {
      activationSource = 'strong_link';
      activationSummary = `Déclenché par exigence / clause : ${[...matchedRequirementIds, ...matchedClauseUrns].join(', ')}`;
    } else if (matchedKeywords.length > 0 || axisDirectScore > 0) {
      activationSource = 'axis_keyword_match';
      activationSummary =
        matchedKeywords.length > 0
          ? `Activé par les mots-clés du sujet : ${matchedKeywords.slice(0, 6).join(', ')}`
          : `Activé par correspondance lexicale avec le titre de l’axe ou ses variantes`;
    } else if (isManualConceptSelection) {
      activationSource = 'manual_concept_selection';
      activationSummary = `Rattaché au concept sélectionné « ${conceptTitle} »`;
    } else {
      activationSource = 'concept_match';
      activationSummary =
        conceptMatchDetails.matchedKeywords.length > 0
          ? `Hérité du concept « ${conceptTitle} » (${conceptMatchDetails.matchedKeywords.slice(0, 4).join(', ')})`
          : `Hérité du concept « ${conceptTitle} »`;
    }

    if (isManuallyExcluded) {
      activationSummary = `Écarté manuellement du périmètre par l’architecte (${activationSummary})`;
    } else if (isOutOfScope) {
      activationSummary = `Hors-périmètre du sujet (aucun mot-clé, exigence ou composant cible direct ; ${activationSummary})`;
    }

    const axisItem: AxisCoverageItem = {
      axisUrn,
      axisTitle: axisEntity?.title || axisUrn,
      domain: axisEntity?.domain || 'architecture',
      togafDomain: resolveTogafDomain(axisEntity?.togaf_domain || axisEntity?.domain),
      rationale: reqTriplet.rationale || 'Axe obligatoire requis par le concept parent.',
      status,
      bindingOrigin,
      requiresRatification,
      boundLeaves: effectiveBoundLeaves,
      candidateLeaves,
      oracleRulesCount,
      executableOracleRules,
      phantomOracleRules,
      hasPhantomOracle: phantomOracleRules.length > 0,
      instantiatedComponents,
      activationReason: {
        source: activationSource,
        summary: activationSummary,
        matchedConceptUrn: parentConceptEntity?.urn,
        matchedConceptTitle: parentConceptEntity?.title,
        matchedKeywords,
        matchedRequirementIds,
        matchedClauseUrns,
        matchedComponents: instantiatedComponents
      },
      relevanceScore,
      relevanceLevel,
      isOutOfScope,
      isManuallyExcluded
    };

    if (isOutOfScope) {
      outOfScopeAxes.push(axisItem);
      if (input.includeOutOfScopeAxes) {
        axes.push(axisItem);
      }
    } else {
      axes.push(axisItem);
    }
  }

  // 2bis. Emplacements de décision (conscientisation : défaut proposé != décision ratifiée + prérequis transitifs)
  const decisionSlots: DecisionSlotItem[] = axes.map((axis) => {
    const execCount = axis.executableOracleRules?.length ?? 0;
    let slotStatus: DecisionSlotStatus = 'open';
    if (axis.boundLeaves.length > 0) {
      if (axis.requiresRatification) {
        slotStatus = 'default_proposed';
      } else {
        slotStatus = execCount > 0 ? 'bound_verified' : 'bound_unverified';
      }
    }

    return {
      slotId: `slot:${axis.axisUrn}`,
      axisUrn: axis.axisUrn,
      axisTitle: axis.axisTitle,
      togafDomain: axis.togafDomain || resolveTogafDomain(axis.domain),
      status: slotStatus,
      bindingOrigin: axis.bindingOrigin || 'none',
      requiresRatification: Boolean(axis.requiresRatification),
      boundLeafUrns: axis.boundLeaves.map((l) => l.urn),
      candidateLeafUrns: axis.candidateLeaves.map((l) => l.urn),
      executableOracleRules: axis.executableOracleRules || [],
      phantomOracleRules: axis.phantomOracleRules || [],
      instantiatedComponents: axis.instantiatedComponents || [],
      isTransitivePrerequisite: false
    };
  });

  const transitivePrereqs = computeTransitivePrerequisiteAxes(
    [...mandatoryAxisMap.keys(), ...boundLeafUrns, ...explicitBindingSet],
    catalog
  );

  for (const [targetAxisUrn, prereqMatch] of transitivePrereqs.entries()) {
    if (
      mandatoryAxisMap.has(targetAxisUrn) ||
      excludedAxisSet.has(targetAxisUrn)
    ) {
      continue;
    }
    const axisEntity = catalog.entities[targetAxisUrn];
    const implTriplets = queryOntologyTriplets(catalog, {
      subject: targetAxisUrn,
      predicate: 'implemented_by'
    });

    const candidateLeaves: CandidateLeafSummary[] = [];
    const slotBoundLeaves: CandidateLeafSummary[] = [];
    let hasExplicit = false;
    let hasStrongLink = false;

    for (const implT of implTriplets) {
      const leafEntity = catalog.entities[implT.object];
      if (!leafEntity) continue;
      const summary = toCandidateSummary(leafEntity, catalog, customComponentMap);
      candidateLeaves.push(summary);

      const isExplicitlyBound = explicitBindingSet.has(leafEntity.urn);
      const isExcluded = excludedLeafSet.has(leafEntity.urn);
      const hasStrongLinkInCorpus =
        shouldAutoBind && !isExcluded && corpusCandidateIds.length > 0
          ? Boolean(findStrongLinkForLeaf(leafEntity, corpusCandidateIds, catalog))
          : false;

      if (isExplicitlyBound || hasStrongLinkInCorpus) {
        slotBoundLeaves.push(summary);
        if (isExplicitlyBound) {
          hasExplicit = true;
        } else {
          hasStrongLink = true;
        }
      }
    }

    const slotHasExcludedLeaf = candidateLeaves.some((c) => excludedLeafSet.has(c.urn));
    let slotOrigin: BindingOrigin = 'none';
    if (slotBoundLeaves.length > 0) {
      slotOrigin = hasExplicit ? 'explicit' : hasStrongLink ? 'strong_link' : 'default_proposed';
    } else if (!slotHasExcludedLeaf && shouldAutoBind && candidateLeaves.length > 0) {
      const proposed =
        candidateLeaves.find((c) => Boolean(catalog.entities[c.urn]?.is_default_standard)) ||
        candidateLeaves.find((c) => c.oracleRules.length > 0) ||
        candidateLeaves[0];
      slotBoundLeaves.push(proposed);
      slotOrigin = 'default_proposed';
    }

    const requiresRatification = slotOrigin === 'default_proposed';
    const uniqueSlotRules = Array.from(new Set(slotBoundLeaves.flatMap((l) => l.oracleRules)));
    const executableOracleRules = uniqueSlotRules.filter((r) => implementedRegoRules.has(r));
    const phantomOracleRules = uniqueSlotRules.filter((r) => !implementedRegoRules.has(r));

    let slotStatus: DecisionSlotStatus = 'open';
    if (slotBoundLeaves.length > 0) {
      if (requiresRatification) {
        slotStatus = 'default_proposed';
      } else {
        slotStatus = executableOracleRules.length > 0 ? 'bound_verified' : 'bound_unverified';
      }
    }

    decisionSlots.push({
      slotId: `slot:${targetAxisUrn}`,
      axisUrn: targetAxisUrn,
      axisTitle: axisEntity?.title || targetAxisUrn,
      togafDomain: resolveTogafDomain(axisEntity?.togaf_domain || axisEntity?.domain),
      status: slotStatus,
      bindingOrigin: slotOrigin,
      requiresRatification,
      boundLeafUrns: slotBoundLeaves.map((l) => l.urn),
      candidateLeafUrns: candidateLeaves.map((l) => l.urn),
      executableOracleRules,
      phantomOracleRules,
      instantiatedComponents: collectInstantiatedComponents(
        [targetAxisUrn, ...slotBoundLeaves.map((l) => l.urn)],
        catalog,
        customComponentMap
      ),
      isTransitivePrerequisite: true,
      triggeredByAxisUrn: prereqMatch.triggeredByAxisUrn
    });
  }

  // 3. Vérification des dépendances inter-axes (`depends_on`, `constrains`, `conflicts_with`)
  const dependencyIssues: CrossAxisDependencyIssue[] = [];
  const allTriplets = catalog.triplets || [];
  for (const t of allTriplets) {
    if (t.predicate === 'depends_on' || t.predicate === 'constrains') {
      if (boundLeafUrns.has(t.subject) && !boundLeafUrns.has(t.object)) {
        const srcTitle = catalog.entities[t.subject]?.title || t.subject;
        const dstTitle = catalog.entities[t.object]?.title || t.object;
        dependencyIssues.push({
          tripletId: t.id,
          sourceUrn: t.subject,
          predicate: t.predicate,
          targetUrn: t.object,
          message: `Dépendance inter-axes non résolue : "${srcTitle}" (${t.predicate}) requiert "${dstTitle}" (${t.object}).`
        });
      }
    } else if (t.predicate === 'conflicts_with') {
      if (boundLeafUrns.has(t.subject) && boundLeafUrns.has(t.object)) {
        const srcTitle = catalog.entities[t.subject]?.title || t.subject;
        const dstTitle = catalog.entities[t.object]?.title || t.object;
        dependencyIssues.push({
          tripletId: t.id,
          sourceUrn: t.subject,
          predicate: 'conflicts_with',
          targetUrn: t.object,
          message: `Conflit ontologique : "${srcTitle}" est incompatible avec "${dstTitle}".`
        });
      }
    }
  }

  // 4. Construction de la liste déterministe des liaisons multi-axes
  const composedBindings: OntologyBindingItem[] = Array.from(boundLeafUrns)
    .sort()
    .map((urn) => ({
      urn,
      revision: catalog.entities[urn]?.revision ?? 1
    }));

  // 5. Analyse des clauses d'intention atomiques
  const clauses = decomposeIntentionClauses(input, catalog, boundLeafUrns);

  // 6. Calcul des métriques de complétude KAOS
  const coveredExecutableAxes = axes.filter((a) => a.status === 'covered_executable').length;
  const coveredNoOracleAxes = axes.filter((a) => a.status === 'covered_no_oracle').length;
  const missingAxes = axes.filter((a) => a.status === 'missing_refinement').length;
  const totalMandatoryAxes = axes.length;

  const axisCoveragePercent =
    totalMandatoryAxes > 0
      ? Math.round(((coveredExecutableAxes + coveredNoOracleAxes * 0.5) / totalMandatoryAxes) * 100)
      : 100;

  const coveredClauses = clauses.filter((c) => c.status === 'covered').length;
  const totalClauses = clauses.length;
  const clauseCoveragePercent =
    totalClauses > 0 ? Math.round((coveredClauses / totalClauses) * 100) : 100;

  const isComplete =
    totalMandatoryAxes > 0 &&
    missingAxes === 0 &&
    coveredNoOracleAxes === 0 &&
    dependencyIssues.length === 0;

  const totalSlots = decisionSlots.length;
  const openSlots = decisionSlots.filter((s) => s.status === 'open').length;
  const defaultProposedSlots = decisionSlots.filter((s) => s.status === 'default_proposed').length;
  const boundUnverifiedSlots = decisionSlots.filter((s) => s.status === 'bound_unverified').length;
  const boundVerifiedSlots = decisionSlots.filter((s) => s.status === 'bound_verified').length;
  const waivedSlots = decisionSlots.filter((s) => s.status === 'waived').length;
  const ratifiedCount = boundVerifiedSlots + boundUnverifiedSlots + waivedSlots;
  const humanRatifiedRatio =
    totalSlots > 0 ? Math.round((ratifiedCount / totalSlots) * 1000) / 1000 : 0;
  const verifiedOracleRatio =
    totalSlots > 0 ? Math.round((boundVerifiedSlots / totalSlots) * 1000) / 1000 : 0;
  const phantomOracleCount = decisionSlots.reduce(
    (acc, s) => acc + s.phantomOracleRules.length,
    0
  );
  const transitivePrerequisitesCount = decisionSlots.filter(
    (s) => s.isTransitivePrerequisite
  ).length;
  const isConscientiouslyComplete =
    totalSlots > 0 &&
    openSlots === 0 &&
    defaultProposedSlots === 0 &&
    boundUnverifiedSlots === 0 &&
    phantomOracleCount === 0 &&
    dependencyIssues.length === 0;

  const allConcepts: HldConceptSummary[] = Object.values(catalog.entities)
    .filter((e) => e.kind === 'concept')
    .map((e) => {
      const reqCount = queryOntologyTriplets(catalog, {
        subject: e.urn,
        predicate: 'requires_aspect'
      }).length;
      const matchEntry = matchedConcepts.find((m) => m.urn === e.urn);
      return {
        urn: e.urn,
        title: e.title || e.urn,
        domain: e.domain || 'architecture',
        axesCount: reqCount,
        score: matchEntry?.score ?? scoreEntityAgainstCorpus(e, corpus)
      };
    });

  return {
    matchedConcepts,
    allConcepts,
    selectedConceptUrn: input.selectedConceptUrn || 'AUTO',
    emergentCapability: detectedEmergent,
    axes,
    outOfScopeAxes,
    filteredOutAxesCount: outOfScopeAxes.length,
    clauses,
    dependencyIssues,
    composedBindings,
    decisionSlots,
    conscientiousMetrics: {
      totalSlots,
      openSlots,
      defaultProposedSlots,
      boundUnverifiedSlots,
      boundVerifiedSlots,
      waivedSlots,
      humanRatifiedRatio,
      verifiedOracleRatio,
      phantomOracleCount,
      transitivePrerequisitesCount,
      isConscientiouslyComplete
    },
    metrics: {
      coveredExecutableAxes,
      coveredNoOracleAxes,
      missingAxes,
      totalMandatoryAxes,
      axisCoveragePercent,
      coveredClauses,
      totalClauses,
      clauseCoveragePercent,
      isComplete
    }
  };
}

/**
 * Compose dynamiquement les objets LLD "Planned" (Nautobot, Sylva CAPI, Zones Sécurité, Environnements, Alimentations 2N)
 * à partir de toutes les feuilles d'ontologie liées sur les différents axes du sujet et des surcharges éventuelles.
 */
export function composeMultiAxisHydration(
  subjectId: string,
  bindings: OntologyBindingItem[],
  catalog: OntologyCatalog,
  overrides: LldHydrationOverrides = {}
): MultiAxisHydratedInventory {
  const hostSlug = sanitizeHostnameSegment(subjectId);
  const hostname = `srv-${hostSlug}-01`;

  const nautobotDevices: Array<Record<string, unknown>> = [];
  const k8sManifests: Array<Record<string, unknown>> = [];
  const securityZones: Array<Record<string, unknown>> = [];
  const environments: Array<Record<string, unknown>> = [];
  let powerFeeds: string[] = ['PDU-A', 'PDU-B'];
  const coveredDomains = new Set<string>();

  let deviceRole = 'worker';
  let deviceType = 'Dell-PowerEdge-R750';
  let deviceStatus = 'planned';
  let hasComputeLeaf = false;
  const computeProfiles: Array<{
    urn: string;
    title: string;
    role: string;
    deviceType: string;
    clusterPool: string;
    dataplaneProfile: string;
  }> = [];
  let interfaces: Array<{ name: string; type: string; ip?: string }> = [
    { name: 'oob0', type: 'management', ip: '192.0.2.10/24' },
    { name: 'eth0', type: 'data', ip: '10.20.0.10/24' }
  ];
  let rootCaKeyCustody = 'unspecified';
  let vaultUnsealMode = 'unspecified';
  let oamSessionRecording = false;
  let egressMode = 'unspecified';
  let fabricUnderlayProtocol = 'unspecified';
  let fabricOverlayProtocol = 'unspecified';
  let torUplinksPerRack = 0;
  let userPlaneIsolationLevel = 'unspecified';
  let storageReplicationFactor = 0;
  let objectVersioningEnabled = false;
  let storageEncryptionCipher = 'unspecified';
  let backupImmutabilityMode = 'unspecified';
  let iamForbidClusterAdminGroup = false;
  let iamMfaLevel = 'unspecified';
  let workloadMtlsMode = 'unspecified';
  let allowStaticK8sSecrets = true;
  let telemetryCollectorStandard = 'unspecified';
  let siemTransport = 'unspecified';
  let alertRequireRunbookAnnotation = false;
  let drpWitnessSitePresent = false;
  let drpRpoSeconds = 999999;
  let drpDaysSinceLastDrill = 999;
  let registryCosignVerification = false;
  let endpointMdmManaged = false;
  let endpointPkiProtocol = 'unspecified';
  let endpointVerifiedBoot = false;
  let endpointLocalEncryptionMode = 'unspecified';
  let endpointAppSandboxingMode = 'unspecified';
  let endpointOtaSignedAb = false;
  let esimSasSmCertified = false;
  let esimFourEyesApproval = false;
  let ossNrmStandard = 'unspecified';
  let smoHitlApproval = false;
  let cmdbSyncEnabled = false;
  let nonInvasiveProbes = false;
  let non3gppIpsecEnforced = false;
  let sliceIsolationEnforced = false;
  let embmsAuthenticated = false;
  let pqcHybridAgility = false;

  for (const b of bindings) {
    const entity = catalog.entities[b.urn];
    if (!entity) continue;
    if (entity.domain) coveredDomains.add(entity.domain);

    const tpl = (entity.hydration_template || {}) as Record<string, any>;
    const proj = (entity.projections || {}) as Record<string, any>;

    if (proj.key_custody_mode !== undefined) {
      rootCaKeyCustody = String(proj.key_custody_mode);
    }
    if (proj.unseal_mechanism !== undefined) {
      vaultUnsealMode = String(proj.unseal_mechanism);
    }
    if (proj.bastion_session_recording !== undefined) {
      oamSessionRecording = Boolean(proj.bastion_session_recording);
    }
    if (proj.egress_mode !== undefined) {
      egressMode = String(proj.egress_mode);
    }
    if (proj.underlay_protocol !== undefined) {
      fabricUnderlayProtocol = String(proj.underlay_protocol);
    }
    if (proj.overlay_protocol !== undefined) {
      fabricOverlayProtocol = String(proj.overlay_protocol);
    }
    if (proj.min_tor_switches_per_rack !== undefined) {
      torUplinksPerRack = Number(proj.min_tor_switches_per_rack);
    }
    if (
      entity.urn === 'urn:archinex:ontology:security:zone:user_plane' &&
      proj.isolation_level !== undefined
    ) {
      userPlaneIsolationLevel = String(proj.isolation_level);
    }
    if (proj.min_replication_factor !== undefined) {
      storageReplicationFactor = Number(proj.min_replication_factor);
    }
    if (proj.versioning_required !== undefined) {
      objectVersioningEnabled = Boolean(proj.versioning_required);
    }
    if (proj.cipher !== undefined) {
      storageEncryptionCipher = String(proj.cipher);
    }
    if (proj.immutability_mode !== undefined) {
      backupImmutabilityMode = String(proj.immutability_mode);
    }
    if (proj.forbid_cluster_admin_group !== undefined) {
      iamForbidClusterAdminGroup = Boolean(proj.forbid_cluster_admin_group);
    }
    if (proj.mfa_level !== undefined) {
      iamMfaLevel = String(proj.mfa_level);
    }
    if (proj.mtls_enforcement !== undefined) {
      workloadMtlsMode = String(proj.mtls_enforcement);
    }
    if (proj.allow_static_k8s_secrets !== undefined) {
      allowStaticK8sSecrets = Boolean(proj.allow_static_k8s_secrets);
    }
    if (proj.collector_standard !== undefined) {
      telemetryCollectorStandard = String(proj.collector_standard);
    }
    if (proj.transport !== undefined) {
      siemTransport = String(proj.transport);
    }
    if (proj.require_runbook_annotation !== undefined) {
      alertRequireRunbookAnnotation = Boolean(proj.require_runbook_annotation);
    }
    if (proj.witness_site_required !== undefined) {
      drpWitnessSitePresent = Boolean(proj.witness_site_required);
    }
    if (proj.rpo_seconds !== undefined) {
      drpRpoSeconds = Number(proj.rpo_seconds);
    }
    if (proj.max_days_between_drills !== undefined) {
      drpDaysSinceLastDrill = Number(proj.max_days_between_drills);
    }
    if (proj.cosign_verification !== undefined) {
      registryCosignVerification = Boolean(proj.cosign_verification);
    }
    if (proj.mdm_managed_required !== undefined) {
      endpointMdmManaged = Boolean(proj.mdm_managed_required);
    }
    if (proj.default_protocol !== undefined && Array.isArray(proj.allowed_protocols)) {
      endpointPkiProtocol = String(proj.default_protocol);
    }
    if (proj.verified_boot_required !== undefined) {
      endpointVerifiedBoot = Boolean(proj.verified_boot_required);
    }
    if (proj.encryption_mode !== undefined) {
      endpointLocalEncryptionMode = String(proj.encryption_mode);
    }
    if (proj.sandboxing_mode !== undefined) {
      endpointAppSandboxingMode = String(proj.sandboxing_mode);
    }
    if (proj.ota_signed_ab_required !== undefined) {
      endpointOtaSignedAb = Boolean(proj.ota_signed_ab_required);
    }
    if (proj.sas_sm_certified_required !== undefined) {
      esimSasSmCertified = Boolean(proj.sas_sm_certified_required);
    }
    if (proj.four_eyes_approval_required !== undefined) {
      esimFourEyesApproval = Boolean(proj.four_eyes_approval_required);
    }
    if (proj.nrm_standard !== undefined) {
      ossNrmStandard = String(proj.nrm_standard);
    }
    if (proj.hitl_approval_required !== undefined) {
      smoHitlApproval = Boolean(proj.hitl_approval_required);
    }
    if (proj.cmdb_sync_enabled !== undefined) {
      cmdbSyncEnabled = Boolean(proj.cmdb_sync_enabled);
    }
    if (proj.non_invasive_probes_required !== undefined) {
      nonInvasiveProbes = Boolean(proj.non_invasive_probes_required);
    }
    if (proj.non3gpp_ipsec_enforced !== undefined) {
      non3gppIpsecEnforced = Boolean(proj.non3gpp_ipsec_enforced);
    }
    if (proj.slice_isolation_enforced !== undefined) {
      sliceIsolationEnforced = Boolean(proj.slice_isolation_enforced);
    }
    if (proj.embms_authenticated_required !== undefined) {
      embmsAuthenticated = Boolean(proj.embms_authenticated_required);
    }
    if (proj.pqc_hybrid_agility_required !== undefined) {
      pqcHybridAgility = Boolean(proj.pqc_hybrid_agility_required);
    }

    if (tpl.nautobot_device || proj.baremetal_types) {
      hasComputeLeaf = true;
      const resolvedRole = Array.isArray(proj.allowed_roles)
        ? proj.allowed_roles[proj.allowed_roles.length - 1]
        : tpl.nautobot_device?.role || deviceRole;
      const resolvedType =
        tpl.nautobot_device?.device_type ||
        (Array.isArray(proj.baremetal_types) ? proj.baremetal_types[0] : deviceType);
      deviceRole = resolvedRole;
      deviceType = resolvedType;
      computeProfiles.push({
        urn: entity.urn,
        title: entity.title || entity.urn,
        role: resolvedRole,
        deviceType: resolvedType,
        clusterPool: tpl.nautobot_device?.cluster_pool || 'sylva-default-pool',
        dataplaneProfile:
          tpl.nautobot_device?.dataplane_profile || 'Sylva Standard'
      });
    }

    if (proj.required_status) {
      deviceStatus = String(proj.required_status);
    }

    if (Array.isArray(tpl.nautobot_interfaces)) {
      interfaces = tpl.nautobot_interfaces;
    }

    if (tpl.security_zone || entity.domain === 'security') {
      const isOam = entity.urn.endsWith(':oam');
      securityZones.push({
        urn: entity.urn,
        zone_id: tpl.security_zone?.zone_id || entity.urn.split(':').pop()?.toUpperCase(),
        title: entity.title,
        status: 'planned',
        isolation_level:
          isOam && overrides.oamIsolationLevel !== undefined
            ? overrides.oamIsolationLevel
            : proj.isolation_level || tpl.security_zone?.isolation_level || 'strict',
        proxy_required:
          isOam && overrides.oamProxyRequired !== undefined
            ? overrides.oamProxyRequired
            : (proj.proxy_required ?? tpl.security_zone?.proxy_required ?? false)
      });
    }

    if (Array.isArray(tpl.environments) || proj.required_tiers) {
      const baseTiers = Array.isArray(tpl.environments)
        ? tpl.environments
        : (proj.required_tiers as string[]).map((t: string) => ({
            env: t,
            isoprod: t !== 'dev'
          }));
      for (const tier of baseTiers) {
        const isStaging = tier.env === 'recette' || tier.env === 'staging' || tier.env === 'preprod';
        environments.push({
          ...tier,
          status: 'planned',
          isoprod:
            isStaging && overrides.stagingIsoprod !== undefined
              ? overrides.stagingIsoprod
              : tier.isoprod
        });
      }
    }

    if (Array.isArray(tpl.power_feeds)) {
      powerFeeds = [...tpl.power_feeds];
    }
  }

  // Application des surcharges d'ingénierie ou de simulation de dérive (Drift)
  if (overrides.deviceType !== undefined) deviceType = overrides.deviceType;
  if (overrides.nodeRole !== undefined) deviceRole = overrides.nodeRole;
  if (overrides.deviceStatus !== undefined) deviceStatus = overrides.deviceStatus;
  if (overrides.interfacesCount !== undefined) {
    interfaces = interfaces.slice(0, Math.max(0, overrides.interfacesCount));
  }
  if (overrides.powerFeedsCount !== undefined) {
    powerFeeds = ['PDU-A', 'PDU-B', 'PDU-C'].slice(0, Math.max(0, overrides.powerFeedsCount));
  }

  const oobIp = overrides.oobIp !== undefined ? overrides.oobIp : '192.0.2.10';
  const bmcAddress =
    overrides.bmcAddress !== undefined
      ? overrides.bmcAddress
      : `redfish+http://${oobIp || '192.0.2.10'}/redfish/v1/Systems/1`;

  if (hasComputeLeaf || bindings.length > 0) {
    const effectiveProfiles =
      computeProfiles.length > 0
        ? computeProfiles
        : [
            {
              urn: 'urn:archinex:ontology:infrastructure:server:baremetal',
              title: 'Cluster Sylva par défaut',
              role: deviceRole,
              deviceType,
              clusterPool: 'sylva-default-pool',
              dataplaneProfile: 'Sylva'
            }
          ];

    effectiveProfiles.forEach((prof, idx) => {
      const nodeHostname =
        idx === 0
          ? hostname
          : `srv-${hostSlug}-0${idx + 1}`;
      const nodeType = overrides.deviceType !== undefined ? overrides.deviceType : prof.deviceType;
      const nodeRole = overrides.nodeRole !== undefined ? overrides.nodeRole : prof.role;
      const nodeOobIp =
        overrides.oobIp !== undefined
          ? overrides.oobIp
          : `192.0.2.${10 + idx}`;
      const nodeBmcAddress =
        overrides.bmcAddress !== undefined
          ? overrides.bmcAddress
          : `redfish+http://${nodeOobIp || `192.0.2.${10 + idx}`}/redfish/v1/Systems/1`;

      const nodeInterfaces = interfaces.map((iface) => {
        if (!iface.ip || idx === 0) return { ...iface };
        const cidrMatch = /^(\d+\.\d+\.\d+)\.(\d+)(\/\d+)?$/.exec(iface.ip);
        if (!cidrMatch) return { ...iface };
        const prefix = cidrMatch[1];
        const lastOctet = Math.min(254, Number(cidrMatch[2]) + idx);
        const mask = cidrMatch[3] || '/24';
        return {
          ...iface,
          ip: `${prefix}.${lastOctet}${mask}`
        };
      });

      nautobotDevices.push({
        name: nodeHostname,
        status: deviceStatus,
        device_type: nodeType,
        oob_ip: nodeOobIp,
        role: nodeRole,
        cluster_pool: prof.clusterPool,
        dataplane_profile: prof.dataplaneProfile,
        interfaces: nodeInterfaces,
        power_feeds: powerFeeds,
        security_zones: securityZones.map((z) => z.zone_id)
      });

      k8sManifests.push({
        apiVersion: 'metal3.io/v1alpha1',
        kind: 'BareMetalHost',
        metadata: {
          name: nodeHostname,
          namespace: 'sylva-system',
          labels: {
            'app.kubernetes.io/managed-by': 'sylva-units-operator',
            'sylva.org/workload-cluster': `wc-${hostSlug}`,
            'sylva.org/machine-deployment-pool': prof.clusterPool,
            'sylva.org/device-type': nodeType,
            'sylva.org/security-zones': securityZones.map((z) => z.zone_id).join('-') || 'default'
          }
        },
        spec: {
          role: nodeRole,
          online: true,
          bmc: {
            address: nodeBmcAddress,
            credentialsName: `${nodeHostname}-bmc-secret`,
            disableCertificateVerification: false
          },
          bootMACAddress: `52:54:00:12:34:${56 + idx}`,
          automatedCleaningMode: 'metadata'
        }
      });
    });
  }

  // Génération du descripteur natif Sylva (`SylvaWorkloadCluster` + `sylva-units` values.yaml)
  // produit par le compilateur d'intention Archinex (FluxCD / Kustomize GitOps) sans réinventer l'opérateur Sylva.
  const sylvaBaremetalHosts: Record<string, unknown> = {};
  const sylvaMachineDeployments: Record<string, unknown> = {};
  for (const [idx, dev] of nautobotDevices.entries()) {
    const hostKey = String(dev.name);
    const poolName = String(dev.cluster_pool || 'sylva-default-pool');
    const isSriovPool = poolName.includes('sriov') || poolName.includes('cnf');
    const bmhSpec = (k8sManifests[idx]?.spec || {}) as Record<string, any>;

    sylvaBaremetalHosts[hostKey] = {
      bmh_metadata: {
        labels: {
          'host-group': poolName,
          'device-type': dev.device_type
        }
      },
      bmh_spec: {
        bmc: bmhSpec.bmc,
        bootMACAddress: bmhSpec.bootMACAddress
      }
    };

    sylvaMachineDeployments[`md-${poolName}`] = {
      infra_provider: 'capm3',
      replicas: 1,
      machine_deployment_spec: {
        template: {
          spec: {
            hostSelector: {
              matchLabels: { 'host-group': poolName }
            }
          }
        }
      },
      rke2: {
        nodeLabels: {
          'sylva.org/pool': poolName,
          'sylva.org/dataplane': isSriovPool ? 'sriov-dpdk-numa' : 'cilium-nis2'
        },
        kubeletExtraArgs: isSriovPool
          ? ['--cpu-manager-policy=static', '--topology-manager-policy=single-numa-node']
          : []
      },
      network_interfaces: isSriovPool
        ? {
            bond0: { type: 'bond', interfaces: ['eno1', 'eno2'], vlans: [{ id: 1403 }] },
            sriov0: { type: 'sriov', num_vfs: 16, mtu: 9000 }
          }
        : {
            bond0: { type: 'bond', interfaces: ['eno1', 'eno2'] }
          }
    };
  }

  const hasSriovPool = nautobotDevices.some((d) =>
    String(d.cluster_pool || '').includes('sriov')
  );

  // Collecte déterministe des clauses satisfaites et des triplets ontologiques évalués (Issue #262)
  const satisfiedClausesSet = new Set<string>();
  const evaluatedTripletsSet = new Set<string>();

  for (const b of bindings) {
    const entity = catalog.entities[b.urn];
    if (entity) {
      if (Array.isArray(entity.governed_by_clauses)) {
        for (const c of entity.governed_by_clauses) {
          satisfiedClausesSet.add(c);
        }
      }
      const satisfiesTriplets = queryOntologyTriplets(catalog, {
        subject: b.urn,
        predicate: 'satisfies_clause'
      });
      for (const t of satisfiesTriplets) {
        satisfiedClausesSet.add(t.object);
        evaluatedTripletsSet.add(t.id);
      }
    }
  }

  for (const t of catalog.triplets || []) {
    if (
      (t.predicate === 'depends_on' || t.predicate === 'constrains' || t.predicate === 'implemented_by') &&
      bindings.some((b) => b.urn === t.subject || b.urn === t.object)
    ) {
      evaluatedTripletsSet.add(t.id);
    }
  }

  for (const r of overrides.projectRequirementRefs || []) {
    if (r && r.trim()) satisfiedClausesSet.add(r.trim());
  }

  const satisfiedClauses = Array.from(satisfiedClausesSet).sort();
  const evaluatedTriplets = Array.from(evaluatedTripletsSet).sort();

  const sylvaWorkloadClusterValues: Record<string, unknown> = {
    apiVersion: 'workloadclusteroperator.sylva/v1alpha1',
    kind: 'SylvaWorkloadCluster',
    metadata: {
      name: `wc-${hostSlug}`,
      namespace: 'sylva-workload-clusters',
      annotations: {
        'archinex.io/gitops-target': `workload-clusters/wc-${hostSlug}`,
        'archinex.io/source-subject': subjectId,
        'archinex.io/satisfied-clauses': satisfiedClauses.join(','),
        'archinex.io/evaluated-triplets': evaluatedTriplets.join(',')
      }
    },
    spec: {
      sylvaUnitsReleasePresets: ['base-workload-cluster'],
      infrastructure: 'metal3',
      controlPlane: {
        provider: 'rke2',
        replicas: 3
      },
      k8sVersion: '1.28',
      enabledUnits: {
        cilium: true,
        multus: hasSriovPool,
        sriov: hasSriovPool,
        'sriov-resources': hasSriovPool,
        metallb: true,
        vault: true,
        kyverno: true,
        monitoring: true
      },
      capi_providers: {
        infra_provider: 'capm3',
        bootstrap_provider: 'cabpr'
      },
      k8s_version: 'v1.28.11+rke2r1',
      os_image_selector: {
        os: 'sle-micro',
        release: '5.5',
        hardened: true
      },
      units: {
        cilium: { enabled: true },
        multus: { enabled: hasSriovPool },
        sriov: { enabled: hasSriovPool },
        'sriov-resources': { enabled: hasSriovPool },
        metallb: { enabled: true },
        vault: { enabled: true },
        kyverno: { enabled: true },
        monitoring: { enabled: true }
      },
      baremetal_hosts: sylvaBaremetalHosts,
      machine_deployments: sylvaMachineDeployments
    }
  };

  // Graphe composé uniquement à partir des fragments déclarés par les feuilles liées (aucun scénario codé en dur).
  const reconciliationGraph: ReconciliationObjectGraph = composeReconciliationGraph(bindings, catalog, {
    s6aDirectBypassDea: overrides.s6aDirectBypassDea,
    orphanPartnerTenant: overrides.orphanPartnerTenant
  });

  const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
  const primaryDc = prodOverlay.spec.datacenters[0] || 'dc1';
  const componentUrnMap: Record<string, string> = { ...DEFAULT_URN_TO_COMPONENT };
  for (const t of catalog.triplets || []) {
    if (t.predicate === 'instantiates_component') {
      componentUrnMap[t.subject] = t.object.replace(/^urn:archinex:component:/, '');
    }
  }
  const activeCatalog = instantiateCatalogFromOntologyBindings(
    bindings.map((b) => b.urn),
    DEFAULT_COMPONENT_CATALOG,
    componentUrnMap,
    { preserveBaseCatalog: true }
  );
  const componentLintIssues = activeCatalog.flatMap((comp) => [
    ...lintBaseComponentNoHardcodedEnv(comp),
    ...validateComponentAgainstCatalogs(comp, DEFAULT_VALUE_CATALOGS)
  ]);
  const resolvedComponents = activeCatalog.filter((c) => !c.metadata.external).map(
    (comp) => resolveComponentInstance(comp, prodOverlay, primaryDc, DEFAULT_VALUE_CATALOGS)
  );
  const resolvedComponentsByDc: Record<string, ResolvedComponentInstance[]> = {};
  for (const dc of prodOverlay.spec.datacenters) {
    resolvedComponentsByDc[dc] = activeCatalog
      .filter((c) => !c.metadata.external)
      .map((comp) => resolveComponentInstance(comp, prodOverlay, dc, DEFAULT_VALUE_CATALOGS));
  }
  const referenceGraph = buildReferenceGraph(activeCatalog);
  const danglingReferences = verifyCatalogDanglingReferences(activeCatalog);
  const trustChain = {
    root_ca_key_custody: overrides.rootCaKeyCustody ?? rootCaKeyCustody,
    vault_unseal_mode: overrides.vaultUnsealMode ?? vaultUnsealMode,
    oam_session_recording: overrides.oamSessionRecording ?? oamSessionRecording,
    egress_mode: overrides.egressMode ?? egressMode
  };
  const extendedDomains: NonNullable<MultiAxisHydratedInventory['extended_domains']> = {
    network_fabric: {
      underlay_protocol: overrides.fabricUnderlayProtocol ?? fabricUnderlayProtocol,
      overlay_protocol: overrides.fabricOverlayProtocol ?? fabricOverlayProtocol,
      tor_uplinks_per_rack: overrides.torUplinksPerRack ?? torUplinksPerRack
    },
    user_plane_zone: {
      isolation_level: overrides.userPlaneIsolationLevel ?? userPlaneIsolationLevel
    },
    storage_csi: {
      replication_factor: overrides.storageReplicationFactor ?? storageReplicationFactor
    },
    object_storage: {
      versioning_enabled: overrides.objectVersioningEnabled ?? objectVersioningEnabled
    },
    encryption_at_rest: {
      cipher: overrides.storageEncryptionCipher ?? storageEncryptionCipher
    },
    backup_vault: {
      immutability_mode: overrides.backupImmutabilityMode ?? backupImmutabilityMode
    },
    iam_rbac: {
      forbid_cluster_admin_group:
        overrides.iamAllowClusterAdminGroup !== undefined
          ? !overrides.iamAllowClusterAdminGroup
          : iamForbidClusterAdminGroup,
      mfa_level: overrides.iamMfaLevel ?? iamMfaLevel
    },
    workload_pki: {
      mtls_enforcement: overrides.workloadMtlsMode ?? workloadMtlsMode
    },
    secrets_management: {
      allow_static_k8s_secrets: overrides.allowStaticK8sSecrets ?? allowStaticK8sSecrets
    },
    observability: {
      collector_standard: overrides.telemetryCollectorStandard ?? telemetryCollectorStandard,
      siem_transport: overrides.siemTransport ?? siemTransport,
      require_runbook_annotation:
        overrides.alertRequireRunbookAnnotation ?? alertRequireRunbookAnnotation
    },
    drp: {
      witness_site_present: overrides.drpWitnessSitePresent ?? drpWitnessSitePresent,
      rpo_seconds: overrides.drpRpoSeconds ?? drpRpoSeconds,
      days_since_last_drill: overrides.drpMaxDaysBetweenDrills ?? drpDaysSinceLastDrill
    },
    oci_registry: {
      cosign_verification: overrides.registryCosignVerification ?? registryCosignVerification
    },
    endpoint_mdm: {
      mdm_managed: overrides.endpointMdmManaged ?? endpointMdmManaged,
      pki_enrollment_protocol: overrides.endpointPkiProtocol ?? endpointPkiProtocol,
      verified_boot_enforced: overrides.endpointVerifiedBoot ?? endpointVerifiedBoot,
      local_encryption_mode: overrides.endpointLocalEncryptionMode ?? endpointLocalEncryptionMode,
      app_sandboxing_mode: overrides.endpointAppSandboxingMode ?? endpointAppSandboxingMode,
      ota_signed_ab_required: overrides.endpointOtaSignedAb ?? endpointOtaSignedAb
    },
    telecom_oss_smdp: {
      esim_sas_sm_certified: overrides.esimSasSmCertified ?? esimSasSmCertified,
      esim_four_eyes_approval: overrides.esimFourEyesApproval ?? esimFourEyesApproval,
      oss_nrm_standard: overrides.ossNrmStandard ?? ossNrmStandard,
      smo_hitl_approval: overrides.smoHitlApproval ?? smoHitlApproval,
      cmdb_sync_enabled: overrides.cmdbSyncEnabled ?? cmdbSyncEnabled,
      non_invasive_probes: overrides.serviceAssuranceProbesNonInvasive ?? nonInvasiveProbes,
      non3gpp_ipsec_enforced: overrides.non3gppIpsecEnforced ?? non3gppIpsecEnforced,
      slice_isolation_enforced: overrides.core5gSliceIsolation ?? sliceIsolationEnforced,
      embms_authenticated: overrides.embmsAuthenticated ?? embmsAuthenticated,
      pqc_hybrid_agility: overrides.pqcHybridAgility ?? pqcHybridAgility
    }
  };
  const sylvaTwinReport = runSylvaDigitalTwinMatrix({
    components: activeCatalog,
    overlay: prodOverlay,
    catalogs: DEFAULT_VALUE_CATALOGS,
    hydratedPowerFeeds: powerFeeds,
    sylvaValues: sylvaWorkloadClusterValues,
    governance: {
      mode: overrides.twinArbitrationMode || 'proposal',
      mandatedProfileId: overrides.twinMandatedProfileId
    }
  });

  return {
    nautobot_planned_devices: nautobotDevices,
    k8s_manifests: k8sManifests,
    sylva_workload_cluster_values: sylvaWorkloadClusterValues,
    security_zones: securityZones,
    environments,
    power_feeds: powerFeeds,
    coveredDomains: Array.from(coveredDomains),
    reconciliation_graph: reconciliationGraph,
    trust_chain: trustChain,
    extended_domains: extendedDomains,
    resolved_components: resolvedComponents,
    resolved_components_by_dc: resolvedComponentsByDc,
    component_lint_issues: componentLintIssues,
    reference_graph: referenceGraph,
    dangling_references: danglingReferences,
    satisfied_clauses: satisfiedClauses,
    evaluated_triplets: evaluatedTriplets,
    sylva_twin_report: sylvaTwinReport
  };
}

/**
 * Évalue formellement l'inventaire LLD hydraté du sujet face à la politique Rego multi-axes
 * (`edp/policies/multi_axis_refinement.rego`) et aux projections `data.ontology` compilées.
 */
export async function evaluateMultiAxisOracle(
  hydratedInventory: MultiAxisHydratedInventory,
  bindings: Array<OntologyBindingItem & { source?: string; ratificationStatus?: string }>,
  catalog: OntologyCatalog,
  options?: {
    source?: OracleVerdictSource;
    hasRealInventory?: boolean;
    allRatified?: boolean;
    ontologyRevision?: string;
    now?: Date;
  }
): Promise<MultiAxisOracleEvaluationResult> {
  const compiled = compileOntologyProjections(bindings, catalog);
  const policyPath = resolve(process.cwd(), 'edp/policies/multi_axis_refinement.rego');
  const source = inferOracleVerdictSource(bindings, options);
  const evaluatedAt = (options?.now ?? new Date()).toISOString();
  const ontologyRevision =
    options?.ontologyRevision ?? catalog.catalog_version ?? compiled.fingerprint.slice(0, 12);

  const opaRes = await runOpaEval<{
    verdict: 'compliant' | 'violated';
    violations: MultiAxisOracleViolation[];
    violation_messages: string[];
    evaluated_axes_count: number;
  }>({
    query: 'data.archinex.edp.multiaxis.evaluation',
    policyFiles: [policyPath],
    data: { ontology: compiled.ontology },
    input: hydratedInventory
  });

  if (opaRes.status === 'pass' && opaRes.output) {
    const violations = Array.isArray(opaRes.output.violations) ? opaRes.output.violations : [];
    const violationMessages = Array.isArray(opaRes.output.violation_messages)
      ? opaRes.output.violation_messages
      : violations.map((v) => v.message);

    return {
      verdict: violations.length === 0 ? 'compliant' : 'violated',
      source,
      evaluatedAt,
      ontologyRevision,
      violations,
      violationMessages,
      evaluatedAxesCount: opaRes.output.evaluated_axes_count ?? Object.keys(compiled.ontology).length,
      ontologyFingerprint: compiled.fingerprint,
      durationMs: opaRes.durationMs
    };
  }

  return {
    verdict: 'violated',
    source,
    evaluatedAt,
    ontologyRevision,
    violations: [
      {
        rule: 'data.archinex.edp.multiaxis.opa_runtime_error',
        axis: 'system',
        message: opaRes.error || 'Échec d’exécution du binaire OPA.'
      }
    ],
    violationMessages: [opaRes.error || 'Échec d’exécution du binaire OPA.'],
    evaluatedAxesCount: Object.keys(compiled.ontology).length,
    ontologyFingerprint: compiled.fingerprint,
    durationMs: opaRes.durationMs
  };
}

/**
 * Variante asynchrone de `decomposeIntentionClauses` exploitant le comparateur cosinus
 * sur embeddings lorsque un encodeur réel est configuré.
 */
export async function decomposeIntentionClausesAsync(
  input: SubjectRefinementInput,
  catalog: OntologyCatalog,
  boundLeafUrns: Set<string>,
  encoderOverride?: Encoder
): Promise<ClauseCoverageItem[]> {
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (!encoder) {
    return decomposeIntentionClauses(input, catalog, boundLeafUrns);
  }

  const leafCandidates = Object.values(catalog.entities)
    .filter((e) => e.kind === 'leaf')
    .map((leaf) => ({
      item: leaf,
      text: `${leaf.title || leaf.urn}. ${leaf.description || ''} ${(leaf.keywords || []).join(', ')}`
    }));

  const rawText = [
    ...(input.structuredFacts || []).map((f) => f.statement || ''),
    input.decisionText || '',
    input.detailedSpec || '',
    input.problem || ''
  ]
    .filter(Boolean)
    .join('. ');

  const segments = rawText
    .split(/(?:[.;•\n]|\bavec\b|\bet\b|\bainsi que\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);

  const semanticLeafBySegment = new Map<string, OntologyEntity>();
  for (const seg of segments) {
    const matches = await matchEntitiesSemantically(seg, leafCandidates, {
      encoder,
      threshold: 0.70,
      topK: 1
    });
    if (matches.length > 0) {
      semanticLeafBySegment.set(seg, matches[0].item);
    }
  }

  return decomposeIntentionClauses(input, catalog, boundLeafUrns, semanticLeafBySegment);
}

/**
 * Variante asynchrone de `computeRefinementCoverage` enrichissant l'auto-liaison ontologique
 * par similarité cosinus sur embeddings lorsque un encodeur réel est configuré.
 */
export async function computeRefinementCoverageAsync(
  input: SubjectRefinementInput,
  catalog: OntologyCatalog,
  encoderOverride?: Encoder
): Promise<RefinementCoverageReport> {
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (!encoder) {
    return computeRefinementCoverage(input, catalog);
  }

  const excluded = new Set(input.excludedLeafUrns || []);
  const combinedText = [
    input.title || '',
    input.problem || '',
    input.decisionText || '',
    input.detailedSpec || '',
    (input.structuredFacts || []).map((f) => f.statement).join(' ')
  ]
    .filter(Boolean)
    .join(' ');

  const leafCandidates = Object.values(catalog.entities)
    .filter((e) => e.kind === 'leaf' && !excluded.has(e.urn))
    .map((leaf) => ({
      item: leaf,
      text: `${leaf.title || leaf.urn}. ${leaf.description || ''} ${(leaf.keywords || []).join(', ')}`
    }));

  const semanticMatches = await matchEntitiesSemantically(combinedText, leafCandidates, {
    encoder,
    threshold: 0.75,
    topK: 8
  });

  const existingBindings = input.explicitBindings || [];
  const existingUrns = new Set<string>(existingBindings.map((b) => b.urn));
  const mergedBindings: OntologyBindingItem[] = [...existingBindings];
  for (const m of semanticMatches) {
    if (!existingUrns.has(m.item.urn)) {
      existingUrns.add(m.item.urn);
      mergedBindings.push({
        urn: m.item.urn,
        revision: m.item.revision ?? 1
      });
    }
  }

  return computeRefinementCoverage(
    {
      ...input,
      explicitBindings: mergedBindings
    },
    catalog
  );
}
