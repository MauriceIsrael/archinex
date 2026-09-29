import { z } from 'zod';

export const CreateCriterionSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().default(''),
	kind: z.enum(['functional', 'nfr', 'cost', 'risk', 'compliance']),
	weight: z.number().int().min(1).max(5).default(3),
	kbRef: z.string().optional().nullable()
});

export const UpdateCriterionSchema = z.object({
	expectedVersion: z.number().int().positive(),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	kind: z.enum(['functional', 'nfr', 'cost', 'risk', 'compliance']).optional(),
	weight: z.number().int().min(1).max(5).optional(),
	kbRef: z.string().optional().nullable()
});

export const CreateOptionSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	summary: z.string().min(1),
	origin: z.enum(['human', 'llm-proposed', 'kb-pattern']).default('human'),
	kbRefs: z.array(z.string()).default([]),
	status: z.enum(['proposed', 'debated', 'retained', 'rejected']).default('proposed')
});

export const UpdateOptionSchema = z.object({
	expectedVersion: z.number().int().positive(),
	title: z.string().min(1).optional(),
	summary: z.string().min(1).optional(),
	status: z.enum(['proposed', 'debated', 'retained', 'rejected']).optional(),
	kbRefs: z.array(z.string()).optional()
});

export const UpsertEvaluationSchema = z.object({
	optionId: z.string().min(1),
	criterionId: z.string().min(1),
	score: z.number().int().min(-2).max(2),
	justification: z.string().min(1, 'Une justification argumentée est obligatoire'),
	evidenceRefs: z.array(z.string()).default([])
});

export const CreateTradeOffSchema = z.object({
	id: z.string().min(1),
	optionId: z.string().min(1),
	gains: z.string().min(1),
	sacrifices: z.string().min(1),
	criterionIds: z.array(z.string()).default([])
});

export const RecordDecisionSchema = z.object({
	id: z.string().min(1),
	retainedOptionId: z.string().min(1),
	rejected: z
		.array(
			z.object({
				optionId: z.string().min(1),
				reason: z.string().min(1)
			})
		)
		.default([]),
	rationale: z.string().min(1),
	reversibility: z.enum(['reversible', 'costly', 'irreversible']),
	acceptedViolations: z
		.array(
			z.object({
				typedId: z.string().min(1),
				justification: z.string().min(1)
			})
		)
		.default([]),
	kbCandidateIds: z.array(z.string()).default([])
});
