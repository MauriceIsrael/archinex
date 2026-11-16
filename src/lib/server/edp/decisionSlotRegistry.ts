import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_COMPONENT_CATALOG,
  instantiateCatalogFromOntologyBindings,
  type LogicalComponent
} from '../../domain/edp/componentCatalog.js';
import {
  verifyCatalogDanglingReferences,
  type CatalogDanglingReferenceReport
} from '../../domain/edp/refResolver.js';
import {
  TOGAF_REFERENCE_BUILDING_BLOCKS,
  resolveTogafDomain,
  scanProjectArchitecturalBlindSpots,
  type BlindSpotScanReport,
  type DocumentEngineLayer,
  type ReferenceDecisionType,
  type TogafDomainId
} from '../../domain/edp/togafTaxonomy.js';
import type { CommodityDecisionSlotSummary } from '../ingest/arckitRequirementsPipeline.js';
import {
  loadProjectComponentCatalog,
  saveProjectComponentCatalog
} from './componentCatalogRepository.js';
import {
  AUTHORIZED_VALIDATOR_ROLES,
  InvariantViolationError,
  UnauthorizedRoleError
} from './edpRepository.js';
import {
  loadOntologyCatalog,
  queryOntologyTriplets,
  type OntologyBindingItem,
  type OntologyCatalog
} from './ontologyClient.js';
import {
  composeMultiAxisHydration,
  computeRefinementCoverage,
  evaluateMultiAxisOracle,
  loadImplementedRegoRuleNames,
  type ConscientiousCoverageMetrics,
  type DecisionSlotItem,
  type LldHydrationOverrides,
  type RefinementCoverageReport,
  type SubjectRefinementInput
} from './refinementCoverage.js';

const STORAGE_DIR = resolve(process.cwd(), '.archinex-catalogs');

const AUTHORIZED_SLOT_ROLES = new Set<string>([
  ...AUTHORIZED_VALIDATOR_ROLES,
  'lead_architect',
  'security_architect',
  'infra_expert_architect',
  'domain_architect',
  'data_architect'
]);

export interface ProjectCompletenessInput {
  projectId: string;
  projectTitle?: string;
  subjectId?: string;
  title?: string;
  problem?: string;
  decisionText?: string;
  detailedSpec?: string;
  structuredFacts?: SubjectRefinementInput['structuredFacts'];
  explicitBindings?: OntologyBindingItem[];
  selectedConceptUrn?: string;
  autoBindFromText?: boolean;
  commoditySlots?: CommodityDecisionSlotSummary[];
  lldOverrides?: LldHydrationOverrides;
  activeTogafDomains?: TogafDomainId[];
}

export interface ProjectDecisionSlotEntry extends DecisionSlotItem {
  decisionType: ReferenceDecisionType;
  documentEngineLayer: DocumentEngineLayer;
  ratifiedBy?: string;
  ratifiedRole?: string;
  ratifiedAt?: string;
  rationale?: string;
  promotedToSubjectId?: string;
  coveredRequirementRefs: string[];
}

export interface BatchRatificationInput {
  projectId: string;
  actorId: string;
  actorRole: string;
  rationale: string;
  slotIds?: string[];
  togafDomains?: TogafDomainId[];
  leafOverrides?: Record<string, string>;
}

export interface BatchRatificationReceipt {
  receiptId: string;
  projectId: string;
  actorId: string;
  actorRole: string;
  rationale: string;
  ratifiedAt: string;
  ratifiedSlotIds: string[];
  boundLeaves: OntologyBindingItem[];
  instantiatedComponents: string[];
}

export interface SlotPromotionInput {
  projectId: string;
  slotId: string;
  actorId: string;
  actorRole: string;
  reason: string;
  subjectTitle?: string;
}

export interface PromotedSubjectDescriptor {
  subjectId: string;
  slotId: string;
  axisUrn: string;
  title: string;
  togafDomain: TogafDomainId;
  promotedBy: string;
  promotedRole: string;
  promotedAt: string;
  reason: string;
  candidateOptions: Array<{ urn: string; title: string; domain: string }>;
}

export interface ArchitectureLockManifest {
  version: '1.0';
  projectId: string;
  projectTitle: string;
  sealedAt: string;
  sealedBy: string;
  sealedByRole: string;
  ontologyFingerprint: string;
  oracleVerdict: 'compliant';
  evaluatedAxesCount: number;
  phantomOracleCount: number;
  boundBindings: OntologyBindingItem[];
  ratifiedSlotIds: string[];
  promotedSubjects: PromotedSubjectDescriptor[];
  instantiatedComponents: string[];
  danglingReferences: CatalogDanglingReferenceReport;
  blindSpotCoveragePercent: number;
  integritySha256: string;
}

export type ComponentLockStatus =
  | 'locked'
  | 'emergent_locked'
  | 'default_proposed'
  | 'baseline';

export type SylvaTransversePillarId = 'security' | 'observability' | 'configuration';

export type ArchitectureComponentLayer =
  | 'workloads-apps'
  | 'workloads-core'
  | 'caas-infra'
  | 'transverse-security'
  | 'transverse-observability'
  | 'transverse-config';

export interface ComponentTransverseBindings {
  security: {
    covered: boolean;
    vaultMount?: string;
    autoRenewCerts: number;
    firewallPolicy?: string;
    securityDeps: string[];
  };
  observability: {
    covered: boolean;
    hasEventsNic: boolean;
    eventsVrf?: string;
    siemLinked: boolean;
  };
  configuration: {
    covered: boolean;
    hasAdminNic: boolean;
    helmCharts: string[];
    paramRefs: string[];
    placementPools: string[];
  };
}

export interface LiveLockedComponentEntry {
  name: string;
  displayName: string;
  functionalDomain: string;
  editor: string;
  tenant: string;
  external: boolean;
  layer: ArchitectureComponentLayer;
  transverseRole?: SylvaTransversePillarId;
  transverseBindings: ComponentTransverseBindings;
  lockStatus: ComponentLockStatus;
  isEmergent: boolean;
  sourceSlotIds: string[];
  sourceAxisTitles: string[];
  sourceLeafUrns: string[];
  coveredRequirementRefs: string[];
  ratifiedBy?: string;
  ratifiedAt?: string;
  dependsOn: string[];
  outboundTargets: Array<{
    target: string;
    label: string;
    kind: 'firewall' | 'contract' | 'dependency';
  }>;
  nicsCount: number;
  nicClasses: string[];
  vrfNames: string[];
  storageSvms: string[];
}

export interface TransversePillarSummary {
  id: SylvaTransversePillarId;
  title: string;
  subtitle: string;
  nicPlane: string;
  dedicatedComponents: string[];
  governingSlotIds: string[];
  lockedSlotsCount: number;
  totalSlotsCount: number;
  coveredWorkloadsCount: number;
  totalWorkloadsCount: number;
}

export interface LiveArchitectureLockSnapshot {
  version: '1.0-live';
  projectId: string;
  projectTitle: string;
  generatedAt: string;
  lockState: 'sealed' | 'ready_to_seal' | 'partial_live_lock';
  liveIntegritySha256: string;
  sealedManifest: ArchitectureLockManifest | null;
  summary: {
    totalSlots: number;
    lockedSlotsCount: number;
    defaultProposedSlotsCount: number;
    openSlotsCount: number;
    completionPercent: number;
    totalComponentsCount: number;
    lockedComponentsCount: number;
    proposedComponentsCount: number;
    emergentComponentsCount: number;
  };
  transversePillars: TransversePillarSummary[];
  sylvaRuntimePlanes: {
    pools: string[];
    storageBackends: string[];
    datacenters: string[];
  };
  lockedBindings: OntologyBindingItem[];
  proposedBindings: OntologyBindingItem[];
  components: LiveLockedComponentEntry[];
  slots: Array<{
    slotId: string;
    axisUrn: string;
    axisTitle: string;
    togafDomain: TogafDomainId;
    status: ProjectDecisionSlotEntry['status'];
    lockBadge: 'locked' | 'default_proposed' | 'open';
    boundLeafUrn?: string;
    boundLeafTitle?: string;
    candidateLeaves: Array<{ urn: string; title: string }>;
    instantiatedComponents: string[];
    coveredRequirementRefs: string[];
    ratifiedBy?: string;
    ratifiedAt?: string;
    rationale?: string;
  }>;
  lockBlockers: string[];
  mermaidLockedOnly: string;
  mermaidFullWithStatus: string;
}

