import { z } from 'zod';

const OptionalString = z.string().optional();
const OptionalOverrides = z.record(z.string(), z.unknown()).optional();

const BaseEdpInputSchema = z.object({
	edpId: OptionalString,
	validatorId: OptionalString,
	validatorRole: OptionalString,
	selectedConceptUrn: OptionalString
});

export const ValidateEdpInputSchema = BaseEdpInputSchema.extend({
	edpId: z.string().min(1, 'edpId est requis.'),
	validatorId: OptionalString,
	validatorRole: OptionalString
});

export const ChallengeEdpInputSchema = BaseEdpInputSchema.extend({
	edpId: OptionalString,
	reason: OptionalString
});

export const BindAspectInputSchema = BaseEdpInputSchema.extend({
	leafUrn: OptionalString,
	axisUrn: OptionalString,
	bindMode: z.enum(['add', 'replace', 'remove']).optional(),
	ratifyAllDefaults: z.boolean().optional()
});

export const UnratifyInputSchema = BaseEdpInputSchema.extend({
	axisUrn: OptionalString,
	leafUrn: OptionalString,
	reason: OptionalString
});

export const AxisScopeInputSchema = BaseEdpInputSchema.extend({
	axisUrn: z.string().min(1, 'axisUrn est requis.')
});

export const HydrateEdpInputSchema = BaseEdpInputSchema.extend({
	overrides: OptionalOverrides,
	dryRun: z.boolean().optional()
});

export const SynthesizeEdpInputSchema = BaseEdpInputSchema;

export const VerifyEdpInputSchema = BaseEdpInputSchema.extend({
	overrides: OptionalOverrides
});

export const DriftScenarioSchema = z.enum([
	'reset_clean',
	'unapproved_hardware',
	'bmc_oob_mismatch',
	'unproxied_oam',
	'non_isoprod_staging',
	'single_power_feed',
	's6a_direct_bypass_dea',
	'orphan_partner_tenant'
]);

export const SimulateDriftInputSchema = BaseEdpInputSchema.extend({
	driftScenario: DriftScenarioSchema.optional(),
	overrides: OptionalOverrides
});

export const ExportSylvaGitopsInputSchema = BaseEdpInputSchema.extend({
	repoUrl: OptionalString,
	baseBranch: OptionalString,
	gitToken: OptionalString
});

export const EdpActionPayloadSchema = z.discriminatedUnion('action', [
	ValidateEdpInputSchema.extend({ action: z.literal('validate') }),
	ChallengeEdpInputSchema.extend({ action: z.literal('challenge') }),
	BindAspectInputSchema.extend({ action: z.literal('bind_aspect') }),
	UnratifyInputSchema.extend({ action: z.literal('unratify') }),
	AxisScopeInputSchema.extend({ action: z.literal('dismiss_axis') }),
	AxisScopeInputSchema.extend({ action: z.literal('restore_axis') }),
	HydrateEdpInputSchema.extend({ action: z.literal('hydrate') }),
	SynthesizeEdpInputSchema.extend({ action: z.literal('synthesize') }),
	VerifyEdpInputSchema.extend({ action: z.literal('verify') }),
	SimulateDriftInputSchema.extend({ action: z.literal('simulate_drift') }),
	ExportSylvaGitopsInputSchema.extend({ action: z.literal('export_sylva_gitops') })
]);

export type EdpActionPayload = z.infer<typeof EdpActionPayloadSchema>;
export type EdpActionName = EdpActionPayload['action'];
export type ValidateEdpInput = z.infer<typeof ValidateEdpInputSchema>;
export type ChallengeEdpInput = z.infer<typeof ChallengeEdpInputSchema>;
export type BindAspectInput = z.infer<typeof BindAspectInputSchema>;
export type UnratifyInput = z.infer<typeof UnratifyInputSchema>;
export type AxisScopeInput = z.infer<typeof AxisScopeInputSchema>;
export type HydrateEdpInput = z.infer<typeof HydrateEdpInputSchema>;
export type SynthesizeEdpInput = z.infer<typeof SynthesizeEdpInputSchema>;
export type VerifyEdpInput = z.infer<typeof VerifyEdpInputSchema>;
export type SimulateDriftInput = z.infer<typeof SimulateDriftInputSchema>;
export type ExportSylvaGitopsInput = z.infer<typeof ExportSylvaGitopsInputSchema>;

export const EDP_ACTION_SLUGS: Record<EdpActionName, string> = {
	validate: 'validate',
	challenge: 'challenge',
	bind_aspect: 'bind-aspect',
	unratify: 'unratify',
	dismiss_axis: 'dismiss-axis',
	restore_axis: 'restore-axis',
	hydrate: 'hydrate',
	synthesize: 'synthesize',
	verify: 'verify',
	simulate_drift: 'simulate-drift',
	export_sylva_gitops: 'export-sylva-gitops'
};
