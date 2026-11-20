import { prisma } from '../prisma';
import { getSubjectArbitrationContext } from './arbitrationDb';
import { buildHldFragment, renderHldFragmentMarkdown, type HldFragment } from '$lib/domain/hldFragment';
import { requirementBundleId } from '$lib/domain/requirementAudit';
import { coverageWarnings } from '$lib/domain/maturityRules';
import { getProjectFrameworks } from './frameworksDb';
import { resolveProjectionPatternSemantically } from '../similarity/projectionSemanticClassifier';
import type { Statement } from '$lib/types/epistemic';
import { loadProjectComponentCatalog } from '../edp/componentCatalogRepository';

const parseIds = (raw: string | null | undefined): string[] => {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
};

/** Fragment de HLD d'un sujet, à partir des tables relationnelles (décision, options, critères, exigences, énoncés, EDP). */
export async function loadHldFragment(projectId: string, subjectId: string): Promise<{ fragment: HldFragment; markdown: string }> {
	const ctx = await getSubjectArbitrationContext(subjectId);
	const subject = ctx.subject;
	if (!subject || subject.projectId !== projectId) throw new Error(`NOT_FOUND: sujet ${subjectId}`);

	const requirementRefs = parseIds(subject.requirementRefs);
	const dependsOnIds = parseIds(subject.dependsOn);
	const [dependsOn, sources, assertion, dbStatements, edpRow] = await Promise.all([
		dependsOnIds.length
			? prisma.subject.findMany({ where: { id: { in: dependsOnIds } }, select: { id: true, name: true, maturityLevel: true } })
			: Promise.resolve([]),
		prisma.requirementSource.findMany({ where: { projectId }, include: { requirements: true } }),
		ctx.decision
			? prisma.domainEvent.findFirst({
					where: { projectId, entityType: 'decision', entityId: ctx.decision.id, type: 'DECISION_ASSERTED' },
					orderBy: { createdAt: 'desc' }
				})
			: Promise.resolve(null),
		prisma.statement.findMany({
			where: {
				projectId,
				OR: [{ subjectId }, { section: subject.sectionRef }],
				status: 'active'
			},
			take: 100
		}).catch(() => []),
		(prisma as any).executableDecisionPackage?.findFirst?.({
			where: { subjectId },
			orderBy: { revision: 'desc' }
		}).catch(() => null) ?? Promise.resolve(null)
	]);

	const mappedStatements: Statement[] = (dbStatements || []).map((st) => ({
		id: st.id,
		section: st.section || subject.sectionRef,
		triplet: {
			subject: st.subjectRef,
			predicate: st.predicate,
			value: st.value,
			...(st.unit ? { unit: st.unit } : {})
		},
		justification: { basedOn: parseIds(st.basedOn) },
		authority: {
			author: st.author,
			role: st.role,
			productionMode: (st.productionMode || 'human-authored') as Statement['authority']['productionMode']
		},
		maturity: {
			subjectLevel: (st.subjectLevel || subject.maturityLevel) as Statement['maturity']['subjectLevel'],
			confidence: (st.confidence || 'designed') as Statement['maturity']['confidence']
		},
		revisability: { antecedents: parseIds(st.basedOn) },
		status: 'active',
		createdAt: st.createdAt.toISOString(),
		updatedAt: st.updatedAt.toISOString()
	}));

	let decisionSlots: HldFragment['decisionSlots'];
	let ontologyAxes: HldFragment['ontologyAxes'];
	let catalogComponents: HldFragment['catalogComponents'];
	try {
		if (edpRow?.content) {
			const parsedEdp = JSON.parse(edpRow.content);
			const cov = parsedEdp.refinementCoverage;
			if (Array.isArray(cov?.decisionSlots)) {
				decisionSlots = cov.decisionSlots.map((s: any) => ({
					slotId: s.slotId,
					axisUrn: s.axisUrn || s.slotId || s.axisTitle || 'axis',
					axisTitle: s.axisTitle,
					togafDomain: s.togafDomain,
					status: s.status,
					boundLeafUrns: s.boundLeafUrns || [],
					boundLeafTitles: s.boundLeafTitles || [],
					boundLeaves: Array.isArray(s.boundLeaves)
						? s.boundLeaves.map((l: any) => ({
								urn: l.urn,
								title: l.title,
								domain: l.domain
							}))
						: undefined,
					instantiatedComponents: s.instantiatedComponents || [],
					coveredRequirementRefs: s.coveredRequirementRefs || [],
					isTransitivePrerequisite: s.isTransitivePrerequisite,
					triggeredByAxisUrn: s.triggeredByAxisUrn
				}));
			}
			if (Array.isArray(cov?.axes)) {
				ontologyAxes = cov.axes.map((a: any) => ({
					axisUrn: a.axisUrn || a.urn || a.axisTitle || 'axis',
					axisTitle: a.axisTitle,
					domain: a.domain,
					togafDomain: a.togafDomain,
					status: a.status,
					boundLeaves: (a.boundLeaves || []).map((l: any) => ({
						urn: l.urn,
						title: l.title,
						domain: l.domain
					})),
					instantiatedComponents: a.instantiatedComponents || []
				}));
			}
		}
		const storedCatalog = loadProjectComponentCatalog(projectId);
		if (storedCatalog.components.length > 0) {
			catalogComponents = storedCatalog.components.map((c) => ({
				name: c.metadata.name,
				title: c.metadata.displayName || c.metadata.name,
				domain: c.metadata.functionalDomain,
				kind: c.spec.class,
				dependsOn: c.spec.dependsOn || []
			}));
		}
	} catch {
		// Non bloquant
	}

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

	const retainedOption = ctx.options.find((o) => o.id === ctx.decision?.retainedOptionId || o.status === 'retained');
	const patternCorpus = [
		subject.name,
		subject.problemStatement || '',
		retainedOption?.title || '',
		retainedOption?.summary || '',
		ctx.decision?.rationale || ''
	]
		.filter(Boolean)
		.join(' ');
	const resolvedPattern = retainedOption
		? await resolveProjectionPatternSemantically(patternCorpus)
		: undefined;

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
		resolvedPattern,
		statements: mappedStatements,
		decisionSlots,
		ontologyAxes,
		catalogComponents,
		generatedAt: new Date().toISOString()
	});
	return { fragment, markdown: renderHldFragmentMarkdown(fragment) };
}

