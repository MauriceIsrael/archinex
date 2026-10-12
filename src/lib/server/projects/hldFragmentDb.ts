import { prisma } from '../prisma';
import { getSubjectArbitrationContext } from './arbitrationDb';
import { buildHldFragment, renderHldFragmentMarkdown, type HldFragment } from '$lib/domain/hldFragment';
import { requirementBundleId } from '$lib/domain/requirementAudit';
import { coverageWarnings } from '$lib/domain/maturityRules';
import { getProjectFrameworks } from './frameworksDb';

const parseIds = (raw: string | null | undefined): string[] => {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
};

/** Fragment de HLD d'un sujet, à partir des tables relationnelles (décision, options, critères, exigences). */
export async function loadHldFragment(projectId: string, subjectId: string): Promise<{ fragment: HldFragment; markdown: string }> {
	const ctx = await getSubjectArbitrationContext(subjectId);
	const subject = ctx.subject;
	if (!subject || subject.projectId !== projectId) throw new Error(`NOT_FOUND: sujet ${subjectId}`);

	const requirementRefs = parseIds(subject.requirementRefs);
	const dependsOnIds = parseIds(subject.dependsOn);
	const [dependsOn, sources, assertion] = await Promise.all([
		dependsOnIds.length
			? prisma.subject.findMany({ where: { id: { in: dependsOnIds } }, select: { id: true, name: true, maturityLevel: true } })
			: Promise.resolve([]),
		prisma.requirementSource.findMany({ where: { projectId }, include: { requirements: true } }),
		ctx.decision
			? prisma.domainEvent.findFirst({
					where: { projectId, entityType: 'decision', entityId: ctx.decision.id, type: 'DECISION_ASSERTED' },
					orderBy: { createdAt: 'desc' }
				})
			: Promise.resolve(null)
	]);

	const requirements = sources.flatMap((s) =>
		s.requirements.map((r) => ({
			id: requirementBundleId(s.sha256, r.clauseRef),
			clauseRef: r.clauseRef,
			title: r.title,
			criticality: r.criticality,
			text: r.text
		}))
	);
	let affirmedBy: string | null = null;
	if (assertion) {
		try {
			affirmedBy = JSON.parse(assertion.payload || '{}').validatedBy || assertion.actorId;
		} catch {
			affirmedBy = assertion.actorId;
		}
	}

	const fragment = buildHldFragment({
		subject: {
			id: subject.id,
			sectionRef: subject.sectionRef,
			name: subject.name,
			problemStatement: subject.problemStatement,
			nature: subject.nature,
			maturityLevel: subject.maturityLevel,
			deliberationStatus: subject.deliberationStatus,
			singleOptionRationale: subject.singleOptionRationale
		},
		dependsOn,
		requirementRefs,
		requirements,
		requirementsDossierPresent: sources.length > 0,
		criteria: ctx.criteria,
		options: ctx.options,
		evaluations: ctx.evaluations,
		arguments: ctx.arguments,
		decision: ctx.decision,
		affirmedBy,
		coverageWarnings: coverageWarnings((await getProjectFrameworks(projectId).catch(() => ({ frameworks: [] }))).frameworks).map((w) => w.message),
		generatedAt: new Date().toISOString()
	});
	return { fragment, markdown: renderHldFragmentMarkdown(fragment) };
}
