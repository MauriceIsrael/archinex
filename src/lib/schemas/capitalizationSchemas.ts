import { z } from 'zod';

export const CandidateInputSchema = z.object({
	id: z.string().optional(),
	kind: z.enum(['new_asset', 'amendment', 'rex']),
	title: z.string().min(3, 'Le titre doit comporter au moins 3 caractères.'),
	summary: z.string().min(5, 'Le résumé doit comporter au moins 5 caractères.'),
	suggested_change: z.string().optional(),
	rationale: z.string().min(3, 'La motivation/justification est obligatoire.'),
	target_asset_ref: z.string().optional(),
	accepted_violation_justification: z.string().optional(),
	status: z.enum(['in_review', 'accepted', 'rejected']).optional()
});

export const SubmitCandidatesSchema = z.object({
	candidates: z.array(CandidateInputSchema).min(1, 'Au moins un candidat doit être soumis.')
});

export type CandidateInput = z.infer<typeof CandidateInputSchema>;
export type SubmitCandidatesInput = z.infer<typeof SubmitCandidatesSchema>;
