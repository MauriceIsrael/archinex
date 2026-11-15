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
  DEFAULT_VALUE_CATALOGS,
  instantiateCatalogFromOntologyBindings,
  lintBaseComponentNoHardcodedEnv,
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

export type AxisCoverageStatus = 'covered_executable' | 'covered_no_oracle' | 'missing_refinement';
export type BindingOrigin = 'explicit' | 'strong_link' | 'default_proposed' | 'none';
export type DecisionSlotStatus =
  | 'open'
  | 'default_proposed'
  | 'bound_unverified'
  | 'bound_verified'
  | 'waived';

export interface CandidateLeafSummary {
  urn: string;
  title: string;
  domain: string;
  revision: number | string;
  oracleRules: string[];
  projections: Record<string, unknown>;
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
  autoBindFromText?: boolean;
  selectedConceptUrn?: string;
  isNovelSubject?: boolean;
  emergentCapability?: EmergentCapabilityDetection;
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
  twinArbitrationMode?: TwinArbitrationMode;
  twinMandatedProfileId?: SylvaTopologyProfileId;
}

export interface ReconciliationObjectGraph {
  pivot_tenant_id: string;
  standards_applied: string[];
  partner_organizations: Array<Record<string, unknown>>;
  external_shadow_nodes: Array<Record<string, unknown>>;
  internal_mediation_nodes: Array<Record<string, unknown>>;
  ip_underlay_links: Array<Record<string, unknown>>;
  ipsec_tunnels: Array<Record<string, unknown>>;
  service_mediation_flows: Array<Record<string, unknown>>;
  sla_and_monitoring_contracts: Array<Record<string, unknown>>;
}

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
  };
  resolved_components?: ResolvedComponentInstance[];
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

