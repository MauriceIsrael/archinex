import { json, error } from '@sveltejs/kit';
import { createInvitation, listInvitations, deleteInvitation } from '$lib/server/invitations';
import { sendInvitationEmail } from '$lib/server/mailer';
import { authorizeProjectAccess } from '$lib/server/projects/projectAccess';
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
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}
	const email = url.searchParams.get('email') || undefined;
	const status = url.searchParams.get('status') || undefined;
	const invitations = listInvitations({ email, status });
	return json({ invitations });
};

// POST: Envoyer une nouvelle invitation
export const POST: RequestHandler = async (event) => {
	const { request, url, locals } = event;
	if (!locals.session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}
	const body = await request.json().catch(() => ({}));
	const result = InviteSchema.safeParse(body);

	if (!result.success) {
		const msg = result.error.issues.map((i) => i.message).join(', ');
		throw error(400, msg);
	}

	if (result.data.projectId) {
		const auth = await authorizeProjectAccess(event, result.data.projectId);
		if (auth.error) return auth.error;
	}

	const inviterName = locals.session.user.name || locals.session.user.email;

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
		sent: dispatch.sent,
		simulated: dispatch.simulated,
		reason: dispatch.reason,
		preview: dispatch.preview
	});
};

// DELETE: Révoquer une invitation
export const DELETE: RequestHandler = async ({ request, url, locals }) => {
	if (!locals.session?.user) {
		return json({ status: 'error', error: 'Non authentifié : session requise' }, { status: 401 });
	}
	const body = await request.json().catch(() => ({}));
	const id = body.id || url.searchParams.get('id');
	if (!id) {
		throw error(400, 'Identifiant d\'invitation requis');
	}

	const deleted = deleteInvitation(id);
	return json({ success: deleted });
};
