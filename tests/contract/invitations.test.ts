import { describe, it, expect, beforeEach } from 'vitest';
import {
	createInvitation,
	getInvitationByToken,
	listInvitations,
	updateInvitationStatus,
	deleteInvitation
} from '$lib/server/invitations';
import { sendInvitationEmail } from '$lib/server/mailer';

describe('Expert Email Invitations & Account Activation Contract', () => {
	const testEmail = `expert.nis2.${Date.now()}@archinex.test`;
	let createdToken = '';
	let createdId = '';

	it('1. Crée une invitation pour un expert avec token sécurisé et métadonnées d\'architecture', () => {
		const inv = createInvitation({
			email: testEmail,
			name: 'Dr. Sarah Connor',
			role: 'user',
			expertRole: 'security_architect',
			projectId: 'proj-telecom-2027',
			projectName: 'Refonte Télécom Critique 2027',
			invitedBy: 'Lead Architect Archinex',
			message: 'Nous avons besoin de votre expertise sur la conformité NIS2 et le chiffrement souverain.'
		});

		expect(inv).toBeDefined();
		expect(inv.id).toBeDefined();
		createdToken = inv.token;
		createdId = inv.id;

		expect(inv.token).toMatch(/^tok_[a-f0-9]{48}$/);
		expect(inv.email).toBe(testEmail);
		expect(inv.name).toBe('Dr. Sarah Connor');
		expect(inv.expertRole).toBe('security_architect');
		expect(inv.projectId).toBe('proj-telecom-2027');
		expect(inv.status).toBe('pending');
		expect(new Date(inv.expiresAt).getTime()).toBeGreaterThan(Date.now());

		createdToken = inv.token;
		createdId = inv.id;
	});

	it('2. Récupère l\'invitation via son token sécurisé', () => {
		const found = getInvitationByToken(createdToken);
		expect(found).not.toBeNull();
		expect(found?.id).toBe(createdId);
		expect(found?.email).toBe(testEmail);
		expect(found?.projectName).toBe('Refonte Télécom Critique 2027');
		expect(found?.status).toBe('pending');
	});

	it('3. Formate et dispatche un email d\'invitation souverain avec lien d\'activation direct', async () => {
		const inv = getInvitationByToken(createdToken);
		expect(inv).not.toBeNull();

		const result = await sendInvitationEmail(inv!, 'http://localhost:5173');
		expect(result.sent).toBe(true);
		expect(result.inviteUrl).toBe(`http://localhost:5173/invite?token=${createdToken}`);
		expect(result.recipient).toBe(testEmail);
		expect(result.subject).toContain('Refonte Télécom Critique 2027');
		expect(result.preview).toBeDefined();
		expect(result.preview.html).toContain('Lead Architect Archinex');
		expect(result.preview?.html).toContain('Refonte Télécom Critique 2027');
		expect(result.preview?.html).toContain(createdToken);
	});

	it('4. Liste et filtre les invitations par statut et email', () => {
		const all = listInvitations();
		expect(all.length).toBeGreaterThan(0);

		const filteredByEmail = listInvitations({ email: testEmail });
		expect(filteredByEmail.length).toBe(1);
		expect(filteredByEmail[0].token).toBe(createdToken);

		const pendingOnly = listInvitations({ status: 'pending' });
		expect(pendingOnly.some((i) => i.id === createdId)).toBe(true);
	});

	it('5. Valide l\'acceptation de l\'invitation et transitionne vers le statut accepted', () => {
		const updated = updateInvitationStatus(createdId, 'accepted');
		expect(updated).toBe(true);

		const reFetched = getInvitationByToken(createdToken);
		expect(reFetched?.status).toBe('accepted');
	});

	it('6. Révoque et supprime une invitation du registre SQLite', () => {
		const success = deleteInvitation(createdId);
		expect(success).toBe(true);

		const check = getInvitationByToken(createdToken);
		expect(check).toBeNull();
	});
});
