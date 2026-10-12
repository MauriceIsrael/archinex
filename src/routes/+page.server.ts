import type { PageServerLoad } from './$types';
import {
	getAllEngagementsFromDb,
	getAllCorpusDocumentsFromDb
} from '$lib/server/engagementsDb';

export const load: PageServerLoad = async () => {
	// Chargement des données persistées dans Prisma SQLite
	const [engagements, corpusDocuments] = await Promise.all([
		getAllEngagementsFromDb(),
		getAllCorpusDocumentsFromDb()
	]);

	return {
		engagements,
		corpusDocuments
	};
};

