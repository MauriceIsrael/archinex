/**
 * Pont d'hydratation Prisma → Phase 5 (decision-slots & catalog).
 * Agrège les exigences, sujets et énoncés actifs d'un projet et les rapproche
 * sémantiquement des blocs de référence TOGAF (`TOGAF_REFERENCE_BUILDING_BLOCKS`)
 * pour alimenter `buildProjectCompletenessLedger` sans nécessiter de passage manuel en Phase 4.
 */

import { prisma } from '$lib/server/prisma';
import {
  TOGAF_DOMAINS,
  TOGAF_REFERENCE_BUILDING_BLOCKS,
  detectEmergentCapabilityNeed,
  resolveTogafDomain,
  type TogafDomainId
} from '$lib/domain/edp/togafTaxonomy';
import type { CommodityDecisionSlotSummary } from '$lib/server/ingest/arckitRequirementsPipeline';
import type { ProjectCompletenessInput } from './decisionSlotRegistry';
import { matchAllBuildingBlocksSemantically } from '$lib/server/similarity/togafSemanticResolver';
import type { Encoder } from '$lib/server/similarity/encoder';

export interface ProjectHydrationTextEntry {
  ref: string;
  text: string;
  categoryOrDomain?: string | null;
  disposition?: string | null;
}

export async function deriveProjectHydrationContextFromEntries(
  entries: ProjectHydrationTextEntry[],
  options?: {
    projectTitle?: string;
    decisionTexts?: string[];
    encoderOverride?: Encoder;
  }
): Promise<Omit<ProjectCompletenessInput, 'projectId'>> {
  const slotMap = new Map<string, CommodityDecisionSlotSummary>();
  const activeDomains = new Set<TogafDomainId>();
  const problemLines: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.text.trim();
    if (!trimmed) continue;
    problemLines.push(entry.ref ? `[${entry.ref}] ${trimmed}` : trimmed);

    const matches = await matchAllBuildingBlocksSemantically(
      trimmed,
      entry.categoryOrDomain || undefined,
      options?.encoderOverride
    );

    for (const { block } of matches) {
      activeDomains.add(block.togafDomain);
      if (!block.axisUrn || !block.defaultLeafUrn) continue;

      const existing = slotMap.get(block.axisUrn);
      if (existing) {
        if (entry.ref && !existing.coveredClauseIds.includes(entry.ref)) {
          existing.coveredClauseIds.push(entry.ref);
          existing.coveredRawRefs.push(entry.ref);
        }
      } else {
        slotMap.set(block.axisUrn, {
          slotId: `slot:${block.axisUrn}`,
          axisUrn: block.axisUrn,
          title: block.title,
          togafDomain: block.togafDomain,
          documentEngineLayer: block.documentEngineLayer,
          defaultLeafUrn: block.defaultLeafUrn,
          logicalComponentName: block.logicalComponentName,
          coveredClauseIds: entry.ref ? [entry.ref] : [],
          coveredRawRefs: entry.ref ? [entry.ref] : [],
          status: 'default_proposed'
        });
      }
    }

    // Continuité Phase 1 -> Phase 5 : si aucune brique standard ne correspond, détecter les besoins émergents
    // ou rattacher toute exigence évacuée à la brique de référence de son domaine TOGAF (Zéro perte silencieuse).
    if (matches.length === 0) {
      const emergent = detectEmergentCapabilityNeed(trimmed, entry.categoryOrDomain || undefined, {
        fallbackTitle: entry.ref || trimmed.slice(0, 48)
      });
      if (emergent) {
        activeDomains.add(emergent.togafDomain);
        const emergentAxisUrn = 'urn:archinex:ontology:axis:emergent_component_allocation';
        const existingEmergent = slotMap.get(emergentAxisUrn);
        if (existingEmergent) {
          if (entry.ref && !existingEmergent.coveredClauseIds.includes(entry.ref)) {
            existingEmergent.coveredClauseIds.push(entry.ref);
            existingEmergent.coveredRawRefs.push(entry.ref);
          }
        } else {
          slotMap.set(emergentAxisUrn, {
            slotId: `slot:${emergentAxisUrn}`,
            axisUrn: emergentAxisUrn,
            title: emergent.title,
            togafDomain: emergent.togafDomain,
            documentEngineLayer: emergent.documentEngineLayer,
            defaultLeafUrn: `urn:archinex:ontology:application:emergent:new_${emergent.suggestedComponentName.replace(/[^a-z0-9_]/gi, '_')}`,
            logicalComponentName: emergent.suggestedComponentName,
            coveredClauseIds: entry.ref ? [entry.ref] : [],
            coveredRawRefs: entry.ref ? [entry.ref] : [],
            status: 'default_proposed'
          });
        }
      } else if (entry.disposition === 'evacuated') {
        const domain = resolveTogafDomain(entry.categoryOrDomain || undefined);
        activeDomains.add(domain);
        const domainBlock =
          TOGAF_REFERENCE_BUILDING_BLOCKS.find((b) => b.togafDomain === domain) ||
          TOGAF_REFERENCE_BUILDING_BLOCKS[0];
        const domainDef = TOGAF_DOMAINS[domain];
        if (domainBlock) {
          const existing = slotMap.get(domainBlock.axisUrn);
          if (existing) {
            if (entry.ref && !existing.coveredClauseIds.includes(entry.ref)) {
              existing.coveredClauseIds.push(entry.ref);
              existing.coveredRawRefs.push(entry.ref);
            }
          } else {
            slotMap.set(domainBlock.axisUrn, {
              slotId: `slot:${domainBlock.axisUrn}`,
              axisUrn: domainBlock.axisUrn,
              title: `${domainBlock.title} (${domainDef.shortLabel})`,
              togafDomain: domain,
              documentEngineLayer: domainDef.documentEngineLayer,
              defaultLeafUrn: domainBlock.defaultLeafUrn,
              logicalComponentName: domainBlock.logicalComponentName,
              coveredClauseIds: entry.ref ? [entry.ref] : [],
              coveredRawRefs: entry.ref ? [entry.ref] : [],
              status: 'default_proposed'
            });
          }
        }
      }
    }
  }

  const decisionText = (options?.decisionTexts || []).filter(Boolean).join('\n').trim() || undefined;

  return {
    projectTitle: options?.projectTitle,
    title: options?.projectTitle,
    problem: problemLines.join('\n'),
    decisionText,
    commoditySlots: Array.from(slotMap.values()),
    activeTogafDomains: activeDomains.size > 0 ? Array.from(activeDomains) : undefined,
    autoBindFromText: true
  };
}

