import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { prisma } from '$lib/server/prisma';
import {
	computeCoverageReport,
	type CoverageDecisionFact,
	type CoveragePlannedObject,
	type CoverageRequirementInput,
	type CoverageStage,
	type CoverageSubjectFact,
	type KbCheckTraceStatus,
	COVERAGE_STAGES
} from '$lib/domain/coverageModel';
import { requirementBundleId } from '$lib/domain/requirementAudit';

function parseStringArray(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

function parseComplianceCheck(raw: string | null | undefined): {
	status: KbCheckTraceStatus;
	derogationReason: string | null;
} {
	if (!raw) return { status: 'not_checked', derogationReason: null };
	try {
		const parsed = JSON.parse(raw) as {
			status?: string;
			derogation?: { reason?: string };
		};
		const derogationReason = parsed.derogation?.reason ?? null;
		if (parsed.status === 'checked') return { status: 'checked', derogationReason };
		if (derogationReason && derogationReason.trim().length >= 5) {
			return { status: 'derogated', derogationReason };
		}
		if (parsed.status === 'partial') return { status: 'partial', derogationReason };
		return { status: 'not_checked', derogationReason };
	} catch {
		return { status: 'not_checked', derogationReason: null };
	}
}

function extractPlannedObjectsFromEdp(edpContent: string): CoveragePlannedObject[] {
	try {
		const parsed = JSON.parse(edpContent) as {
			hydratedInventory?: {
				resolved_components?: Array<{
					id?: string;
					name?: string;
					kind?: string;
					nautobotUrl?: string;
					realizedProven?: boolean;
					realizedAt?: string | null;
				}>;
			};
			nautobotPlan?: Array<{
				id?: string;
				kind?: string;
				label?: string;
				url?: string;
				realizedProven?: boolean;
				realizedAt?: string | null;
			}>;
		};
		const fromPlan = Array.isArray(parsed.nautobotPlan)
			? parsed.nautobotPlan.map((item, idx) => ({
					id: item.id || `nb-plan-${idx}`,
					kind: item.kind || 'nautobot_object',
					label: item.label || item.id || `Objet ${idx + 1}`,
					url: item.url,
					realizedProven: Boolean(item.realizedProven),
					realizedAt: item.realizedAt ?? null
				}))
			: [];
		if (fromPlan.length > 0) return fromPlan;

		const resolved = parsed.hydratedInventory?.resolved_components ?? [];
		return resolved.map((c, idx) => ({
			id: c.id || c.name || `comp-${idx}`,
			kind: c.kind || 'component',
			label: c.name || c.id || `Composant ${idx + 1}`,
			url: c.nautobotUrl,
			realizedProven: Boolean(c.realizedProven),
			realizedAt: c.realizedAt ?? null
		}));
	} catch {
		return [];
	}
}

/**
 * GET /api/projects/[projectId]/coverage
 * Retourne le rapport unique de complétude de la couverture des exigences (Issue #401).
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	const rawThreshold = event.url.searchParams.get('threshold');
	const threshold: CoverageStage =
		rawThreshold && (COVERAGE_STAGES as readonly string[]).includes(rawThreshold)
			? (rawThreshold as CoverageStage)
			: 'decided';

	const [sources, subjects, edps, lastReconcileEvent] = await Promise.all([
		prisma.requirementSource.findMany({
			where: { projectId },
			include: { requirements: { orderBy: { position: 'asc' } } },
			orderBy: { createdAt: 'asc' }
		}),
		prisma.subject.findMany({
			where: { projectId },
			include: { decision: true },
			orderBy: { sectionRef: 'asc' }
		}),
		prisma.executableDecisionPackage.findMany({
			where: {
				subjectId: {
					in: (
						await prisma.subject.findMany({
							where: { projectId },
							select: { id: true }
						})
					).map((s) => s.id)
				},
				status: { not: 'retracted' }
			},
			orderBy: { revision: 'desc' }
		}),
		prisma.domainEvent.findFirst({
			where: {
				projectId,
				type: { in: ['NAUTOBOT_RECONCILED', 'DRIFT_RECONCILED', 'EDP_HYDRATED'] }
			},
			orderBy: { createdAt: 'desc' }
		})
	]);

	// Indexation des sujets par référence d'exigence (id, clauseRef ou bundleId)
	const subjectsByRef = new Map<string, CoverageSubjectFact[]>();
	const decisionBySubject = new Map<string, CoverageDecisionFact>();
	const plannedBySubject = new Map<string, CoveragePlannedObject[]>();

	for (const edp of edps) {
		if (!plannedBySubject.has(edp.subjectId)) {
			plannedBySubject.set(edp.subjectId, extractPlannedObjectsFromEdp(edp.content));
		}
	}

	for (const s of subjects) {
		const subFact: CoverageSubjectFact = {
			id: s.id,
			title: s.name,
			sectionRef: s.sectionRef,
			domain: s.domain || 'Général',
			owner: s.waitingForRole || 'lead_architect'
		};

		const refs = parseStringArray(s.requirementRefs);
		for (const ref of refs) {
			const list = subjectsByRef.get(ref) ?? [];
			list.push(subFact);
			subjectsByRef.set(ref, list);
		}

		if (s.decision) {
			const check = parseComplianceCheck(s.decision.complianceCheck);
			decisionBySubject.set(s.id, {
				id: s.decision.id,
				subjectId: s.id,
				rationale: s.decision.rationale,
				kbCheckStatus: check.status,
				kbDerogationReason: check.derogationReason,
				decidedAt: s.decision.decidedAt.toISOString()
			});
		}
	}

	const inputs: CoverageRequirementInput[] = [];
	for (const src of sources) {
		for (const req of src.requirements) {
			const bundleId = requirementBundleId(src.sha256, req.clauseRef);
			const matchedSubjects = Array.from(
				new Map(
					[
						...(subjectsByRef.get(req.id) ?? []),
						...(subjectsByRef.get(req.clauseRef) ?? []),
						...(subjectsByRef.get(bundleId) ?? [])
					].map((s) => [s.id, s])
				).values()
			);

			const decisions = matchedSubjects
				.map((s) => decisionBySubject.get(s.id))
				.filter((d): d is CoverageDecisionFact => Boolean(d));

			const plannedObjects = matchedSubjects.flatMap((s) => plannedBySubject.get(s.id) ?? []);

			const effectiveDisposition = (req.decidedDisposition ?? req.proposedDisposition) as
				| 'deliberated'
				| 'evacuated'
				| 'clarification_needed'
				| 'to_qualify';
			const effectiveReason = req.decidedDisposition ? req.decidedReason : req.proposedReason;

			inputs.push({
				id: req.id,
				clauseRef: req.clauseRef,
				title: req.title,
				section: matchedSubjects[0]?.sectionRef || src.title,
				domain: req.category || matchedSubjects[0]?.domain || 'Général',
				criticality: req.criticality,
				owner: req.decidedBy || matchedSubjects[0]?.owner || 'Non assigné',
				disposition: effectiveDisposition,
				dispositionReason: effectiveReason ?? '',
				clarificationQuestion: req.clarificationQuestion ?? '',
				subjects: matchedSubjects,
				decisions,
				plannedObjects
			});
		}
	}

	const report = computeCoverageReport(inputs, {
		threshold,
		lastReconciliationAt: lastReconcileEvent?.createdAt.toISOString() ?? null
	});

	return json({
		status: 'ok',
		projectId,
		report
	});
};
