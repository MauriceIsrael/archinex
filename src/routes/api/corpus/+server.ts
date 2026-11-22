import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import {
	getAllCorpusDocumentsFromDb,
	saveCorpusDocumentToDb
} from '$lib/server/engagementsDb';
import {
	authorizeProjectAccess,
	getAccessibleProjectIds
} from '$lib/server/projects/projectAccess';
import type { CorpusDocument } from '$lib/domain/corpus';

export const GET: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}

	const projectId =
		event.url.searchParams.get('projectId') || event.url.searchParams.get('engagementId');
	if (projectId) {
		const auth = await authorizeProjectAccess(event, projectId);
		if (auth.error) return auth.error;
		const documents = await getAllCorpusDocumentsFromDb();
		const filtered = documents.filter(
			(doc) => doc.isGlobalStandard || (doc.engagementIds ?? []).includes(projectId)
		);
		return json({ documents: filtered });
	}

	const [documents, allowedIds] = await Promise.all([
		getAllCorpusDocumentsFromDb(),
		getAccessibleProjectIds(session)
	]);
	const visible = allowedIds
		? documents.filter(
				(doc) => doc.isGlobalStandard || (doc.engagementIds ?? []).some((id) => allowedIds.has(id))
			)
		: documents;
	return json({ documents: visible });
};

export const POST: RequestHandler = async (event) => {
	const session = event.locals.session;
	if (!session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}

	const body = await event.request.json();
	const doc = body.document as CorpusDocument;

	if (!doc || !doc.id || !doc.title) {
		return json({ error: 'Document invalide' }, { status: 400 });
	}

	const targetProjectIds = new Set<string>(
		Array.isArray(doc.engagementIds) ? doc.engagementIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : []
	);

	// Si le document existe déjà, vérifier aussi l'accès aux projets déjà rattachés
	const existing = await prisma.corpusDocument.findUnique({
		where: { id: doc.id },
		select: { engagementIds: true }
	});
	if (existing?.engagementIds) {
		try {
			const prevIds = JSON.parse(existing.engagementIds) as unknown[];
			for (const id of prevIds) {
				if (typeof id === 'string' && id.length > 0) targetProjectIds.add(id);
			}
		} catch {
			// ignoré
		}
	}

	for (const projectId of targetProjectIds) {
		const auth = await authorizeProjectAccess(event, projectId);
		if (auth.error) return auth.error;
	}

	const saved = await saveCorpusDocumentToDb(doc);
	return json({ document: saved }, { status: 201 });
};
