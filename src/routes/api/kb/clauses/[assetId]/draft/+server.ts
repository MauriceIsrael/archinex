import { json, type RequestHandler } from '@sveltejs/kit';
import { draftCheckClause } from '$lib/server/doctrine/clauseDrafter';


/**
 * Rédaction assistée par IA d'une clause de vérification déterministe (Issue #99).
 * Dérive les déclencheurs (when), conditions attendues (expect) en FR et EN, et le message
 * à partir du texte légal et des métadonnées du contrôle.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.session?.user) {
		return json({ status: 'error', error: 'Authentification requise' }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}));
	const assetId = params.assetId || body.asset_id;
	if (!assetId) {
		return json({ status: 'error', error: "L'identifiant du contrôle (assetId) est requis" }, { status: 400 });
	}

	const input = {
		asset_id: assetId,
		asset_title: String(body.asset_title || assetId),
		asset_title_fr: body.asset_title_fr ? String(body.asset_title_fr) : null,
		asset_excerpt: String(body.asset_excerpt || body.asset_title || ''),
		framework: body.framework ? String(body.framework) : null,
		domain: Array.isArray(body.domain) ? body.domain.map(String) : [],
		source_ref: body.source_ref ? String(body.source_ref) : null
	};

	try {
		const draft = await draftCheckClause(input);
		return json({
			status: 'ok',
			data: draft
		});
	} catch (e: any) {
		return json(
			{
				status: 'error',
				error: e?.message || 'Erreur lors de la rédaction assistée de la clause'
			},
			{ status: 500 }
		);
	}
};
