import { json, type RequestEvent } from '@sveltejs/kit';
import type { ZodType } from 'zod';
import { prisma } from '$lib/server/prisma';
import { resolveProjectNautobotOptions } from '$lib/server/edp/nautobotSync';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { requirementBundleId } from '$lib/domain/requirementAudit';
import type { StructuredFactInput } from '$lib/server/edp/refinementCoverage';

export interface EdpActionActor {
	id: string;
	role: string;
}

export interface EdpActionContext {
	projectId: string;
	subjectId: string;
	actor: EdpActionActor;
}

export interface EdpActionResult {
	status?: number;
	body: Record<string, unknown>;
}

export interface SubjectEdpContext {
	subject: any;
	title: string;
	sectionRef: string;
	edpPrimaryKey: string;
	decisionText: string;
	problem: string;
	structuredFacts: StructuredFactInput[];
	requirementClauses: string[];
}

export interface PersistedEdpSnapshot {
	fromDb: any | null;
	parsedDb: any | null;
	explicitBindings: Array<{ urn: string; revision: number | string }>;
	excludedLeafUrns: string[];
	excludedAxisUrns: string[];
}

function parseStringIds(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export async function loadProjectNautobotOptions(projectId: string) {
	const project = await (prisma as any).project?.findUnique({
		where: { id: projectId },
		select: { id: true, shortName: true, strategy: true }
	});
	return resolveProjectNautobotOptions(project || { id: projectId });
}

export async function loadSubjectContext(
	subjectId: string,
	projectIdParam?: string
): Promise<SubjectEdpContext> {
	const subject = await (prisma as any).subject?.findUnique({
		where: { id: subjectId },
		include: { decision: true, options: true }
	});
	const resolvedProjectId = subject?.projectId || projectIdParam;
	const title = subject?.name || 'Plateforme Cloud & Interconnexion Sécurisée';
	const sectionRef = subject?.sectionRef || subject?.section_ref || subjectId || 'ADR-012';
	const edpPrimaryKey = `EDP-${subjectId}`;

	const retainedOption = subject?.options?.find(
		(o: any) => o.id === subject?.decision?.retainedOptionId || o.status === 'retained'
	);
	const decisionParts = [
		retainedOption?.title,
		retainedOption?.summary,
		subject?.decision?.rationale,
		subject?.decision?.retainedOptionTitle
	].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

	const decisionText =
		decisionParts.length > 0
			? decisionParts.join('. ')
			: subject?.options?.map((o: any) => o.title).join('. ') ||
				'Déploiement sur substrat serveur Bare-Metal avec réseau OOB dédié, environnements Dev/Recette Iso-Prod/Prod, cloisonnement de zone sécurité OAM et double adduction électrique 2N.';

	const problem =
		subject?.problemStatement ||
		subject?.problem ||
		`Spécification et raffinement multi-axes opposable pour : ${title}`;

	const structuredFacts: StructuredFactInput[] = [];
	const requirementClauses: string[] = [];

	try {
		const statements = await (prisma as any).statement?.findMany({
			where: {
				...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
				OR: [{ subjectId }, { section: sectionRef }],
				status: 'active'
			},
			take: 100
		});
		for (const st of statements || []) {
			const text = [st.subjectRef, st.predicate, st.value, st.unit].filter(Boolean).join(' ').trim();
			if (text) {
				structuredFacts.push({
					id: st.id,
					category: st.predicate,
					statement: text,
					target: st.subjectRef
				});
			}
		}

		const reqRefs = parseStringIds(subject?.requirementRefs);
		if (resolvedProjectId && reqRefs.length > 0) {
			const sources = await (prisma as any).requirementSource?.findMany({
				where: { projectId: resolvedProjectId },
				include: { requirements: true }
			});
			const refSet = new Set(reqRefs);
			for (const src of sources || []) {
				for (const req of src.requirements || []) {
					const bundleId = requirementBundleId(src.sha256, req.clauseRef);
					if (refSet.has(bundleId) || refSet.has(req.clauseRef) || refSet.has(req.id)) {
						const reqText = [req.title, req.text].filter(Boolean).join(' — ').trim();
						if (reqText) {
							structuredFacts.push({
								id: req.clauseRef,
								category: req.category || 'RFP',
								statement: reqText,
								target: sectionRef
							});
							requirementClauses.push(req.clauseRef);
						}
					}
				}
			}
		}
	} catch {
		// Tolérant si les tables relationnelles optionnelles ne sont pas disponibles
	}

	return {
		subject,
		title,
		sectionRef,
		edpPrimaryKey,
		decisionText,
		problem,
		structuredFacts,
		requirementClauses
	};
}

export async function loadPersistedEdpSnapshot(subjectId: string): Promise<PersistedEdpSnapshot> {
	const fromDb = await (prisma as any).executableDecisionPackage?.findFirst({
		where: { subjectId },
		orderBy: { revision: 'desc' }
	});
	const parsedDb = fromDb ? JSON.parse(fromDb.content) : null;
	const explicitBindings: Array<{ urn: string; revision: number | string }> =
		parsedDb?.explicitBindings ?? parsedDb?.decision_context?.ontology_bindings ?? [];
	const excludedLeafUrns: string[] = Array.isArray(parsedDb?.excludedLeafUrns)
		? parsedDb.excludedLeafUrns
		: [];
	const excludedAxisUrns: string[] = Array.isArray(parsedDb?.excludedAxisUrns)
		? parsedDb.excludedAxisUrns
		: [];
	return { fromDb, parsedDb, explicitBindings, excludedLeafUrns, excludedAxisUrns };
}

export function buildDefaultEdpShell(
	ctx: SubjectEdpContext,
	status: 'proposed' | 'draft' = 'proposed',
	subjectId?: string
) {
	return {
		...(status === 'draft' ? { schema_version: '1.0' } : {}),
		metadata: {
			id: ctx.edpPrimaryKey,
			...(status === 'draft' && subjectId ? { subject_id: subjectId } : {}),
			title:
				status === 'draft' ? ctx.title : `${ctx.title} (${ctx.sectionRef.toUpperCase()})`,
			status,
			revision: 1
		},
		decision_context: {
			problem: ctx.problem,
			decision: ctx.decisionText,
			ontology_bindings: []
		},
		provenance: {
			production_mode: 'llm-proposed-human-approved',
			created_at: new Date().toISOString()
		}
	};
}

export async function upsertEdpRecord(params: {
	edpPrimaryKey: string;
	subjectId: string;
	decisionId?: string;
	status: string;
	revision: number;
	policyHash?: string;
	includeProvenanceFields?: boolean;
	contentObj: Record<string, unknown>;
}) {
	const createData: Record<string, unknown> = {
		id: params.edpPrimaryKey,
		subjectId: params.subjectId,
		status: params.status,
		revision: params.revision,
		content: JSON.stringify(params.contentObj)
	};
	if (params.includeProvenanceFields !== false) {
		createData.decisionId = params.decisionId || `DEC-${params.subjectId}`;
		createData.productionMode = 'llm-proposed-human-approved';
		createData.policyHash = params.policyHash || 'multi-axis-ontology';
	}
	await (prisma as any).executableDecisionPackage?.upsert({
		where: { id: params.edpPrimaryKey },
		create: createData,
		update: {
			subjectId: params.subjectId,
			content: JSON.stringify(params.contentObj)
		}
	});
}

export async function runEdpActionRoute<TInput>(
	event: RequestEvent,
	schema: ZodType<TInput>,
	handler: (ctx: EdpActionContext, input: TInput) => Promise<EdpActionResult>,
	preAuth?: Awaited<ReturnType<typeof authorizeProjectAccess>>
): Promise<Response> {
	const projectId = event.params.projectId ?? '';
	const subjectId = event.params.subjectId ?? '';
	const auth = preAuth ?? (await authorizeProjectAccess(event, projectId));
	if (auth.error) return auth.error;

	let rawBody: unknown;
	try {
		rawBody = await event.request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = schema.safeParse(rawBody);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		return json(
			{
				success: false,
				error: firstIssue?.message || 'Charge utile invalide.',
				issues: parsed.error.issues
			},
			{ status: 400 }
		);
	}

	const ctx: EdpActionContext = {
		projectId,
		subjectId,
		actor: {
			id: auth.session?.user?.email || auth.session?.user?.id || 'architect',
			role: auth.session?.user?.role || 'lead_architect'
		}
	};

	const result = await handler(ctx, parsed.data);
	return json(result.body, { status: result.status ?? 200 });
}