export interface ProjectCompletenessLedger {
  projectId: string;
  projectTitle: string;
  generatedAt: string;
  slots: ProjectDecisionSlotEntry[];
  type1DeliberationQueue: ProjectDecisionSlotEntry[];
  type2RatificationQueue: ProjectDecisionSlotEntry[];
  promotedSubjects: PromotedSubjectDescriptor[];
  ratificationReceipts: BatchRatificationReceipt[];
  composedBindings: OntologyBindingItem[];
  instantiatedComponents: string[];
  activeCatalog: LogicalComponent[];
  danglingReferences: CatalogDanglingReferenceReport;
  blindSpots: BlindSpotScanReport;
  conscientiousMetrics: ConscientiousCoverageMetrics;
  dependencyIssues: RefinementCoverageReport['dependencyIssues'];
  readyForArchitectureLock: boolean;
  lockBlockers: string[];
  coverageReport: RefinementCoverageReport;
}

interface PersistedRatificationRecord {
  slotId: string;
  axisUrn: string;
  leafUrn: string;
  leafRevision: number | string;
  ratifiedBy: string;
  ratifiedRole: string;
  ratifiedAt: string;
  rationale: string;
}

interface PersistedProjectSlotState {
  projectId: string;
  ratifications: Record<string, PersistedRatificationRecord>;
  promotions: Record<string, PromotedSubjectDescriptor>;
  receipts: BatchRatificationReceipt[];
  lastCoverageInput?: Omit<ProjectCompletenessInput, 'projectId'>;
  updatedAt: string;
}

const slotStateCache = new Map<string, PersistedProjectSlotState>();
const lockCache = new Map<string, ArchitectureLockManifest>();
const touchedProjectIds = new Set<string>();

function sanitizeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getSlotStatePath(projectId: string): string {
  return resolve(STORAGE_DIR, `${sanitizeProjectId(projectId)}.slots.json`);
}

function getLockManifestPath(projectId: string): string {
  return resolve(STORAGE_DIR, `${sanitizeProjectId(projectId)}.architecture.lock.json`);
}

function getCatalogFilePath(projectId: string): string {
  return resolve(STORAGE_DIR, `${sanitizeProjectId(projectId)}.json`);
}

function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function createEmptyState(projectId: string): PersistedProjectSlotState {
  return {
    projectId,
    ratifications: {},
    promotions: {},
    receipts: [],
    updatedAt: new Date().toISOString()
  };
}

function loadProjectSlotState(projectId: string): PersistedProjectSlotState {
  const cached = slotStateCache.get(projectId);
  if (cached) return cached;

  const filePath = getSlotStatePath(projectId);
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<PersistedProjectSlotState>;
      const hydrated: PersistedProjectSlotState = {
        projectId,
        ratifications: parsed.ratifications || {},
        promotions: parsed.promotions || {},
        receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
        lastCoverageInput: parsed.lastCoverageInput,
        updatedAt: parsed.updatedAt || new Date().toISOString()
      };
      slotStateCache.set(projectId, hydrated);
      return hydrated;
    } catch {
      // État disque corrompu : repart d'un registre vierge
    }
  }

  const fresh = createEmptyState(projectId);
  slotStateCache.set(projectId, fresh);
  return fresh;
}

function saveProjectSlotState(projectId: string, state: PersistedProjectSlotState): void {
  ensureStorageDir();
  touchedProjectIds.add(projectId);
  state.updatedAt = new Date().toISOString();
  slotStateCache.set(projectId, state);
  writeFileSync(getSlotStatePath(projectId), JSON.stringify(state, null, 2), 'utf8');
}

function assertAuthorizedSlotActor(actorId: string, actorRole: string): void {
  if (!AUTHORIZED_SLOT_ROLES.has(actorRole)) {
    throw new UnauthorizedRoleError(
      `Rôle "${actorRole}" non habilité à ratifier ou sceller des emplacements de décision d'architecture.`
    );
  }
  if (!actorId || actorId.trim().length === 0) {
    throw new InvariantViolationError(
      'Identifiant d’acteur requis pour tracer une ratification ou un scellement.'
    );
  }
}

function resolveAxisMetadata(
  axisUrn: string,
  catalog: OntologyCatalog
): { decisionType: ReferenceDecisionType; documentEngineLayer: DocumentEngineLayer } {
  const refBlock = TOGAF_REFERENCE_BUILDING_BLOCKS.find((b) => b.axisUrn === axisUrn);
  const axisEntity = catalog.entities[axisUrn];

  const decisionType: ReferenceDecisionType =
    refBlock?.defaultDecisionType ||
    (axisEntity?.default_decision_type === 'type1_deliberate'
      ? 'type1_deliberate'
      : 'type2_default_ratify');

  const rawLayer = refBlock?.documentEngineLayer || axisEntity?.document_engine_layer;
  const documentEngineLayer: DocumentEngineLayer =
    rawLayer === 'context' ||
    rawLayer === 'application' ||
    rawLayer === 'component' ||
    rawLayer === 'infrastructure' ||
    rawLayer === 'iaas'
      ? rawLayer
      : 'component';

  return { decisionType, documentEngineLayer };
}

function buildComponentUrnMap(catalog: OntologyCatalog): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entity of Object.values(catalog.entities)) {
    if (typeof entity.instantiated_component === 'string' && entity.instantiated_component) {
      map[entity.urn] = entity.instantiated_component.replace(/^urn:archinex:component:/, '');
    }
  }
  for (const triplet of catalog.triplets || []) {
    if (triplet.predicate === 'instantiates_component') {
      map[triplet.subject] = triplet.object.replace(/^urn:archinex:component:/, '');
    }
  }
  return map;
}

function computeUnifiedConscientiousMetrics(
  slots: ProjectDecisionSlotEntry[],
  dependencyIssuesCount: number
): ConscientiousCoverageMetrics {
  const totalSlots = slots.length;
  const openSlots = slots.filter((s) => s.status === 'open').length;
  const defaultProposedSlots = slots.filter((s) => s.status === 'default_proposed').length;
  const boundUnverifiedSlots = slots.filter((s) => s.status === 'bound_unverified').length;
  const boundVerifiedSlots = slots.filter((s) => s.status === 'bound_verified').length;
  const waivedSlots = slots.filter((s) => s.status === 'waived').length;
  const ratifiedCount = boundVerifiedSlots + boundUnverifiedSlots + waivedSlots;
  const humanRatifiedRatio =
    totalSlots > 0 ? Math.round((ratifiedCount / totalSlots) * 1000) / 1000 : 0;
  const verifiedOracleRatio =
    totalSlots > 0 ? Math.round((boundVerifiedSlots / totalSlots) * 1000) / 1000 : 0;
  const phantomOracleCount = slots.reduce((acc, s) => acc + s.phantomOracleRules.length, 0);
  const transitivePrerequisitesCount = slots.filter((s) => s.isTransitivePrerequisite).length;
  const isConscientiouslyComplete =
    totalSlots > 0 &&
    openSlots === 0 &&
    defaultProposedSlots === 0 &&
    boundUnverifiedSlots === 0 &&
    phantomOracleCount === 0 &&
    dependencyIssuesCount === 0;

  return {
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
  };
}

