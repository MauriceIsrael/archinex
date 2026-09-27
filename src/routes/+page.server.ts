import { checkPermission } from '$lib/server/casbin';
import type { PageServerLoad } from './$types';
import {
	getAllEngagementsFromDb,
	getAllCorpusDocumentsFromDb,
	seedEngagementsIfEmpty
} from '$lib/server/engagementsDb';

export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session;

	const abacStatus = {
		canManageUsers: false,
		canEditSettings: false,
		canAccessSecretAPI: false
	};

	if (session) {
		const sub = {
			id: session.user.id,
			role: session.user.role,
			...session.user.attributes
		};

		const [canUsers, canSettings, canSecret] = await Promise.all([
			checkPermission(sub, { type: 'ui:users' }, 'read'),
			checkPermission(sub, { type: 'ui:settings' }, 'read'),
			checkPermission(sub, { type: 'api:secret' }, 'access')
		]);

		abacStatus.canManageUsers = canUsers;
		abacStatus.canEditSettings = canSettings;
		abacStatus.canAccessSecretAPI = canSecret;
	}

	// Initialisation et chargement des données persistées dans Prisma SQLite
	await seedEngagementsIfEmpty();
	const [engagements, corpusDocuments] = await Promise.all([
		getAllEngagementsFromDb(),
		getAllCorpusDocumentsFromDb()
	]);

	return {
		abacStatus,
		engagements,
		corpusDocuments
	};
};
