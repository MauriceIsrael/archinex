import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireRole } from '$lib/auth/guard.server';
import { simulateReflexes } from '$lib/server/rules/reflexCatalogService';
import type { RequestHandler } from './$types';

const SimulateSchema = z.object({
	text: z.string().default(''),
	facts: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
	ruleId: z.string().optional(),
	ruleDraft: z.any().optional(),
	includeHistoricalReplay: z.boolean().default(true)
});

export const POST: RequestHandler = async ({ locals, request }) => {
	requireRole(locals, 'admin');

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = SimulateSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json({ error: 'Paramètres de simulation invalides.' }, { status: 400 });
	}

	try {
		const result = await simulateReflexes(parsed.data);
		return json({ status: 'ok', ...result });
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors de la simulation.' }, { status: 500 });
	}
};
