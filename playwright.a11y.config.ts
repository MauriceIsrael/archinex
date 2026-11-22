import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.A11Y_PORT || 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const EPHEMERAL_A11Y_JWT_SECRET = randomBytes(32).toString('hex');

/**
 * Configuration Playwright autonome pour l'audit d'accessibilité (axe-core)
 * et le contrôle responsive 390 px sur les pages clés, sans dépendance LLMOps/Docker.
 */
export default defineConfig({
	testDir: './tests/e2e/browser',
	testMatch: /accessibility\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	timeout: 90000,
	expect: {
		timeout: 15000
	},
	reporter: [['list']],
	use: {
		baseURL: BASE_URL,
		headless: true,
		trace: 'retain-on-failure'
	},
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: `npx vite preview --port ${PORT} --host 127.0.0.1`,
				url: `${BASE_URL}/login`,
				reuseExistingServer: !process.env.CI,
				timeout: 60000,
				env: {
					...process.env,
					JWT_SECRET: EPHEMERAL_A11Y_JWT_SECRET
				}
			},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1280, height: 800 }
			}
		}
	]
});
