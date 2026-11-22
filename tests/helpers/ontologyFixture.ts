import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	applyProjectOverlay,
	loadProjectOverlays,
	type OntologyCatalog
} from '../../src/lib/server/edp/ontologyClient';

/**
 * Catalogue de test lu directement sur la fixture (copie de l'export du Hub), avec les extensions de projet que la
 * configuration de test désigne (ARCHINEX_ONTOLOGY_PROJECT_OVERLAY, vitest.config.ts) : le même catalogue que celui
 * que renvoie `loadOntologyCatalog()`, mais de façon synchrone, pour les tests qui le clonent au niveau du module.
 */
export function readFixtureCatalog(): OntologyCatalog {
	const base = JSON.parse(
		readFileSync(resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json'), 'utf8')
	) as OntologyCatalog;
	return loadProjectOverlays(process.env.ARCHINEX_ONTOLOGY_PROJECT_OVERLAY).reduce(applyProjectOverlay, base);
}
