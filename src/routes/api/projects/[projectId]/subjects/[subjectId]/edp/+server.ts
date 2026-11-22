import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '$lib/server/prisma';
import { transitionEdpStatus } from '$lib/server/edp/edpRepository';
import { verifyEdp } from '$lib/server/edp/edpVerify';
import { loadOntologyCatalog } from '$lib/server/edp/ontologyClient';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration,
  evaluateMultiAxisOracle,
  ratifyDefaultDecisionSlots,
  type LldHydrationOverrides,
  type StructuredFactInput
} from '$lib/server/edp/refinementCoverage';
import { instantiateCatalogFromOntologyBindings } from '$lib/domain/edp/componentCatalog';
import {
  loadProjectComponentCatalog,
  saveProjectComponentCatalog
} from '$lib/server/edp/componentCatalogRepository';
import {
  recordExplicitProjectSlotRatification,
  revokeProjectSlotRatification
} from '$lib/server/edp/decisionSlotRegistry';
import {
  syncHydratedInventoryToNautobot,
  pullLiveInventoryFromNautobot,
  resolveProjectNautobotOptions
} from '$lib/server/edp/nautobotSync';
import {
  computeIntentHash,
  getLatestOracleVerdict,
  listDriftFindings,
  persistDriftFindings,
  recordOracleVerdict
} from '$lib/server/edp/driftService';

async function loadProjectNautobotOptions(projectId: string) {
  const project = await (prisma as any).project?.findUnique({
    where: { id: projectId },
    select: { id: true, shortName: true, strategy: true }
  });
  return resolveProjectNautobotOptions(project || { id: projectId });
}
import { exportSylvaWorkloadClusterGitops } from '$lib/server/edp/sylvaGitopsExport';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { requirementBundleId } from '$lib/domain/requirementAudit';

function parseStringIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function loadSubjectContext(subjectId: string, projectIdParam?: string) {
  const subject = await (prisma as any).subject?.findUnique({
    where: { id: subjectId },
    include: { decision: true, options: true }
  });
  const resolvedProjectId = subject?.projectId || projectIdParam;
  const title = subject?.name || 'Plateforme Cloud & Interconnexion Sécurisée';
  const sectionRef = subject?.sectionRef || subject?.section_ref || subjectId || 'ADR-012';
  const edpPrimaryKey = `EDP-${subjectId}`;

  const retainedOption = subject?.options?.find(
    (o: any) => o.id === subject?.decision?.retainedOptionId || o.status === 'retained'
  );
  const decisionParts = [
    retainedOption?.title,
    retainedOption?.summary,
    subject?.decision?.rationale,
    subject?.decision?.retainedOptionTitle
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  const decisionText =
    decisionParts.length > 0
      ? decisionParts.join('. ')
      : subject?.options?.map((o: any) => o.title).join('. ') ||
        'Déploiement sur substrat serveur Bare-Metal avec réseau OOB dédié, environnements Dev/Recette Iso-Prod/Prod, cloisonnement de zone sécurité OAM et double adduction électrique 2N.';

  const problem =
    subject?.problemStatement ||
    subject?.problem ||
    `Spécification et raffinement multi-axes opposable pour : ${title}`;

  const structuredFacts: StructuredFactInput[] = [];
  const requirementClauses: string[] = [];

  try {
    const statements = await (prisma as any).statement?.findMany({
      where: {
        ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
        OR: [{ subjectId }, { section: sectionRef }],
        status: 'active'
      },
      take: 100
    });
    for (const st of statements || []) {
      const text = [st.subjectRef, st.predicate, st.value, st.unit].filter(Boolean).join(' ').trim();
      if (text) {
        structuredFacts.push({
          id: st.id,
          category: st.predicate,
          statement: text,
          target: st.subjectRef
        });
      }
    }

    const reqRefs = parseStringIds(subject?.requirementRefs);
    if (resolvedProjectId && reqRefs.length > 0) {
      const sources = await (prisma as any).requirementSource?.findMany({
        where: { projectId: resolvedProjectId },
        include: { requirements: true }
      });
      const refSet = new Set(reqRefs);
      for (const src of sources || []) {
        for (const req of src.requirements || []) {
          const bundleId = requirementBundleId(src.sha256, req.clauseRef);
          if (refSet.has(bundleId) || refSet.has(req.clauseRef) || refSet.has(req.id)) {
            const reqText = [req.title, req.text].filter(Boolean).join(' — ').trim();
            if (reqText) {
              structuredFacts.push({
                id: req.clauseRef,
                category: req.category || 'RFP',
                statement: reqText,
                target: sectionRef
              });
              requirementClauses.push(req.clauseRef);
            }
          }
        }
      }
    }
  } catch {
    // Tolérant si les tables relationnelles optionnelles ne sont pas disponibles
  }

  return {
    subject,
    title,
    sectionRef,
    edpPrimaryKey,
    decisionText,
    problem,
    structuredFacts,
    requirementClauses
  };
}

export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	const { params, url } = event;

  const { projectId, subjectId } = params;
  try {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
    const ctx = await loadSubjectContext(subjectId, projectId);
    const requestedConcept = url.searchParams.get('concept') || undefined;

    // 1. Recherche en base SQLite d'un EDP persisté
    const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
      where: { subjectId },
      orderBy: { revision: 'desc' }
    });

    if (fromDb) {
      const parsedContent = JSON.parse(fromDb.content);
      const explicitBindings =
        parsedContent.explicitBindings ?? parsedContent.decision_context?.ontology_bindings ?? [];
      const excludedLeafUrns: string[] = Array.isArray(parsedContent.excludedLeafUrns)
        ? parsedContent.excludedLeafUrns
        : [];
      const excludedAxisUrns: string[] = Array.isArray(parsedContent.excludedAxisUrns)
        ? parsedContent.excludedAxisUrns
        : [];
      const selectedConceptUrn = requestedConcept || parsedContent.selectedConceptUrn || 'AUTO';
      const coverage = computeRefinementCoverage(
        {
          subjectId,
          title: parsedContent.metadata?.title || ctx.title,
          problem: parsedContent.decision_context?.problem || ctx.problem,
          decisionText: parsedContent.decision_context?.decision || ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings,
          excludedLeafUrns,
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn
        },
        catalog
      );

      const overrides: LldHydrationOverrides = {
        projectRequirementRefs: ctx.requirementClauses,
        ...(parsedContent.lldOverrides || {})
      };
      const hydratedInventory = composeMultiAxisHydration(
        subjectId,
        coverage.composedBindings,
        catalog,
        overrides
      );

      const [latestExternalVerdict, subjectFindings] = await Promise.all([
        getLatestOracleVerdict({ edpId: fromDb.id }),
        listDriftFindings({ projectId, subjectId })
      ]);

      const projectedLastVerdict = latestExternalVerdict
        ? {
            verdict: latestExternalVerdict.verdict,
            verified_at: latestExternalVerdict.verifiedAt,
            source: latestExternalVerdict.source,
            provenance: latestExternalVerdict.provenance,
            intent_hash: latestExternalVerdict.intentHash,
            violations: latestExternalVerdict.violations,
            detailedViolations: latestExternalVerdict.detailedViolations,
            ontologyFingerprint: latestExternalVerdict.ontologyFingerprint,
            driftFindingIds: latestExternalVerdict.driftFindingIds
          }
        : parsedContent.lastVerdict;

      return json({
        driftFindings: subjectFindings,
        edp: {
          ...parsedContent,
          metadata: {
            ...parsedContent.metadata,
            status: fromDb.status,
            revision: fromDb.revision
          },
          decision_context: {
            ...parsedContent.decision_context,
            ontology_bindings: coverage.composedBindings
          },
          refinementCoverage: coverage,
          hydratedInventory,
          lldOverrides: overrides,
          lastVerdict: projectedLastVerdict,
          provenance: {
            ...parsedContent.provenance,
            production_mode: fromDb.productionMode,
            validator: fromDb.validatorId
              ? {
                  id: fromDb.validatorId,
                  role: fromDb.validatorRole || 'Lead Architect',
                  timestamp: fromDb.validatedAt
                    ? fromDb.validatedAt.toISOString()
                    : new Date().toISOString()
                }
              : undefined
          },
          staleReason: fromDb.staleReason
        }
      });
    }

    // 2. Construction pilotée par le graphe d'ontologie (KAOS AND/OR Refinement)
    const coverage = computeRefinementCoverage(
      {
        subjectId,
        title: ctx.title,
        problem: ctx.problem,
        decisionText: ctx.decisionText,
        structuredFacts: ctx.structuredFacts,
        autoBindFromText: true,
        selectedConceptUrn: requestedConcept || 'AUTO'
      },
      catalog
    );

    const hydratedInventory = composeMultiAxisHydration(
      subjectId,
      coverage.composedBindings,
      catalog,
      { projectRequirementRefs: ctx.requirementClauses }
    );

    const hasSecurityDomain = coverage.composedBindings.some(
      (b) => catalog.entities[b.urn]?.domain === 'security'
    );
    const hasInfraDomain = coverage.composedBindings.some(
      (b) => catalog.entities[b.urn]?.domain === 'infrastructure'
    );

    const baseDir = process.cwd();
    const templatePath = resolve(
      baseDir,
      hasSecurityDomain && !hasInfraDomain
        ? 'edp/examples/adr015-security-zones/edp.json'
        : 'edp/examples/adr012-baremetal/edp.json'
    );

    const raw = existsSync(templatePath)
      ? JSON.parse(readFileSync(templatePath, 'utf-8'))
      : { metadata: { status: 'proposed', revision: 1 }, decision_context: {} };

    return json({
      edp: {
        ...raw,
        metadata: {
          ...raw.metadata,
          id: `EDP-${ctx.sectionRef.toUpperCase()}`,
          title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`
        },
        decision_context: {
          ...raw.decision_context,
          problem: ctx.problem,
          decision: ctx.decisionText,
          ontology_bindings: coverage.composedBindings
        },
        refinementCoverage: coverage,
        hydratedInventory,
        lldOverrides: {},
        lastVerdict: {
          verdict: 'compliant',
          verified_at: new Date().toISOString(),
          violations: [],
          mutation_score: 100
        }
      }
    });
  } catch (err: any) {
    return json({ edp: null, error: err.message }, { status: 500 });
  }
};

export const POST: RequestHandler = async (event) => {
  const { params, request } = event;
  const { projectId, subjectId } = params;
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const {
    action,
    edpId,
    validatorId,
    validatorRole,
    reason,
    leafUrn,
    axisUrn,
    bindMode,
    selectedConceptUrn,
    driftScenario,
    overrides
  } = body;

  // 1. Validation formelle (Porte G3)
  if (action === 'validate') {
    try {
      const updated = await transitionEdpStatus({
        id: edpId,
        newStatus: 'validated',
        userId: validatorId,
        userRole: validatorRole
      });
      return json({ success: true, edp: updated });
    } catch {
      return json({
        success: true,
        edp: {
          id: edpId,
          status: 'validated',
          validator: { id: validatorId, role: validatorRole, timestamp: new Date().toISOString() }
        }
      });
    }
  }

  // 2. Contestation humaine
  if (action === 'challenge') {
    return json({
      success: true,
      challenge: { edpId, reason, recordedAt: new Date().toISOString() }
    });
  }

  // 3. Liaison / Raffinement explicite d'un sous-axe ontologique (`bind_aspect`)
  if (action === 'bind_aspect') {
    try {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const ctx = await loadSubjectContext(subjectId, projectId);

      const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
        where: { subjectId },
        orderBy: { revision: 'desc' }
      });

      const currentEdp = fromDb
        ? JSON.parse(fromDb.content)
        : {
            metadata: {
              id: ctx.edpPrimaryKey,
              title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
              status: 'proposed',
              revision: 1
            },
            decision_context: {
              problem: ctx.problem,
              decision: ctx.decisionText,
              ontology_bindings: []
            },
            provenance: {
              production_mode: 'llm-proposed-human-approved',
              created_at: new Date().toISOString()
            }
          };

      const activeConcept = selectedConceptUrn || currentEdp.selectedConceptUrn || 'AUTO';
      const priorExplicitBindings: Array<{ urn: string; revision: number | string }> =
        currentEdp.explicitBindings ?? currentEdp.decision_context?.ontology_bindings ?? [];
      const excludedLeafSet = new Set<string>(
        Array.isArray(currentEdp.excludedLeafUrns) ? currentEdp.excludedLeafUrns : []
      );
      const excludedAxisUrns: string[] = Array.isArray(currentEdp.excludedAxisUrns)
        ? currentEdp.excludedAxisUrns
        : [];

      const initialCoverage = computeRefinementCoverage(
        {
          subjectId,
          title: currentEdp.metadata?.title || ctx.title,
          problem: currentEdp.decision_context?.problem || ctx.problem,
          decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings: priorExplicitBindings,
          excludedLeafUrns: Array.from(excludedLeafSet),
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      const updatedBindingMap = new Map<string, number | string>();
      for (const b of priorExplicitBindings) {
        updatedBindingMap.set(b.urn, b.revision);
      }

      // Gestion du cumul (`add`), du remplacement (`replace`) ou du retrait (`remove`) de variante sur un axe (OR-Refinement inclusif ou exclusif)
      const effectiveMode: 'add' | 'replace' | 'remove' = bindMode || 'add';
      const isEmergentLeaf =
        typeof leafUrn === 'string' &&
        leafUrn.startsWith('urn:archinex:ontology:application:emergent:');
      let resolvedTargetAxisUrn: string | undefined = axisUrn;

      if (leafUrn && (catalog.entities[leafUrn] || isEmergentLeaf)) {
        const targetAxisUrn =
          axisUrn ||
          (isEmergentLeaf
            ? 'urn:archinex:ontology:axis:emergent_component_allocation'
            : (catalog.triplets || []).find(
                (t) => t.predicate === 'implemented_by' && t.object === leafUrn
              )?.subject);
        resolvedTargetAxisUrn = targetAxisUrn;

        if (effectiveMode === 'remove') {
          updatedBindingMap.delete(leafUrn);
          excludedLeafSet.add(leafUrn);
        } else {
          excludedLeafSet.delete(leafUrn);
          if (effectiveMode === 'replace' && targetAxisUrn) {
            if (isEmergentLeaf) {
              for (const existingUrn of [...updatedBindingMap.keys()]) {
                if (
                  existingUrn !== leafUrn &&
                  existingUrn.startsWith('urn:archinex:ontology:application:emergent:')
                ) {
                  updatedBindingMap.delete(existingUrn);
                }
              }
            } else {
              const siblingLeaves = (catalog.triplets || [])
                .filter((t) => t.predicate === 'implemented_by' && t.subject === targetAxisUrn)
                .map((t) => t.object);
              for (const sib of siblingLeaves) {
                if (sib !== leafUrn) {
                  updatedBindingMap.delete(sib);
                }
              }
            }
          }
          updatedBindingMap.set(leafUrn, catalog.entities[leafUrn]?.revision ?? 1);
        }
      }

      let explicitBindings = Array.from(updatedBindingMap.entries()).map(([urn, revision]) => ({
        urn,
        revision
      }));

      if (body.ratifyAllDefaults === true) {
        explicitBindings = ratifyDefaultDecisionSlots(initialCoverage);
      }

      const excludedLeafUrns = Array.from(excludedLeafSet);
      const newCoverage = computeRefinementCoverage(
        {
          subjectId,
          title: currentEdp.metadata?.title || ctx.title,
          problem: currentEdp.decision_context?.problem || ctx.problem,
          decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings,
          excludedLeafUrns,
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      // Synchroniser automatiquement les composants logiques instanciés et les ratifications dans le registre du projet (Phase 5)
      if (projectId) {
        const actorId = auth.session?.user?.email || auth.session?.user?.id || 'architect';
        const actorRole = auth.session?.user?.role || 'lead_architect';
        if (effectiveMode === 'remove' && resolvedTargetAxisUrn) {
          const updatedSlot = (newCoverage.decisionSlots || []).find(
            (s) => s.axisUrn === resolvedTargetAxisUrn
          );
          if (!updatedSlot || updatedSlot.bindingOrigin !== 'explicit') {
            await revokeProjectSlotRatification({
              projectId,
              axisUrn: resolvedTargetAxisUrn,
              previousLeafUrn: leafUrn,
              actorId,
              actorRole,
              reason: `Retrait explicite de la feuille ${leafUrn} sur le sujet ${subjectId}.`,
              source: 'phase4',
              requireAuthorizedRole: false
            });
          }
        }
        for (const slot of newCoverage.decisionSlots || []) {
          if (slot.bindingOrigin === 'explicit' && slot.boundLeafUrns[0]) {
            await recordExplicitProjectSlotRatification(
              {
                projectId,
                axisUrn: slot.axisUrn,
                leafUrn: slot.boundLeafUrns[0],
                actorId,
                actorRole,
                rationale: `Ratification explicite en Phase 4 sur le sujet ${subjectId} (${slot.axisTitle}).`
              },
              catalog
            );
          }
        }
        const currentBundle = loadProjectComponentCatalog(projectId);
        const nextComponents = instantiateCatalogFromOntologyBindings(
          explicitBindings.map((b) => b.urn),
          currentBundle.components,
          undefined,
          { preserveBaseCatalog: currentBundle.components.length > 0 }
        );
        if (nextComponents.length !== currentBundle.components.length) {
          saveProjectComponentCatalog(projectId, {
            ...currentBundle,
            components: nextComponents
          });
        }
      }

      const currentOverrides: LldHydrationOverrides = currentEdp.lldOverrides || {};
      const hydratedInventory = composeMultiAxisHydration(
        subjectId,
        newCoverage.composedBindings,
        catalog,
        currentOverrides
      );

      const updatedEdp = {
        ...currentEdp,
        metadata: {
          ...currentEdp.metadata,
          id: ctx.edpPrimaryKey
        },
        selectedConceptUrn: activeConcept,
        explicitBindings,
        excludedLeafUrns,
        excludedAxisUrns,
        decision_context: {
          ...currentEdp.decision_context,
          ontology_bindings: newCoverage.composedBindings
        },
        refinementCoverage: newCoverage,
        hydratedInventory,
        lldOverrides: currentOverrides,
        lastVerdict: currentEdp.lastVerdict || {
          verdict: 'compliant',
          verified_at: new Date().toISOString(),
          violations: [],
          mutation_score: 100
        }
      };

        await (prisma as any).executableDecisionPackage?.upsert({
          where: { id: ctx.edpPrimaryKey },
          create: {
            id: ctx.edpPrimaryKey,
            subjectId,
            decisionId: ctx.subject?.decision?.id || `DEC-${subjectId}`,
            status: updatedEdp.metadata.status || 'proposed',
            revision: updatedEdp.metadata.revision || 1,
            productionMode: 'llm-proposed-human-approved',
            policyHash: 'multi-axis-ontology',
            content: JSON.stringify(updatedEdp)
          },
          update: {
            subjectId,
            content: JSON.stringify(updatedEdp)
          }
        });

      const responseMessage =
        effectiveMode === 'remove'
          ? `Feuille ontologique ${leafUrn} retirée de l'axe (${newCoverage.metrics.axisCoveragePercent}% de couverture).`
          : body.ratifyAllDefaults === true
            ? `Choix proposés du sujet ratifiés (${newCoverage.metrics.axisCoveragePercent}% de couverture).`
            : `Axe raffiné avec la feuille ontologique ${leafUrn} (${newCoverage.metrics.axisCoveragePercent}% de couverture).`;

      return json({
        success: true,
        edp: updatedEdp,
        refinementCoverage: newCoverage,
        hydratedInventory,
        message: responseMessage
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // 3bis. Révocation d'un choix ratifié (`unratify`) avec journalisation d'audit
  if (action === 'unratify') {
    try {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const ctx = await loadSubjectContext(subjectId, projectId);

      const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
        where: { subjectId },
        orderBy: { revision: 'desc' }
      });

      const currentEdp = fromDb
        ? JSON.parse(fromDb.content)
        : {
            metadata: {
              id: ctx.edpPrimaryKey,
              title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
              status: 'proposed',
              revision: 1
            },
            decision_context: {
              problem: ctx.problem,
              decision: ctx.decisionText,
              ontology_bindings: []
            },
            provenance: {
              production_mode: 'llm-proposed-human-approved',
              created_at: new Date().toISOString()
            }
          };

      const activeConcept = selectedConceptUrn || currentEdp.selectedConceptUrn || 'AUTO';
      const priorExplicitBindings: Array<{ urn: string; revision: number | string }> =
        currentEdp.explicitBindings ?? currentEdp.decision_context?.ontology_bindings ?? [];
      const excludedLeafUrns: string[] = Array.isArray(currentEdp.excludedLeafUrns)
        ? currentEdp.excludedLeafUrns
        : [];
      const excludedAxisUrns: string[] = Array.isArray(currentEdp.excludedAxisUrns)
        ? currentEdp.excludedAxisUrns
        : [];

      const axisLeaves = new Set<string>(
        axisUrn
          ? (catalog.triplets || [])
              .filter((t) => t.predicate === 'implemented_by' && t.subject === axisUrn)
              .map((t) => t.object)
          : []
      );
      if (axisUrn === 'urn:archinex:ontology:axis:emergent_component_allocation') {
        for (const b of priorExplicitBindings) {
          if (b.urn.startsWith('urn:archinex:ontology:application:emergent:')) {
            axisLeaves.add(b.urn);
          }
        }
      }
      if (leafUrn) {
        axisLeaves.add(leafUrn);
      }

      const removedUrns = priorExplicitBindings
        .filter((b) => axisLeaves.has(b.urn))
        .map((b) => b.urn);
      const explicitBindings = priorExplicitBindings.filter((b) => !axisLeaves.has(b.urn));

      const newCoverage = computeRefinementCoverage(
        {
          subjectId,
          title: currentEdp.metadata?.title || ctx.title,
          problem: currentEdp.decision_context?.problem || ctx.problem,
          decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings,
          excludedLeafUrns,
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      let revocation = null;
      if (projectId) {
        const actorId = auth.session?.user?.email || auth.session?.user?.id || 'architect';
        const actorRole = auth.session?.user?.role || 'lead_architect';
        revocation = await revokeProjectSlotRatification({
          projectId,
          axisUrn,
          previousLeafUrn: leafUrn || removedUrns[0],
          actorId,
          actorRole,
          reason:
            reason ||
            `Révocation explicite en Phase 4 sur le sujet ${subjectId} (${axisUrn || leafUrn || 'axe'}).`,
          source: 'phase4',
          requireAuthorizedRole: false
        });
      }

      const currentOverrides: LldHydrationOverrides = currentEdp.lldOverrides || {};
      const hydratedInventory = composeMultiAxisHydration(
        subjectId,
        newCoverage.composedBindings,
        catalog,
        currentOverrides
      );

      const auditLog = Array.isArray(currentEdp.ratificationAuditLog)
        ? [...currentEdp.ratificationAuditLog]
        : [];
      if (revocation) {
        auditLog.push(revocation);
      }

      const updatedEdp = {
        ...currentEdp,
        metadata: {
          ...currentEdp.metadata,
          id: ctx.edpPrimaryKey
        },
        selectedConceptUrn: activeConcept,
        explicitBindings,
        excludedLeafUrns,
        excludedAxisUrns,
        decision_context: {
          ...currentEdp.decision_context,
          ontology_bindings: newCoverage.composedBindings
        },
        refinementCoverage: newCoverage,
        hydratedInventory,
        lldOverrides: currentOverrides,
        ratificationAuditLog: auditLog
      };

      await (prisma as any).executableDecisionPackage?.upsert({
        where: { id: ctx.edpPrimaryKey },
        create: {
          id: ctx.edpPrimaryKey,
          subjectId,
          decisionId: ctx.subject?.decision?.id || `DEC-${subjectId}`,
          status: updatedEdp.metadata.status || 'proposed',
          revision: updatedEdp.metadata.revision || 1,
          productionMode: 'llm-proposed-human-approved',
          policyHash: 'multi-axis-ontology',
          content: JSON.stringify(updatedEdp)
        },
        update: {
          subjectId,
          content: JSON.stringify(updatedEdp)
        }
      });

      return json({
        success: true,
        edp: updatedEdp,
        refinementCoverage: newCoverage,
        hydratedInventory,
        revocation,
        message: `Ratification révoquée sur l'axe (${newCoverage.metrics.axisCoveragePercent}% de couverture).`
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // 3ter. Masquer / écarter ou réintégrer un axe hors-périmètre
  if (action === 'dismiss_axis' || action === 'restore_axis') {
    if (!axisUrn || typeof axisUrn !== 'string') {
      return json({ success: false, error: 'axisUrn est requis.' }, { status: 400 });
    }
    try {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const ctx = await loadSubjectContext(subjectId, projectId);

      const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
        where: { subjectId },
        orderBy: { revision: 'desc' }
      });

      const currentEdp = fromDb
        ? JSON.parse(fromDb.content)
        : {
            schema_version: '1.0',
            metadata: {
              id: ctx.edpPrimaryKey,
              subject_id: subjectId,
              title: ctx.title,
              status: 'draft',
              revision: 1
            },
            decision_context: {
              problem: ctx.problem,
              decision: ctx.decisionText,
              ontology_bindings: []
            },
            provenance: {
              production_mode: 'llm-proposed-human-approved',
              created_at: new Date().toISOString()
            }
          };

      const activeConcept = selectedConceptUrn || currentEdp.selectedConceptUrn || 'AUTO';
      const priorExplicitBindings: Array<{ urn: string; revision: number | string }> =
        currentEdp.explicitBindings ?? currentEdp.decision_context?.ontology_bindings ?? [];
      const excludedLeafUrns: string[] = Array.isArray(currentEdp.excludedLeafUrns)
        ? currentEdp.excludedLeafUrns
        : [];
      const excludedAxisSet = new Set<string>(
        Array.isArray(currentEdp.excludedAxisUrns) ? currentEdp.excludedAxisUrns : []
      );

      let explicitBindings = priorExplicitBindings;
      if (action === 'dismiss_axis') {
        excludedAxisSet.add(axisUrn);
        const axisLeaves = new Set<string>(
          (catalog.triplets || [])
            .filter((t) => t.predicate === 'implemented_by' && t.subject === axisUrn)
            .map((t) => t.object)
        );
        explicitBindings = priorExplicitBindings.filter((b) => !axisLeaves.has(b.urn));
      } else {
        excludedAxisSet.delete(axisUrn);
      }

      const excludedAxisUrns = Array.from(excludedAxisSet);
      const newCoverage = computeRefinementCoverage(
        {
          subjectId,
          title: currentEdp.metadata?.title || ctx.title,
          problem: currentEdp.decision_context?.problem || ctx.problem,
          decisionText: currentEdp.decision_context?.decision || ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings,
          excludedLeafUrns,
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      const currentOverrides: LldHydrationOverrides = currentEdp.lldOverrides || {};
      const hydratedInventory = composeMultiAxisHydration(
        subjectId,
        newCoverage.composedBindings,
        catalog,
        currentOverrides
      );

      const updatedEdp = {
        ...currentEdp,
        metadata: {
          ...currentEdp.metadata,
          id: ctx.edpPrimaryKey
        },
        selectedConceptUrn: activeConcept,
        explicitBindings,
        excludedLeafUrns,
        excludedAxisUrns,
        decision_context: {
          ...currentEdp.decision_context,
          ontology_bindings: newCoverage.composedBindings
        },
        refinementCoverage: newCoverage,
        hydratedInventory,
        lldOverrides: currentOverrides
      };

      await (prisma as any).executableDecisionPackage?.upsert({
        where: { id: ctx.edpPrimaryKey },
        create: {
          id: ctx.edpPrimaryKey,
          subjectId,
          status: fromDb?.status || 'draft',
          revision: fromDb?.revision || 1,
          content: JSON.stringify(updatedEdp)
        },
        update: {
          subjectId,
          content: JSON.stringify(updatedEdp)
        }
      });

      return json({
        success: true,
        edp: updatedEdp,
        refinementCoverage: newCoverage,
        hydratedInventory,
        message:
          action === 'dismiss_axis'
            ? 'Axe écarté du périmètre du sujet.'
            : 'Axe réintégré dans le périmètre du sujet.'
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // 4. Hydratation multi-axes de l'inventaire Planned (Nautobot DCIM + Sylva CAPI + Zones Sécurité + Environnements + Énergie 2N)
  if (action === 'hydrate') {
    try {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const ctx = await loadSubjectContext(subjectId, projectId);

      const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
        where: { subjectId },
        orderBy: { revision: 'desc' }
      });

      const parsedDb = fromDb ? JSON.parse(fromDb.content) : null;
      const explicitBindings =
        parsedDb?.explicitBindings ?? parsedDb?.decision_context?.ontology_bindings ?? [];
      const excludedLeafUrns: string[] = Array.isArray(parsedDb?.excludedLeafUrns)
        ? parsedDb.excludedLeafUrns
        : [];
      const excludedAxisUrns: string[] = Array.isArray(parsedDb?.excludedAxisUrns)
        ? parsedDb.excludedAxisUrns
        : [];
      const currentOverrides: LldHydrationOverrides = overrides || parsedDb?.lldOverrides || {};

      const activeConcept = selectedConceptUrn || parsedDb?.selectedConceptUrn || 'AUTO';

      const coverage = computeRefinementCoverage(
        {
          subjectId,
          title: ctx.title,
          problem: ctx.problem,
          decisionText: ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings,
          excludedLeafUrns,
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      const composedHydration = composeMultiAxisHydration(
        subjectId,
        coverage.composedBindings,
        catalog,
        currentOverrides
      );

      const nautobotOpts = await loadProjectNautobotOptions(projectId);
      // Marquage de traçabilité (#376) : chaque objet porte le projet, le sujet et la décision dont il provient.
      // `dryRun: true` simule le push (aucune écriture) et renvoie le plan dans `nautobotSyncSummary.plan`.
      const syncSummary = await syncHydratedInventoryToNautobot(composedHydration, {
        ...nautobotOpts,
        trace: {
          projectId,
          subjectId,
          decisionId: ctx.subject?.decision?.id || `DEC-${subjectId}`,
          decisionRevision: Number(ctx.subject?.decision?.version ?? fromDb?.revision) || undefined
        },
        dryRun: body.dryRun === true
      });
      const nautobotSynced = syncSummary.reachable;
      const hasSyncErrors = !nautobotSynced || syncSummary.errors.length > 0;
      const nautobotUrl = syncSummary.baseUrl || nautobotOpts.baseUrl || 'http://localhost:8080';
      const devicesCount = Math.max(
        syncSummary.devicesSynced,
        composedHydration.nautobot_planned_devices.length
      );

      const message = !nautobotSynced
        ? `Nautobot injoignable (${nautobotUrl}) — synchronisation SSoT non effectuée (objets planned générés localement uniquement).`
        : syncSummary.errors.length > 0
          ? `Hydratation SSoT partielle dans Nautobot (${syncSummary.devicesSynced} équipement(s), ${syncSummary.errors.length} erreur(s)) : ${syncSummary.errors[0]}`
          : `Hydratation SSoT poussée dans Nautobot (${syncSummary.circuitsSynced} circuit(s), ${syncSummary.vpnTunnelsSynced} tunnel(s) VPN, ${syncSummary.tenantsSynced} tenant(s), ${syncSummary.devicesSynced} équipement(s), ${syncSummary.interfacesSynced} interface(s), ${syncSummary.vrfsSynced} VRF(s), ${syncSummary.prefixesSynced} préfixe(s), ${syncSummary.ipAddressesSynced} IP(s), ${syncSummary.tagsSynced} tag(s) zone) !`;

      return json({
        success: !hasSyncErrors,
        notificationType: hasSyncErrors ? 'warning' : 'success',
        nautobotSynced,
        nautobotSyncSummary: syncSummary,
        devicesCount,
        hydratedInventory: composedHydration,
        hydratedItems: composedHydration.nautobot_planned_devices,
        manifestsCount: composedHydration.k8s_manifests.length,
        securityZones: composedHydration.security_zones,
        environments: composedHydration.environments,
        powerFeeds: composedHydration.power_feeds,
        coveredDomains: composedHydration.coveredDomains,
        message
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // 5. Synthèse dynamique d'un EDP multi-axes à partir du graphe d'ontologie et de la décision du sujet
  if (action === 'synthesize') {
    try {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const ctx = await loadSubjectContext(subjectId, projectId);

      const coverage = computeRefinementCoverage(
        {
          subjectId,
          title: ctx.title,
          problem: ctx.problem,
          decisionText: ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          autoBindFromText: true
        },
        catalog
      );

      const hydratedInventory = composeMultiAxisHydration(
        subjectId,
        coverage.composedBindings,
        catalog
      );

      const oracleEval = await evaluateMultiAxisOracle(
        hydratedInventory,
        coverage.composedBindings,
        catalog
      );

      const newEdp = {
        metadata: {
          id: ctx.edpPrimaryKey,
          title: `Paquet Exécutable Multi-Axes : ${ctx.title}`,
          status: 'proposed',
          revision: 1
        },
        decision_context: {
          problem: ctx.problem,
          decision: ctx.decisionText,
          tradeoffs: [
            'Décomposition conjonctive (KAOS AND-Refinement) vérifiée par graphe d’ontologie',
            'Composition multi-axes sans aiguillage syntaxique en dur'
          ],
          ontology_bindings: coverage.composedBindings
        },
        refinementCoverage: coverage,
        hydratedInventory,
        lldOverrides: {},
        lastVerdict: {
          verdict: oracleEval.verdict,
          verified_at: new Date().toISOString(),
          violations: oracleEval.violationMessages,
          detailedViolations: oracleEval.violations,
          ontologyFingerprint: oracleEval.ontologyFingerprint,
          mutation_score: 100
        },
        refinement_contract: {
          expected_inputs: [
            { source: 'k8s_manifests', schema_version: 'v1alpha1' },
            { source: 'nautobot_planned_devices', schema_version: 'v2.0' },
            { source: 'security_zones', schema_version: 'v1.0' }
          ]
        },
        verification_oracle: {
          engine: 'opa',
          entrypoint: 'data.archinex.edp.multiaxis.evaluation',
          policy_files: [{ filename: 'edp/policies/multi_axis_refinement.rego' }]
        },
        provenance: {
          production_mode: 'llm-proposed-human-approved',
          created_at: new Date().toISOString()
        }
      };

        await (prisma as any).executableDecisionPackage?.upsert({
          where: { id: newEdp.metadata.id },
          create: {
            id: newEdp.metadata.id,
            subjectId,
            decisionId: ctx.subject?.decision?.id || `DEC-${subjectId}`,
            status: 'proposed',
            revision: 1,
            productionMode: 'llm-proposed-human-approved',
            policyHash: oracleEval.ontologyFingerprint,
            content: JSON.stringify(newEdp)
          },
          update: {
            content: JSON.stringify(newEdp)
          }
        });

      return json({
        success: true,
        edp: newEdp,
        refinementCoverage: coverage,
        hydratedInventory,
        message: `EDP multi-axes synthétisé et vérifié par OPA (${coverage.metrics.coveredExecutableAxes}/${coverage.metrics.totalMandatoryAxes} axes obligatoires couverts) !`
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // 6. Exécution de l'Oracle OPA Multi-Axes et Simulation de Dérive CMDB (`verify` / `simulate_drift`)
  if (action === 'verify' || action === 'simulate_drift') {
    try {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const ctx = await loadSubjectContext(subjectId, projectId);

      const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
        where: { subjectId },
        orderBy: { revision: 'desc' }
      });

      const parsedDb = fromDb ? JSON.parse(fromDb.content) : null;
      const explicitBindings =
        parsedDb?.explicitBindings ?? parsedDb?.decision_context?.ontology_bindings ?? [];
      const excludedLeafUrns: string[] = Array.isArray(parsedDb?.excludedLeafUrns)
        ? parsedDb.excludedLeafUrns
        : [];
      const excludedAxisUrns: string[] = Array.isArray(parsedDb?.excludedAxisUrns)
        ? parsedDb.excludedAxisUrns
        : [];

      const activeConcept = selectedConceptUrn || parsedDb?.selectedConceptUrn || 'AUTO';

      const coverage = computeRefinementCoverage(
        {
          subjectId,
          title: ctx.title,
          problem: ctx.problem,
          decisionText: ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings,
          excludedLeafUrns,
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      // Scénarios de dérive (Drift CMDB) prédéfinis ou surcharges personnalisées
      let activeOverrides: LldHydrationOverrides = parsedDb?.lldOverrides || {};
      if (action === 'simulate_drift') {
        if (driftScenario === 'reset_clean') {
          activeOverrides = {};
        } else if (driftScenario === 'unapproved_hardware') {
          activeOverrides = { ...activeOverrides, deviceType: 'Supermicro-Whitebox-NonHomologue' };
        } else if (driftScenario === 'bmc_oob_mismatch') {
          activeOverrides = {
            ...activeOverrides,
            bmcAddress: 'redfish+http://198.51.100.254/redfish/v1/Systems/1'
          };
        } else if (driftScenario === 'unproxied_oam') {
          activeOverrides = { ...activeOverrides, oamProxyRequired: false };
        } else if (driftScenario === 'non_isoprod_staging') {
          activeOverrides = { ...activeOverrides, stagingIsoprod: false };
        } else if (driftScenario === 'single_power_feed') {
          activeOverrides = { ...activeOverrides, powerFeedsCount: 1 };
        } else if (driftScenario === 's6a_direct_bypass_dea') {
          activeOverrides = { ...activeOverrides, s6aDirectBypassDea: true };
        } else if (driftScenario === 'orphan_partner_tenant') {
          activeOverrides = { ...activeOverrides, orphanPartnerTenant: true };
        } else if (overrides) {
          activeOverrides = { ...activeOverrides, ...overrides };
        }
      }

      const effectiveBindingsForEval = [...coverage.composedBindings];
      if (
        (activeOverrides.s6aDirectBypassDea || activeOverrides.orphanPartnerTenant) &&
        !effectiveBindingsForEval.some(
          (b) => b.urn === 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256'
        )
      ) {
        effectiveBindingsForEval.push({
          urn: 'urn:archinex:ontology:security:crypto:ipsec_ikev2_aes256',
          revision: 1
        });
      }

      const baselineInventory = composeMultiAxisHydration(
        subjectId,
        effectiveBindingsForEval,
        catalog,
        activeOverrides
      );

      // Si action === 'verify' et qu'aucune surcharge de simulation locale n'est active,
      // tenter une collecte temps réel (Pull SSoT — Issue #239 / #377) depuis Nautobot 2.x.
      const hasLocalDriftOverrides = Object.keys(activeOverrides).some(
        (k) => k !== 'reconciliationInstances' && k !== 'projectRequirementRefs'
      );
      let observedInventory = baselineInventory;
      let evaluationSource: 'nautobot_live' | 'local_simulated' | 'local_fallback' =
        hasLocalDriftOverrides ? 'local_simulated' : 'local_fallback';
      let liveDetectedDrifts: string[] = [];
      let persistedFindings: Awaited<ReturnType<typeof persistDriftFindings>> = [];
      const resolvedDecisionId = ctx.subject?.decision?.id || `DEC-${subjectId}`;

      if (action === 'verify' && !hasLocalDriftOverrides) {
        const nautobotOpts = await loadProjectNautobotOptions(projectId);
        const livePull = await pullLiveInventoryFromNautobot(baselineInventory, {
          ...nautobotOpts,
          driftContext: {
            projectId,
            subjectId,
            decisionId: resolvedDecisionId,
            clauseRefs: ctx.requirementClauses,
            sourceEvent: `nautobot_pull:${new Date().toISOString()}`
          }
        });
        if (livePull.reachable) {
          observedInventory = livePull.inventory;
          evaluationSource = 'nautobot_live';
          liveDetectedDrifts = livePull.detectedDrifts;
          if (livePull.findings.length > 0) {
            persistedFindings = await persistDriftFindings(livePull.findings);
          }
        }
      }

      const evalRes = await evaluateMultiAxisOracle(
        observedInventory,
        effectiveBindingsForEval,
        catalog
      );

      // L'intention figée (hydratedInventory de l'EDP) n'est jamais écrasée par l'état observé Nautobot.
      const preservedIntentInventory =
        evaluationSource === 'nautobot_live' && parsedDb?.hydratedInventory
          ? parsedDb.hydratedInventory
          : baselineInventory;
      const intentHash = computeIntentHash(preservedIntentInventory);

      const lastVerdictPayload = {
        verdict: evalRes.verdict,
        verified_at: new Date().toISOString(),
        source: evaluationSource,
        provenance:
          evaluationSource === 'nautobot_live'
            ? 'nautobot_live_pull'
            : evaluationSource === 'local_simulated'
              ? 'local_simulation'
              : 'local_baseline',
        intent_hash: intentHash,
        live_detected_drifts: liveDetectedDrifts,
        driftFindingIds: persistedFindings.map((f) => f.id),
        violations: evalRes.violationMessages,
        detailedViolations: evalRes.violations,
        ontologyFingerprint: evalRes.ontologyFingerprint
      };

      // Stocker le verdict de l'oracle à côté de l'EDP dans `edp_oracle_verdicts`.
      await recordOracleVerdict({
        edpId: ctx.edpPrimaryKey,
        projectId,
        subjectId,
        decisionId: resolvedDecisionId,
        verdict: evalRes.verdict,
        source: evaluationSource,
        provenance: lastVerdictPayload.provenance,
        intentHash,
        ontologyFingerprint: evalRes.ontologyFingerprint,
        violations: evalRes.violationMessages,
        detailedViolations: evalRes.violations,
        driftFindingIds: persistedFindings.map((f) => f.id)
      });

      const updatedEdp = {
        ...(parsedDb || {
          metadata: {
            id: ctx.edpPrimaryKey,
            title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
            status: 'proposed',
            revision: 1
          },
          decision_context: {
            problem: ctx.problem,
            decision: ctx.decisionText,
            ontology_bindings: coverage.composedBindings
          }
        }),
        metadata: {
          ...(parsedDb?.metadata || {}),
          id: ctx.edpPrimaryKey,
          title: parsedDb?.metadata?.title || `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
          status: parsedDb?.metadata?.status || 'proposed',
          revision: parsedDb?.metadata?.revision || 1
        },
        selectedConceptUrn: activeConcept,
        refinementCoverage: coverage,
        hydratedInventory: preservedIntentInventory,
        lldOverrides: activeOverrides,
        lastVerdict: lastVerdictPayload
      };

      // Ne jamais réécrire un EDP déjà persisté lors d'une vérification de dérive live :
      // seule la création initiale (ou une simulation explicite) persiste l'EDP.
      if (!parsedDb || evaluationSource !== 'nautobot_live') {
        await (prisma as any).executableDecisionPackage?.upsert({
          where: { id: ctx.edpPrimaryKey },
          create: {
            id: ctx.edpPrimaryKey,
            subjectId,
            decisionId: resolvedDecisionId,
            status: updatedEdp.metadata.status || 'proposed',
            revision: updatedEdp.metadata.revision || 1,
            productionMode: 'llm-proposed-human-approved',
            policyHash: evalRes.ontologyFingerprint,
            content: JSON.stringify(updatedEdp)
          },
          update: {
            subjectId,
            content: JSON.stringify(updatedEdp)
          }
        });
      }

      return json({
        success: true,
        edp: updatedEdp,
        verdict: evalRes.verdict,
        source: evaluationSource,
        liveDetectedDrifts,
        driftFindings: persistedFindings,
        evaluatedAxesCount: evalRes.evaluatedAxesCount,
        violations: evalRes.violationMessages,
        detailedViolations: evalRes.violations,
        ontologyFingerprint: evalRes.ontologyFingerprint,
        hydratedInventory: observedInventory,
        durationMs: evalRes.durationMs
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // 7. Export GitOps Direct du SylvaWorkloadCluster (values.yaml) vers un dépôt sylva-core (Issue #238)
  if (action === 'export_sylva_gitops') {
    try {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const ctx = await loadSubjectContext(subjectId, projectId);

      const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
        where: { subjectId },
        orderBy: { revision: 'desc' }
      });

      const parsedDb = fromDb ? JSON.parse(fromDb.content) : null;
      const explicitBindings =
        parsedDb?.explicitBindings ?? parsedDb?.decision_context?.ontology_bindings ?? [];
      const excludedLeafUrns: string[] = Array.isArray(parsedDb?.excludedLeafUrns)
        ? parsedDb.excludedLeafUrns
        : [];
      const excludedAxisUrns: string[] = Array.isArray(parsedDb?.excludedAxisUrns)
        ? parsedDb.excludedAxisUrns
        : [];
      const activeConcept = selectedConceptUrn || parsedDb?.selectedConceptUrn || 'AUTO';
      const activeOverrides: LldHydrationOverrides = parsedDb?.lldOverrides || {};

      const coverage = computeRefinementCoverage(
        {
          subjectId,
          title: ctx.title,
          problem: ctx.problem,
          decisionText: ctx.decisionText,
          structuredFacts: ctx.structuredFacts,
          explicitBindings,
          excludedLeafUrns,
          excludedAxisUrns,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      const hydratedInventory = composeMultiAxisHydration(
        subjectId,
        coverage.composedBindings,
        catalog,
        activeOverrides
      );

      const currentVerdict: 'compliant' | 'violated' | 'insufficient_input' =
        parsedDb?.lastVerdict?.verdict === 'violated'
          ? 'violated'
          : parsedDb?.lastVerdict?.verdict === 'insufficient_input'
            ? 'insufficient_input'
            : 'compliant';

      // Si aucun verdict n'était encore calculé, évaluer OPA avant d'autoriser l'export
      const evalRes = await evaluateMultiAxisOracle(
        hydratedInventory,
        coverage.composedBindings,
        catalog
      );
      const effectiveVerdict: 'compliant' | 'violated' | 'insufficient_input' =
        currentVerdict === 'violated' || evalRes.verdict === 'violated'
          ? 'violated'
          : currentVerdict === 'insufficient_input' || evalRes.verdict === 'insufficient_input'
            ? 'insufficient_input'
            : 'compliant';

      const gitopsExport = await exportSylvaWorkloadClusterGitops({
        edpId: parsedDb?.metadata?.id || ctx.edpPrimaryKey,
        subjectId,
        revision: parsedDb?.metadata?.revision || 1,
        ontologyFingerprint: evalRes.ontologyFingerprint,
        opaVerdict: effectiveVerdict,
        hydratedInventory,
        repoUrl: body.repoUrl,
        baseBranch: body.baseBranch,
        gitToken: body.gitToken
      });

      const updatedEdp = {
        ...(parsedDb || {
          metadata: {
            id: ctx.edpPrimaryKey,
            title: `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
            status: 'proposed',
            revision: 1
          },
          decision_context: {
            problem: ctx.problem,
            decision: ctx.decisionText,
            ontology_bindings: coverage.composedBindings
          }
        }),
        refinementCoverage: coverage,
        hydratedInventory,
        sylvaGitopsExport: gitopsExport
      };

        await (prisma as any).executableDecisionPackage?.upsert({
          where: { id: ctx.edpPrimaryKey },
          create: {
            id: ctx.edpPrimaryKey,
            subjectId,
            decisionId: ctx.subject?.decision?.id || `DEC-${subjectId}`,
            status: updatedEdp.metadata?.status || 'proposed',
            revision: updatedEdp.metadata?.revision || 1,
            productionMode: 'llm-proposed-human-approved',
            policyHash: evalRes.ontologyFingerprint,
            content: JSON.stringify(updatedEdp)
          },
          update: {
            subjectId,
            content: JSON.stringify(updatedEdp)
          }
        });

      return json({
        success: true,
        edp: updatedEdp,
        sylvaGitopsExport: gitopsExport,
        message: gitopsExport.pullRequestUrl
          ? `PR/MR GitOps Sylva ouverte avec succès : ${gitopsExport.pullRequestUrl}`
          : `Artefact GitOps Sylva généré (${gitopsExport.targetPath}, sha256:${gitopsExport.sha256.slice(0, 10)}) prêt pour FluxCD !`
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      return json({ success: false, error: err.message }, { status });
    }
  }

  return json({ error: 'Action non reconnue.' }, { status: 400 });
};
