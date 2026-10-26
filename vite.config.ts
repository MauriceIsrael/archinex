import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
	if (!process.env.VITEST) {
		const env = loadEnv(mode, process.cwd(), '');
		for (const [key, value] of Object.entries(env)) {
			if (process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		optimizeDeps: {
			exclude: ['lucide-svelte', '@prisma/client', 'casbin', 'casbin-prisma-adapter'],
			include: [
				'mermaid',
				'tailwind-variants',
				'tailwind-merge',
				'devalue',
				'zod',
				// Lourdes
				'echarts/core',
				'echarts/charts',
				'echarts/components',
				'echarts/renderers',
				// Transitives svelte-i18n
				'intl-messageformat',
				'deepmerge',
				// Transitives bits-ui
				'@floating-ui/dom',
				'tabbable',
				'style-to-object',
				// Transitives @internationalized
				'@internationalized/date'
			]
		},
		ssr: {
			external: ['@prisma/client', 'casbin-prisma-adapter']
		}
	};
});
