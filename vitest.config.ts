import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
	plugins: [svelte()],
	test: {
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		environment: 'node',
		globals: true
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	}
});