function computeLockReadiness(
  metrics: ConscientiousCoverageMetrics,
  slots: ProjectDecisionSlotEntry[],
  dependencyIssuesCount: number,
  danglingReferences: CatalogDanglingReferenceReport
): { readyForArchitectureLock: boolean; lockBlockers: string[] } {
  const blockers: string[] = [];
  if (slots.length === 0) {
    blockers.push('Aucun emplacement de décision architectural recensé dans le registre.');
  }
  if (metrics.openSlots > 0) {
    blockers.push(
      `${metrics.openSlots} emplacement(s) de décision ouvert(s) sans aucune liaison ontologique.`
    );
  }
  if (metrics.defaultProposedSlots > 0) {
    blockers.push(
      `${metrics.defaultProposedSlots} proposition(s) par défaut attendent encore une ratification humaine explicite.`
    );
  }
  if (metrics.phantomOracleCount > 0) {
    blockers.push(
      `${metrics.phantomOracleCount} oracle(s) fantôme(s) déclaré(s) dans l'ontologie sans règle Rego associée.`
    );
  }
  if (dependencyIssuesCount > 0) {
    blockers.push(
      `${dependencyIssuesCount} dépendance(s) ou conflit(s) inter-axes non résolu(s).`
    );
  }
  if (!danglingReferences.valid) {
    blockers.push(
      `Catalogue logique incomplet : références pendantes détectées (${[
        ...danglingReferences.danglingFirewallGroups,
        ...danglingReferences.missingDependencies,
        ...(danglingReferences.missingVaultComponent ? ['vault-cluster'] : [])
      ].join(', ')}).`
    );
  }

  return {
    readyForArchitectureLock: blockers.length === 0,
    lockBlockers: blockers
  };
}

/**
 * Consolide l'état de complétude d'un projet : couverture ontologique, emplacements de commodités
 * issus du pipeline ArcKit, ratifications humaines enregistrées, promotions Type 1,
 * instanciation du catalogue logique, références pendantes et angles morts TOGAF.
 */
