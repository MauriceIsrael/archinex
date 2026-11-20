import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadProjectHldDossier } from '$lib/server/projects/hldFragmentDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import {
	compileDossierWithDocumentEngine,
	checkDocumentEngineHealth,
	getDocumentStudioUrl,
	DocumentEngineUnavailableError,
	type DocumentEngineTransverseEnrichment
} from '$lib/server/projects/documentEngineBridge';
import {
	buildProjectCompletenessLedger,
	getProjectArchitectureLock
} from '$lib/server/edp/decisionSlotRegistry';
import { loadProjectHydrationContextFromDb } from '$lib/server/edp/projectHydrationContext';

/**
 * Endpoint de compilation et d'export du dossier HLD via Document Engine.
 *
 * GET /api/projects/:projectId/hld-document-engine?format=docx
 * GET /api/projects/:projectId/hld-document-engine?action=check
 */
export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;

	const action = event.url.searchParams.get('action');
	if (action === 'check') {
		const health = await checkDocumentEngineHealth();
		return json({
			status: 'ok',
			engine: health,
			studio: {
				url: getDocumentStudioUrl()
			}
		});
	}

	const rawFormat = event.url.searchParams.get('format') || 'docx';
	const format = rawFormat === 'markdown' || rawFormat === 'pdf' ? rawFormat : 'docx';
	const includeMermaidCode = event.url.searchParams.get('includeMermaidCode') === 'true';

	try {
		const projectId = event.params.projectId;
		const dossier = await loadProjectHldDossier(projectId);
		let transverseEnrichment: DocumentEngineTransverseEnrichment | undefined;
		try {
			const dbContext = await loadProjectHydrationContextFromDb(projectId, dossier.projectTitle);
			const ledger = await buildProjectCompletenessLedger({
				...dbContext,
				projectId,
				projectTitle: dossier.projectTitle
			});
			const architectureLock = getProjectArchitectureLock(projectId);
			transverseEnrichment = {
				components: ledger.activeCatalog,
				ratifiedSlots: ledger.slots,
				architectureLock
			};
		} catch {
			// Si l'ontologie ou le registre n'est pas disponible, on compile le HLD sans enrichissement transverse
		}
		const result = await compileDossierWithDocumentEngine(dossier, format, {
			includeMermaidCode,
			transverseEnrichment
		});

		return new Response(result.buffer, {
			headers: {
				'Content-Type': result.contentType,
				'Content-Disposition': `attachment; filename="${result.filename}"`
			}
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(
			`[hld-document-engine] Erreur compilation (${event.params.projectId}, format=${format}) :`,
			message
		);

		if (err instanceof DocumentEngineUnavailableError) {
			return json(
				{
					status: 'error',
					code: 'DOCUMENT_ENGINE_UNAVAILABLE',
					error: err.message,
					engineUrl: err.url,
					studioUrl: getDocumentStudioUrl()
				},
				{ status: 503 }
			);
		}

		return json(
			{
				status: 'error',
				error: message
			},
			{ status: 500 }
		);
	}
};
