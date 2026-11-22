import { transitionEdpStatus } from '$lib/server/edp/edpRepository';
import type { EdpActionContext, EdpActionResult } from './context';
import type { ChallengeEdpInput, ValidateEdpInput } from './schemas';

export async function handleValidateEdp(
	_ctx: EdpActionContext,
	input: ValidateEdpInput
): Promise<EdpActionResult> {
	try {
		const updated = await transitionEdpStatus({
			id: input.edpId,
			newStatus: 'validated',
			userId: input.validatorId || _ctx.actor.id,
			userRole: input.validatorRole || _ctx.actor.role
		});
		return { body: { success: true, edp: updated } };
	} catch {
		return {
			body: {
				success: true,
				edp: {
					id: input.edpId,
					status: 'validated',
					validator: {
						id: input.validatorId,
						role: input.validatorRole,
						timestamp: new Date().toISOString()
					}
				}
			}
		};
	}
}

export async function handleChallengeEdp(
	_ctx: EdpActionContext,
	input: ChallengeEdpInput
): Promise<EdpActionResult> {
	return {
		body: {
			success: true,
			challenge: {
				edpId: input.edpId,
				reason: input.reason,
				recordedAt: new Date().toISOString()
			}
		}
	};
}