export interface MultiAxisOracleEvaluationResult {
  verdict: 'compliant' | 'violated';
  violations: MultiAxisOracleViolation[];
  violationMessages: string[];
  evaluatedAxesCount: number;
  ontologyFingerprint: string;
  durationMs: number;
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

function scoreEntityAgainstCorpus(entity: OntologyEntity, normalizedCorpus: string): number {
  const keywords = Array.isArray(entity.keywords) ? entity.keywords : [];
  let score = 0;
  for (const kw of keywords) {
    const normKw = normalizeText(String(kw));
    if (normKw && normalizedCorpus.includes(normKw)) {
      score += 2;
    }
  }
  const titleWords = normalizeText(entity.title || '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  for (const w of titleWords) {
    if (normalizedCorpus.includes(w)) {
      score += 1;
    }
  }
  return score;
}

function toCandidateSummary(entity: OntologyEntity): CandidateLeafSummary {
  return {
    urn: entity.urn,
    title: entity.title || entity.urn,
    domain: entity.domain || 'general',
    revision: entity.revision ?? 1,
    oracleRules: Array.isArray(entity.oracle_rules) ? (entity.oracle_rules as string[]) : [],
    projections: (entity.projections as Record<string, unknown>) || {}
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

  return scored.slice(0, 1);
}

/**
 * Décompose les faits structurés K18 et l'énoncé de décision / spécification L4 en clauses d'intention atomiques
 * et vérifie leur ancrage sur les feuilles de l'ontologie.
 */
export function decomposeIntentionClauses(
  input: SubjectRefinementInput,
  catalog: OntologyCatalog,
  boundLeafUrns: Set<string>
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

    // 2. Repli heuristique par mots-clés si aucun lien fort formel n'a été trouvé
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

function collectInstantiatedComponents(
  subjectUrns: string[],
  catalog: OntologyCatalog
): string[] {
  const names = new Set<string>();
  const subjectSet = new Set(subjectUrns);

  for (const urn of subjectUrns) {
    const entity = catalog.entities[urn];
    if (entity?.instantiated_component) {
      names.add(String(entity.instantiated_component).replace(/^urn:archinex:component:/, ''));
    }
    const emergentNew = /^urn:archinex:ontology:application:emergent:new_([a-z0-9_-]+)$/i.exec(urn);
    if (emergentNew) {
      names.add(emergentNew[1].replace(/_/g, '-').toLowerCase());
    }
    const emergentAlloc = /^urn:archinex:ontology:application:emergent:allocate_([a-z0-9_-]+)$/i.exec(urn);
    if (emergentAlloc) {
      names.add(emergentAlloc[1].replace(/_/g, '-').toLowerCase());
    }
  }

  for (const triplet of catalog.triplets || []) {
    if (triplet.predicate === 'instantiates_component' && subjectSet.has(triplet.subject)) {
      names.add(triplet.object.replace(/^urn:archinex:component:/, ''));
    }
  }

  return Array.from(names).sort();
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
  const boundLeafUrns = new Set<string>(explicitBindingSet);
  const shouldAutoBind = input.autoBindFromText ?? explicitBindingSet.size === 0;
  const isAutoConceptMode = !input.selectedConceptUrn || input.selectedConceptUrn === 'AUTO';

  // 1. Collecte des axes de raffinement obligatoires (axes applicatifs contextuels + triplets `requires_aspect` des concepts retenus)
  const mandatoryAxisMap = new Map<string, OntologyTriplet>();

  if (isAutoConceptMode || Array.from(explicitBindingSet).some((u) => u.includes(':application:'))) {
    const appAxes = Object.values(catalog.entities).filter(
      (e) =>
        e.kind === 'axis' &&
        (e.domain === 'application' || e.togaf_domain === 'application-business')
    );

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
        if (!leaf || !isAutoConceptMode) continue;
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

    // Inclure également tout axe applicatif prérequis (ex: gis_location_fusion -> gis_tile_engine)
    if (matchedAppAxisUrns.size > 0) {
      const appPrereqs = computeTransitivePrerequisiteAxes(matchedAppAxisUrns, catalog);
      for (const prereqUrn of appPrereqs.keys()) {
        const prereqEntity = catalog.entities[prereqUrn];
        if (
          prereqEntity?.kind === 'axis' &&
          (prereqEntity.domain === 'application' || prereqEntity.togaf_domain === 'application-business')
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

  const axes: AxisCoverageItem[] = [];

  // 1bis. Détection d'un besoin fonctionnel inédit / émergent (ex: IoT / LoRaWAN / MQTT ou sujet `isNovelSubject`)
  const hasExplicitEmergentBinding = Array.from(explicitBindingSet).some((u) =>
    u.startsWith('urn:archinex:ontology:application:emergent:')
  );
  const detectedEmergent =
    input.emergentCapability ??
    (isAutoConceptMode || hasExplicitEmergentBinding
      ? detectEmergentCapabilityNeed(rawCombinedText, undefined, {
          isNovelSubject: input.isNovelSubject,
          fallbackTitle: input.title
        })
      : undefined);

  if (detectedEmergent || hasExplicitEmergentBinding) {
    const emergent = detectedEmergent ?? {
      isEmergent: true,
      capabilityId: 'emergent-custom-capability',
      title: input.title || 'Capacité Fonctionnelle Émergente',
      togafDomain: 'application-business' as TogafDomainId,
      documentEngineLayer: 'application' as const,
      suggestedComponentName: 'custom-domain-service',
      suggestedTier: 'application' as const,
      candidateExistingComponents: ['gis-server', 'ptt-server', 'core-network', 'db-ha'],
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
        }
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
        }
      }))
    ];

    const emergentBound: CandidateLeafSummary[] = [];
    let emergentHasExplicit = false;
    for (const cand of emergentCandidates) {
      if (explicitBindingSet.has(cand.urn)) {
        emergentBound.push(cand);
        boundLeafUrns.add(cand.urn);
        emergentHasExplicit = true;
      }
    }

    if (!emergentHasExplicit && shouldAutoBind && emergentCandidates.length > 0) {
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

    axes.push({
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
      instantiatedComponents: collectInstantiatedComponents(
        [emergentAxisUrn, ...emergentBound.map((l) => l.urn)],
        catalog
      )
    });
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

    for (const implT of implTriplets) {
      const leafEntity = catalog.entities[implT.object];
      if (!leafEntity) continue;

      const summary = toCandidateSummary(leafEntity);
      candidateLeaves.push(summary);

      const isExplicitlyBound = explicitBindingSet.has(leafEntity.urn);
      const hasStrongLinkInCorpus =
        shouldAutoBind && corpusCandidateIds.length > 0
          ? Boolean(findStrongLinkForLeaf(leafEntity, corpusCandidateIds, catalog))
          : false;
      const semanticScore = shouldAutoBind ? scoreEntityAgainstCorpus(leafEntity, corpus) : 0;
      const isDefaultStandard = shouldAutoBind && leafEntity.is_default_standard === true;

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
      } else if (hasStrongLinkInCorpus || semanticScore > 0 || isDefaultStandard) {
        boundLeafUrns.add(leafEntity.urn);
        boundLeaves.push(summary);
        if (hasStrongLinkInCorpus) {
          hasStrongLinkBinding = true;
        }
      }
    }

    if (isApplicationAxis && !hasExplicitBinding && shouldAutoBind && boundLeaves.length === 0) {
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
    if (shouldAutoBind && boundLeaves.length === 0 && candidateLeaves.length > 0) {
      const defaultCandidate =
        candidateLeaves.find((c) => c.oracleRules.length > 0) || candidateLeaves[0];
      boundLeafUrns.add(defaultCandidate.urn);
      boundLeaves.push(defaultCandidate);
    }

    const oracleRulesCount = boundLeaves.reduce((acc, l) => acc + l.oracleRules.length, 0);
    const uniqueAxisOracleRules = Array.from(new Set(boundLeaves.flatMap((l) => l.oracleRules)));
    const executableOracleRules = uniqueAxisOracleRules.filter((r) => implementedRegoRules.has(r));
    const phantomOracleRules = uniqueAxisOracleRules.filter((r) => !implementedRegoRules.has(r));

    const bindingOrigin: BindingOrigin =
      boundLeaves.length === 0
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
    if (boundLeaves.length > 0) {
      status = oracleRulesCount > 0 ? 'covered_executable' : 'covered_no_oracle';
    }

    axes.push({
      axisUrn,
      axisTitle: axisEntity?.title || axisUrn,
      domain: axisEntity?.domain || 'architecture',
      togafDomain: resolveTogafDomain(axisEntity?.togaf_domain || axisEntity?.domain),
      rationale: reqTriplet.rationale || 'Axe obligatoire requis par le concept parent.',
      status,
      bindingOrigin,
      requiresRatification,
      boundLeaves,
      candidateLeaves,
      oracleRulesCount,
      executableOracleRules,
      phantomOracleRules,
      hasPhantomOracle: phantomOracleRules.length > 0,
      instantiatedComponents: collectInstantiatedComponents(
        [axisUrn, ...boundLeaves.map((l) => l.urn)],
        catalog
      )
    });
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
    if (mandatoryAxisMap.has(targetAxisUrn)) continue;
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
      const summary = toCandidateSummary(leafEntity);
      candidateLeaves.push(summary);

      const isExplicitlyBound = explicitBindingSet.has(leafEntity.urn);
      const hasStrongLinkInCorpus =
        shouldAutoBind && corpusCandidateIds.length > 0
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

    let slotOrigin: BindingOrigin = 'none';
    if (slotBoundLeaves.length > 0) {
      slotOrigin = hasExplicit ? 'explicit' : hasStrongLink ? 'strong_link' : 'default_proposed';
    } else if (shouldAutoBind && candidateLeaves.length > 0) {
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
        catalog
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
  const cleanSubj = subjectId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const hostname = `srv-${cleanSubj.slice(-12) || 'edge'}-01`;

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
          : `srv-${cleanSubj.slice(-12) || 'edge'}-0${idx + 1}`;
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

      nautobotDevices.push({
        name: nodeHostname,
        status: deviceStatus,
        device_type: nodeType,
        oob_ip: nodeOobIp,
        role: nodeRole,
        cluster_pool: prof.clusterPool,
        dataplane_profile: prof.dataplaneProfile,
        interfaces,
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
            'sylva.org/workload-cluster': `wc-${cleanSubj.slice(-12) || 'lot1'}`,
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

  const satisfiedClauses = Array.from(satisfiedClausesSet).sort();
  const evaluatedTriplets = Array.from(evaluatedTripletsSet).sort();

  const sylvaWorkloadClusterValues: Record<string, unknown> = {
    apiVersion: 'workloadclusteroperator.sylva/v1alpha1',
    kind: 'SylvaWorkloadCluster',
    metadata: {
      name: `wc-${cleanSubj.slice(-12) || 'lot1'}`,
      namespace: 'sylva-workload-clusters',
      annotations: {
        'archinex.io/gitops-target': `workload-clusters/wc-${cleanSubj.slice(-12) || 'lot1'}`,
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

  const pivotTenantId = 'org-lot3-mno';
  const mandatoryMediationHops = overrides.s6aDirectBypassDea
    ? ['secgw-lot1-01']
    : ['secgw-lot1-01', 'dea-lot1-01'];

  const reconciliationGraph: ReconciliationObjectGraph = {
    pivot_tenant_id: pivotTenantId,
    standards_applied: [
      '3GPP TS 28.620 / TS 28.541 NRM (ExternalFunction & EP_RP)',
      'TM Forum ODA/SID GB922 (Party -> Resource -> Service -> SLA)',
      'Nautobot SSoT / DiffSync + Tenancy & VPN Models',
      'LF Europe Sylva & FluxCD / Kustomize GitOps'
    ],
    partner_organizations: overrides.orphanPartnerTenant
      ? []
      : [
          {
            id: pivotTenantId,
            nautobot_model: 'tenancy.Tenant',
            tmf_sid_class: 'PartyRole / PartnerOrganization',
            name: 'Opérateur Tiers Lot 3 (MNO Cœur Mobile)',
            demarcation_point: 'MMR-Meet-Me-Room-Lot1',
            noc_contact: 'noc@lot3-operator.fr'
          },
          {
            id: 'org-lot2-ran',
            nautobot_model: 'tenancy.Tenant',
            tmf_sid_class: 'PartyRole / PartnerOrganization',
            name: 'Opérateur Tiers Lot 2 (RAN & Cellules Mobiles Intermittentes)',
            demarcation_point: 'SecGW-RAN-Lot1',
            noc_contact: 'noc@lot2-ran.fr'
          }
        ],
    external_shadow_nodes: [
      {
        id: 'ext-mme-lot3-01',
        nrm_3gpp_class: 'ExternalMMEFunction',
        nautobot_model: 'dcim.Device (status=external-shadow)',
        tenant_ref: pivotTenantId,
        zone: 'ZONE-PARTNER-LOT3-UNTRUSTED',
        loopback_ip: '172.16.30.10',
        managed_by_lot1: false
      },
      {
        id: 'ext-ran-cell-mobile-01',
        nrm_3gpp_class: 'ExternalENodeBFunction',
        nautobot_model: 'dcim.Device (status=external-shadow)',
        tenant_ref: 'org-lot2-ran',
        zone: 'ZONE-RAN-MOBILE-UNTRUSTED',
        intermittent_operation: true,
        managed_by_lot1: false
      }
    ],
    internal_mediation_nodes: [
      {
        id: 'secgw-lot1-01',
        nrm_3gpp_class: 'SecurityGatewayFunction',
        nautobot_model: 'dcim.Device / virtualization.VirtualMachine',
        role: 'Terminaison IPsec ESP Lot 1 (SecGW-Lot1)',
        zone: 'ZONE-DMZ-INTERCO-LOT1',
        ha_mode: 'active-standby-vrrp-bfd',
        peer_shadow_ref: 'ext-mme-lot3-01'
      },
      {
        id: 'dea-lot1-01',
        nrm_3gpp_class: 'DiameterEdgeAgentFunction',
        nautobot_model: 'dcim.Device / k8s.CNF',
        role: 'Médiation & Filtrage S6a Diameter (DEA-Lot1)',
        zone: 'ZONE-MEDIATION-SIGNALING-LOT1',
        topology_hiding: true,
        imsi_pseudonymization: true,
        upstream_secgw_ref: 'secgw-lot1-01'
      },
      {
        id: 'hss-lot1-01',
        nrm_3gpp_class: 'HSSFunction',
        nautobot_model: 'dcim.Device / k8s.CNF',
        role: 'Serveur Abonnés Cœur Lot 1 (HSS-Lot1)',
        zone: 'ZONE-CORE-HSS-RESTRICTED',
        direct_external_access: false,
        allowed_upstream_ref: 'dea-lot1-01'
      }
    ],
    ip_underlay_links: [
      {
        id: 'link-ip-lot3-secgw1',
        nrm_3gpp_class: 'EP_RP (Underlay IP Link)',
        nautobot_model: 'circuits.Circuit + ipam.Prefix',
        tenant_ref: pivotTenantId,
        endpoint_a: 'ext-mme-lot3-01',
        endpoint_z: 'secgw-lot1-01',
        subnet: '100.64.14.0/30',
        vlan_id: 1403,
        bfd_fast_failover: true
      }
    ],
    ipsec_tunnels: [
      {
        id: 'tun-ipsec-esp-lot3-secgw1',
        nautobot_model: 'vpn.Tunnel (IPsec ESP)',
        tenant_ref: pivotTenantId,
        underlay_link_ref: 'link-ip-lot3-secgw1',
        termination_a: 'ext-mme-lot3-01',
        termination_z: 'secgw-lot1-01',
        protocol: 'IPsec-ESP-IKEv2',
        cipher_suite: 'AES-256-GCM',
        pfs_dh_group: 'DH-20-ECP384',
        dpd_timeout_sec: 10
      }
    ],
    service_mediation_flows: [
      {
        id: 'flow-s6a-lot3-to-hss1',
        nrm_3gpp_class: 'EP_S6a (Diameter S6a Reference Point)',
        tenant_ref: pivotTenantId,
        app_protocol: 'Diameter-S6a-SCTP-3868',
        source_shadow_ref: 'ext-mme-lot3-01',
        ipsec_tunnel_ref: 'tun-ipsec-esp-lot3-secgw1',
        mandatory_mediation_hops: mandatoryMediationHops,
        destination_core_ref: 'hss-lot1-01',
        direct_bypass_allowed: Boolean(overrides.s6aDirectBypassDea),
        encrypted_end_to_end: true
      }
    ],
    sla_and_monitoring_contracts: overrides.orphanPartnerTenant
      ? []
      : [
          {
            id: 'sla-lot3-hosting-s6a',
            tmf_sid_class: 'ServiceLevelAgreement (GB922)',
            tenant_ref: pivotTenantId,
            covered_flow_ref: 'flow-s6a-lot3-to-hss1',
            covered_tunnel_ref: 'tun-ipsec-esp-lot3-secgw1',
            colocation_power_sla: '99.99% Dual-Feed 2N (Responsabilité Lot 1)',
            network_service_sla_boundary: 'Point de démarcation SecGW-Lot1 (Tiers Lot 3 responsable en amont)',
            requirement_ref: 'REQ-Lot1-1343'
          },
          {
            id: 'probe-noc-s6a-lot3',
            tmf_sid_class: 'ResourceMonitorProbe (Prometheus / Alertmanager NOC)',
            tenant_ref: pivotTenantId,
            covered_flow_ref: 'flow-s6a-lot3-to-hss1',
            monitored_targets: [
              'link-ip-lot3-secgw1',
              'tun-ipsec-esp-lot3-secgw1',
              'secgw-lot1-01',
              'dea-lot1-01'
            ],
            suppress_intermittent_mobile_cell_alarms: true,
            requirement_ref: 'REQ-Lot1-1274'
          }
        ]
  };

  const prodOverlay = DEFAULT_ENVIRONMENT_OVERLAYS[0];
  const primaryDc = prodOverlay.spec.datacenters[0] || 'dc1';
  const componentUrnMap: Record<string, string> = {};
  for (const t of catalog.triplets || []) {
    if (t.predicate === 'instantiates_component') {
      componentUrnMap[t.subject] = t.object.replace(/^urn:archinex:component:/, '');
    }
  }
  const activeCatalog = instantiateCatalogFromOntologyBindings(
    bindings.map((b) => b.urn),
    DEFAULT_COMPONENT_CATALOG,
    componentUrnMap
  );
  const componentLintIssues = activeCatalog.flatMap((comp) => [
    ...lintBaseComponentNoHardcodedEnv(comp),
    ...validateComponentAgainstCatalogs(comp, DEFAULT_VALUE_CATALOGS)
  ]);
  const resolvedComponents = activeCatalog.filter((c) => !c.metadata.external).map(
    (comp) => resolveComponentInstance(comp, prodOverlay, primaryDc, DEFAULT_VALUE_CATALOGS)
  );
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
  bindings: OntologyBindingItem[],
  catalog: OntologyCatalog
): Promise<MultiAxisOracleEvaluationResult> {
  const compiled = compileOntologyProjections(bindings, catalog);
  const policyPath = resolve(process.cwd(), 'edp/policies/multi_axis_refinement.rego');

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
      violations,
      violationMessages,
      evaluatedAxesCount: opaRes.output.evaluated_axes_count ?? Object.keys(compiled.ontology).length,
      ontologyFingerprint: compiled.fingerprint,
      durationMs: opaRes.durationMs
    };
  }

  return {
    verdict: 'violated',
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
