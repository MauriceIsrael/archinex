import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import {
  InvariantViolationError,
  UnauthorizedRoleError
} from '$lib/server/edp/edpRepository';
import {
  buildLiveArchitectureLockSnapshot,
  buildProjectCompletenessLedger,
  batchRatifyProjectType2Slots,
  generateArchitectureLockManifest,
  getProjectArchitectureLock,
  getProjectRatificationAuditLog,
  promoteSlotToDeliberationSubject,
  revokeProjectSlotRatification,
  type ProjectCompletenessInput
} from '$lib/server/edp/decisionSlotRegistry';
import type { TogafDomainId } from '$lib/domain/edp/togafTaxonomy';

export const GET: RequestHandler = async (event) => {
  const { projectId } = event.params;
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;

  const selectedConceptUrn = event.url.searchParams.get('conceptUrn') || undefined;
  const input = {
    projectId,
    projectTitle: auth.project?.title,
    selectedConceptUrn
  };
  const ledger = await buildProjectCompletenessLedger(input);
  const architectureLock = getProjectArchitectureLock(projectId);
  const liveLockSnapshot = await buildLiveArchitectureLockSnapshot(input);
  const auditLog = getProjectRatificationAuditLog(projectId);

  return json({
    status: 'ok',
    ledger,
    architectureLock,
    liveLockSnapshot,
    auditLog
  });
};

export const POST: RequestHandler = async (event) => {
  const { projectId } = event.params;
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;

  let body: {
    action?: 'ratify_batch' | 'unratify_slot' | 'promote_to_subject' | 'seal_architecture_lock';
    actorRole?: string;
    rationale?: string;
    reason?: string;
    slotId?: string;
    axisUrn?: string;
    slotIds?: string[];
    togafDomains?: TogafDomainId[];
    leafOverrides?: Record<string, string>;
    subjectTitle?: string;
    coverageInput?: Omit<ProjectCompletenessInput, 'projectId'>;
  };

  try {
    body = await event.request.json();
  } catch {
    return json({ status: 'error', error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const actorId = auth.session?.user?.email || auth.session?.user?.id || 'architect';
  const actorRole = body.actorRole || auth.session?.user?.role || '';

  try {
    if (body.action === 'ratify_batch') {
      const result = await batchRatifyProjectType2Slots(
        {
          projectId,
          actorId,
          actorRole,
          rationale: body.rationale || '',
          slotIds: body.slotIds,
          togafDomains: body.togafDomains,
          leafOverrides: body.leafOverrides
        },
        body.coverageInput
      );

      const liveLockSnapshot = await buildLiveArchitectureLockSnapshot({
        projectId,
        projectTitle: auth.project?.title,
        ...(body.coverageInput ?? {})
      });

      return json({
        status: 'ok',
        receipt: result.receipt,
        ledger: result.updatedLedger,
        instantiatedComponents: result.instantiatedComponents,
        liveLockSnapshot
      });
    }

    if (body.action === 'unratify_slot') {
      if (!body.slotId && !body.axisUrn) {
        return json(
          { status: 'error', error: 'Paramètre slotId ou axisUrn requis pour la révocation.' },
          { status: 400 }
        );
      }

      const revocation = await revokeProjectSlotRatification({
        projectId,
        slotId: body.slotId,
        axisUrn: body.axisUrn,
        actorId,
        actorRole,
        reason: body.reason || body.rationale || '',
        source: 'phase5'
      });

      const ledger = await buildProjectCompletenessLedger({
        projectId,
        ...(body.coverageInput ?? {})
      });
      const liveLockSnapshot = await buildLiveArchitectureLockSnapshot({
        projectId,
        projectTitle: auth.project?.title,
        ...(body.coverageInput ?? {})
      });

      return json({
        status: 'ok',
        revocation,
        ledger,
        liveLockSnapshot,
        auditLog: getProjectRatificationAuditLog(projectId)
      });
    }

    if (body.action === 'promote_to_subject') {
      if (!body.slotId) {
        return json(
          { status: 'error', error: 'Paramètre slotId requis pour la promotion.' },
          { status: 400 }
        );
      }

      const promotedSubject = await promoteSlotToDeliberationSubject({
        projectId,
        slotId: body.slotId,
        actorId,
        actorRole,
        reason: body.reason || body.rationale || '',
        subjectTitle: body.subjectTitle
      });

      const ledger = await buildProjectCompletenessLedger({
        projectId,
        ...(body.coverageInput ?? {})
      });
      const liveLockSnapshot = await buildLiveArchitectureLockSnapshot({
        projectId,
        projectTitle: auth.project?.title,
        ...(body.coverageInput ?? {})
      });

      return json({
        status: 'ok',
        promotedSubject,
        ledger,
        liveLockSnapshot
      });
    }

    if (body.action === 'seal_architecture_lock') {
      const manifest = await generateArchitectureLockManifest({
        projectId,
        sealedBy: actorId,
        sealedByRole: actorRole,
        coverageInput: body.coverageInput
      });
      const liveLockSnapshot = await buildLiveArchitectureLockSnapshot({
        projectId,
        projectTitle: auth.project?.title,
        ...(body.coverageInput ?? {})
      });

      return json({
        status: 'ok',
        architectureLock: manifest,
        liveLockSnapshot
      });
    }

    return json(
      {
        status: 'error',
        error:
          'Action non reconnue (attendu : ratify_batch, unratify_slot, promote_to_subject ou seal_architecture_lock).'
      },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof UnauthorizedRoleError) {
      return json({ status: 'error', error: err.message }, { status: 403 });
    }
    if (err instanceof InvariantViolationError) {
      return json({ status: 'error', error: err.message }, { status: 422 });
    }
    return json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Erreur interne du registre de décisions.'
      },
      { status: 500 }
    );
  }
};
