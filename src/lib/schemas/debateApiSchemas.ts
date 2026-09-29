import { z } from 'zod';

export const CreateArgumentSchema = z.object({
	optionId: z.string().optional().nullable(),
	targetArgumentId: z.string().optional().nullable(),
	stance: z.enum(['support', 'objection', 'question', 'verification', 'synthesis']),
	claim: z.string().min(3, "L'affirmation doit contenir au moins 3 caractères."),
	grounds: z.string().min(5, "Le fondement ('grounds') doit être étayé (au moins 5 caractères)."),
	kbRefs: z.array(z.string()).default([]),
	confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']).default('assumed')
});

export const ResolveArgumentSchema = z.object({
	resolution: z.enum(['open', 'answered', 'accepted_risk', 'withdrawn']),
	expectedVersion: z.number().int()
});

export const StartDebateSchema = z.object({
	maxRounds: z.number().int().min(1).max(3).default(3)
});
