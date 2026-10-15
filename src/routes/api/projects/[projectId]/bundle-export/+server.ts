import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import type { ConfidentialityLevel } from '$lib/domain/engagementBundle';
import { exportOscalCompliance } from '$lib/domain/oscalExport';
import { prisma } from '$lib/server/prisma';
import { llmopsClient } from '$lib/server/llmops/client';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';
import { reconcileRequirementsToHub } from '$lib/server/projects/hubRequirementDecisions';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

export const POST: RequestHandler = async (event) => {
	// 1. Authentification stricte par session et contrôle d'appartenance au projet (jamais par en-tête)
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;

	// Un en-tête X-Actor-Email fourni par le client est explicitement ignoré
	const actorHandle = session.user.name || session.user.email;

	try {
		let body: Record<string, unknown> = {};
		try {
			body = await event.request.json();
		} catch {
			// Body optionnel si passé en query params
		}

		const confidentiality = (body.confidentiality ||
			event.url.searchParams.get('confidentiality')) as ConfidentialityLevel;

		if (!confidentiality) {
			return json(
				{
					status: 'error',
					error:
						'CONFIDENTIALITY_REQUIRED: Le niveau de confidentialité (public, internal, confidential, secret) est obligatoire.'
				},
				{ status: 400 }
			);
		}

		// 2. Vérification de la bascule du système d'enregistrement (SoR: Hub vs Local)
		const project = await prisma.project.findUnique({
			where: { id: event.params.projectId }
		});

		if (project && isProjectCutOverToHub(project)) {
			const strategy = typeof project.strategy === 'string' ? JSON.parse(project.strategy || '{}') : (project.strategy || {});
			const engagementId = strategy.hubEngagementId || project.shortName || project.id;
			// Le Hub est l'émetteur unique de l'instantané d'un projet basculé : Archinex n'émet rien. Il met d'abord le Hub au niveau
			// de ses exigences et de leurs sujets (idempotent), puis demande l'instantané. Pas de dossier local pour ce projet.
			const reconciled = await reconcileRequirementsToHub(project, session.user.email);
			const hubExport = await llmopsClient.exportEngagementSnapshot(engagementId, session.user.email);
			return json({
				status: 'ok',
				snapshotRef: hubExport.snapshotRef,
				created: hubExport.created,
				is_provisional: hubExport.is_provisional,
				systemOfRecord: 'hub',
				reconciled
			});
		}

		const result = await exportEngagementBundle({
			projectId: event.params.projectId,
			confidentiality,
			actorHandle
		});

		const format = event.url.searchParams.get('format');
		if (format === 'oscal') {
			const oscal = exportOscalCompliance(result.bundle);
			return json(oscal);
		}

		return json({
			status: 'ok',
			bundle: result.bundle,
			snapshotRef: result.snapshotRef,
			systemOfRecord: 'local'
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		const problems = (err as Record<string, unknown>)?.problems;
		return json(
			{
				status: 'error',
				error: message,
				problems
			},
			{ status: 400 }
		);
	}
};
