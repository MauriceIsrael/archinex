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

export type AxisCoverageStatus = 'covered_executable' | 'covered_no_oracle' | 'missing_refinement';

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
  rationale: string;
  status: AxisCoverageStatus;
  boundLeaves: CandidateLeafSummary[];
  candidateLeaves: CandidateLeafSummary[];
  oracleRulesCount: number;
}

export interface ClauseCoverageItem {
  clauseId: string;
  text: string;
  source?: 'k18_fact' | 'spec_clause';
  matchedAxisUrn?: string;
  matchedLeafUrn?: string;
  matchedLeafTitle?: string;
  status: 'covered' | 'unmapped';
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

export interface RefinementCoverageReport {
  matchedConcepts: Array<{ urn: string; title: string; score: number }>;
  allConcepts?: HldConceptSummary[];
  selectedConceptUrn?: string;
  axes: AxisCoverageItem[];
  clauses: ClauseCoverageItem[];
  dependencyIssues: CrossAxisDependencyIssue[];
  composedBindings: OntologyBindingItem[];
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
}

export interface MultiAxisHydratedInventory {
  nautobot_planned_devices: Array<Record<string, unknown>>;
  k8s_manifests: Array<Record<string, unknown>>;
  security_zones: Array<Record<string, unknown>>;
  environments: Array<Record<string, unknown>>;
  power_feeds: string[];
  coveredDomains: string[];
}

export interface MultiAxisOracleViolation {
  rule: string;
  axis: string;
  message: string;
}

export interface MultiAxisOracleEvaluationResult {
  verdict: 'compliant' | 'violated';
  violations: MultiAxisOracleViolation[];
  violationMessages: string[];
  evaluatedAxesCount: number;
  ontologyFingerprint: string;
  durationMs: number;
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
    let bestLeaf: OntologyEntity | null = null;
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
      const parentAxisTriplet = implTriplets.find((t) => t.object === bestLeaf!.urn);
      const isBound = boundLeafUrns.has(bestLeaf.urn);
      return {
        clauseId: `CL-${idx + 1}`,
        text: entry.text,
        source: entry.source,
        matchedAxisUrn: parentAxisTriplet?.subject,
        matchedLeafUrn: bestLeaf.urn,
        matchedLeafTitle: bestLeaf.title || bestLeaf.urn,
        status: isBound ? 'covered' : 'unmapped'
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
 * Calcule la Matrice de Couverture du Raffinement (KAOS AND/OR Goal Refinement + Ontologie)
 * et compose les liaisons multi-axes d'un sujet.
 */
export function computeRefinementCoverage(
  input: SubjectRefinementInput,
  catalog: OntologyCatalog
): RefinementCoverageReport {
  const matchedConcepts = resolveSubjectConcepts(input, catalog);
  const factsText = (input.structuredFacts || []).map((f) => f.statement).join(' ');
  const corpus = normalizeText(
    [
      input.title || '',
      input.problem || '',
      input.decisionText || '',
      input.detailedSpec || '',
      factsText
    ].join(' ')
  );

  // 1. Collecte des axes de raffinement obligatoires (triplets `requires_aspect` issus des concepts retenus)
  const mandatoryAxisMap = new Map<string, OntologyTriplet>();
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

  // 2. Liaisons explicites déjà présentes sur le paquet + inférence sémantique optionnelle depuis l'ontologie
  const boundLeafUrns = new Set<string>(
    (input.explicitBindings || []).map((b) => b.urn)
  );

  const shouldAutoBind = input.autoBindFromText ?? boundLeafUrns.size === 0;

  const axes: AxisCoverageItem[] = [];

  for (const [axisUrn, reqTriplet] of mandatoryAxisMap.entries()) {
    const axisEntity = catalog.entities[axisUrn];
    const implTriplets = queryOntologyTriplets(catalog, {
      subject: axisUrn,
      predicate: 'implemented_by'
    });

    const candidateLeaves: CandidateLeafSummary[] = [];
    const boundLeaves: CandidateLeafSummary[] = [];

    for (const implT of implTriplets) {
      const leafEntity = catalog.entities[implT.object];
      if (!leafEntity) continue;

      const summary = toCandidateSummary(leafEntity);
      candidateLeaves.push(summary);

      const isExplicitlyBound = boundLeafUrns.has(leafEntity.urn);
      const semanticScore = shouldAutoBind ? scoreEntityAgainstCorpus(leafEntity, corpus) : 0;
      const isDefaultStandard = shouldAutoBind && leafEntity.is_default_standard === true;

      if (isExplicitlyBound || semanticScore > 0 || isDefaultStandard) {
        boundLeafUrns.add(leafEntity.urn);
        boundLeaves.push(summary);
      }
    }

    // Auto-raffinement par défaut (KAOS OR-Refinement) : tant qu'une feuille standard homologuée existe
    // dans l'ontologie pour cet axe obligatoire, on la lie automatiquement sans attendre un clic manuel.
    if (shouldAutoBind && boundLeaves.length === 0 && candidateLeaves.length > 0) {
      const defaultCandidate =
        candidateLeaves.find((c) => c.oracleRules.length > 0) || candidateLeaves[0];
      boundLeafUrns.add(defaultCandidate.urn);
      boundLeaves.push(defaultCandidate);
    }

    const oracleRulesCount = boundLeaves.reduce((acc, l) => acc + l.oracleRules.length, 0);

    let status: AxisCoverageStatus = 'missing_refinement';
    if (boundLeaves.length > 0) {
      status = oracleRulesCount > 0 ? 'covered_executable' : 'covered_no_oracle';
    }

    axes.push({
      axisUrn,
      axisTitle: axisEntity?.title || axisUrn,
      domain: axisEntity?.domain || 'architecture',
      rationale: reqTriplet.rationale || 'Axe obligatoire requis par le concept parent.',
      status,
      boundLeaves,
      candidateLeaves,
      oracleRulesCount
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
    axes,
    clauses,
    dependencyIssues,
    composedBindings,
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

  for (const b of bindings) {
    const entity = catalog.entities[b.urn];
    if (!entity) continue;
    if (entity.domain) coveredDomains.add(entity.domain);

    const tpl = (entity.hydration_template || {}) as Record<string, any>;
    const proj = (entity.projections || {}) as Record<string, any>;

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
          tpl.nautobot_device?.dataplane_profile || 'SUSE Telco Cloud & Sylva Standard'
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
              dataplaneProfile: 'SUSE Telco Cloud & Sylva'
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
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1alpha5',
        kind: 'BareMetalHost',
        metadata: {
          name: nodeHostname,
          namespace: 'sylva-system',
          labels: {
            'archinex.io/device-type': nodeType,
            'archinex.io/cluster-pool': prof.clusterPool,
            'archinex.io/distribution': 'SUSE-Telco-Cloud-RKE2',
            'archinex.io/orchestrator': 'Sylva-CAPI-Metal3',
            'archinex.io/host-os': 'SLE-Micro-5.5',
            'archinex.io/security-zones': securityZones.map((z) => z.zone_id).join('-') || 'default'
          }
        },
        spec: {
          role: nodeRole,
          bmc: { address: nodeBmcAddress },
          bootMACAddress: `52:54:00:12:34:${56 + idx}`
        }
      });
    });
  }

  return {
    nautobot_planned_devices: nautobotDevices,
    k8s_manifests: k8sManifests,
    security_zones: securityZones,
    environments,
    power_feeds: powerFeeds,
    coveredDomains: Array.from(coveredDomains)
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
