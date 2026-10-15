import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadProjectHldDossier } from '$lib/server/projects/hldFragmentDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';

/**
 * Exporte l'ensemble des fragments HLD d'un projet assemblés en un dossier de conception Markdown complet.
 */
export const GET: RequestHandler = async (event) => {
	const auth = await authorizeProjectAccess(event, event.params.projectId);
	if (auth.error) return auth.error;

	try {
		const dossier = await loadProjectHldDossier(event.params.projectId);

		if (event.url.searchParams.get('format') === 'markdown' || event.url.searchParams.get('format') === 'raw') {
			return new Response(dossier.markdown, {
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					'Content-Disposition': `attachment; filename="hld-dossier-${event.params.projectId}.md"`
				}
			});
		}

		return json({ status: 'ok', dossier });
	} catch (err: any) {
		const message = err?.message || String(err);
		return json({ status: 'error', error: message }, { status: message.startsWith('NOT_FOUND') ? 404 : 500 });
	}
};
