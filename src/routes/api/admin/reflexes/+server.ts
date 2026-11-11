import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireRole } from '$lib/auth/guard.server';
import {
	createReflexRule,
	getAdminReflexStudioState,
	listPublishedVocabulary
} from '$lib/server/rules/reflexCatalogService';
import type { RequestHandler } from './$types';

const ConditionSchema = z.object({
	key: z.string().min(1),
	op: z.enum(['eq', 'neq', 'gte', 'lte', 'in']),
	value: z.union([z.string(), z.number(), z.array(z.string())])
});

const ActionSchema = z.object({
	question: z.string().min(5, 'La question doit comporter au moins 5 caractères'),
	subjectName: z.string().min(2, 'Le nom du sous-sujet doit comporter au moins 2 caractères'),
	rationale: z.string().default(''),
	initialLevel: z.enum(['L0_named', 'L1_framed']).default('L1_framed'),
	suggestedRole: z.string().default('lead_architect'),
	mandatory: z.boolean().default(false),
	assetRef: z.string().optional()
});

const CreateReflexSchema = z.object({
	id: z.string().optional(),
	title: z.string().min(3, 'Le titre doit comporter au moins 3 caractères'),
	domain: z.string().default('general'),
	assetRef: z.string().optional(),
	assetType: z.enum(['pattern', 'principle', 'control', 'standard']).default('pattern'),
	mandatory: z.boolean().default(false),
	status: z.enum(['draft', 'published', 'deprecated']).default('draft'),
	conditions: z.array(ConditionSchema).min(1, 'Au moins une condition est requise'),
	semanticHints: z.array(z.string()).default([]),
	action: ActionSchema,
	source: z.enum(['catalog', 'promoted_agent', 'admin_authored']).default('admin_authored')
});

export const GET: RequestHandler = async ({ locals }) => {
	requireRole(locals, 'admin');
	try {
		const state = await getAdminReflexStudioState();
		return json({ status: 'ok', ...state });
	} catch (err: any) {
		return json({ error: err.message || 'Erreur lors du chargement du studio.' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	requireRole(locals, 'admin');

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ error: 'Corps JSON invalide.' }, { status: 400 });
	}

	const parsed = CreateReflexSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{
				error: parsed.error.issues[0]?.message || 'Données invalides.',
				details: parsed.error.flatten()
			},
			{ status: 400 }
		);
	}

	const vocab = await listPublishedVocabulary();
	const allowedKeys = new Set(vocab.map((v) => v.key));
	const invalidKeys = parsed.data.conditions.map((c) => c.key).filter((k) => !allowedKeys.has(k));
	if (invalidKeys.length > 0) {
		return json(
			{ error: `Clé(s) hors vocabulaire canonique : ${invalidKeys.join(', ')}` },
			{ status: 400 }
		);
	}

	try {
		const rule = await createReflexRule({
			...parsed.data,
			actorId: locals.session?.user?.email || locals.session?.user?.id || 'admin'
		});
		return json({ status: 'ok', rule }, { status: 201 });
	} catch (err: any) {
		return json({ error: err.message || 'Impossible de créer le réflexe.' }, { status: 400 });
	}
};
