import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/prisma';
import {
	getAllEngagementsFromDb,
	getAllCorpusDocumentsFromDb
} from '$lib/server/engagementsDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { computeKbClausesHealth } from '$lib/domain/kbClausesHealth';
import {
	computeTopFrugalityOpportunities,
	type SubjectMatrixInput
} from '$lib/domain/frugalityScoring';
import { getAccessibleProjectIds } from '$lib/server/projects/projectAccess';

export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session;
	// Aucune donnée de projet, d'engagement ou de base de connaissance n'est servie à un visiteur anonyme (#391).
	if (!session?.user) {
		return {
			engagements: [],
			corpusDocuments: [],
			kbClausesHealth: null,
			frugalityOpportunities: []
		};
	}

	const userEmail = session.user.email;
	const allowedIds = await getAccessibleProjectIds(session);

	// Chargement des données persistées dans Prisma SQLite + état des clauses KB + opportunités de frugalité
	// Payload allégé : les compteurs de clauses et de maturité sont préservés, les textes bruts ne sont pas dupliqués
	const [allEngagements, allCorpusDocuments, clausesRes, frameworksRes, frugalitySubjects] = await Promise.all([
		getAllEngagementsFromDb({ includeCorpusKeyClauses: false, stripSubjectProposals: true }),
		getAllCorpusDocumentsFromDb({ includeKeyClauses: false }),
		llmopsClient.listCheckClauses({}, userEmail).catch(() => null),
		llmopsClient.getComplianceFrameworks().catch(() => null),
		prisma.subject
			.findMany({
				where: allowedIds ? { projectId: { in: [...allowedIds] } } : undefined,
				include: {
					project: { select: { id: true, title: true, badge: true } },
					criteria: true,
					options: { include: { evaluations: true } },
					decision: true
				}
			})
			.catch(() => [])
	]);

	const engagements = allowedIds
		? allEngagements.filter((e) => allowedIds.has(e.id))
		: allEngagements;
	const corpusDocuments = allowedIds
		? allCorpusDocuments.filter(
				(doc) => doc.isGlobalStandard || (doc.engagementIds ?? []).some((id) => allowedIds.has(id))
			)
		: allCorpusDocuments;

	const offline =
		!clausesRes ||
		clausesRes.status === 'unavailable' ||
		(!clausesRes.data && (!frameworksRes || frameworksRes.status === 'unavailable'));

	const kbClausesHealth = computeKbClausesHealth(clausesRes?.data ?? null, {
		frameworksOverview: frameworksRes?.data,
		offline
	});

	const matrixInputs: SubjectMatrixInput[] = (frugalitySubjects || []).map((s) => ({
		id: s.id,
		name: s.name,
		sectionRef: s.sectionRef,
		projectId: s.projectId,
		projectTitle: s.project?.title,
		projectBadge: s.project?.badge,
		criteria: s.criteria.map((c) => ({
			id: c.id,
			name: c.name,
			kind: c.kind,
			weight: c.weight,
			description: c.description
		})),
		options: s.options.map((o) => ({
			id: o.id,
			title: o.title,
			summary: o.summary,
			evaluations: o.evaluations.map((e) => ({
				criterionId: e.criterionId,
				score: e.score,
				justification: e.justification
			}))
		})),
		decision: s.decision ? { retainedOptionId: s.decision.retainedOptionId } : null
	}));

	const frugalityOpportunities = computeTopFrugalityOpportunities(matrixInputs, 5);

	return {
		engagements,
		corpusDocuments,
		kbClausesHealth,
		frugalityOpportunities
	};
};


