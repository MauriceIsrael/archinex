import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllEngagementsFromDb,
	saveEngagementToDb,
	updateEngagementInDb,
	seedEngagementsIfEmpty
} from '$lib/server/engagementsDb';
import {
	buildEngagementProfileFromWorkspaceInput,
	type WorkspaceCreationInput,
	type EngagementProfile
} from '$lib/domain/engagements';
import { getAllCorpusDocumentsFromDb, saveCorpusDocumentToDb } from '$lib/server/engagementsDb';

export const GET: RequestHandler = async () => {
	await seedEngagementsIfEmpty();
	const engagements = await getAllEngagementsFromDb();
	return json({ engagements });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	if (body.workspaceInput) {
		const input = body.workspaceInput as WorkspaceCreationInput;
		const commonDocs = await getAllCorpusDocumentsFromDb();
		const { engagement, newUpstreamDocuments } = buildEngagementProfileFromWorkspaceInput(
			input,
			commonDocs
		);

		// Persister les nouveaux documents amonts dans Prisma
		for (const doc of newUpstreamDocuments) {
			await saveCorpusDocumentToDb(doc);
		}

		// Persister l'engagement dans Prisma
		const saved = await saveEngagementToDb(engagement);
		return json({ engagement: saved, newUpstreamDocuments }, { status: 201 });
	}

	if (body.engagement) {
		const engagement = body.engagement as EngagementProfile;
		const saved = await saveEngagementToDb(engagement);
		return json({ engagement: saved }, { status: 201 });
	}

	return json({ error: 'Payload invalide : engagement ou workspaceInput requis' }, { status: 400 });
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { id, updates } = body;

	if (!id || !updates) {
		return json({ error: 'id et updates requis' }, { status: 400 });
	}

	const updated = await updateEngagementInDb(id, updates);
	if (!updated) {
		return json({ error: 'Engagement introuvable' }, { status: 404 });
	}

	return json({ engagement: updated });
};