export async function buildProjectCompletenessLedger(
  input: ProjectCompletenessInput,
  catalog?: OntologyCatalog
): Promise<ProjectCompletenessLedger> {
  const resolvedCatalog = catalog ?? (await loadOntologyCatalog());
  const state = loadProjectSlotState(input.projectId);
  const implementedRegoRules = loadImplementedRegoRuleNames();

  const mergedInput: ProjectCompletenessInput = {
    ...(state.lastCoverageInput ?? {}),
    ...input
  };

  // Fusion déterministe des liaisons explicites + liaisons déjà ratifiées dans le registre projet
  const bindingMap = new Map<string, OntologyBindingItem>();
  for (const b of mergedInput.explicitBindings || []) {
    bindingMap.set(b.urn, b);
  }
  for (const rat of Object.values(state.ratifications)) {
    const promotion = state.promotions[rat.slotId];
    if (promotion && rat.ratifiedAt < promotion.promotedAt) {
      continue;
    }
    if (!bindingMap.has(rat.leafUrn)) {
      bindingMap.set(rat.leafUrn, { urn: rat.leafUrn, revision: rat.leafRevision });
    }
  }

  const coverageReport = computeRefinementCoverage(
    {
      subjectId: mergedInput.subjectId || mergedInput.projectId,
      title: mergedInput.title || mergedInput.projectTitle || mergedInput.projectId,
      problem: mergedInput.problem || '',
      decisionText: mergedInput.decisionText,
      detailedSpec: mergedInput.detailedSpec,
      structuredFacts: mergedInput.structuredFacts,
      explicitBindings: Array.from(bindingMap.values()),
      selectedConceptUrn: mergedInput.selectedConceptUrn || 'ALL',
      autoBindFromText: mergedInput.autoBindFromText ?? true
    },
    resolvedCatalog
  );

  const commodityByAxis = new Map<string, CommodityDecisionSlotSummary>();
  for (const cs of mergedInput.commoditySlots || []) {
    commodityByAxis.set(cs.axisUrn, cs);
  }

  const slots: ProjectDecisionSlotEntry[] = [];
  const seenAxisUrns = new Set<string>();

  for (const slot of coverageReport.decisionSlots || []) {
    seenAxisUrns.add(slot.axisUrn);
    const meta = resolveAxisMetadata(slot.axisUrn, resolvedCatalog);
    const rat =
      state.ratifications[slot.slotId] ||
      Object.values(state.ratifications).find((r) => r.axisUrn === slot.axisUrn);
    const promotion = state.promotions[slot.slotId];
    const matchingCommodity = commodityByAxis.get(slot.axisUrn);

    const decisionType: ReferenceDecisionType = promotion
      ? 'type1_deliberate'
      : meta.decisionType;

    const effectiveRatification =
      rat && (!promotion || rat.ratifiedAt >= promotion.promotedAt) ? rat : undefined;

    slots.push({
      ...slot,
      decisionType,
      documentEngineLayer: matchingCommodity?.documentEngineLayer
        ? (matchingCommodity.documentEngineLayer as DocumentEngineLayer)
        : meta.documentEngineLayer,
      ratifiedBy: effectiveRatification?.ratifiedBy,
      ratifiedRole: effectiveRatification?.ratifiedRole,
      ratifiedAt: effectiveRatification?.ratifiedAt,
      rationale: effectiveRatification?.rationale,
      promotedToSubjectId: promotion?.subjectId,
      coveredRequirementRefs: Array.from(
        new Set([
          ...(matchingCommodity?.coveredRawRefs || []),
          ...(matchingCommodity?.coveredClauseIds || [])
        ])
      )
    });
  }

  // Compléter avec d'éventuels emplacements commodités qui ne figuraient pas encore dans le concept sélectionné
  const extraBoundLeaves: OntologyBindingItem[] = [];
  for (const cs of mergedInput.commoditySlots || []) {
    if (seenAxisUrns.has(cs.axisUrn)) continue;
    seenAxisUrns.add(cs.axisUrn);

    const meta = resolveAxisMetadata(cs.axisUrn, resolvedCatalog);
    const axisEntity = resolvedCatalog.entities[cs.axisUrn];
    const candidateLeaves = queryOntologyTriplets(resolvedCatalog, {
      subject: cs.axisUrn,
      predicate: 'implemented_by'
    })
      .map((t) => resolvedCatalog.entities[t.object])
      .filter(Boolean);

    const candidateLeafUrns =
      candidateLeaves.length > 0
        ? candidateLeaves.map((l) => l.urn)
        : cs.defaultLeafUrn
          ? [cs.defaultLeafUrn]
          : [];

    const slotId = `slot:${cs.axisUrn}`;
    const promotion = state.promotions[slotId] || state.promotions[cs.slotId];
    const rat =
      state.ratifications[slotId] ||
      state.ratifications[cs.slotId] ||
      Object.values(state.ratifications).find((r) => r.axisUrn === cs.axisUrn);
    const effectiveRatification =
      rat && (!promotion || rat.ratifiedAt >= promotion.promotedAt) ? rat : undefined;

    const explicitMatch = candidateLeafUrns.find((u) => bindingMap.has(u));
    const chosenLeafUrn = effectiveRatification?.leafUrn || explicitMatch || cs.defaultLeafUrn;
    const isExplicit = Boolean(effectiveRatification || explicitMatch);
    const chosenEntity = chosenLeafUrn ? resolvedCatalog.entities[chosenLeafUrn] : undefined;
    const oracleRules = Array.isArray(chosenEntity?.oracle_rules)
      ? (chosenEntity!.oracle_rules as string[])
      : [];
    const executableOracleRules = oracleRules.filter((r) => implementedRegoRules.has(r));
    const phantomOracleRules = oracleRules.filter((r) => !implementedRegoRules.has(r));

    if (chosenLeafUrn && chosenEntity) {
      extraBoundLeaves.push({
        urn: chosenLeafUrn,
        revision: chosenEntity.revision ?? 1
      });
    }

    const status = chosenLeafUrn
      ? isExplicit
        ? executableOracleRules.length > 0
          ? 'bound_verified'
          : 'bound_unverified'
        : 'default_proposed'
      : 'open';

    slots.push({
      slotId,
      axisUrn: cs.axisUrn,
      axisTitle: axisEntity?.title || cs.title,
      togafDomain: cs.togafDomain || resolveTogafDomain(axisEntity?.domain),
      status,
      bindingOrigin: isExplicit ? 'explicit' : chosenLeafUrn ? 'default_proposed' : 'none',
      requiresRatification: Boolean(chosenLeafUrn && !isExplicit),
      boundLeafUrns: chosenLeafUrn ? [chosenLeafUrn] : [],
      candidateLeafUrns,
      executableOracleRules,
      phantomOracleRules,
      instantiatedComponents: cs.logicalComponentName ? [cs.logicalComponentName] : [],
      isTransitivePrerequisite: false,
      decisionType: promotion ? 'type1_deliberate' : meta.decisionType,
      documentEngineLayer: (cs.documentEngineLayer as DocumentEngineLayer) || meta.documentEngineLayer,
      ratifiedBy: effectiveRatification?.ratifiedBy,
      ratifiedRole: effectiveRatification?.ratifiedRole,
      ratifiedAt: effectiveRatification?.ratifiedAt,
      rationale: effectiveRatification?.rationale,
      promotedToSubjectId: promotion?.subjectId,
      coveredRequirementRefs: Array.from(
        new Set([...(cs.coveredRawRefs || []), ...(cs.coveredClauseIds || [])])
      )
    });
  }

  // Inclure également les emplacements contextuels ou émergents explicitement ratifiés en Phase 4
  for (const rat of Object.values(state.ratifications)) {
    if (seenAxisUrns.has(rat.axisUrn)) continue;
    const promotion = state.promotions[rat.slotId];
    if (promotion && rat.ratifiedAt < promotion.promotedAt) continue;
    seenAxisUrns.add(rat.axisUrn);

    const meta = resolveAxisMetadata(rat.axisUrn, resolvedCatalog);
    const axisEntity = resolvedCatalog.entities[rat.axisUrn];
    const candidateLeaves = queryOntologyTriplets(resolvedCatalog, {
      subject: rat.axisUrn,
      predicate: 'implemented_by'
    })
      .map((t) => resolvedCatalog.entities[t.object])
      .filter(Boolean);
    const candidateLeafUrns =
      candidateLeaves.length > 0
        ? candidateLeaves.map((l) => l.urn)
        : [rat.leafUrn];

    const chosenEntity = resolvedCatalog.entities[rat.leafUrn];
    const oracleRules = Array.isArray(chosenEntity?.oracle_rules)
      ? (chosenEntity!.oracle_rules as string[])
      : [];
    const executableOracleRules = oracleRules.filter((r) => implementedRegoRules.has(r));
    const phantomOracleRules = oracleRules.filter((r) => !implementedRegoRules.has(r));

    extraBoundLeaves.push({
      urn: rat.leafUrn,
      revision: rat.leafRevision
    });

    const instantiatedSet = new Set<string>();
    if (typeof chosenEntity?.instantiated_component === 'string' && chosenEntity.instantiated_component) {
      instantiatedSet.add(chosenEntity.instantiated_component.replace(/^urn:archinex:component:/, ''));
    }
    for (const t of queryOntologyTriplets(resolvedCatalog, {
      subject: rat.leafUrn,
      predicate: 'instantiates_component'
    })) {
      instantiatedSet.add(t.object.replace(/^urn:archinex:component:/, ''));
    }
    const emergentNewMatch = /^urn:archinex:ontology:application:emergent:new_([a-z0-9_-]+)$/i.exec(rat.leafUrn);
    if (emergentNewMatch) {
      instantiatedSet.add(emergentNewMatch[1].replace(/_/g, '-').toLowerCase());
    }
    const emergentAllocMatch = /^urn:archinex:ontology:application:emergent:allocate_([a-z0-9_-]+)$/i.exec(rat.leafUrn);
    if (emergentAllocMatch) {
      instantiatedSet.add(emergentAllocMatch[1].replace(/_/g, '-').toLowerCase());
    }

    const reqRefs = Array.isArray(chosenEntity?.governed_by_clauses)
      ? (chosenEntity!.governed_by_clauses as string[])
      : [];

    slots.push({
      slotId: rat.slotId,
      axisUrn: rat.axisUrn,
      axisTitle:
        axisEntity?.title ||
        (rat.axisUrn === 'urn:archinex:ontology:axis:emergent_component_allocation'
          ? '0. Allocation de Composant Logique (Capacité Émergente / Sujet Inédit)'
          : rat.axisUrn),
      togafDomain: resolveTogafDomain(axisEntity?.domain || 'application'),
      status: executableOracleRules.length > 0 ? 'bound_verified' : 'bound_unverified',
      bindingOrigin: 'explicit',
      requiresRatification: false,
      boundLeafUrns: [rat.leafUrn],
      candidateLeafUrns,
      executableOracleRules,
      phantomOracleRules,
      instantiatedComponents: Array.from(instantiatedSet),
      isTransitivePrerequisite: false,
      decisionType: meta.decisionType,
      documentEngineLayer: meta.documentEngineLayer,
      ratifiedBy: rat.ratifiedBy,
      ratifiedRole: rat.ratifiedRole,
      ratifiedAt: rat.ratifiedAt,
      rationale: rat.rationale,
      coveredRequirementRefs: reqRefs
    });
  }

  // Consolidation des liaisons composées et instanciation du catalogue logique
  const allComposedMap = new Map<string, OntologyBindingItem>();
  for (const b of coverageReport.composedBindings) {
    allComposedMap.set(b.urn, b);
  }
  for (const b of extraBoundLeaves) {
    if (!allComposedMap.has(b.urn)) {
      allComposedMap.set(b.urn, b);
    }
  }
  const composedBindings = Array.from(allComposedMap.values()).sort((a, b) =>
    a.urn.localeCompare(b.urn)
  );

  const componentUrnMap = buildComponentUrnMap(resolvedCatalog);
  const storedBundle = loadProjectComponentCatalog(input.projectId);
  const baseCatalog =
    storedBundle.components.length > 0 ? storedBundle.components : DEFAULT_COMPONENT_CATALOG;
  const activeCatalog = instantiateCatalogFromOntologyBindings(
    composedBindings.map((b) => b.urn),
    baseCatalog,
    componentUrnMap
  );
  const instantiatedComponents = activeCatalog.map((c) => c.metadata.name).sort();
  const danglingReferences = verifyCatalogDanglingReferences(activeCatalog);

  const coveredAxes = new Set(slots.filter((s) => s.status !== 'open').map((s) => s.axisUrn));
  const blindSpots = scanProjectArchitecturalBlindSpots(
    coveredAxes,
    mergedInput.activeTogafDomains
  );

  const conscientiousMetrics = computeUnifiedConscientiousMetrics(
    slots,
    coverageReport.dependencyIssues.length
  );
  const { readyForArchitectureLock, lockBlockers } = computeLockReadiness(
    conscientiousMetrics,
    slots,
    coverageReport.dependencyIssues.length,
    danglingReferences
  );

  const type1DeliberationQueue = slots.filter(
    (s) =>
      s.decisionType === 'type1_deliberate' &&
      (s.status === 'open' || s.status === 'default_proposed')
  );
  const type2RatificationQueue = slots.filter(
    (s) =>
      s.decisionType === 'type2_default_ratify' &&
      (s.status === 'open' || s.status === 'default_proposed')
  );

  return {
    projectId: input.projectId,
    projectTitle: mergedInput.projectTitle || mergedInput.title || input.projectId,
    generatedAt: new Date().toISOString(),
    slots,
    type1DeliberationQueue,
    type2RatificationQueue,
    promotedSubjects: Object.values(state.promotions),
    ratificationReceipts: state.receipts,
    composedBindings,
    instantiatedComponents,
    activeCatalog,
    danglingReferences,
    blindSpots,
    conscientiousMetrics,
    dependencyIssues: coverageReport.dependencyIssues,
    readyForArchitectureLock,
    lockBlockers,
    coverageReport
  };
}

/**
 * Ratifie en masse (ou sur une sélection ciblée d'IDs / domaines TOGAF) les emplacements
 * de décision de type commodité, puis persiste les composants logiques transverses instanciés.
 */
