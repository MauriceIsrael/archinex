import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { sanitizeHandle } from '$lib/domain/bundleAssembly';
import { saveRequirementAudit } from '$lib/server/projects/requirementsDb';
import { buildRequirementAudit, sourceBundleId, sourceSha256, type ReviewedClause } from '$lib/domain/requirementAudit';

/**
 * Réenregistre le dossier d'exigences d'un projet à partir de l'analyse de RFP enregistrée qui l'a produit,
 * sans rien relancer. L'analyse est retrouvée par l'identifiant de source que portent les sujets
 * (`SRC-xxxxxxxx:clause`) ; les clauses confirmées sont celles que les sujets du projet couvrent.
 */
export const POST: RequestHandler = async (event) => {
	const projectId = event.params.projectId!;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	const subjects = await prisma.subject.findMany({ where: { projectId }, select: { requirementRefs: true } });
	const refs = subjects.flatMap((s) => {
		try {
			return JSON.parse(s.requirementRefs || '[]') as string[];
		} catch {
			return [];
		}
	});
	const sourceIds = new Set(refs.map((r) => r.split(':')[0]).filter((id) => id.startsWith('SRC-')));
	if (sourceIds.size === 0) {
		return json({ status: 'error', error: 'NO_REQUIREMENT_REFS', reason: "Aucun sujet du projet ne référence d'exigence de RFP." }, { status: 404 });
	}

	const runs = await prisma.factorizationRun.findMany({
		where: { status: { in: ['ok', 'partial'] }, sourceText: { not: null }, result: { not: null } },
		orderBy: { startedAt: 'desc' },
		select: { id: true, documentTitle: true, model: true, sourceText: true, result: true, startedAt: true, finishedAt: true }
	});

	const saved: Array<{ sourceId: string; runId: string; clauses: number; confirmed: number }> = [];
	for (const sourceId of sourceIds) {
		const run = runs.find((r) => sourceBundleId(sourceSha256(r.sourceText!)) === sourceId);
		if (!run) continue;
		const result = JSON.parse(run.result!) as { modelUsed?: string; allAuditedRequirements?: ReviewedClause[] };
		const reviewed = result.allAuditedRequirements ?? [];
		if (reviewed.length === 0) continue;
		const confirmedDeliberated = refs.filter((r) => r.startsWith(`${sourceId}:`)).map((r) => r.slice(sourceId.length + 1));
		const audit = buildRequirementAudit({
			sourceText: run.sourceText!,
			sourceTitle: run.documentTitle || 'Cahier des Charges (RFP)',
			model: result.modelUsed || run.model,
			auditedAt: (run.finishedAt ?? run.startedAt).toISOString(),
			reviewed,
			confirmedDeliberated
		});
		await saveRequirementAudit(projectId, audit, sanitizeHandle(auth.session!.user.email));
		saved.push({ sourceId, runId: run.id, clauses: audit.items.length, confirmed: audit.confirmedDeliberated.length });
	}

	if (saved.length === 0) {
		return json({ status: 'error', error: 'RUN_NOT_FOUND', reason: "L'analyse de RFP à l'origine de ces sujets n'est plus enregistrée." }, { status: 404 });
	}
	return json({ status: 'ok', saved });
};
