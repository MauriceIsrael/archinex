import { defineConfig } from 'prisma/config';
import { isAbsolute, resolve } from 'node:path';

// Même logique que src/lib/server/dbUrl.ts (dupliquée : ce fichier est copié seul dans l'image Docker).
function resolveDatabaseUrl(raw = process.env.DATABASE_URL): string {
	const url = raw ?? 'file:./dev.db';
	if (!url.startsWith('file:')) return url;
	const path = url.slice('file:'.length);
	if (isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path)) return url;
	return `file:${resolve(process.cwd(), 'prisma', path)}`;
}

// Avec un fichier de configuration, Prisma ne charge plus .env de lui-même.
// loadEnvFile n'écrase pas les variables déjà définies (CI, tests).
try {
	process.loadEnvFile('.env');
} catch {
	// pas de .env : on s'appuie sur l'environnement
}

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		seed: 'tsx prisma/seed.ts'
	},
	datasource: {
		url: resolveDatabaseUrl()
	}
});