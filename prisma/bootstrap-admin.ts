// Premier compte administrateur d'une installation neuve (docker-entrypoint.sh), à la place du seed de démonstration.
//
// Aucun compte n'est créé tant que ARCHINEX_BOOTSTRAP_ADMIN_EMAIL n'est pas fourni, et rien n'est fait si un administrateur
// existe déjà : relancer le conteneur ne recrée ni ne modifie jamais un compte. Les autres comptes se créent ensuite depuis
// l'interface (/admin, « Créer un compte »), voir docs/fresh-install.md.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { createPrismaClient, type PrismaClient } from '../src/lib/server/prismaFactory';

export type BootstrapResult =
	| { status: 'exists' }
	| { status: 'skipped' }
	| { status: 'created'; email: string; generatedPassword?: string }
	| { status: 'promoted'; email: string };

const MIN_PASSWORD_LENGTH = 12;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bootstrapAdmin(
	prisma: Pick<PrismaClient, 'user'>,
	env: Record<string, string | undefined> = process.env
): Promise<BootstrapResult> {
	if ((await prisma.user.count({ where: { role: 'admin' } })) > 0) return { status: 'exists' };

	const email = env.ARCHINEX_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
	if (!email) return { status: 'skipped' };
	if (!EMAIL_SHAPE.test(email)) throw new Error(`ARCHINEX_BOOTSTRAP_ADMIN_EMAIL n'est pas une adresse valide : ${email}`);

	// Une adresse déjà inscrite (compte non administrateur) est promue, son mot de passe reste inchangé.
	const existing = await prisma.user.findUnique({ where: { email } });
	if (existing) {
		await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
		return { status: 'promoted', email };
	}

	const provided = env.ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD;
	if (provided !== undefined && provided !== '' && provided.length < MIN_PASSWORD_LENGTH) {
		throw new Error(`ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD : ${MIN_PASSWORD_LENGTH} caractères au minimum.`);
	}
	const generatedPassword = provided ? undefined : randomBytes(18).toString('base64url');
	const name = env.ARCHINEX_BOOTSTRAP_ADMIN_NAME?.trim() || 'Administrateur';

	await prisma.user.create({
		data: {
			name,
			email,
			passwordHash: await bcrypt.hash(provided || generatedPassword!, 10),
			role: 'admin',
			attributes: JSON.stringify({ isActive: true, bootstrap: true })
		}
	});
	return { status: 'created', email, generatedPassword };
}

async function main() {
	const prisma = createPrismaClient();
	try {
		const result = await bootstrapAdmin(prisma);
		switch (result.status) {
			case 'exists':
				console.log('[bootstrap] Un administrateur existe déjà : rien à faire.');
				break;
			case 'skipped':
				console.warn(
					"[bootstrap] Aucun administrateur et ARCHINEX_BOOTSTRAP_ADMIN_EMAIL absent : personne ne pourra se connecter. " +
						'Définissez ARCHINEX_BOOTSTRAP_ADMIN_EMAIL (et ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD, 12 caractères au minimum) puis redémarrez.'
				);
				break;
			case 'promoted':
				console.log(`[bootstrap] ${result.email} existait : rôle administrateur accordé (mot de passe inchangé).`);
				break;
			case 'created':
				console.log(`[bootstrap] Administrateur créé : ${result.email}`);
				if (result.generatedPassword) {
					console.log(
						`[bootstrap] Mot de passe généré (affiché UNE SEULE FOIS, à changer dès la première connexion) : ${result.generatedPassword}`
					);
				}
				break;
		}
	} finally {
		await prisma.$disconnect();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => {
		console.error('[bootstrap] Erreur :', e instanceof Error ? e.message : e);
		process.exit(1);
	});
}
