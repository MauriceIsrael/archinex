import { createHash } from 'node:crypto';
import { prisma } from '../prisma';
import { loadOntologyCatalog } from './ontologyClient';
import {
  computeRefinementCoverage,
  composeMultiAxisHydration,
  evaluateMultiAxisOracle
} from './refinementCoverage';
import {
  pullLiveInventoryFromNautobot,
  resolveProjectNautobotOptions
} from './nautobotSync';
import {
  compareFrozenIntentWithNautobotObject,
  computeIntentHash,
  extractArchinexMarkers,
  hasTraceabilityMarkers,
  persistDriftFindings,
  recordOracleVerdict
} from './driftService';
import type { DriftFindingRecord } from './driftTypes';

export interface WebhookProcessInput {
  projectId: string;
  headers: Headers;
  rawBody: string;
  payload: Record<string, any>;
  sync?: boolean;
  db?: any;
  fetchImpl?: typeof fetch;
}

export interface WebhookProcessResult {
  status: number;
  body: Record<string, unknown>;
  /** Promesse du traitement asynchrone (exposée pour les tests afin d'éviter les timers arbitraires). */
  backgroundTask?: Promise<void>;
}

const pendingBackgroundTasks = new Set<Promise<void>>();

/**
 * Attend la fin de tous les traitements asynchrones de webhooks en cours (utile en test).
 */
export async function flushPendingWebhookTasks(): Promise<void> {
  while (pendingBackgroundTasks.size > 0) {
    await Promise.allSettled(Array.from(pendingBackgroundTasks));
  }
}

function isUniqueConstraintError(err: any): boolean {
  if (!err) return false;
  if (err.code === 'P2002') return true;
  const msg = String(err.message || '');
  return msg.includes('UNIQUE constraint failed') || msg.includes('Unique constraint failed');
}

export function resolveWebhookEventId(
  headers: Headers,
  projectId: string,
  modelName: string,
  eventType: string,
  payload: Record<string, any>,
  rawBody: string
): string {
  const fromHeader =
    headers.get('x-nautobot-event-id')?.trim() ||
    headers.get('x-request-id')?.trim() ||
    headers.get('x-webhook-event-id')?.trim();
  if (fromHeader) return fromHeader;

  const fromPayload = payload.request_id || payload.event_id || payload.delivery_id;
  if (typeof fromPayload === 'string' && fromPayload.trim().length > 0) {
    return fromPayload.trim();
  }

  // Repli déterministe sur l'empreinte du contenu brut + projet + modèle + événement
  return `evt-${createHash('sha256')
    .update(`${projectId}|${modelName}|${eventType}|${rawBody}`)
    .digest('hex')
    .slice(0, 32)}`;
}

async function loadFrozenEdpForProject(params: {
  projectId: string;
  decisionId?: string;
  subjectId?: string;
  db: any;
}): Promise<{
  edpRow: any | null;
  parsedEdp: Record<string, any> | null;
  subjectId: string | null;
  decisionId: string | null;
}> {
  const { projectId, decisionId, subjectId, db } = params;
  if (!decisionId && !subjectId) {
    return { edpRow: null, parsedEdp: null, subjectId: null, decisionId: null };
  }

  let edpRow: any = null;
  if (decisionId) {
    edpRow = await db.executableDecisionPackage?.findFirst({
      where: { decisionId },
      orderBy: { revision: 'desc' }
    });
  }
  if (!edpRow && subjectId) {
    edpRow = await db.executableDecisionPackage?.findFirst({
      where: { subjectId },
      orderBy: { revision: 'desc' }
    });
  }

  const candidateSubjectId = edpRow?.subjectId || subjectId || null;
  const candidateDecisionId = edpRow?.decisionId || decisionId || null;

  // Vérifier que le sujet appartient bien au projet authentifié (si présent dans la table subjects)
  if (candidateSubjectId && db.subject?.findUnique) {
    const subjectRow = await db.subject.findUnique({
      where: { id: candidateSubjectId },
      select: { id: true, projectId: true }
    });
    if (subjectRow && subjectRow.projectId !== projectId) {
      return { edpRow: null, parsedEdp: null, subjectId: null, decisionId: null };
    }
  }

  if (!edpRow) {
    return {
      edpRow: null,
      parsedEdp: null,
      subjectId: candidateSubjectId,
      decisionId: candidateDecisionId
    };
  }

  let parsedEdp: Record<string, any> | null = null;
  try {
    parsedEdp = JSON.parse(edpRow.content);
  } catch (err) {
    console.error('[NautobotWebhook] Contenu JSON EDP illisible:', { edpId: edpRow.id, error: err });
    throw err;
  }

  return {
    edpRow,
    parsedEdp,
    subjectId: edpRow.subjectId,
    decisionId: edpRow.decisionId
  };
}

