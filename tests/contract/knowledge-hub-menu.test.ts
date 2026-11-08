import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Knowledge Hub Menu Rationalization Contract Test', () => {
	const layoutPath = path.resolve('src/routes/+layout.svelte');
	const layoutContent = fs.readFileSync(layoutPath, 'utf8');

	it('1. Regroupe toutes les mini-apps KB dans un menu "Knowledge Hub" avec 3 paliers ergonomiques et séparateurs', () => {
		expect(layoutContent).toContain("labelKey: 'nav.knowledgeHub'");
		expect(layoutContent).toContain('knowledgeHubGroups');
		expect(layoutContent).toContain('data-testid="knowledge-hub-menu"');
		expect(layoutContent).toContain('data-testid="knowledge-hub-submenus"');
		expect(layoutContent).toContain('role="separator"');
		expect(layoutContent).toContain('data-testid="knowledge-hub-separator"');

		// Vérifie la présence et l'ordre ergonomique progressif des 3 groupes :
		// 1. Visualisation & Exploration -> 2. Doctrine & Rédaction -> 3. Validation & Évaluation
		const idxVisu = layoutContent.indexOf("id: 'visualisation'");
		const idxDoctrine = layoutContent.indexOf("id: 'doctrine'");
		const idxValidation = layoutContent.indexOf("id: 'validation'");

		expect(idxVisu).toBeGreaterThan(-1);
		expect(idxDoctrine).toBeGreaterThan(idxVisu);
		expect(idxValidation).toBeGreaterThan(idxDoctrine);

		// Vérifie que toutes les routes KB sont présentes dans knowledgeHubGroups dans l'ordre attendu
		const expectedRoutes = [
			'/knowledge',
			'/kb/me',
			'/kb/frameworks',
			'/kb/workshop',
			'/kb/clauses',
			'/kb/reviews',
			'/kb/evals',
			'/kb/dashboard'
		];

		let lastIdx = -1;
		for (const route of expectedRoutes) {
			const idx = layoutContent.indexOf(`href: '${route}'`);
			expect(idx, `Route ${route} doit être présente dans knowledgeHubGroups`).toBeGreaterThan(lastIdx);
			lastIdx = idx;
		}

		// Vérifie la progressivité des portes constitutionnelles G5 -> G6 -> G7 sur le palier Validation & Évaluation
		expect(layoutContent).toContain("gate: 'G5'");
		expect(layoutContent).toContain("gate: 'G6'");
		expect(layoutContent).toContain("gate: 'G7'");
	});

	it('2. Retire les mini-apps KB du menu caché derrière l’icône utilisateur en haut à droite', () => {
		const avatarMenuStart = layoutContent.indexOf('<DropdownMenu.Content align="end"');
		const avatarMenuEnd = layoutContent.indexOf('</DropdownMenu.Content>', avatarMenuStart);
		expect(avatarMenuStart).toBeGreaterThan(-1);
		expect(avatarMenuEnd).toBeGreaterThan(avatarMenuStart);

		const avatarMenuBlock = layoutContent.slice(avatarMenuStart, avatarMenuEnd);

		// Le menu avatar conserve l'identité et la déconnexion mais n'embarque plus les mini-apps KB
		expect(avatarMenuBlock).toContain('session.user.name');
		expect(avatarMenuBlock).toContain('handleLogout');
		expect(avatarMenuBlock).not.toContain('/kb/me');
		expect(avatarMenuBlock).not.toContain('/kb/reviews');
		expect(avatarMenuBlock).not.toContain('/kb/workshop');
		expect(avatarMenuBlock).not.toContain('/kb/clauses');
		expect(avatarMenuBlock).not.toContain('/kb/frameworks');
		expect(avatarMenuBlock).not.toContain('/kb/evals');
		expect(avatarMenuBlock).not.toContain('/kb/dashboard');
	});

	it('3. Définit les clés i18n du Knowledge Hub et de ses sous-menus dans toutes les langues', () => {
		const locales = ['fr-FR.json', 'en.json', 'en-UK.json', 'es.json'];
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

		for (const localeFile of locales) {
			const filePath = path.resolve('src/lib/locales', localeFile);
			const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
			expect(json.nav).toBeDefined();
			expect(json.nav.knowledgeHub).toBe('Knowledge Hub');

			for (const key of requiredNavKeys) {
				expect(json.nav[key], `Clé nav.${key} manquante dans ${localeFile}`).toBeTruthy();
			}
		}
	});
});
