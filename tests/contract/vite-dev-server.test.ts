import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

describe('Vite Dev Server Configuration & Prisma Resolution Contract (Issue #144)', () => {
	let server: ViteDevServer | null = null;

	afterAll(async () => {
		if (server) {
			await server.close();
			server = null;
		}
	});

	it('exclut @prisma/client, casbin et casbin-prisma-adapter de optimizeDeps.include', () => {
		const viteConfigPath = resolve(process.cwd(), 'vite.config.ts');
		const viteConfigContent = readFileSync(viteConfigPath, 'utf-8');

		// Le client browser de Prisma et les adaptateurs serveur ne doivent pas être pré-bundlés côté client
		expect(viteConfigContent).not.toMatch(/include:\s*\[[^\]]*'@prisma\/client'/);
		expect(viteConfigContent).not.toMatch(/include:\s*\[[^\]]*'casbin'/);
		expect(viteConfigContent).not.toMatch(/include:\s*\[[^\]]*'casbin-prisma-adapter'/);

		// Ils doivent figurer dans optimizeDeps.exclude
		expect(viteConfigContent).toMatch(/exclude:\s*\[[^\]]*'@prisma\/client'/);
		expect(viteConfigContent).toMatch(/exclude:\s*\[[^\]]*'casbin-prisma-adapter'/);

		// ssr.external doit déclarer @prisma/client
		expect(viteConfigContent).toMatch(/ssr:\s*\{\s*external:\s*\[[^\]]*'@prisma\/client'/);
	});

	it(
		'démarre le serveur de développement Vite et sert /login sans crash sur .prisma/client/index-browser',
		async () => {
			const testPort = 5195;
			server = await createServer({
				server: { port: testPort },
				logLevel: 'error'
			});

			await server.listen();
			expect(server.httpServer).toBeDefined();

			const response = await fetch(`http://localhost:${testPort}/login`);
			expect(response.status).toBe(200);

			const html = await response.text();
			expect(html.toLowerCase()).toContain('<!doctype html>');
			expect(html).toContain('admin@archinex.local');
			expect(html).toContain('Sign In');
		},
		30000
	);
});
