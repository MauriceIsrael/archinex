import { json, error, type RequestHandler } from '@sveltejs/kit';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import type { CheckOptionRequest } from '$lib/types/llmops';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as CheckOptionRequest;
		if (!body || (!body.option_id && !body.option_label)) {
			throw error(400, 'option_id ou option_label est requis.');
		}

		const result = await doctrineService.checkOption(body);
		return json(result);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Erreur lors de la vérification doctrinale';
		return json(
			{
				verdict: 'uncovered',
				details: message
			},
			{ status: 500 }
		);
	}
};
