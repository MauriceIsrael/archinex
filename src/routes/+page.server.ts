import type { PageServerLoad } from './$types';
import {
	getAllEngagementsFromDb,
	getAllCorpusDocumentsFromDb
} from '$lib/server/engagementsDb';
import { llmopsClient } from '$lib/server/llmops/client';
import { computeKbClausesHealth } from '$lib/domain/kbClausesHealth';

export const load: PageServerLoad = async ({ locals }) => {
	const userEmail = locals.session?.user?.email;

	// Chargement des données persistées dans Prisma SQLite + état des clauses KB
	// Payload allégé : les compteurs de clauses et de maturité sont préservés, les textes bruts ne sont pas dupliqués
	const [engagements, corpusDocuments, clausesRes, frameworksRes] = await Promise.all([
		getAllEngagementsFromDb({ includeCorpusKeyClauses: false, stripSubjectProposals: true }),
		getAllCorpusDocumentsFromDb({ includeKeyClauses: false }),
		llmopsClient.listCheckClauses({}, userEmail).catch(() => null),
		llmopsClient.getComplianceFrameworks().catch(() => null)
	]);

	const offline =
		!clausesRes ||
		clausesRes.status === 'unavailable' ||
		(!clausesRes.data && (!frameworksRes || frameworksRes.status === 'unavailable'));

	const kbClausesHealth = computeKbClausesHealth(clausesRes?.data ?? null, {
		frameworksOverview: frameworksRes?.data,
		offline
	});

	return {
		engagements,
		corpusDocuments,
		kbClausesHealth
	};
};


