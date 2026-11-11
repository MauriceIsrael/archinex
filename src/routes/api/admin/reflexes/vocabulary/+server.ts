import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireRole } from '$lib/auth/guard.server';
import { upsertVocabularyEntry } from '$lib/server/rules/reflexCatalogService';
import type { RequestHandler } from './$types';

const VocabularySchema = z.object({
	key: z.string().min(2).regex(/^[a-z0-9_]+$/, 'Clé snake_case attendue'),
	label: z.string().min(2),
	valueType: z.enum(['enum', 'number', 'boolean', 'string']),
	description: z.string().default(''),
	canonicalValues: z.array(
		z.object({
			canonical: z.string().min(1),
			label: z.string().min(1),
			aliases: z.array(z.string())
		})
	)
});

export const PUT: RequestHandler = async ({ locals, request }) => {
	requireRole(locals, 'admin');

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = VocabularySchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message || 'Entrée de vocabulaire invalide.' },
			{ status: 400 }
		);
	}

	try {
		const entry = await upsertVocabularyEntry(parsed.data);
		return json({ status: 'ok', entry });
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors de la sauvegarde.' }, { status: 500 });
	}
};
