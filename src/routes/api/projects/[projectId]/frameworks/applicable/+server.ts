import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { getApplicableFrameworks, pushApplicableFrameworks } from '$lib/server/compliance/complianceService';
import { detectApplicableFrameworks, REGULATORY_FRAMEWORKS } from '$lib/domain/regulatoryFrameworks';

/** Référentiels déclarés pour l'espace, et ceux que cite le dossier d'exigences enregistré (proposition). */
export const GET: RequestHandler = async (event) => {
	const projectId = event.params.projectId!;
	const sources = await prisma.requirementSource.findMany({
		where: { projectId },
		select: { requirements: { select: { title: true, text: true } } }
	});
	const text = sources.flatMap((s) => s.requirements.map((r) => `${r.title} ${r.text}`)).join('\n');
	return json({
		status: 'ok',
		applicable: await getApplicableFrameworks(projectId),
		requirementsDossier: sources.length > 0,
		detected: text ? detectApplicableFrameworks(text) : [],
		catalogue: REGULATORY_FRAMEWORKS.map((f) => ({ code: f.code, label: f.label }))
	});
};

/** Déclare les référentiels applicables : enregistrés dans la stratégie de l'espace et transmis à LLMOps. */
export const PUT: RequestHandler = async (event) => {
	const projectId = event.params.projectId!;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	const body = await event.request.json().catch(() => ({}));
	const known = new Set(REGULATORY_FRAMEWORKS.map((f) => f.code));
	const frameworks = Array.isArray(body.frameworks)
		? [...new Set<string>(body.frameworks.filter((f: unknown): f is string => typeof f === 'string' && known.has(f)))].sort()
		: null;
	if (!frameworks) return json({ status: 'error', error: 'frameworks (liste de codes) requis' }, { status: 400 });

	for (const table of ['engagement', 'project'] as const) {
		const row = await (prisma[table] as any).findUnique({ where: { id: projectId }, select: { strategy: true } });
		if (!row) continue;
		const strategy = { ...JSON.parse(row.strategy || '{}'), applicableFrameworks: frameworks };
		await (prisma[table] as any).update({ where: { id: projectId }, data: { strategy: JSON.stringify(strategy) } });
	}
	const llmops = await pushApplicableFrameworks(projectId, frameworks);
	return json({ status: 'ok', applicable: frameworks, llmops });
};
