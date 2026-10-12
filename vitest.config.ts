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
		env: {
			LLMOPS_BASE_URL: 'http://127.0.0.1:1'
		}
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	}
});
