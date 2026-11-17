import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubjectArbitrationContext } from '$lib/server/projects/arbitrationDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { resolveProjectionPatternSemantically } from '$lib/server/similarity/projectionSemanticClassifier';

/**
 * Résout sémantiquement le patron d'architecture cible d'un sujet via le comparateur cosinus
 * sur embeddings (`resolveProjectionPatternSemantically`), afin d'alimenter `ProjectionContext.resolvedPattern`.
 */
export const GET: RequestHandler = async (event) => {
	const { params } = event;
	const auth = await authorizeProjectAccess(event, params.projectId);
	if (auth.error) return auth.error;
	try {
		const ctx = await getSubjectArbitrationContext(params.subjectId!);
		const subject = ctx.subject;
		if (!subject || subject.projectId !== params.projectId) {
			return json({ status: 'error', error: 'Sujet introuvable' }, { status: 404 });
		}
		const retainedOption = ctx.options.find(
			(o) => o.id === ctx.decision?.retainedOptionId || o.status === 'retained'
		);
		const text = [
			subject.name,
			subject.problemStatement || '',
			retainedOption?.title || '',
			retainedOption?.summary || '',
			ctx.decision?.rationale || ''
		]
			.filter(Boolean)
			.join(' ');
		const resolvedPattern = await resolveProjectionPatternSemantically(text);
		return json({ status: 'ok', resolvedPattern: resolvedPattern ?? null });
	} catch (err: any) {
		return json({ status: 'error', error: err?.message || String(err) }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { params, request } = event;
	const auth = await authorizeProjectAccess(event, params.projectId);
	if (auth.error) return auth.error;
	try {
		const body = await request.json().catch(() => ({}));
		const text = typeof body?.text === 'string' ? body.text : '';
		const resolvedPattern = text.trim() ? await resolveProjectionPatternSemantically(text) : undefined;
		return json({ status: 'ok', resolvedPattern: resolvedPattern ?? null });
	} catch (err: any) {
		return json({ status: 'error', error: err?.message || String(err) }, { status: 500 });
	}
};
