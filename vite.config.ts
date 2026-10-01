import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: {
		exclude: ['lucide-svelte'],
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
			'gridstack',
			'casbin',
			'casbin-prisma-adapter',
			// Packages SSR découverts trop tard (prisma, jose)
			'@prisma/client',
			'jose',
			// Transitives svelte-i18n
			'intl-messageformat',
			'deepmerge',
			// Transitives bits-ui
			'@floating-ui/dom',
			'tabbable',
			'style-to-object',
			// Transitives @internationalized
			'@internationalized/date',
		]
	}
});
