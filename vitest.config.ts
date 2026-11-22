import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
	plugins: [svelte()],
	test: {
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		// Les specs Playwright se lancent avec `npm run test:e2e:browser`, pas avec vitest.
		exclude: ['**/node_modules/**', 'tests/e2e/browser/**'],
		environment: 'node',
		globals: true,
		// Exécution séquentielle des suites pour préserver la base SQLite partagée (dev.db)
		fileParallelism: false,
		// Les tests ne parlent jamais au LLMOps de développement (127.0.0.1:8000) : adresse injoignable, comme en CI.
		// Les tests « réels » se lancent explicitement contre un serveur dédié (LLMOPS_LIVE_URL).
		// DATABASE_URL par défaut : garantit qu'un `npm test` sur clone propre ne transforme pas
		// les suites Prisma en « verts » ignorés silencieux.
		env: {
			LLMOPS_BASE_URL: 'http://127.0.0.1:1',
			DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
			// L'ontologie de test = copie de l'export du Hub (fixture générée) + l'extension du scénario « Lulu » (données de
			// projet) + les écarts de doctrine non encore tranchés dans le Hub (à supprimer au fur et à mesure, Archinex#417).
			ARCHINEX_ONTOLOGY_PROJECT_OVERLAY:
				'tests/fixtures/edp/ontology_project_overlay.lulu.json,tests/fixtures/edp/ontology_pending_conflicts.json'
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary', 'lcov', 'html'],
			reportsDirectory: 'coverage',
			reportOnFailure: true,
			include: ['src/lib/domain/**/*.ts'],
			exclude: ['**/*.d.ts', '**/index.ts'],
			// Seuils progressifs anti-régression sur la logique métier pure (`src/lib/domain/**`, #394)
			thresholds: {
				statements: 90,
				branches: 75,
				functions: 95,
				lines: 90
			}
		}
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	}
});
