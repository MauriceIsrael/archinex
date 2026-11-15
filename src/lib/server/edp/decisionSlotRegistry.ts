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
