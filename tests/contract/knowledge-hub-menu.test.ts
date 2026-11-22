import { describe, it, expect } from 'vitest';
import { KNOWLEDGE_HUB_NAV_GROUPS, MAIN_MENU_ITEMS } from '$lib/domain/navigation';
import frFR from '$lib/locales/fr-FR.json';
import en from '$lib/locales/en.json';
import enUK from '$lib/locales/en-UK.json';
import es from '$lib/locales/es.json';

describe('Knowledge Hub Menu Rationalization Contract Test', () => {
	it('1. Regroupe toutes les mini-apps KB dans un menu "Knowledge Hub" avec 3 paliers ergonomiques ordonnés', () => {
		const kbRoot = MAIN_MENU_ITEMS.find((item) => item.isKnowledgeHub);
		expect(kbRoot).toBeDefined();
		expect(kbRoot?.labelKey).toBe('nav.knowledgeHub');
		expect(kbRoot?.authOnly).toBe(true);

		expect(KNOWLEDGE_HUB_NAV_GROUPS.map((g) => g.id)).toEqual([
			'visualisation',
			'doctrine',
			'validation'
		]);

		const allRoutes = KNOWLEDGE_HUB_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
		expect(allRoutes).toEqual([
			'/knowledge',
			'/kb/me',
			'/kb/frameworks',
			'/kb/workshop',
			'/kb/clauses',
			'/kb/reviews',
			'/kb/evals',
			'/kb/dashboard'
		]);

		// Aucun label interne G5/G6/G7 dans les intitulés par défaut
		for (const group of KNOWLEDGE_HUB_NAV_GROUPS) {
			expect(group.defaultLabel).not.toMatch(/\bG[567]\b/);
			for (const item of group.items) {
				expect(item.defaultLabel).not.toMatch(/\bG[567]\b/);
			}
		}
	});

	it('2. Définit les clés i18n du Knowledge Hub et de ses sous-menus dans toutes les langues', () => {
		const locales = [
			{ name: 'fr-FR.json', json: frFR as Record<string, any> },
			{ name: 'en.json', json: en as Record<string, any> },
			{ name: 'en-UK.json', json: enUK as Record<string, any> },
			{ name: 'es.json', json: es as Record<string, any> }
		];
		const requiredNavKeys = [
			'knowledgeHub',
			'knowledge',
			'kbGroupVisualisation',
			'kbGroupDoctrine',
			'kbGroupValidation',
			'kbMe',
			'kbFrameworks',
			'kbWorkshop',
			'kbClauses',
			'kbReviews',
			'kbEvals',
			'kbDashboard'
		];

		for (const { name, json } of locales) {
			expect(json.nav).toBeDefined();
			expect(json.nav.knowledgeHub).toBe('Knowledge Hub');

			for (const key of requiredNavKeys) {
				expect(json.nav[key], `Clé nav.${key} manquante dans ${name}`).toBeTruthy();
				expect(json.nav[key], `Clé nav.${key} dans ${name} ne doit pas contenir G5/G6/G7`).not.toMatch(/\bG[567]\b/);
			}
		}
	});
});
