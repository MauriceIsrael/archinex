import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadProjectHldDossier } from '$lib/server/projects/hldFragmentDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import {
	compileDossierWithDocumentEngine,
	checkDocumentEngineHealth,
	getDocumentStudioUrl,
	DocumentEngineUnavailableError
} from '$lib/server/projects/documentEngineBridge';

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

	try {
		const dossier = await loadProjectHldDossier(event.params.projectId);
		const result = await compileDossierWithDocumentEngine(dossier, format);

		return new Response(result.buffer, {
			headers: {
				'Content-Type': result.contentType,
				'Content-Disposition': `attachment; filename="${result.filename}"`
			}
		});
	} catch (err: unknown) {
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

		const message = err instanceof Error ? err.message : String(err);
		return json(
			{
				status: 'error',
				error: message
			},
			{ status: 500 }
		);
	}
};
