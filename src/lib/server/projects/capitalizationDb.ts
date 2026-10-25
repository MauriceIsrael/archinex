import { prisma } from '../prisma';
import { doctrineService } from '$lib/server/doctrine/doctrineService';
import {
	buildKbCandidates,
	anonymizeCandidates,
	formatCandidateProposedContent,
	inferCandidateAssetType,
	isDecisionMetadataViolation,
	normalizeKbDomain,
	normalizeTargetAssetId,
	type AnonymizationContext
} from '$lib/domain/capitalization';
import { canArbitrateSubject, UnauthorizedArbitrationError } from './arbitrationDb';
import type { ActorInfo } from './projectsDb';
import type { KbCandidate } from '$lib/types/llmops';
import type { Decision, Option } from '$lib/domain/options';

/**
 * Extrait le contexte d'anonymisation depuis les données du projet.
 */
function extractAnonymizationContext(project: any): AnonymizationContext {
	const rawTitle = String(project.title || '').trim();
	const baseTitle = rawTitle.includes('(') ? rawTitle.split('(')[0].trim() : '';
	const projectNames = [project.id, rawTitle, baseTitle, project.shortName].filter(Boolean);
	const participantNames = (project.members || []).map((m: any) => m.userId).filter(Boolean);

	let clientNames: string[] = [];
	let siteNames: string[] = [];

	try {
		const strategy = JSON.parse(project.strategy || '{}');
		if (strategy.clientName) clientNames.push(strategy.clientName);
		if (Array.isArray(strategy.sites)) siteNames.push(...strategy.sites);
	} catch {
		// Ignore JSON parse errors
	}

	return {
		projectNames,
		clientNames,
		siteNames,
		participantNames
	};
}

/**
 * Prépare les candidats KB pour un sujet arbitré (Porte G4).
 * Renvoie les propositions générées et anonymisées pour révision humaine préalable.
 * Lorsqu'un architecte déclenche la préparation en Porte G4, une décision initialement
 * qualifiée `project_specific` par construction est anonymisée et généralisée en doctrine
 * réutilisable (`reusable_architecture_doctrine`) pour devenir moissonnable par LLMOps.
 */
export async function prepareSubjectKbCandidates(
	subjectId: string,
	actor: ActorInfo
): Promise<{
	candidates: KbCandidate[];
	anonymizationContext: AnonymizationContext;
	decision: Decision;
}> {
	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: {
			project: {
				include: {
					members: true
				}
			},
			options: true,
			arguments: true,
			decision: true
		}
	});

	if (!subject) {
		throw new Error(`Sujet introuvable : ${subjectId}`);
	}

	if (!subject.decision || subject.deliberationStatus === 'awaiting_review') {
		throw new Error(
			"Le sujet n'a pas encore fait l'objet d'un arbitrage opposable (Maturité L3_decided et décision requises pour capitaliser)."
		);
	}

	if (!['L3_decided', 'L4_specified', 'L5_archived'].includes(subject.maturityLevel)) {
		await prisma.subject.update({
			where: { id: subjectId },
			data: { maturityLevel: 'L3_decided', deliberationStatus: 'arbitrated' }
		});
	}

	const ctx = extractAnonymizationContext(subject.project);

	const rawViolations: Array<{ typedId: string; justification: string }> = JSON.parse(
		subject.decision.acceptedViolations || '[]'
	);
	const portabilityEntry = rawViolations.find((v) => v?.typedId?.startsWith('PORTABILITY:'));
	const storedPortability = portabilityEntry?.typedId?.replace('PORTABILITY:', '') as Decision['portability'];
	const realViolations = rawViolations.filter(
		(v) => v?.typedId && !isDecisionMetadataViolation(v.typedId)
	);

	// En Porte G4, l'architecte choisit explicitement d'anonymiser et de généraliser la décision
	// pour la verser au patrimoine doctrinal LLMOps.
	const effectivePortability: Decision['portability'] =
		storedPortability === 'reusable_product_capability'
			? 'reusable_product_capability'
			: 'reusable_architecture_doctrine';

	const parsedDecision: Decision = {
		id: subject.decision.id,
		subjectId: subject.decision.subjectId,
		retainedOptionId: subject.decision.retainedOptionId,
		rejected: JSON.parse(subject.decision.rejected || '[]'),
		rationale: subject.decision.rationale,
		reversibility: subject.decision.reversibility as any,
		portability: effectivePortability,
		arbiterId: subject.decision.arbiterId,
		arbiterRole: subject.decision.arbiterRole,
		decidedAt: subject.decision.decidedAt.toISOString(),
		acceptedViolations: realViolations,
		kbCandidateIds: JSON.parse(subject.decision.kbCandidateIds || '[]'),
		version: subject.decision.version
	};

	const parsedOptions: Option[] = subject.options.map((o) => ({
		id: o.id,
		subjectId: o.subjectId,
		title: o.title,
		summary: o.summary,
		origin: o.origin as any,
		kbRefs: JSON.parse(o.kbRefs || '[]'),
		status: o.status as any,
		author: o.author,
		role: o.role || 'lead_architect',
		productionMode: o.productionMode as any,
		version: o.version
	}));

	const rawCandidates = buildKbCandidates({
		decision: parsedDecision,
		subject: {
			id: subject.id,
			name: subject.name,
			domain: subject.domain,
			sectionRef: subject.sectionRef,
			problemStatement: subject.problemStatement
		},
		options: parsedOptions,
		engagement: subject.projectId,
		author: actor.userId,
		authorRole: actor.role
	});

	const anonymized = anonymizeCandidates(rawCandidates, ctx);

	return {
		candidates: anonymized,
		anonymizationContext: ctx,
		decision: parsedDecision
	};
}