export async function batchRatifyProjectType2Slots(
  input: BatchRatificationInput,
  coverageInput?: Omit<ProjectCompletenessInput, 'projectId'>,
  catalog?: OntologyCatalog
): Promise<{
  receipt: BatchRatificationReceipt;
  updatedLedger: ProjectCompletenessLedger;
  instantiatedComponents: string[];
}> {
  assertAuthorizedSlotActor(input.actorId, input.actorRole);
  if (!input.rationale || input.rationale.trim().length === 0) {
    throw new InvariantViolationError(
      'Une justification explicite (rationale) est requise pour ratifier un lot d’emplacements.'
    );
  }

  const resolvedCatalog = catalog ?? (await loadOntologyCatalog());
  const state = loadProjectSlotState(input.projectId);
  if (coverageInput) {
    state.lastCoverageInput = coverageInput;
    saveProjectSlotState(input.projectId, state);
  }

  const beforeLedger = await buildProjectCompletenessLedger(
    {
      ...(state.lastCoverageInput ?? {}),
      ...(coverageInput ?? {}),
      projectId: input.projectId
    },
    resolvedCatalog
  );

  const explicitSlotFilter = input.slotIds && input.slotIds.length > 0 ? new Set(input.slotIds) : null;
  const domainFilter =
    input.togafDomains && input.togafDomains.length > 0 ? new Set(input.togafDomains) : null;

  const targetSlots = beforeLedger.slots.filter((slot) => {
    if (explicitSlotFilter) {
      return explicitSlotFilter.has(slot.slotId);
    }
    if (slot.decisionType !== 'type2_default_ratify') {
      return false;
    }
    if (slot.status !== 'default_proposed' && slot.status !== 'open') {
      return false;
    }
    if (domainFilter && !domainFilter.has(slot.togafDomain)) {
      return false;
    }
    return true;
  });

  if (targetSlots.length === 0) {
    throw new InvariantViolationError(
      'Aucun emplacement éligible à la ratification en lot n’a été trouvé.'
    );
  }

  const ratifiedAt = new Date().toISOString();
  const newlyBoundLeaves: OntologyBindingItem[] = [];
  const ratifiedSlotIds: string[] = [];

  for (const slot of targetSlots) {
    const overrideLeaf =
      input.leafOverrides?.[slot.slotId] || input.leafOverrides?.[slot.axisUrn];
    const selectedLeafUrn =
      overrideLeaf || slot.boundLeafUrns[0] || slot.candidateLeafUrns[0];
    if (!selectedLeafUrn) continue;

    const leafEntity = resolvedCatalog.entities[selectedLeafUrn];
    const leafRevision = leafEntity?.revision ?? 1;

    state.ratifications[slot.slotId] = {
      slotId: slot.slotId,
      axisUrn: slot.axisUrn,
      leafUrn: selectedLeafUrn,
      leafRevision,
      ratifiedBy: input.actorId,
      ratifiedRole: input.actorRole,
      ratifiedAt,
      rationale: input.rationale.trim()
    };

    ratifiedSlotIds.push(slot.slotId);
    newlyBoundLeaves.push({ urn: selectedLeafUrn, revision: leafRevision });
  }

  if (ratifiedSlotIds.length === 0) {
    throw new InvariantViolationError(
      'Les emplacements sélectionnés ne disposent d’aucune feuille ontologique candidate à ratifier.'
    );
  }

  const receipt: BatchRatificationReceipt = {
    receiptId: `ratif-${createHash('sha256')
      .update(`${input.projectId}:${ratifiedAt}:${ratifiedSlotIds.join(',')}`)
      .digest('hex')
      .slice(0, 12)}`,
    projectId: input.projectId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    rationale: input.rationale.trim(),
    ratifiedAt,
    ratifiedSlotIds,
    boundLeaves: newlyBoundLeaves,
    instantiatedComponents: []
  };

  state.receipts.push(receipt);
  saveProjectSlotState(input.projectId, state);

  const updatedLedger = await buildProjectCompletenessLedger(
    {
      ...(state.lastCoverageInput ?? {}),
      ...(coverageInput ?? {}),
      projectId: input.projectId
    },
    resolvedCatalog
  );

  // Persistance des composants logiques transverses dans le catalogue projet
  const existingBundle = loadProjectComponentCatalog(input.projectId);
  const componentUrnMap = buildComponentUrnMap(resolvedCatalog);
  const enrichedComponents = instantiateCatalogFromOntologyBindings(
    updatedLedger.composedBindings.map((b) => b.urn),
    existingBundle.components.length > 0 ? existingBundle.components : DEFAULT_COMPONENT_CATALOG,
    componentUrnMap
  );
  saveProjectComponentCatalog(input.projectId, {
    catalogs: existingBundle.catalogs,
    components: enrichedComponents,
    overlays: existingBundle.overlays
  });
  touchedProjectIds.add(input.projectId);

  receipt.instantiatedComponents = updatedLedger.instantiatedComponents;
  saveProjectSlotState(input.projectId, state);

  return {
    receipt,
    updatedLedger,
    instantiatedComponents: updatedLedger.instantiatedComponents
  };
}

/**
 * Promeut un emplacement de commodité (Type 2) vers un véritable sujet de délibération
 * architecturale (Type 1) avec ses options candidates issues de l'ontologie.
 */
