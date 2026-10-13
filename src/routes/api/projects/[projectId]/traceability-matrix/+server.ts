import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { reconcileRequirementsToHub, hubEngagementIdOf } from '$lib/server/projects/hubRequirementDecisions';
import { hubErrorResponse } from '$lib/server/projects/hubErrors';
import { llmopsClient } from '$lib/server/llmops/client';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import { sanitizeHandle } from '$lib/domain/bundleAssembly';
import { renderTraceabilityMatrix, BundleRejectedError } from '$lib/domain/bundleRtm';
import { requireVerifiedHubSnapshot, HubSnapshotRejectedError } from '$lib/domain/hubSnapshot';
import { renderTraceabilityView, viewFromHubSnapshot } from '$lib/domain/traceability';
import type { ConfidentialityLevel } from '$lib/domain/engagementBundle';

const LEVELS: ConfidentialityLevel[] = ['public', 'internal', 'confidential', 'secret'];

/**
 * Matrice de traçabilité des exigences, en Markdown, produite À PARTIR DE L'ARTEFACT SCELLÉ qui fait foi :
 * - projet basculé sur le Hub : l'instantané émis par le Hub (Archinex n'émet rien), dont le sceau est revérifié ici ;
 * - sinon : le dossier scellé d'Archinex, vérifié avant rendu.
 * Un artefact altéré ou incohérent est refusé : on ne produit pas de document à partir de lui.
 */
export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;

	try {
		if (auth.project && isProjectCutOverToHub(auth.project)) {
			const engagementId = hubEngagementIdOf(auth.project);
			await reconcileRequirementsToHub(auth.project, session.user.email);
			const issued = await llmopsClient.exportEngagementSnapshot(engagementId, session.user.email);
			const envelope = await llmopsClient.getEngagementExport(engagementId, issued.snapshotRef.snapshotId, session.user.email);
			const snapshot = requireVerifiedHubSnapshot(envelope);
			return new Response(renderTraceabilityView(viewFromHubSnapshot(snapshot)), {
				headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Source': 'hub-snapshot', 'X-Snapshot-Id': snapshot.snapshotId }
			});
		}

		const confidentiality = event.url.searchParams.get('confidentiality') as ConfidentialityLevel | null;
		if (!confidentiality || !LEVELS.includes(confidentiality)) {
			return json({ status: 'error', error: `CONFIDENTIALITY_REQUIRED: ${LEVELS.join(', ')}` }, { status: 400 });
		}
		const { bundle } = await exportEngagementBundle({
			projectId: event.params.projectId,
			confidentiality,
			actorHandle: sanitizeHandle(session.user.email)
		});
		return new Response(renderTraceabilityMatrix(bundle), {
			headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Source': 'archinex-bundle', 'X-Snapshot-Id': bundle.snapshotId }
		});
	} catch (e) {
		if (e instanceof BundleRejectedError || e instanceof HubSnapshotRejectedError) {
			return json({ status: 'error', error: e.message }, { status: 422 });
		}
		const message = e instanceof Error ? e.message : String(e);
		if (message.startsWith('BUNDLE_VERIFICATION_FAILED')) return json({ status: 'error', error: message }, { status: 422 });
		return hubErrorResponse(e);
	}
};
