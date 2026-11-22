import type { EdpActionContext, EdpActionResult } from './context';
import {
	EdpActionPayloadSchema,
	type EdpActionName,
	type EdpActionPayload
} from './schemas';
import { handleChallengeEdp, handleValidateEdp } from './validateAndChallenge';
import { handleBindAspect, handleUnratify } from './bindingActions';
import { handleDismissAxis, handleRestoreAxis } from './axisScopeActions';
import { handleHydrateEdp, handleSynthesizeEdp } from './hydrationAndSynthesis';
import {
	handleExportSylvaGitops,
	handleSimulateDrift,
	handleVerifyEdp
} from './verificationAndExport';

export type EdpActionHandler<K extends EdpActionName = EdpActionName> = (
	ctx: EdpActionContext,
	input: Extract<EdpActionPayload, { action: K }>
) => Promise<EdpActionResult>;

export const EDP_ACTION_HANDLERS: { [K in EdpActionName]: EdpActionHandler<K> } = {
	validate: handleValidateEdp,
	challenge: handleChallengeEdp,
	bind_aspect: handleBindAspect,
	unratify: handleUnratify,
	dismiss_axis: handleDismissAxis,
	restore_axis: handleRestoreAxis,
	hydrate: handleHydrateEdp,
	synthesize: handleSynthesizeEdp,
	verify: handleVerifyEdp,
	simulate_drift: handleSimulateDrift,
	export_sylva_gitops: handleExportSylvaGitops
};

export async function dispatchEdpAction(
	ctx: EdpActionContext,
	rawBody: unknown
): Promise<EdpActionResult> {
	const parsed = EdpActionPayloadSchema.safeParse(rawBody);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		const isUnknownAction = firstIssue?.path?.includes('action');
		return {
			status: 400,
			body: {
				success: false,
				error: isUnknownAction
					? 'Action non reconnue.'
					: firstIssue?.message || 'Charge utile EDP invalide.',
				issues: parsed.error.issues
			}
		};
	}

	const payload = parsed.data;
	const handler = EDP_ACTION_HANDLERS[payload.action] as (
		ctx: EdpActionContext,
		input: EdpActionPayload
	) => Promise<EdpActionResult>;
	return handler(ctx, payload);
}

export * from './schemas';
export * from './context';
export { getEdpState } from './getEdpState';
export {
	handleValidateEdp,
	handleChallengeEdp,
	handleBindAspect,
	handleUnratify,
	handleDismissAxis,
	handleRestoreAxis,
	handleHydrateEdp,
	handleSynthesizeEdp,
	handleVerifyEdp,
	handleSimulateDrift,
	handleExportSylvaGitops
};
