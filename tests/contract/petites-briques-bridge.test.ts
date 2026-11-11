import { describe, it, expect } from 'vitest';
import {
	generatePetitesBriquesCanvas,
	generatePetitesBriquesYAML,
	generatePetitesBriquesJSON,
	extractCanvasRequirements
} from '$lib/domain/petitesBriquesBridge';
import type { ProjectionContext } from '$lib/domain/artifactProjections';

describe('PetitesBriques Canvas Bridge Contract Tests', () => {
	it('1. Extrait les indicateurs d\'exigences pour orienter le choix des briques', () => {
		const context: ProjectionContext = {
			projectName: 'Système Radio Tactique',
			decision: {
				retainedOptionId: 'opt-1',
				retainedOptionTitle: 'Survie Edge autonome en îlotage et cœur actif/actif bi-site',
				rationale: 'Passerelle LMR requise pour migration TETRA'
			}
		};

		const reqs = extractCanvasRequirements([], context);
		expect(reqs.edge_survivability).toBe(true);
		expect(reqs.active_active_core).toBe(true);
		expect(reqs.lmr_interworking).toBe(true);
	});

	it('2. Génère le canevas complet pour l\'arbitrage Actif/Actif Géoredondant avec Quorum et DCI', () => {
		const subject = {
			id: 'sub-aa',
			section_ref: '§2.3',
			name: 'Topologie de haute disponibilité et reprise'
		};

		const context: ProjectionContext = {
			projectId: 'lot1-core',
			projectName: 'Réseau Critique National',
			enterpriseName: 'Direction Générale Sécurité',
			decision: {
				retainedOptionId: 'opt-aa-geo',
				retainedOptionTitle: 'Actif/actif géoredondant généralisé',
				rationale: 'Cœur et plateformes critiques en actif/actif sur au moins deux zones indépendantes'
			}
		};

		const canvas = generatePetitesBriquesCanvas(subject, null, [], context);

		expect(canvas.name).toContain('Réseau Critique National');
		expect(canvas.sites.length).toBeGreaterThanOrEqual(2);

		const dc1 = canvas.sites.find((s) => s.id === 'site-core-dc1');
		const dc2 = canvas.sites.find((s) => s.id === 'site-core-dc2');
		expect(dc1).toBeDefined();
		expect(dc2).toBeDefined();
		expect(dc1?.siteType).toBe('managed-self');
		expect(dc2?.siteType).toBe('managed-self');

		// Vérification des briques instanciées
		expect(dc1?.bricks.some((b) => b.templateId === 't1-core-control')).toBe(true);
		expect(dc1?.bricks.some((b) => b.templateId === 'gw-gtp')).toBe(true);
		expect(dc1?.bricks.some((b) => b.templateId === 't2-ip-fabric')).toBe(true);

		// Vérification de la zone et de la liaison DCI
		expect(canvas.zones.some((z) => z.id === 'zone-core-national')).toBe(true);
		expect(canvas.connections.some((c) => c.id === 'conn-inter-dc-fiber')).toBe(true);

		// Périmètre de confiance souverain
		expect(canvas.perimeters.length).toBe(1);
		expect(canvas.perimeters[0].siteIds).toContain('site-core-dc1');
		expect(canvas.perimeters[0].siteIds).toContain('site-core-dc2');
	});

	it('3. Génère le canevas complet pour la Survie Edge Tactique avec liaison N2/N3', () => {
		const subject = {
			id: 'sub-edge',
			section_ref: '§3.2',
			name: 'Bulle tactique projetable'
		};

		const context: ProjectionContext = {
			projectId: 'tactical-bubble',
			projectName: 'Système Edge',
			decision: {
				retainedOptionId: 'opt-edge',
				retainedOptionTitle: 'Survie locale Edge autonome en mode îlotage',
				rationale: 'Double adduction vers cœur bi-site et maintien groupe local'
			}
		};

		const canvas = generatePetitesBriquesCanvas(subject, null, [], context);

		const edgeSite = canvas.sites.find((s) => s.id === 'site-edge-survie');
		expect(edgeSite).toBeDefined();
		expect(edgeSite?.siteType).toBe('on-prem');
		expect(edgeSite?.bricks.some((b) => b.templateId === 'spectre-radio')).toBe(true);
		expect(edgeSite?.bricks.some((b) => b.templateId === 'gw-gtp')).toBe(true);

		expect(canvas.zones.some((z) => z.id === 'zone-tactical-edge')).toBe(true);
		expect(canvas.connections.some((c) => c.linkTypeId === 'n2-ngap')).toBe(true);
		expect(canvas.connections.some((c) => c.linkTypeId === 'n3-gtp-u')).toBe(true);
	});

	it('4. Génère les formats de sérialisation YAML et JSON opposables', () => {
		const subject = {
			id: 'sub-canvas',
			section_ref: '§1',
			name: 'Système Test'
		};

		const context: ProjectionContext = {
			projectId: 'test-project',
			projectName: 'Test Petites Briques',
			decision: {
				retainedOptionId: 'opt-1',
				retainedOptionTitle: 'Bi-site actif-actif et passerelle TETRA LMR'
			}
		};

		const canvas = generatePetitesBriquesCanvas(subject, null, [], context);

		// Sérialisation JSON
		const json = generatePetitesBriquesJSON(canvas);
		const parsed = JSON.parse(json);
		expect(parsed.name).toBe(canvas.name);
		expect(parsed.sites.length).toBe(canvas.sites.length);

		// Sérialisation YAML
		const yaml = generatePetitesBriquesYAML(canvas);
		expect(yaml).toContain('# Petites Briques Canvas Specification');
		expect(yaml).toContain('name:');
		expect(yaml).toContain('sites:');
		expect(yaml).toContain('zones:');
		expect(yaml).toContain('connections:');
		expect(yaml).toContain('perimeters:');
		expect(yaml).toContain('site-core-dc1');
		expect(yaml).toContain('site-legacy-lmr');
	});
});