export async function promoteSlotToDeliberationSubject(
  input: SlotPromotionInput,
  catalog?: OntologyCatalog
): Promise<PromotedSubjectDescriptor> {
  assertAuthorizedSlotActor(input.actorId, input.actorRole);
  if (!input.reason || input.reason.trim().length === 0) {
    throw new InvariantViolationError(
      'Une motivation explicite est requise pour promouvoir un emplacement en sujet de délibération.'
    );
  }

  const resolvedCatalog = catalog ?? (await loadOntologyCatalog());
  const state = loadProjectSlotState(input.projectId);
  const ledger = await buildProjectCompletenessLedger(
    { ...(state.lastCoverageInput ?? {}), projectId: input.projectId },
    resolvedCatalog
  );

  const slot = ledger.slots.find((s) => s.slotId === input.slotId);
  if (!slot) {
    throw new InvariantViolationError(
      `Emplacement "${input.slotId}" introuvable dans le registre du projet "${input.projectId}".`
    );
  }

  const candidateOptions = slot.candidateLeafUrns.map((urn) => {
    const entity = resolvedCatalog.entities[urn];
    return {
      urn,
      title: entity?.title || urn,
      domain: entity?.domain || slot.togafDomain
    };
  });

  const promotedAt = new Date().toISOString();
  const descriptor: PromotedSubjectDescriptor = {
    subjectId: `subj-${slot.slotId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    slotId: slot.slotId,
    axisUrn: slot.axisUrn,
    title: input.subjectTitle?.trim() || slot.axisTitle,
    togafDomain: slot.togafDomain,
    promotedBy: input.actorId,
    promotedRole: input.actorRole,
    promotedAt,
    reason: input.reason.trim(),
    candidateOptions
  };

  delete state.ratifications[slot.slotId];
  state.promotions[slot.slotId] = descriptor;
  saveProjectSlotState(input.projectId, state);

  return descriptor;
}

/**
 * Génère et scelle cryptographiquement `architecture.lock` après avoir vérifié :
 * 0 emplacement ouvert, 0 proposition par défaut non ratifiée, 0 oracle fantôme,
 * 0 dépendance non résolue, catalogue sans référence pendante, et verdict OPA `compliant`.
 */
export async function generateArchitectureLockManifest(
  options: {
    projectId: string;
    sealedBy: string;
    sealedByRole: string;
    coverageInput?: Omit<ProjectCompletenessInput, 'projectId'>;
  },
  catalog?: OntologyCatalog
): Promise<ArchitectureLockManifest> {
  assertAuthorizedSlotActor(options.sealedBy, options.sealedByRole);
  const resolvedCatalog = catalog ?? (await loadOntologyCatalog());
  const state = loadProjectSlotState(options.projectId);

  const ledgerInput: ProjectCompletenessInput = {
    ...(state.lastCoverageInput ?? {}),
    ...(options.coverageInput ?? {}),
    projectId: options.projectId
  };

  const ledger = await buildProjectCompletenessLedger(ledgerInput, resolvedCatalog);
  if (!ledger.readyForArchitectureLock) {
    throw new InvariantViolationError(
      `Scellement architecture.lock refusé : ${ledger.lockBlockers.join(' | ')}`
    );
  }

  const hydratedInventory = composeMultiAxisHydration(
    options.projectId,
    ledger.composedBindings,
    resolvedCatalog,
    ledgerInput.lldOverrides || {}
  );

  const oracleEval = await evaluateMultiAxisOracle(
    hydratedInventory,
    ledger.composedBindings,
    resolvedCatalog
  );

  if (oracleEval.verdict !== 'compliant') {
    throw new InvariantViolationError(
      `Scellement architecture.lock refusé : ${oracleEval.violations.length} violation(s) de politique OPA détectée(s) — ${oracleEval.violationMessages.join(' | ')}`
    );
  }

  const sealedAt = new Date().toISOString();
  const ratifiedSlotIds = ledger.slots
    .filter((s) => s.status === 'bound_verified' || s.status === 'bound_unverified' || s.status === 'waived')
    .map((s) => s.slotId)
    .sort();

  const unsignedPayload = {
    version: '1.0' as const,
    projectId: options.projectId,
    projectTitle: ledger.projectTitle,
    sealedAt,
    sealedBy: options.sealedBy,
    sealedByRole: options.sealedByRole,
    ontologyFingerprint: oracleEval.ontologyFingerprint,
    oracleVerdict: 'compliant' as const,
    evaluatedAxesCount: oracleEval.evaluatedAxesCount,
    phantomOracleCount: ledger.conscientiousMetrics.phantomOracleCount,
    boundBindings: ledger.composedBindings,
    ratifiedSlotIds,
    promotedSubjects: ledger.promotedSubjects,
    instantiatedComponents: ledger.instantiatedComponents,
    danglingReferences: ledger.danglingReferences,
    blindSpotCoveragePercent: ledger.blindSpots.coveragePercent
  };

  const integritySha256 = createHash('sha256')
    .update(JSON.stringify(unsignedPayload))
    .digest('hex');

  const manifest: ArchitectureLockManifest = {
    ...unsignedPayload,
    integritySha256
  };

  ensureStorageDir();
  touchedProjectIds.add(options.projectId);
  lockCache.set(options.projectId, manifest);
  writeFileSync(getLockManifestPath(options.projectId), JSON.stringify(manifest, null, 2), 'utf8');

  return manifest;
}

/**
 * Lit le manifeste `architecture.lock` scellé d'un projet s'il existe.
 */
export function getProjectArchitectureLock(projectId: string): ArchitectureLockManifest | null {
  const cached = lockCache.get(projectId);
  if (cached) return cached;

  const lockPath = getLockManifestPath(projectId);
  if (!existsSync(lockPath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as ArchitectureLockManifest;
    lockCache.set(projectId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Enregistre directement dans le registre projet une ratification explicite effectuée en Phase 4 (`bind_aspect`).
 */
export async function recordExplicitProjectSlotRatification(
  options: {
    projectId: string;
    axisUrn: string;
    leafUrn: string;
    actorId?: string;
    actorRole?: string;
    rationale?: string;
  },
  catalog?: OntologyCatalog
): Promise<void> {
  const resolvedCatalog = catalog ?? (await loadOntologyCatalog());
  const state = loadProjectSlotState(options.projectId);
  const slotId = `slot:${options.axisUrn}`;
  const leafEntity = resolvedCatalog.entities[options.leafUrn];
  const leafRevision = leafEntity?.revision ?? 1;

  state.ratifications[slotId] = {
    slotId,
    axisUrn: options.axisUrn,
    leafUrn: options.leafUrn,
    leafRevision,
    ratifiedBy: options.actorId || 'architect',
    ratifiedRole: options.actorRole || 'lead_architect',
    ratifiedAt: new Date().toISOString(),
    rationale:
      options.rationale ||
      `Ratification explicite sur l'axe ${options.axisUrn} (${options.leafUrn}).`
  };
  saveProjectSlotState(options.projectId, state);
}

const SECURITY_COMPONENT_NAMES = new Set([
  'hsm-appliance',
  'pki-ca',
  'vault-cluster',
  'iam-keycloak',
  'admin-bastion',
  'ingress-waf-proxy'
]);

const OBSERVABILITY_COMPONENT_NAMES = new Set(['siem-soc']);

function classifyComponentLayer(comp: LogicalComponent): {
  layer: ArchitectureComponentLayer;
  transverseRole?: SylvaTransversePillarId;
} {
  const name = comp.metadata.name;
  const dom = comp.metadata.functionalDomain;
  const labelLayer = comp.metadata.labels?.layer;

  if (OBSERVABILITY_COMPONENT_NAMES.has(name) || labelLayer === 'observability-soc') {
    return { layer: 'transverse-observability', transverseRole: 'observability' };
  }
  if (dom === 'security' || SECURITY_COMPONENT_NAMES.has(name)) {
    return { layer: 'transverse-security', transverseRole: 'security' };
  }
  if (
    dom === 'gis-services' ||
    dom === 'ptt-services' ||
    labelLayer === 'application-emergent'
  ) {
    return { layer: 'workloads-apps' };
  }
  if (dom === 'core-network' || comp.metadata.external) {
    return { layer: 'workloads-core' };
  }
  return { layer: 'caas-infra' };
}

function extractComponentTransverseBindings(comp: LogicalComponent): ComponentTransverseBindings {
  const modules = comp.spec.compute?.modules || [];
  const nics = modules.flatMap((m) => m.nics || []);
  const deps = comp.spec.dependsOn || [];

  const vaultMount = comp.spec.security?.vault?.mount;
  const autoRenewCerts = (comp.spec.security?.certificates || []).filter((c) => c.autoRenew).length;
  const firewallPolicy = comp.spec.firewall?.policy;
  const securityDeps = deps.filter((d) => SECURITY_COMPONENT_NAMES.has(d));
  const securityCovered =
    comp.metadata.external ||
    SECURITY_COMPONENT_NAMES.has(comp.metadata.name) ||
    Boolean(vaultMount) ||
    autoRenewCerts > 0 ||
    securityDeps.length > 0;

  const eventsNic = nics.find((n) => n.class === 'events');
  const siemLinked = deps.includes('siem-soc') || OBSERVABILITY_COMPONENT_NAMES.has(comp.metadata.name);
  const observabilityCovered =
    comp.metadata.external || Boolean(eventsNic) || siemLinked;

  const adminNic = nics.find((n) => n.class === 'admin');
  const helmCharts = modules
    .map((m) => (m.helm ? `${m.helm.chart}@${m.helm.version}` : null))
    .filter((x): x is string => Boolean(x));
  const placementPools = Array.from(
    new Set(
      modules
        .map((m) => m.placement?.pool || m.placement?.requiredDataplane)
        .filter((x): x is string => Boolean(x))
    )
  );
  const serialized = JSON.stringify(comp.spec);
  const paramRefMatches = serialized.match(/ref\(param\.[a-zA-Z0-9_.-]+\)/g) || [];
  const paramRefs = Array.from(new Set(paramRefMatches));
  const configurationCovered =
    comp.metadata.external || Boolean(adminNic) || helmCharts.length > 0 || paramRefs.length > 0;

  return {
    security: {
      covered: securityCovered,
      vaultMount,
      autoRenewCerts,
      firewallPolicy,
      securityDeps
    },
    observability: {
      covered: observabilityCovered,
      hasEventsNic: Boolean(eventsNic),
      eventsVrf: eventsNic?.vrf,
      siemLinked
    },
    configuration: {
      covered: configurationCovered,
      hasAdminNic: Boolean(adminNic),
      helmCharts,
      paramRefs,
      placementPools
    }
  };
}

