import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Plugin Vite qui réécrit à la volée les imports globaux `import { A, B } from 'lucide-svelte'`
 * en imports granulaires directs `import A from 'lucide-svelte/icons/a'`.
 * Supprime le goulet d'étranglement de 3 788 requêtes HTTP en dev mode en ne chargeant que les icônes réellement utilisées.
 */
function lucideOptimizePlugin(): Plugin {
	let iconMap: Record<string, string> | null = null;

	function loadIconMap(): Record<string, string> {
		if (iconMap) return iconMap;
		iconMap = {};
		try {
			const iconsPath = path.resolve(process.cwd(), 'node_modules/lucide-svelte/dist/icons/index.js');
			const aliasesPath = path.resolve(process.cwd(), 'node_modules/lucide-svelte/dist/aliases/aliases.js');

			if (fs.existsSync(iconsPath)) {
				const iconsContent = fs.readFileSync(iconsPath, 'utf-8');
				const iconRegex = /export\s+\{\s*default\s+as\s+([a-zA-Z0-9]+)\s*\}\s+from\s+'\.\/([a-z0-9-]+)\.svelte';/g;
				let m: RegExpExecArray | null;
				while ((m = iconRegex.exec(iconsContent)) !== null) {
					iconMap[m[1]] = `lucide-svelte/icons/${m[2]}`;
				}
			}

			if (fs.existsSync(aliasesPath)) {
				const aliasesContent = fs.readFileSync(aliasesPath, 'utf-8');
				const aliasRegex = /default\s+as\s+([a-zA-Z0-9]+)\s*\}\s+from\s+'\.\.\/icons\/([a-z0-9-]+)\.js';/g;
				let m: RegExpExecArray | null;
				while ((m = aliasRegex.exec(aliasesContent)) !== null) {
					iconMap[m[1]] = `lucide-svelte/icons/${m[2]}`;
				}
			}
		} catch (err) {
			console.warn('[lucideOptimizePlugin] Erreur lors de la construction du catalogue d’icônes:', err);
		}
		return iconMap;
	}

	return {
		name: 'lucide-optimize-imports',
		enforce: 'pre',
		transform(code, id) {
			if (!id.includes('/src/') || (!id.endsWith('.svelte') && !id.endsWith('.ts') && !id.endsWith('.js'))) {
				return null;
			}
			if (!code.includes('lucide-svelte')) {
				return null;
			}

			const lucideImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-svelte['"];?/g;
			if (!lucideImportRegex.test(code)) {
				return null;
			}

			const map = loadIconMap();
			let hasChanges = false;

			const transformed = code.replace(lucideImportRegex, (_match: string, importsStr: string) => {
				const items = importsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
				const replacements: string[] = [];
				const unmapped: string[] = [];

				for (const item of items) {
					const parts = item.split(/\s+as\s+/);
					const originalName = parts[0].trim();
					const localName = parts[1] ? parts[1].trim() : originalName;

					if (map[originalName]) {
						replacements.push(`import ${localName} from '${map[originalName]}';`);
						hasChanges = true;
					} else {
						unmapped.push(item);
					}
				}

				if (unmapped.length > 0) {
					replacements.push(`import { ${unmapped.join(', ')} } from 'lucide-svelte';`);
				}

				return replacements.join('\n');
			});

			return hasChanges ? { code: transformed, map: null } : null;
		}
	};
}

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
		plugins: [lucideOptimizePlugin(), tailwindcss(), sveltekit()],
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
