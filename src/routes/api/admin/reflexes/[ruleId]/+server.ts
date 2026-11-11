import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireRole } from '$lib/auth/guard.server';
import {
	deleteReflexRule,
	listPublishedVocabulary,
	updateReflexRule
} from '$lib/server/rules/reflexCatalogService';
import type { RequestHandler } from './$types';

const ConditionSchema = z.object({
	key: z.string().min(1),
	op: z.enum(['eq', 'neq', 'gte', 'lte', 'in']),
	value: z.union([z.string(), z.number(), z.array(z.string())])
});

const PatchReflexSchema = z.object({
	title: z.string().min(3).optional(),
	domain: z.string().optional(),
	assetRef: z.string().optional(),
	assetType: z.enum(['pattern', 'principle', 'control', 'standard']).optional(),
	mandatory: z.boolean().optional(),
	status: z.enum(['draft', 'published', 'deprecated']).optional(),
	conditions: z.array(ConditionSchema).min(1).optional(),
	semanticHints: z.array(z.string()).optional(),
	action: z
		.object({
			question: z.string().min(5),
			subjectName: z.string().min(2),
			rationale: z.string().default(''),
			initialLevel: z.enum(['L0_named', 'L1_framed']).default('L1_framed'),
			suggestedRole: z.string().default('lead_architect'),
			mandatory: z.boolean().default(false),
			assetRef: z.string().optional()
		})
		.optional()
});

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	requireRole(locals, 'admin');

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = PatchReflexSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message || 'Mise à jour invalide.' },
			{ status: 400 }
		);
	}

	if (parsed.data.conditions) {
		const vocab = await listPublishedVocabulary();
		const allowedKeys = new Set(vocab.map((v) => v.key));
		const invalidKeys = parsed.data.conditions.map((c) => c.key).filter((k) => !allowedKeys.has(k));
		if (invalidKeys.length > 0) {
			return json(
				{ error: `Clé(s) hors vocabulaire canonique : ${invalidKeys.join(', ')}` },
				{ status: 400 }
			);
		}
	}

	try {
		const rule = await updateReflexRule(
			params.ruleId,
			parsed.data,
			locals.session?.user?.email || locals.session?.user?.id || 'admin'
		);
		return json({ status: 'ok', rule });
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors de la mise à jour.' }, { status: 404 });
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	requireRole(locals, 'admin');
	try {
		await deleteReflexRule(params.ruleId);
		return json({ status: 'ok' });
	} catch (err: any) {
		return json({ error: err.message || 'Impossible de supprimer ce réflexe.' }, { status: 404 });
	}
};
