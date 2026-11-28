import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkIpFlowManagerHealth } from '$lib/server/edp/ipfmSync';

/**
 * Endpoint de contrôle de disponibilité d'IP Flow Manager (IFM).
 *
 * GET /api/ipfm/health
 */
export const GET: RequestHandler = async () => {
	const health = await checkIpFlowManagerHealth(1500);
	return json({
		status: 'ok',
		ipfm: {
			available: health.available,
			url: health.url,
			version: health.version || null,
			error: health.error || null
		}
	});
};
