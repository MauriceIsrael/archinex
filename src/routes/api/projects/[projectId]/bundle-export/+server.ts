import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportEngagementBundle } from '$lib/server/bundleExportService';
import type { ConfidentialityLevel } from '$lib/domain/engagementBundle';
import { prisma } from '$lib/server/prisma';
import { llmopsClient } from '$lib/server/llmops/client';
import { isProjectCutOverToHub } from '$lib/server/projects/hubMigrationService';

export const POST: RequestHandler = async (event) => {
	// 1. Authentification stricte par session (jamais par en-tête)
	const session = event.locals.session;
	if (!session || !session.user) {
		return json(
			{ status: 'error', error: 'Non authentifié : session requise' },
			{ status: 401 }
		);
	}

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
			const hubExport = await llmopsClient.exportEngagementSnapshot(engagementId, session.user.email);

			// Le Hub scelle les faits engagés ; Archinex scelle le processus (exigences, sujets, lacunes) et épingle ce snapshot.
			let processBundle: Awaited<ReturnType<typeof exportEngagementBundle>> | null = null;
			let processBundleError: string | undefined;
			try {
				processBundle = await exportEngagementBundle({
					projectId: event.params.projectId,
					confidentiality,
					actorHandle,
					factsFromHub: {
						engagement_id: engagementId,
						snapshot_id: hubExport.snapshotRef.snapshotId,
						checksum: hubExport.snapshotRef.checksum
					}
				});
			} catch (e) {
				// Le snapshot du Hub est déjà émis : on le rend, et on dit pourquoi le dossier de processus manque.
				processBundleError = e instanceof Error ? e.message : String(e);
			}

			return json({
				status: 'ok',
				snapshotRef: hubExport.snapshotRef,
				created: hubExport.created,
				is_provisional: hubExport.is_provisional,
				systemOfRecord: 'hub',
				processBundle: processBundle?.bundle ?? null,
				processSnapshotRef: processBundle?.snapshotRef ?? null,
				processBundleError
			});
		}

		const result = await exportEngagementBundle({
			projectId: event.params.projectId,
			confidentiality,
			actorHandle
		});

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
