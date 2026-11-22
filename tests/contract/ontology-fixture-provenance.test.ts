/**
 * La fixture d'ontologie n'est plus écrite à la main : c'est une copie de l'export du Knowledge Hub (LLMOps#192,
 * Archinex#417). Ces tests empêchent qu'elle redevienne une seconde source de vérité.
 *
 * - Hors-ligne : l'empreinte de la fixture est celle que `scripts/sync-ontology-fixture.mjs` a enregistrée
 *   (toute retouche à la main la fait échouer) ;
 * - En ligne : voir `hub-ontology-fixture-live.test.ts` (le nom contient « live » pour être lancé par `hub-live`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical, sha256, assertCatalogShape } from '../../scripts/sync-ontology-fixture.mjs';

const FIXTURE = resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json');
const PROVENANCE = resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.provenance.json');

const fixtureText = readFileSync(FIXTURE, 'utf-8').replace(/\r\n/g, '\n');
const fixture = JSON.parse(fixtureText);
const provenance = JSON.parse(readFileSync(PROVENANCE, 'utf-8'));

describe('Fixture d\'ontologie = copie de l\'export du Hub', () => {
	it('porte une provenance LLMOps et une forme de catalogue valide', () => {
		expect(provenance.source).toBe('MauriceIsrael/LLMOps');
		expect(() => assertCatalogShape(fixture)).not.toThrow();
	});

	it('est dans la forme canonique écrite par le script de synchronisation', () => {
		expect(fixtureText).toBe(canonical(fixture));
	});

	it('n\'a pas été retouchée à la main : empreinte et effectifs conformes à la provenance', () => {
		expect(sha256(fixtureText), 'fixture modifiée sans passer par scripts/sync-ontology-fixture.mjs').toBe(provenance.sha256);
		expect(Object.keys(fixture.entities)).toHaveLength(provenance.entities);
		expect(fixture.triplets).toHaveLength(provenance.triplets);
		expect(fixture.catalog_version).toBe(provenance.catalog_version);
	});
});

describe('Extension de projet', () => {
	it('échoue clairement quand elle cible une entité que le Hub n\'a plus', async () => {
		const { applyProjectOverlay } = await import('../../src/lib/server/edp/ontologyClient');
		const catalog = { catalog_version: '1', generated_at: 'x', entities: {}, triplets: [] };
		expect(() =>
			applyProjectOverlay(catalog, { entityPatches: { 'urn:archinex:ontology:absente': { keywords: ['x'] } } })
		).toThrow(/absente de l'ontologie du Hub/);
	});

	it('fusionne objets et tableaux, remplace sur $replace, et ne touche pas au catalogue d\'origine', async () => {
		const { applyProjectOverlay } = await import('../../src/lib/server/edp/ontologyClient');
		const u = 'urn:archinex:ontology:t:leaf';
		const catalog: any = {
			catalog_version: '1',
			generated_at: 'x',
			entities: { [u]: { urn: u, revision: 1, keywords: ['a'], projections: { p: 1 }, oracle_rules: ['r1'] } },
			triplets: [{ id: 't1', subject: u, predicate: 'depends_on', object: u }]
		};
		const out: any = applyProjectOverlay(catalog, {
			entityPatches: { [u]: { keywords: ['a', 'b'], projections: { q: 2 }, oracle_rules: { $replace: ['r2'] } } },
			addedTriplets: [
				{ id: 't1', subject: u, predicate: 'depends_on', object: u },
				{ id: 'tr-prj-1', subject: u, predicate: 'depends_on', object: u }
			]
		} as any);
		expect(out.entities[u].keywords).toEqual(['a', 'b']);
		expect(out.entities[u].projections).toEqual({ p: 1, q: 2 });
		expect(out.entities[u].oracle_rules).toEqual(['r2']);
		expect(out.triplets.map((t: any) => t.id)).toEqual(['t1', 'tr-prj-1']);
		expect(catalog.entities[u].keywords).toEqual(['a']);
	});
});