async function runAsyncOracleAndReconciliation(params: {
  receiptId: string;
  eventId: string;
  projectId: string;
  modelName: string;
  eventType: string;
  edpRow: any | null;
  parsedEdp: Record<string, any> | null;
  subjectId: string | null;
  decisionId: string | null;
  clauseRefs: string[];
  initialFindingIds: string[];
  project: any | null;
  db: any;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const {
    receiptId,
    eventId,
    projectId,
    modelName,
    eventType,
    edpRow,
    parsedEdp,
    subjectId,
    decisionId,
    clauseRefs,
    initialFindingIds,
    project,
    db,
    fetchImpl
  } = params;

  try {
    await db.webhookEventReceipt.update({
      where: { id: receiptId },
      data: { status: 'processing' }
    });

    const allFindingIds = new Set<string>(initialFindingIds);

    if (edpRow && parsedEdp && subjectId && decisionId) {
      const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
      const explicitBindings = parsedEdp.decision_context?.ontology_bindings || [];
      const activeConcept = parsedEdp.selectedConceptUrn || 'AUTO';

      const coverage = computeRefinementCoverage(
        {
          subjectId,
          title: parsedEdp.metadata?.title || subjectId,
          problem: parsedEdp.decision_context?.problem || '',
          decisionText: parsedEdp.decision_context?.decision || '',
          explicitBindings,
          autoBindFromText: true,
          selectedConceptUrn: activeConcept
        },
        catalog
      );

      // Cloner l'intention figée (l'EDP en base n'est JAMAIS modifié)
      const frozenInventory = parsedEdp.hydratedInventory
        ? JSON.parse(JSON.stringify(parsedEdp.hydratedInventory))
        : composeMultiAxisHydration(subjectId, coverage.composedBindings, catalog, {});

      const intentHash = computeIntentHash(frozenInventory);

      const nautobotOpts = resolveProjectNautobotOptions(project || { id: projectId }, {
        ...(fetchImpl ? { fetchImpl } : {}),
        driftContext: {
          projectId,
          subjectId,
          decisionId,
          clauseRefs,
          sourceEvent: `nautobot_webhook:${eventId}`
        }
      });

      const livePull = await pullLiveInventoryFromNautobot(frozenInventory, nautobotOpts);
      const observedInventory = livePull.reachable ? livePull.inventory : frozenInventory;

      if (livePull.reachable && livePull.findings.length > 0) {
        const pullFindings = await persistDriftFindings(livePull.findings, db);
        for (const f of pullFindings) {
          allFindingIds.add(f.id);
        }
      }

      const evalRes = await evaluateMultiAxisOracle(
        observedInventory,
        coverage.composedBindings,
        catalog
      );

      const hasDrift = allFindingIds.size > 0;
      const effectiveVerdict =
        evalRes.verdict === 'violated' || hasDrift ? 'violated' : evalRes.verdict;

      // Stocker le verdict À CÔTÉ de l'EDP dans `edp_oracle_verdicts`, sans jamais toucher `executable_decision_packages`
      await recordOracleVerdict(
        {
          edpId: edpRow.id,
          projectId,
          subjectId,
          decisionId,
          verdict: effectiveVerdict,
          source: 'nautobot_webhook',
          provenance: livePull.reachable
            ? `nautobot_webhook:${modelName}:${eventType} (live_pull)`
            : `nautobot_webhook:${modelName}:${eventType} (webhook_snapshot)`,
          intentHash,
          ontologyFingerprint: evalRes.ontologyFingerprint,
          webhookEventId: eventId,
          violations: evalRes.violationMessages,
          detailedViolations: evalRes.violations,
          driftFindingIds: Array.from(allFindingIds)
        },
        db
      );
    }

    await db.webhookEventReceipt.update({
      where: { id: receiptId },
      data: {
        status: 'processed',
        findingIds: JSON.stringify(Array.from(allFindingIds)),
        processedAt: new Date()
      }
    });
  } catch (err: any) {
    console.error('[NautobotWebhook] Erreur lors du traitement asynchrone:', {
      eventId,
      projectId,
      error: err
    });
    try {
      await db.webhookEventReceipt.update({
        where: { id: receiptId },
        data: {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          processedAt: new Date()
        }
      });
    } catch (updateErr) {
      console.error('[NautobotWebhook] Impossible de journaliser l\'échec sur le reçu:', updateErr);
    }
    throw err;
  }
}

/**
 * Traite un événement webhook Nautobot déjà authentifié par HMAC :
 * 1. Idempotence par identifiant d'événement (`WebhookEventReceipt`).
 * 2. Rattachement exclusif via les marqueurs `archinex_*` de l'objet (jamais `payload.subjectId`).
 * 3. Comparaison contre l'intention figée (EDP non modifié) et persistance des `DriftFinding`.
 * 4. Réponse rapide (202) + réconciliation / oracle asynchrone.
 * 5. Remontée explicite de toute erreur de persistance (journal + 500).
 */
export async function processAuthenticatedNautobotWebhook(
  input: WebhookProcessInput
): Promise<WebhookProcessResult> {
  const { projectId, headers, rawBody, payload, sync = false, db = prisma, fetchImpl } = input;

  const eventType = String(payload.event || payload.action || 'updated').trim().toLowerCase();
  const modelName = String(payload.model || payload.content_type || 'unknown').trim().toLowerCase();
  const dataSnapshot =
    payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {};

  // Extraction stricte des marqueurs de traçabilité depuis l'objet Nautobot (JAMAIS payload.subjectId)
  const markers = extractArchinexMarkers(dataSnapshot);
  if (markers.projectId && markers.projectId !== projectId) {
    return {
      status: 403,
      body: {
        accepted: false,
        error: `Incohérence de projet : marqueur archinex_project='${markers.projectId}' incompatible avec le projet authentifié '${projectId}'.`
      }
    };
  }

  const eventId = resolveWebhookEventId(headers, projectId, modelName, eventType, payload, rawBody);

  // 1. Enregistrement idempotent du reçu d'événement
  let receipt: any;
  try {
    receipt = await db.webhookEventReceipt.create({
      data: {
        provider: 'nautobot',
        eventId,
        projectId,
        modelName,
        eventType,
        status: 'accepted'
      }
    });
  } catch (err: any) {
    if (isUniqueConstraintError(err)) {
      const existing = await db.webhookEventReceipt.findUnique({
        where: { provider_eventId: { provider: 'nautobot', eventId } }
      });
      return {
        status: 200,
        body: {
          accepted: true,
          duplicate: true,
          eventId,
          projectId,
          status: existing?.status || 'processed',
          findingIds: existing?.findingIds ? JSON.parse(existing.findingIds) : []
        }
      };
    }
    console.error('[NautobotWebhook] Échec de persistance WebhookEventReceipt:', {
      eventId,
      projectId,
      error: err
    });
    return {
      status: 500,
      body: {
        accepted: false,
        error: `Erreur de persistance du reçu webhook : ${err instanceof Error ? err.message : String(err)}`
      }
    };
  }

  // 2. Lecture seule de l'EDP figé + persistance des DriftFinding
  let persistedFindings: DriftFindingRecord[] = [];
  let edpRow: any = null;
  let parsedEdp: Record<string, any> | null = null;
  let resolvedSubjectId: string | null = null;
  let resolvedDecisionId: string | null = null;
  let project: any = null;

  try {
    project = await db.project?.findUnique({
      where: { id: projectId },
      select: { id: true, shortName: true, strategy: true }
    });
    const nautobotOpts = resolveProjectNautobotOptions(project || { id: projectId });

    if (hasTraceabilityMarkers(markers)) {
      const loaded = await loadFrozenEdpForProject({
        projectId,
        decisionId: markers.decisionId,
        subjectId: markers.subjectId,
        db
      });
      edpRow = loaded.edpRow;
      parsedEdp = loaded.parsedEdp;
      resolvedSubjectId = loaded.subjectId;
      resolvedDecisionId = loaded.decisionId;
    }

    const drafts = compareFrozenIntentWithNautobotObject({
      projectId,
      modelName,
      eventType,
      dataSnapshot,
      markers,
      frozenEdp: parsedEdp,
      subjectId: resolvedSubjectId,
      decisionId: resolvedDecisionId,
      sourceEvent: `nautobot_webhook:${eventId}`,
      projectScope: nautobotOpts.projectScope
    });

    if (drafts.length > 0) {
      persistedFindings = await persistDriftFindings(drafts, db);
    }

    await db.webhookEventReceipt.update({
      where: { id: receipt.id },
      data: {
        findingIds: JSON.stringify(persistedFindings.map((f) => f.id))
      }
    });
  } catch (err: any) {
    console.error('[NautobotWebhook] Échec de détection ou persistance DriftFinding:', {
      eventId,
      projectId,
      error: err
    });
    try {
      await db.webhookEventReceipt.update({
        where: { id: receipt.id },
        data: {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          processedAt: new Date()
        }
      });
    } catch {
      // Déjà journalisé ci-dessus ; on remonte l'erreur initiale en 500
    }
    return {
      status: 500,
      body: {
        accepted: false,
        eventId,
        error: `Erreur de persistance lors du traitement du webhook : ${err instanceof Error ? err.message : String(err)}`
      }
    };
  }

  // 3. Planification asynchrone de l'évaluation Oracle / Pull live
  const asyncParams = {
    receiptId: receipt.id,
    eventId,
    projectId,
    modelName,
    eventType,
    edpRow,
    parsedEdp,
    subjectId: resolvedSubjectId,
    decisionId: resolvedDecisionId,
    clauseRefs: markers.clauseRefs,
    initialFindingIds: persistedFindings.map((f) => f.id),
    project,
    db,
    fetchImpl
  };

  let backgroundTask: Promise<void> | undefined;
  if (sync) {
    await runAsyncOracleAndReconciliation(asyncParams);
  } else {
    const task = new Promise<void>((resolve) => {
      setImmediate(() => {
        runAsyncOracleAndReconciliation(asyncParams)
          .catch(() => {
            // Déjà journalisé et tracé en base dans `webhook_event_receipts`
          })
          .finally(resolve);
      });
    });
    pendingBackgroundTasks.add(task);
    task.finally(() => pendingBackgroundTasks.delete(task));
    backgroundTask = task;
  }

  const outOfDecision = !hasTraceabilityMarkers(markers);

  return {
    status: 202,
    body: {
      accepted: true,
      duplicate: false,
      eventId,
      projectId,
      model: modelName,
      event: eventType,
      subjectId: resolvedSubjectId,
      decisionId: resolvedDecisionId,
      outOfDecision,
      findingsCount: persistedFindings.length,
      findingIds: persistedFindings.map((f) => f.id)
    },
    backgroundTask
  };
}
