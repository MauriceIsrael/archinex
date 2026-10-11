import { describe, it, expect, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '$lib/server/prisma';
import { inviteKbExpert } from '$lib/server/kbProfilesDb';

// Archinex n'envoie pas d'e-mail : l'admin doit pouvoir fixer le mot de passe initial d'un expert.
describe("Expert KB créé avec un mot de passe initial fixé par l'admin", () => {
	const stamp = Date.now();
	const email = `expert+${stamp}@example.org`;

	afterAll(async () => {
		await prisma.user.deleteMany({ where: { email } });
	});

	it('le compte est actif tout de suite, sans lien d\'activation, et le mot de passe fonctionne', async () => {
		const res = await inviteKbExpert({
			name: 'Expert Sécurité',
			email,
			kbHandle: `@secu-${stamp}`,
			kbRoles: ['kb:review'],
			ownedDomains: ['security-governance'],
			initialPassword: 'motdepasse-initial'
		});

		expect(res.invitationToken).toBeNull();
		expect(res.invitationUrl).toBeNull();
		expect(res.expert.invitationStatus).toBe('active');

		const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { kbProfile: true } });
		expect(await bcrypt.compare('motdepasse-initial', user.passwordHash)).toBe(true);
		expect(user.kbProfile?.invitationToken).toBeNull();
	});
});
