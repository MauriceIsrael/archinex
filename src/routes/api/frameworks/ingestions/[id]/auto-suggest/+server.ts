import { json, type RequestHandler } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import { autoEnrichFrameworkIngestion } from '$lib/server/frameworks/frameworkEnricher';

/**
 * Déclenche l'auto-enrichissement assisté par IA de toutes les exigences d'une ingestion
 * (critères d'acceptation, liaisons doctrinales et termes de recherche étiquetés llm-derived).
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	const actorEmail = locals.session?.user?.email || undefined;
	if (!locals.session?.user) {
		return json({ status: 'error', error: 'Authentification requise' }, { status: 401 });
	}

	const ingestionId = params.id;
	if (!ingestionId) {
		return json({ status: 'error', error: "Identifiant d'ingestion requis" }, { status: 400 });
	}

	try {
		const ingRes = await llmopsClient.getFrameworkIngestion(ingestionId, actorEmail);
		if (ingRes.status !== 'ok' || !ingRes.data) {
			return json({ status: 'error', error: ingRes.error || 'Ingestion introuvable' }, { status: 404 });
		}

		const ingestion = ingRes.data;
		const result = await autoEnrichFrameworkIngestion(
			ingestionId,
			ingestion.requirements || [],
			ingestion.framework_id,
			actorEmail
		);

		return json({
			status: 'ok',
			data: {
				updated: result.updated,
				count: result.count
			}
		});
	} catch (err: any) {
		console.error(`[auto-suggest] Erreur lors de l'auto-enrichissement de ${ingestionId}:`, err?.message || err);
		return json({ status: 'error', error: err?.message || "Erreur lors de l'auto-enrichissement" }, { status: 500 });
	}
};
