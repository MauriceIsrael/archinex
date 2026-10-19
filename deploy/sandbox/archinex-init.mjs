// Crée, dans une base Archinex vierge, les comptes de test de SANDBOX_ARCHINEX_USERS (JSON), et rien d'autre :
// ni projet, ni espace de travail, ni les comptes de démonstration de prisma/seed.ts (mots de passe publics).
// Exécuté à chaque démarrage : un compte existant n'est pas modifié (le mot de passe reste celui du premier démarrage).
// Monté en /app/sandbox-init.mjs : les modules se résolvent depuis /app/node_modules.
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const users = JSON.parse(process.env.SANDBOX_ARCHINEX_USERS ?? '[]');
const db = new Database(new URL(process.env.DATABASE_URL).pathname);
const now = Date.now();

const findUser = db.prepare('SELECT id FROM users WHERE email = ?');
const insertUser = db.prepare(
	'INSERT INTO users (id, name, email, passwordHash, role, attributes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertProfile = db.prepare(
	'INSERT INTO kb_profiles (id, userId, kbHandle, kbRoles, ownedDomains, delegated, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)'
);

let created = 0;
for (const u of users) {
	if (findUser.get(u.email)) continue;
	const id = `usr_sandbox_${u.key}`;
	insertUser.run(id, u.name, u.email, bcrypt.hashSync(u.password, 10), u.role, '{}', now, now);
	if (u.kbHandle) {
		insertProfile.run(
			`kbp_sandbox_${u.key}`,
			id,
			u.kbHandle,
			JSON.stringify(u.kbRoles ?? []),
			JSON.stringify(u.ownedDomains ?? []),
			now,
			now
		);
	}
	created++;
}
console.log(`[sandbox] comptes de test : ${created} créé(s), ${users.length - created} déjà présent(s)`);
