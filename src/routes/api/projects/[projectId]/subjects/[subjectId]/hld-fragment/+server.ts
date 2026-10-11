import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadHldFragment } from '$lib/server/projects/hldFragmentDb';

/** Fragment de dossier de conception (HLD) du sujet : structuré, et en Markdown pour le dossier. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { fragment, markdown } = await loadHldFragment(params.projectId!, params.subjectId!);
		return json({ status: 'ok', fragment, markdown });
	} catch (err: any) {
		const message = err?.message || String(err);
		return json({ status: 'error', error: message }, { status: message.startsWith('NOT_FOUND') || /introuvable/i.test(message) ? 404 : 500 });
	}
};
