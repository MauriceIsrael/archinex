import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';
import { doctrineService } from '$lib/server/doctrine/doctrineService';

export const GET: RequestHandler = async ({ params }) => {
	const { subjectId } = params;

	try {
		const subject = await prisma.subject.findUnique({
			where: { id: subjectId }
		});
		if (!subject) {
			return json({ message: `Sujet ${subjectId} introuvable` }, { status: 404 });
		}

		let allowedKbRefs: string[] = [];
		let items: any[] = [];
		try {
			const docCtx = await doctrineService.getDoctrineContext({
				topics: [subject.name],
				domains: subject.domain ? [subject.domain] : []
			});
			if (docCtx && Array.isArray(docCtx.items)) {
				allowedKbRefs = docCtx.items.map((i: any) => i.id);
				items = docCtx.items;
			}
		} catch (err) {
			console.warn('[Doctrine Context] Indisponible :', err);
		}

		return json({
			subjectId,
			allowedKbRefs,
			items
		});
	} catch (err: any) {
		return json({ message: err.message }, { status: 500 });
	}
};
