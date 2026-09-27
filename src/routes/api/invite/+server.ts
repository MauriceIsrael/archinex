import { json, error } from '@sveltejs/kit';
import { createInvitation, listInvitations, deleteInvitation } from '$lib/server/invitations';
import { sendInvitationEmail } from '$lib/server/mailer';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const InviteSchema = z.object({
	email: z.string().email('Adresse email invalide'),
	name: z.string().optional(),
	role: z.enum(['admin', 'user']).optional().default('user'),
	expertRole: z.string().optional().default('infra_expert_architect'),
	projectId: z.string().optional(),
	projectName: z.string().optional(),
	message: z.string().optional()
});

// GET: Lister les invitations
export const GET: RequestHandler = async ({ url }) => {
	const email = url.searchParams.get('email') || undefined;
	const status = url.searchParams.get('status') || undefined;
	const invitations = listInvitations({ email, status });
	return json({ invitations });
};

// POST: Envoyer une nouvelle invitation
export const POST: RequestHandler = async ({ request, url, locals }) => {
	const body = await request.json().catch(() => ({}));
	const result = InviteSchema.safeParse(body);

	if (!result.success) {
		const msg = result.error.issues.map((i) => i.message).join(', ');
		throw error(400, msg);
	}

	const inviterName = locals.session?.user?.name || 'Lead Architect';

	const invitation = createInvitation({
		...result.data,
		invitedBy: inviterName
	});

	// Envoi de l'email d'invitation (ou simulation locale)
	const dispatch = await sendInvitationEmail(invitation, url.origin);

	return json({
		success: true,
		invitation,
		inviteUrl: dispatch.inviteUrl,
		preview: dispatch.preview
	});
};

// DELETE: Révoquer une invitation
export const DELETE: RequestHandler = async ({ request, url }) => {
	const body = await request.json().catch(() => ({}));
	const id = body.id || url.searchParams.get('id');
	if (!id) {
		throw error(400, 'Identifiant d\'invitation requis');
	}

	const deleted = deleteInvitation(id);
	return json({ success: deleted });
};
