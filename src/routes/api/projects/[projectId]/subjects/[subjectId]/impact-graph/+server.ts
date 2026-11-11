import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { getSubjectArbitrationContext } from '$lib/server/projects/arbitrationDb';
import { getProjectFrameworks } from '$lib/server/projects/frameworksDb';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { requirementBundleId } from '$lib/domain/requirementAudit';
import {
	buildContextualImpactGraph,
	type ContextualSubjectInput
} from '$lib/domain/impactGraph';
import { generateContextualImpactGraphWithLlm } from '$lib/server/agents/impactGraphGenerator';

function parseStringArray(raw: string | null | undefined): string[] {
	try {
		const parsed = JSON.parse(raw || '[]');
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

async function loadContextualInput(
	projectId: string,
	subjectId: string
): Promise<ContextualSubjectInput> {
	const [project, ctx, sources, fwData, tradeoffs] = await Promise.all([
		prisma.project.findUnique({
			where: { id: projectId },
			select: { id: true, title: true }
		}),
		getSubjectArbitrationContext(subjectId),
		prisma.requirementSource.findMany({
			where: { projectId },
			include: { requirements: true }
		}),
		getProjectFrameworks(projectId).catch(() => ({ frameworks: [] })),
		prisma.tradeOff.findMany({
			where: { subjectId }
		})
	]);

	if (!project) {
		throw new Error(`NOT_FOUND: projet ${projectId} introuvable`);
	}
	if (!ctx.subject || ctx.subject.projectId !== projectId) {
		throw new Error(`NOT_FOUND: sujet ${subjectId} introuvable dans le projet ${projectId}`);
	}

	const requirementRefs = new Set(parseStringArray(ctx.subject.requirementRefs));
	const allRequirements = sources.flatMap((s) =>
		s.requirements.map((r) => ({
			id: requirementBundleId(s.sha256, r.clauseRef),
			clauseRef: r.clauseRef,
			title: r.title,
			criticality: r.criticality
		}))
	);

	// Ne conserve que les exigences rattachées au sujet (ou toutes si aucune ref explicite)
	const linkedRequirements =
		requirementRefs.size > 0
			? allRequirements.filter((r) => requirementRefs.has(r.id) || requirementRefs.has(r.clauseRef))
			: allRequirements.slice(0, 4);

	const frameworkNames = (fwData.frameworks || []).map((f: any) =>
		typeof f === 'string' ? f : f.framework || String(f)
	);

	return {
		projectId: project.id,
		projectTitle: project.title,
		subject: {
			id: ctx.subject.id,
			sectionRef: ctx.subject.sectionRef,
			name: ctx.subject.name,
			problemStatement: ctx.subject.problemStatement || '',
			maturityLevel: ctx.subject.maturityLevel
		},
		criteria: ctx.criteria.map((c) => ({
			id: c.id,
			name: c.name,
			description: c.description,
			kind: c.kind,
			weight: c.weight
		})),
		options: ctx.options.map((o) => ({
			id: o.id,
			title: o.title,
			summary: o.summary,
			status: o.status
		})),
		evaluations: ctx.evaluations.map((e) => ({
			optionId: e.optionId,
			criterionId: e.criterionId,
			score: e.score,
			justification: e.justification
		})),
		decision: ctx.decision
			? {
					id: ctx.decision.id,
					retainedOptionId: ctx.decision.retainedOptionId,
					rationale: ctx.decision.rationale,
					reversibility: ctx.decision.reversibility,
					complianceStatus: ctx.decision.complianceStatus,
					version: ctx.decision.version,
					acceptedViolations: ctx.decision.acceptedViolations
				}
			: null,
		requirements: linkedRequirements,
		frameworks: frameworkNames,
		tradeoffs: tradeoffs.map((t) => ({
			id: t.id,
			optionId: t.optionId,
			gains: t.gains,
			sacrifices: t.sacrifices
		}))
	};
}

/** GET : retourne le graphe causal déterministe contextualisé pour ce sujet. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const input = await loadContextualInput(params.projectId!, params.subjectId!);
		const graph = buildContextualImpactGraph(input);
		return json({ status: 'ok', graph });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		const status = message.startsWith('NOT_FOUND') || /introuvable/i.test(message) ? 404 : 500;
		return json({ status: 'error', error: message }, { status });
	}
};

/** POST : génère / enrichit dynamiquement le graphe causal du sujet via le LLM. */
export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const auth = await authorizeProjectAccess(event, params.projectId!);
	if (auth.error) return auth.error;

	try {
		const input = await loadContextualInput(params.projectId!, params.subjectId!);
		const graph = await generateContextualImpactGraphWithLlm(input);
		return json({ status: 'ok', graph });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		const status = message.startsWith('NOT_FOUND') || /introuvable/i.test(message) ? 404 : 500;
		return json({ status: 'error', error: message }, { status });
	}
};
