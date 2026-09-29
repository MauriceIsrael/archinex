import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllCorpusDocumentsFromDb,
	saveCorpusDocumentToDb
} from '$lib/server/engagementsDb';
import type { CorpusDocument } from '$lib/domain/corpus';

export const GET: RequestHandler = async () => {
	const documents = await getAllCorpusDocumentsFromDb();
	return json({ documents });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const doc = body.document as CorpusDocument;

	if (!doc || !doc.id || !doc.title) {
		return json({ error: 'Document invalide' }, { status: 400 });
	}

	const saved = await saveCorpusDocumentToDb(doc);
	return json({ document: saved }, { status: 201 });
};