/**
 * Soumet les candidats validés et éventuellement amendés par l'utilisateur vers LLMOps.
 * Invariant III : Rien n'est envoyé sans validation et action humaine.
 */
export async function submitSubjectKbCandidates(
	subjectId: string,
	candidates: KbCandidate[],
	actor: ActorInfo
): Promise<{
	submitted: Array<{ id?: string; candidate_id: string; status: string }>;
	updatedCandidateIds: string[];
}> {
	// Invariant II : Vérification que l'auteur est humain
	if (actor.productionMode === 'llm-derived') {
		throw new Error(
			"Invariant II violé : La capitalisation de doctrine ne peut pas être déclenchée de façon autonome par un agent."
		);
	}

	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: {
			project: {
				include: {
					members: true
				}
			},
			decision: true
		}
	});

	if (!subject) {
		throw new Error(`Sujet introuvable : ${subjectId}`);
	}

	if (!subject.decision) {
		throw new Error(`Aucune décision enregistrée sur le sujet ${subjectId}.`);
	}

	if (!canArbitrateSubject(actor, subject.domain)) {
		throw new UnauthorizedArbitrationError(
			`L'acteur ${actor.userId} (${actor.role}) n'a pas les droits pour soumettre des candidats de doctrine sur le domaine "${subject.domain}".`
		);
	}

	const ctx = extractAnonymizationContext(subject.project);
	const normalizedDomain = normalizeKbDomain(subject.domain);

	// Filtre défensif contre les marqueurs de métadonnées de délibération
	const validCandidates = candidates.filter(
		(c) => !isDecisionMetadataViolation(c.target_asset_ref) && !isDecisionMetadataViolation(c.target_asset_id)
	);

	// Ré-anonymisation de sécurité avant transmission
	const sanitizedCandidates = anonymizeCandidates(validCandidates, ctx);

	const submittedResults: Array<{ id?: string; candidate_id: string; status: string }> = [];

	for (const cand of sanitizedCandidates) {
		const targetAssetId = normalizeTargetAssetId(cand.target_asset_id || cand.target_asset_ref);
		const assetType = cand.asset_type || inferCandidateAssetType(cand.kind, targetAssetId);
		const payload: KbCandidate = {
			...cand,
			asset_type: assetType,
			target_asset_id: targetAssetId,
			domain: [normalizedDomain],
			source: {
				system: 'archinex',
				engagement: subject.projectId,
				decision_id: subject.decision.id,
				subject_id: subject.id,
				author: actor.userId,
				production_mode: 'human-authored'
			},
			evidence: [{ kind: 'engagement', ref: subject.projectId }],
			author: actor.userId,
			author_role: actor.role,
			portability: 'reusable_architecture_doctrine',
			harvestable: true,
			production_mode: 'human-authored'
		};
		payload.proposed_content = formatCandidateProposedContent(payload);

		const res = await doctrineService.submitKbCandidate(payload);
		submittedResults.push({
			id: cand.id,
			candidate_id: res.candidate_id,
			status: res.status
		});
	}

	// Persistance des identifiants dans la décision, mise à jour de la portabilité et enregistrement du DomainEvent
	const existingIds: string[] = JSON.parse(subject.decision.kbCandidateIds || '[]').filter(Boolean);
	const newIds = submittedResults.map((r) => r.candidate_id || r.id || 'pending_dispatch').filter(Boolean);
	const mergedIds = Array.from(new Set([...existingIds, ...newIds]));

	const existingViolations: Array<{ typedId: string; justification: string }> = JSON.parse(
		subject.decision.acceptedViolations || '[]'
	);
	const updatedViolations = existingViolations.some((v) => v?.typedId?.startsWith('PORTABILITY:'))
		? existingViolations.map((v) =>
				v?.typedId === 'PORTABILITY:project_specific'
					? { ...v, typedId: 'PORTABILITY:reusable_architecture_doctrine' }
					: v
			)
		: [...existingViolations, { typedId: 'PORTABILITY:reusable_architecture_doctrine', justification: '' }];

	await prisma.$transaction(async (tx) => {
		await tx.decision.update({
			where: { subjectId },
			data: {
				kbCandidateIds: JSON.stringify(mergedIds),
				acceptedViolations: JSON.stringify(updatedViolations),
				version: { increment: 1 }
			}
		});

		await tx.domainEvent.create({
			data: {
				projectId: subject.projectId,
				entityType: 'subject',
				entityId: subjectId,
				type: 'KB_CANDIDATES_SUBMITTED',
				actorId: actor.userId,
				actorRole: actor.role,
				productionMode: 'human-authored',
				payload: JSON.stringify({
					decisionId: subject.decision?.id,
					submittedCandidatesCount: submittedResults.length,
					candidateIds: newIds
				})
			}
		});
	});

	return {
		submitted: submittedResults,
		updatedCandidateIds: mergedIds
	};
}

/**
 * Récupère le statut des candidats KB soumis pour un sujet.
 */
export async function getSubjectKbCandidatesStatus(subjectId: string): Promise<{
	decisionId?: string;
	candidateIds: string[];
	candidates: KbCandidate[];
}> {
	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		include: {
			decision: true
		}
	});

	if (!subject || !subject.decision) {
		return { candidateIds: [], candidates: [] };
	}

	const candidateIds: string[] = JSON.parse(subject.decision.kbCandidateIds || '[]').filter(Boolean);

	// Interroge LLMOps pour récupérer la liste des candidats de cet engagement
	const remoteCandidates = await doctrineService.listKbCandidates({
		source: 'archinex',
		engagement: subject.projectId
	});

	// Filtrage des candidats associés au sujet ou dont l'id figure dans candidateIds
	const matched = remoteCandidates
		.filter(
			(c) =>
				(c.id && candidateIds.includes(c.id)) ||
				c.source?.decision_id === subject.decision?.id ||
				c.source?.subject_id === subjectId
		)
		.map((c) => ({
			...c,
			summary: c.summary || c.rationale || ''
		}));

	return {
		decisionId: subject.decision.id,
		candidateIds,
		candidates: matched
	};
}
