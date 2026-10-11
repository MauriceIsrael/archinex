import { defineConfig } from 'prisma/config';

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
	}
});
