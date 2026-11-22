import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
import { resolveProjectActor } from '$lib/server/projects/actorHelper';
import { prisma } from '$lib/server/prisma';
import type { SealedSnapshot } from '$lib/domain/freezeExport';
import {
	computeCoverageReport,
	evaluateSealingReadiness,
	type AcceptedBlockingDeviation,
	type CoverageDecisionFact,
	type CoverageRequirementInput
} from '$lib/domain/coverageModel';
import { requirementBundleId } from '$lib/domain/requirementAudit';

/**
 * Récupère le dernier snapshot scellé d'une section (L5_archived).
 */
export const GET: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;

	try {
		const frozenEvent = await prisma.domainEvent.findFirst({
			where: {
				projectId,
				entityType: 'section_freeze',
				entityId: subjectId,
				type: 'SECTION_FROZEN'
			},
			orderBy: { createdAt: 'desc' }
		});

		if (!frozenEvent) {
			return json({ status: 'ok', snapshot: null });
		}

		const snapshot: SealedSnapshot = JSON.parse(frozenEvent.payload);
		return json({ status: 'ok', snapshot });
	} catch (err: any) {
		return json({ status: 'error', error: err?.message || 'Erreur lors de la lecture du scellement' }, { status: 500 });
	}
};

/**
 * Scelle officiellement une section d'architecture au niveau L5_archived.
 * Seul le Lead Architect peut sceller une section (contrôle d'habilitation strict).
 */
export const POST: RequestHandler = async (event) => {
	const { projectId, subjectId } = event.params;
	const auth = await authorizeProjectAccess(event, projectId);
	if (auth.error) return auth.error;
	const session = auth.session!;

	const actor = await resolveProjectActor(event, projectId);
	const role = actor.role;
	if (role !== 'lead_architect' && role !== 'admin') {
		return json(
			{
				status: 'error',
				error: "Seul l'Architecte Référent (Lead Architect) est habilité à sceller une section.",
				code: 'ROLE_NOT_AUTHORIZED'
			},
			{ status: 403 }
		);
	}

	let body: {
		snapshot?: SealedSnapshot;
		authorName?: string;
		acceptedDeviations?: AcceptedBlockingDeviation[];
	} = {};
	try {
		body = await event.request.json();
	} catch {
		// Pas de corps JSON fourni
	}

	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: { decision: true }
	});

	if (!subject || subject.projectId !== projectId) {
		return json({ status: 'error', error: `Sujet '${subjectId}' introuvable dans le projet` }, { status: 404 });
	}

	const snapshot = body.snapshot;
	if (!snapshot || !snapshot.sealSha256) {
		return json({ status: 'error', error: 'Snapshot scellé avec condensat SHA-256 obligatoire.' }, { status: 400 });
	}

	// Garde-fou de complétude de couverture (Issue #401) :
	// Refuse le scellement si une exigence bloquante rattachée au sujet n'est pas décidée (sauf acceptation tracée)
	// ou si une exigence est évacuée sans motif.
	let reqRefs: string[] = [];
	try {
		const parsedRefs = JSON.parse(subject.requirementRefs || '[]');
		if (Array.isArray(parsedRefs)) {
			reqRefs = parsedRefs.filter((x): x is string => typeof x === 'string');
		}
	} catch {
		reqRefs = [];
	}

	if (reqRefs.length > 0) {
		const sources = await prisma.requirementSource.findMany({
			where: { projectId },
			include: { requirements: true }
		});
		const refSet = new Set(reqRefs);
		const decisionFact: CoverageDecisionFact[] = subject.decision
			? (() => {
					let kbStatus: 'checked' | 'partial' | 'not_checked' | 'derogated' = 'checked';
					let derogationReason: string | null = null;
					if (subject.decision.complianceCheck) {
						try {
							const parsed = JSON.parse(subject.decision.complianceCheck) as {
								status?: string;
								derogation?: { reason?: string };
							};
							derogationReason = parsed.derogation?.reason ?? null;
							kbStatus =
								parsed.status === 'checked'
									? 'checked'
									: derogationReason
										? 'derogated'
										: parsed.status === 'partial'
											? 'partial'
											: 'not_checked';
						} catch {
							kbStatus = 'not_checked';
						}
					}
					return [
						{
							id: subject.decision.id,
							subjectId: subject.id,
							rationale: subject.decision.rationale,
							kbCheckStatus: kbStatus,
							kbDerogationReason: derogationReason
						}
					];
				})()
			: [];

		const matchedInputs: CoverageRequirementInput[] = [];
		for (const src of sources) {
			for (const r of src.requirements) {
				const bId = requirementBundleId(src.sha256, r.clauseRef);
				if (refSet.has(r.id) || refSet.has(r.clauseRef) || refSet.has(bId)) {
					const disp = (r.decidedDisposition ?? r.proposedDisposition) as
						| 'deliberated'
						| 'evacuated'
						| 'clarification_needed'
						| 'to_qualify';
					const reason = r.decidedDisposition ? r.decidedReason : r.proposedReason;
					matchedInputs.push({
						id: r.id,
						clauseRef: r.clauseRef,
						title: r.title,
						criticality: r.criticality,
						domain: r.category || subject.domain || 'Général',
						disposition: disp,
						dispositionReason: reason ?? '',
						clarificationQuestion: r.clarificationQuestion ?? '',
						subjects: [{ id: subject.id, title: subject.name, sectionRef: subject.sectionRef }],
						decisions: decisionFact
					});
				}
			}
		}

		if (matchedInputs.length > 0) {
			const coverageReport = computeCoverageReport(matchedInputs, { threshold: 'decided' });
			const readiness = evaluateSealingReadiness(coverageReport, body.acceptedDeviations ?? []);
			if (!readiness.canSeal) {
				return json(
					{
						status: 'error',
						code: 'COVERAGE_INCOMPLETE_FOR_SEALING',
						error: readiness.summary,
						readiness
					},
					{ status: 409 }
				);
			}
		}
	}

	try {
		// 1. Promotion du sujet en L5_archived en base
		await prisma.subject.update({
			where: { id: subjectId },
			data: {
				maturityLevel: 'L5_archived',
				blockingCount: 0
			}
		});

		// 2. Enregistrement immuable du scellement dans la piste d'audit
		await prisma.domainEvent.create({
			data: {
				projectId,
				entityType: 'section_freeze',
				entityId: subjectId,
				type: 'SECTION_FROZEN',
				actorId: session.user.id || session.user.email,
				actorRole: role,
				productionMode: actor.productionMode || 'human-authored',
				payload: JSON.stringify(snapshot)
			}
		});

		return json({ status: 'ok', snapshot });
	} catch (err: any) {
		return json({ status: 'error', error: err?.message || 'Erreur lors du scellement de la section' }, { status: 500 });
	}
};
