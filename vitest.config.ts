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
		globals: true
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	}
});
