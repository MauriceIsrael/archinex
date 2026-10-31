import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('App Title Contract Test', () => {
	it('defines "archinex" as the app title across all locale dictionaries', () => {
		const locales = ['en.json', 'en-UK.json', 'fr-FR.json', 'es.json'];

		for (const localeFile of locales) {
			const filePath = path.resolve('src/lib/locales', localeFile);
			const raw = fs.readFileSync(filePath, 'utf8');
			const json = JSON.parse(raw);

			expect(json.app).toBeDefined();
			expect(json.app.title).toBe('archinex');
		}
	});

	it('uses "archinex" as the default title in +layout.svelte', () => {
		const layoutPath = path.resolve('src/routes/+layout.svelte');
		const content = fs.readFileSync(layoutPath, 'utf8');

		expect(content).toContain(`{$t('app.title', { default: 'archinex' })}`);
		expect(content).not.toContain('A small app to have fun');
		expect(content).not.toContain('SvelteKit Admin');
	});
});
