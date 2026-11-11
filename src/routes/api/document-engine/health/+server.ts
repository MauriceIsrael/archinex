import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	checkDocumentEngineHealth,
	getDocumentStudioUrl,
	getDocumentEngineUrl
} from '$lib/server/projects/documentEngineBridge';

/**
 * Endpoint global de contrôle de disponibilité de Document Engine et Document Studio.
 *
 * GET /api/document-engine/health
 */
export const GET: RequestHandler = async () => {
	const health = await checkDocumentEngineHealth(1200);
	return json({
		status: 'ok',
		engine: {
			available: health.available,
			url: health.url || getDocumentEngineUrl()
		},
		studio: {
			url: getDocumentStudioUrl()
		}
	});
};
