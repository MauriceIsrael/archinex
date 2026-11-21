import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { getAllEngagementsFromDb, saveEngagementToDb } from '$lib/server/engagementsDb';
import {
	addCreatorAsMember,
	authorizeProjectAccess,
	getAccessibleProjectIds
} from '$lib/server/projects/projectAccess';
import { pushApplicableFrameworks } from '$lib/server/compliance/complianceService';

const frameworksOf = (strategy: unknown): string[] | null => {
	const fws = (strategy as { applicableFrameworks?: unknown } | null)?.applicableFrameworks;
	return Array.isArray(fws) ? [...fws].filter((f): f is string => typeof f === 'string').sort() : null;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = locals.session;
	if (!session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}
	try {
		const full = url.searchParams.get('full') === 'true';
		const [engagements, allowedIds] = await Promise.all([
			getAllEngagementsFromDb({
				includeCorpusKeyClauses: full,
				stripSubjectProposals: !full
			}),
			getAccessibleProjectIds(session)
		]);
		const visible = allowedIds ? engagements.filter((e) => allowedIds.has(e.id)) : engagements;
		return json(visible);
	} catch (err: any) {
		return json({ error: err.message || 'Failed to fetch engagements' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	const session = locals.session;
	if (!session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}
	try {
		const body = await request.json();
		if (!body?.engagement) {
			return json({ error: 'Missing engagement payload' }, { status: 400 });
		}
		const previous = await prisma.engagement.findUnique({ where: { id: body.engagement.id }, select: { strategy: true } });
		const isCreation = !previous;
		if (!isCreation) {
			const auth = await authorizeProjectAccess(event, body.engagement.id);
			if (auth.error) return auth.error;
		}
		const saved = await saveEngagementToDb(body.engagement);
		// Seulement à la création : une sauvegarde ultérieure ne donne pas l'accès au projet.
		const creatorId = session.user.id;
		if (isCreation && creatorId) {
			await addCreatorAsMember(saved.id, creatorId).catch((err) =>
				console.warn(`[engagements] Créateur non rattaché au projet ${saved.id} :`, err?.message || err)
			);
		}
		// Référentiels applicables : déclarés à LLMOps à la création, puis à chaque changement de la liste.
		const frameworks = frameworksOf(body.engagement.strategy);
		const before = previous ? frameworksOf(JSON.parse(previous.strategy || '{}')) : null;
		if (frameworks && JSON.stringify(frameworks) !== JSON.stringify(before)) {
			await pushApplicableFrameworks(saved.id, frameworks).catch((err) =>
				console.warn(`[engagements] Référentiels de ${saved.id} non déclarés à LLMOps :`, err?.message || err)
			);
		}
		return json({ success: true, engagement: saved });
	} catch (err: any) {
		return json({ error: err.message || 'Failed to persist engagement' }, { status: 500 });
	}
};
