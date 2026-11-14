import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import {
  InvariantViolationError,
  UnauthorizedRoleError
} from '$lib/server/edp/edpRepository';
import {
  buildProjectCompletenessLedger,
  batchRatifyProjectType2Slots,
  generateArchitectureLockManifest,
  getProjectArchitectureLock,
  promoteSlotToDeliberationSubject,
  type ProjectCompletenessInput
} from '$lib/server/edp/decisionSlotRegistry';
import type { TogafDomainId } from '$lib/domain/edp/togafTaxonomy';

export const GET: RequestHandler = async (event) => {
  const { projectId } = event.params;
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;

  const selectedConceptUrn = event.url.searchParams.get('conceptUrn') || undefined;
  const ledger = await buildProjectCompletenessLedger({
    projectId,
    projectTitle: auth.project?.title,
    selectedConceptUrn
  });
  const architectureLock = getProjectArchitectureLock(projectId);

  return json({
    status: 'ok',
    ledger,
    architectureLock
  });
};

export const POST: RequestHandler = async (event) => {
  const { projectId } = event.params;
  const auth = await authorizeProjectAccess(event, projectId);
  if (auth.error) return auth.error;

  let body: {
    action?: 'ratify_batch' | 'promote_to_subject' | 'seal_architecture_lock';
    actorRole?: string;
    rationale?: string;
    reason?: string;
    slotId?: string;
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

      return json({
        status: 'ok',
        receipt: result.receipt,
        ledger: result.updatedLedger,
        instantiatedComponents: result.instantiatedComponents
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

      return json({
        status: 'ok',
        promotedSubject,
        ledger
      });
    }

    if (body.action === 'seal_architecture_lock') {
      const manifest = await generateArchitectureLockManifest({
        projectId,
        sealedBy: actorId,
        sealedByRole: actorRole,
        coverageInput: body.coverageInput
      });

      return json({
        status: 'ok',
        architectureLock: manifest
      });
    }

    return json(
      {
        status: 'error',
        error:
          'Action non reconnue (attendu : ratify_batch, promote_to_subject ou seal_architecture_lock).'
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