export interface ProjectHldDossier {
	projectId: string;
	projectTitle: string;
	markdown: string;
	fragments: HldFragment[];
	generatedAt: string;
}

/**
 * Assemble l'ensemble des fragments HLD des sujets d'un projet pour produire le dossier de conception complet.
 */
export async function loadProjectHldDossier(projectId: string): Promise<ProjectHldDossier> {
	const project = await prisma.project.findUnique({
		where: { id: projectId },
		include: {
			subjects: {
				orderBy: { sectionRef: 'asc' }
			}
		}
	});

	if (!project) throw new Error(`NOT_FOUND: projet ${projectId}`);

	const fragments: HldFragment[] = [];
	const fragmentMds: string[] = [];

	for (const subj of project.subjects) {
		try {
			const { fragment, markdown } = await loadHldFragment(projectId, subj.id);
			fragments.push(fragment);
			fragmentMds.push(markdown);
		} catch {
			// Sujet incomplet ou non migré, on ignore
		}
	}

	const now = new Date().toISOString();
	const out: string[] = [
		`# Dossier de Conception d'Architecture (HLD) — ${project.title}`,
		'',
		`> Document de conception unifié produit à partir des délibérations et des décisions enregistrées. Zéro dérive documentaire garantie.`,
		'',
		'| Métadonnées du Dossier | Valeur |',
		'|---|---|',
		`| **Projet** | ${project.title} (\`${project.id}\`) |`,
		`| **Type d'Engagement** | ${project.type} |`,
		`| **Sujets d'Architecture Instruits** | ${fragments.length} / ${project.subjects.length} |`,
		`| **Généré le** | ${now.slice(0, 10)} |`,
		'',
		'---',
		'',
		'## Fragments de Conception par Section (Modèle ADR ArcKit)',
		'',
		fragmentMds.join('\n\n---\n\n')
	];

	return {
		projectId,
		projectTitle: project.title,
		markdown: out.join('\n'),
		fragments,
		generatedAt: now
	};
}
