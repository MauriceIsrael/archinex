import { z } from 'zod';

export const CreateDecisionSchema = z.object({
	retainedOptionId: z.string().min(1, "L'option retenue est obligatoire."),
	rejected: z.array(
		z.object({
			optionId: z.string(),
			reason: z.string().min(3, "Le motif d'écartement est requis (au moins 3 caractères).")
		})
	).default([]),
	rationale: z.string().min(10, "La motivation de l'arbitrage doit être substantielle (au moins 10 caractères)."),
	reversibility: z.enum(['reversible', 'costly', 'irreversible']),
	acceptedViolations: z.array(
		z.object({
			typedId: z.string(),
			justification: z.string().min(5, 'La justification de la dispense est obligatoire (au moins 5 caractères).')
		})
	).default([])
});

export type CreateDecisionDto = z.infer<typeof CreateDecisionSchema>;
