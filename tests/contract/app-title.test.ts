import { describe, it, expect } from 'vitest';
import { APP_DEFAULT_TITLE } from '$lib/domain/navigation';
import en from '$lib/locales/en.json';
import enUK from '$lib/locales/en-UK.json';
import frFR from '$lib/locales/fr-FR.json';
import es from '$lib/locales/es.json';

describe('App Title Contract Test', () => {
	it('defines "archinex" as the app title across all locale dictionaries', () => {
		const locales = [
			{ name: 'en.json', dict: en },
			{ name: 'en-UK.json', dict: enUK },
			{ name: 'fr-FR.json', dict: frFR },
			{ name: 'es.json', dict: es }
		];

		for (const { name, dict } of locales) {
			expect(dict.app, `${name} doit définir app`).toBeDefined();
			expect(dict.app.title, `${name} doit définir app.title = archinex`).toBe('archinex');
		}
	});

	it('exposes "archinex" as the default title constant used by the root layout', () => {
		expect(APP_DEFAULT_TITLE).toBe('archinex');
		expect(APP_DEFAULT_TITLE).not.toContain('A small app to have fun');
		expect(APP_DEFAULT_TITLE).not.toContain('SvelteKit Admin');
	});
});