function generateStatusAwareMermaid(
  components: LiveLockedComponentEntry[],
  onlyLocked: boolean
): string {
  const filtered = onlyLocked
    ? components.filter(
        (c) => c.lockStatus === 'locked' || c.lockStatus === 'emergent_locked'
      )
    : components;

  const lines: string[] = [
    'flowchart LR',
    '  classDef locked fill:#065f46,stroke:#10b981,stroke-width:2px,color:#ecfdf5;',
    '  classDef emergent fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#f5f3ff;',
    '  classDef proposed fill:#78350f,stroke:#f59e0b,stroke-width:2px,stroke-dasharray: 5 5,color:#fffbeb;',
    '  classDef baseline fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#f1f5f9;'
  ];

  if (filtered.length === 0) {
    lines.push('  EMPTY["Aucun composant explicitement verrouillé à cet instant — Ratifiez un axe pour le voir apparaître"]:::proposed');
    return lines.join('\n');
  }

  const layerLabels: Record<ArchitectureComponentLayer, string> = {
    'workloads-apps': 'Plan 1a · Workloads Applicatifs, SIG, MCPTT & Émergents',
    'workloads-core': 'Plan 1b · Cœur de Réseau 4G/5GC & Médiation',
    'caas-infra': 'Plan 2/3 · Socle CaaS Sylva, Stockage & Fabric',
    'transverse-security': '🛡️ Transverse · Sécurité, Identité & Confiance',
    'transverse-observability': '📡 Transverse · Observabilité, SIEM & SLA (events)',
    'transverse-config': '⚙️ Transverse · Configuration, GitOps & Cycle de Vie (admin)'
  };

  const byLayer = new Map<ArchitectureComponentLayer, LiveLockedComponentEntry[]>();
  for (const c of filtered) {
    if (!byLayer.has(c.layer)) byLayer.set(c.layer, []);
    byLayer.get(c.layer)!.push(c);
  }

  const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_');
  const esc = (s: string) => s.replace(/"/g, "'");
  const visibleSet = new Set(filtered.map((c) => c.name));

  const renderGroup = (layerKeys: ArchitectureComponentLayer[]) => {
    for (const layerKey of layerKeys) {
      const comps = byLayer.get(layerKey);
      if (!comps || comps.length === 0) continue;
      lines.push(`    subgraph LAYER_${safeId(layerKey)}["${esc(layerLabels[layerKey])}"]`);
      for (const c of comps) {
        const nodeId = `COMP_${safeId(c.name)}`;
        const badge =
          c.lockStatus === 'emergent_locked'
            ? '🟣 ÉMERGENT LOCKÉ'
            : c.lockStatus === 'locked'
              ? '🔒 LOCKÉ'
              : c.lockStatus === 'default_proposed'
                ? '🟠 PROPOSÉ'
                : '🛡️ SOCLE';
        const cssClass =
          c.lockStatus === 'emergent_locked'
            ? 'emergent'
            : c.lockStatus === 'locked'
              ? 'locked'
              : c.lockStatus === 'default_proposed'
                ? 'proposed'
                : 'baseline';
        lines.push(`      ${nodeId}["${badge} · ${esc(c.displayName)} (${esc(c.name)})"]:::${cssClass}`);
      }
      lines.push('    end');
    }
  };

  lines.push('  subgraph STACK_VERTICAL["Empilement Vertical Sylva (Workloads -> CaaS -> Bare-Metal)"]');
  renderGroup(['workloads-apps', 'workloads-core', 'caas-infra']);
  lines.push('  end');

  lines.push('  subgraph PILLARS_TRANSVERSE["Piliers Transverses Sylva (Sécurité · Observabilité · GitOps)"]');
  renderGroup(['transverse-security', 'transverse-observability', 'transverse-config']);
  lines.push('  end');

  const seenEdges = new Set<string>();
  for (const c of filtered) {
    const srcId = `COMP_${safeId(c.name)}`;
    for (const edge of c.outboundTargets) {
      if (!visibleSet.has(edge.target)) continue;
      const dstId = `COMP_${safeId(edge.target)}`;
      if (srcId === dstId) continue;
      const key = `${srcId}->${dstId}:${edge.kind}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      if (edge.kind === 'dependency') {
        lines.push(`  ${srcId} -. "dependsOn" .-> ${dstId}`);
      } else {
        lines.push(`  ${srcId} -- "${esc(edge.label.slice(0, 32))}" --> ${dstId}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Construit à tout instant (« Live Architecture Lock View ») la photographie temps réel
 * de l'architecture verrouillée vs proposée, des composants instanciés par couche TOGAF/Sylva,
 * de la traçabilité des exigences et de l'empreinte SHA-256 progressive.
 */
export async function buildLiveArchitectureLockSnapshot(
  input: ProjectCompletenessInput,
  catalog?: OntologyCatalog
): Promise<LiveArchitectureLockSnapshot> {
  const resolvedCatalog = catalog ?? (await loadOntologyCatalog());
  const ledger = await buildProjectCompletenessLedger(input, resolvedCatalog);
  const sealedManifest = getProjectArchitectureLock(input.projectId);

  const lockedBindings: OntologyBindingItem[] = [];
  const proposedBindings: OntologyBindingItem[] = [];

  const slotEntries: LiveArchitectureLockSnapshot['slots'] = ledger.slots.map((slot) => {
    const isLocked =
      slot.status === 'bound_verified' ||
      slot.status === 'bound_unverified' ||
      slot.status === 'waived';
    const lockBadge: 'locked' | 'default_proposed' | 'open' = isLocked
      ? 'locked'
      : slot.status === 'default_proposed'
        ? 'default_proposed'
        : 'open';

    const boundLeafUrn = slot.boundLeafUrns[0];
    const leafEntity = boundLeafUrn ? resolvedCatalog.entities[boundLeafUrn] : undefined;
    const boundLeafTitle = leafEntity?.title || boundLeafUrn;

    if (boundLeafUrn) {
      const bindingItem: OntologyBindingItem = {
        urn: boundLeafUrn,
        revision: leafEntity?.revision ?? 1
      };
      if (isLocked) {
        lockedBindings.push(bindingItem);
      } else {
        proposedBindings.push(bindingItem);
      }
    }

    const candidateLeaves = slot.candidateLeafUrns.map((u) => ({
      urn: u,
      title: resolvedCatalog.entities[u]?.title || u
    }));

    const clauseRefs = new Set<string>(slot.coveredRequirementRefs || []);
    if (Array.isArray(leafEntity?.governed_by_clauses)) {
      for (const c of leafEntity!.governed_by_clauses as string[]) {
        clauseRefs.add(c);
      }
    }

    return {
      slotId: slot.slotId,
      axisUrn: slot.axisUrn,
      axisTitle: slot.axisTitle,
      togafDomain: slot.togafDomain,
      status: slot.status,
      lockBadge,
      boundLeafUrn,
      boundLeafTitle,
      candidateLeaves,
      instantiatedComponents: slot.instantiatedComponents || [],
      coveredRequirementRefs: Array.from(clauseRefs),
      ratifiedBy: slot.ratifiedBy,
      ratifiedAt: slot.ratifiedAt,
      rationale: slot.rationale
    };
  });

  const componentMap = new Map<string, LiveLockedComponentEntry>();
  for (const comp of ledger.activeCatalog) {
    const isEmergent = comp.metadata.labels?.origin === 'emergent-slot';
    const nics = (comp.spec.compute?.modules || []).flatMap((m) => m.nics || []);
    const nicClasses = Array.from(new Set(nics.map((n) => n.class)));
    const vrfNames = (comp.spec.network?.vrfs || []).map((v) => v.name);
    const storageSvms = (comp.spec.storage?.svms || []).map((s) => s.name);

    const outboundTargets: LiveLockedComponentEntry['outboundTargets'] = [];
    for (const dep of comp.spec.dependsOn || []) {
      outboundTargets.push({ target: dep, label: 'dependsOn', kind: 'dependency' });
    }
    for (const contract of comp.spec.crossTenantContracts || []) {
      outboundTargets.push({
        target: contract.targetComponent,
        label: contract.purpose,
        kind: 'contract'
      });
    }
    for (const rule of comp.spec.firewall?.rules || []) {
      const m = rule.to.match(/^ref\(component:([^.)]+)/);
      if (m) {
        outboundTargets.push({
          target: m[1],
          label: rule.functionalFlow || `${rule.proto.toUpperCase()}/${rule.ports.join(',')}`,
          kind: 'firewall'
        });
      }
    }

    const classification = classifyComponentLayer(comp);
    const transverseBindings = extractComponentTransverseBindings(comp);

    componentMap.set(comp.metadata.name, {
      name: comp.metadata.name,
      displayName: comp.metadata.displayName,
      functionalDomain: comp.metadata.functionalDomain,
      editor: comp.metadata.editor,
      tenant: comp.metadata.tenant,
      external: comp.metadata.external,
      layer: classification.layer,
      transverseRole: classification.transverseRole,
      transverseBindings,
      lockStatus: isEmergent
        ? 'emergent_locked'
        : sealedManifest
          ? 'locked'
          : 'baseline',
      isEmergent,
      sourceSlotIds: [],
      sourceAxisTitles: [],
      sourceLeafUrns: [],
      coveredRequirementRefs: [],
      dependsOn: comp.spec.dependsOn || [],
      outboundTargets,
      nicsCount: nics.length,
      nicClasses,
      vrfNames,
      storageSvms
    });
  }

  for (const slot of slotEntries) {
    for (const compName of slot.instantiatedComponents) {
      const entry = componentMap.get(compName);
      if (!entry) continue;
      if (!entry.sourceSlotIds.includes(slot.slotId)) {
        entry.sourceSlotIds.push(slot.slotId);
      }
      if (!entry.sourceAxisTitles.includes(slot.axisTitle)) {
        entry.sourceAxisTitles.push(slot.axisTitle);
      }
      if (slot.boundLeafUrn && !entry.sourceLeafUrns.includes(slot.boundLeafUrn)) {
        entry.sourceLeafUrns.push(slot.boundLeafUrn);
      }
      for (const reqRef of slot.coveredRequirementRefs) {
        if (!entry.coveredRequirementRefs.includes(reqRef)) {
          entry.coveredRequirementRefs.push(reqRef);
        }
      }
      if (slot.lockBadge === 'locked') {
        entry.lockStatus = entry.isEmergent ? 'emergent_locked' : 'locked';
        entry.ratifiedBy = slot.ratifiedBy || entry.ratifiedBy;
        entry.ratifiedAt = slot.ratifiedAt || entry.ratifiedAt;
      } else if (
        slot.lockBadge === 'default_proposed' &&
        entry.lockStatus !== 'locked' &&
        entry.lockStatus !== 'emergent_locked'
      ) {
        entry.lockStatus = 'default_proposed';
      }
    }
  }

  const components = Array.from(componentMap.values());
  const lockedSlotsCount = slotEntries.filter((s) => s.lockBadge === 'locked').length;
  const defaultProposedSlotsCount = slotEntries.filter(
    (s) => s.lockBadge === 'default_proposed'
  ).length;
  const openSlotsCount = slotEntries.filter((s) => s.lockBadge === 'open').length;
  const totalSlots = slotEntries.length;
  const completionPercent =
    totalSlots > 0 ? Math.round((lockedSlotsCount / totalSlots) * 100) : 0;

  const lockedComponentsCount = components.filter(
    (c) => c.lockStatus === 'locked' || c.lockStatus === 'emergent_locked'
  ).length;
  const proposedComponentsCount = components.filter(
    (c) => c.lockStatus === 'default_proposed'
  ).length;
  const emergentComponentsCount = components.filter((c) => c.isEmergent).length;

  const lockState: LiveArchitectureLockSnapshot['lockState'] = sealedManifest
    ? 'sealed'
    : ledger.readyForArchitectureLock
      ? 'ready_to_seal'
      : 'partial_live_lock';

  const verticalWorkloads = components.filter(
    (c) => c.layer === 'workloads-apps' || c.layer === 'workloads-core' || c.layer === 'caas-infra'
  );
  const totalWorkloadsCount = verticalWorkloads.length;

  const buildPillarSummary = (
    id: SylvaTransversePillarId,
    title: string,
    subtitle: string,
    nicPlane: string,
    domainFilter: (s: (typeof slotEntries)[number]) => boolean
  ): TransversePillarSummary => {
    const dedicatedComponents = components
      .filter((c) => c.transverseRole === id)
      .map((c) => c.name);
    const matchingSlots = slotEntries.filter(domainFilter);
    const lockedSlots = matchingSlots.filter((s) => s.lockBadge === 'locked');
    const coveredWorkloadsCount = verticalWorkloads.filter((w) => w.transverseBindings[id].covered).length;
    return {
      id,
      title,
      subtitle,
      nicPlane,
      dedicatedComponents,
      governingSlotIds: matchingSlots.map((s) => s.slotId),
      lockedSlotsCount: lockedSlots.length,
      totalSlotsCount: matchingSlots.length,
      coveredWorkloadsCount,
      totalWorkloadsCount
    };
  };

  const transversePillars: TransversePillarSummary[] = [
    buildPillarSummary(
      'security',
      '🛡️ Sécurité, Identité & Confiance',
      'mTLS (PKI/HSM), secrets Vault, IAM/PAM & pare-feu deny-by-default',
      'VRF business/trust · Vault & PKI',
      (s) => s.togafDomain === 'security-trust'
    ),
    buildPillarSummary(
      'observability',
      '📡 Observabilité, SIEM & SLA',
      'Collecte Syslog TLS, métrologie Prometheus/Thanos & sondes 3GPP',
      'NIC #3 class: events · siem-soc',
      (s) => s.togafDomain === 'operations-observability'
    ),
    buildPillarSummary(
      'configuration',
      '⚙️ Configuration, GitOps & Cycle de Vie',
      'Charts Helm OCI, FluxCD, paramètres ref(param.*) & Overlays prod/preprod/lab',
      'NIC #1 class: admin · Base × Overlay × DC',
      (s) =>
        s.togafDomain === 'platform-compute' ||
        s.togafDomain === 'network-connectivity' ||
        s.togafDomain === 'data-persistence' ||
        s.togafDomain === 'facilities-sovereignty'
    )
  ];

  const poolSet = new Set<string>();
  const storageBackendSet = new Set<string>();
  for (const comp of ledger.activeCatalog) {
    for (const mod of comp.spec.compute?.modules || []) {
      if (mod.placement?.pool) poolSet.add(mod.placement.pool);
    }
    for (const svm of comp.spec.storage?.svms || []) {
      if (svm.backend) storageBackendSet.add(svm.backend);
    }
  }
  const sylvaRuntimePlanes = {
    pools: Array.from(poolSet).sort(),
    storageBackends: Array.from(storageBackendSet).sort(),
    datacenters: loadProjectComponentCatalog(input.projectId).overlays[0]?.spec.datacenters || ['dc1', 'dc2', 'dc3']
  };

  const liveIntegritySha256 =
    sealedManifest?.integritySha256 ||
    createHash('sha256')
      .update(
        JSON.stringify({
          projectId: input.projectId,
          lockedBindings,
          lockedComponents: components
            .filter((c) => c.lockStatus === 'locked' || c.lockStatus === 'emergent_locked')
            .map((c) => c.name)
            .sort()
        })
      )
      .digest('hex');

  return {
    version: '1.0-live',
    projectId: input.projectId,
    projectTitle: ledger.projectTitle,
    generatedAt: new Date().toISOString(),
    lockState,
    liveIntegritySha256,
    sealedManifest,
    summary: {
      totalSlots,
      lockedSlotsCount,
      defaultProposedSlotsCount,
      openSlotsCount,
      completionPercent,
      totalComponentsCount: components.length,
      lockedComponentsCount,
      proposedComponentsCount,
      emergentComponentsCount
    },
    transversePillars,
    sylvaRuntimePlanes,
    lockedBindings,
    proposedBindings,
    components,
    slots: slotEntries,
    lockBlockers: ledger.lockBlockers,
    mermaidLockedOnly: generateStatusAwareMermaid(components, true),
    mermaidFullWithStatus: generateStatusAwareMermaid(components, false)
  };
}

/**
 * Réinitialise le registre d'emplacements et les manifestes associés (usage tests).
 */
export function resetProjectSlotRegistry(projectId?: string): void {
  const targets = projectId ? [projectId] : Array.from(touchedProjectIds);
  for (const id of targets) {
    slotStateCache.delete(id);
    lockCache.delete(id);
    touchedProjectIds.delete(id);
    for (const p of [getSlotStatePath(id), getLockManifestPath(id), getCatalogFilePath(id)]) {
      if (existsSync(p)) {
        rmSync(p, { force: true });
      }
    }
  }
  if (!projectId) {
    slotStateCache.clear();
    lockCache.clear();
  }
}