export async function loadProjectHydrationContextFromDb(
  projectId: string,
  projectTitle?: string
): Promise<Omit<ProjectCompletenessInput, 'projectId'>> {
  const entries: ProjectHydrationTextEntry[] = [];
  const decisionTexts: string[] = [];

  try {
    const [requirements, subjects, statements] = await Promise.all([
      prisma.requirement.findMany({
        where: { source: { projectId } },
        select: {
          clauseRef: true,
          title: true,
          text: true,
          category: true,
          proposedDisposition: true,
          decidedDisposition: true
        },
        orderBy: { position: 'asc' },
        take: 200
      }),
      prisma.subject.findMany({
        where: { projectId },
        select: {
          id: true,
          sectionRef: true,
          name: true,
          domain: true,
          problemStatement: true,
          decision: { select: { rationale: true } }
        },
        take: 100
      }),
      prisma.statement.findMany({
        where: { projectId, status: 'active' },
        select: { id: true, section: true, subjectRef: true, predicate: true, value: true, unit: true },
        take: 200
      })
    ]);

    for (const req of requirements) {
      const text = [req.title, req.text].filter(Boolean).join(' — ');
      if (text.trim()) {
        entries.push({
          ref: req.clauseRef,
          text,
          categoryOrDomain: req.category,
          disposition: req.decidedDisposition || req.proposedDisposition
        });
      }
    }

    for (const sub of subjects) {
      const text = [sub.name, sub.problemStatement].filter(Boolean).join(' — ');
      if (text.trim()) {
        entries.push({
          ref: sub.sectionRef || sub.id,
          text,
          categoryOrDomain: sub.domain
        });
      }
      if (sub.decision?.rationale) {
        decisionTexts.push(sub.decision.rationale);
      }
    }

    for (const st of statements) {
      const text = [st.subjectRef, st.predicate, st.value, st.unit].filter(Boolean).join(' ');
      if (text.trim()) {
        entries.push({
          ref: st.section || st.id,
          text
        });
      }
    }
  } catch {
    // Non bloquant si la base n'est pas initialisée (ex. tests unitaires isolés)
  }

  if (entries.length === 0 && projectTitle?.trim()) {
    entries.push({ ref: projectId, text: projectTitle.trim() });
  }

  return deriveProjectHydrationContextFromEntries(entries, {
    projectTitle,
    decisionTexts
  });
}
