#!/usr/bin/env node
/**
 * Synchronise la fixture d'ontologie hors-ligne d'Archinex depuis le Knowledge Hub (LLMOps).
 *
 * Le Hub est la SEULE source de l'ontologie (LLMOps#192, Archinex#417) : `tests/fixtures/edp/ontology_export.json`
 * n'est plus écrit à la main, c'est une copie de ce que sert `GET /api/knowledge/ontology/export`, c'est-à-dire du
 * fichier `data/snapshots/ontology_export.json` du Hub. Un fichier de provenance (`ontology_export.provenance.json`)
 * enregistre d'où vient la copie et son empreinte, ce qui permet de détecter une retouche à la main.
 *
 * Usage :
 *   node scripts/sync-ontology-fixture.mjs --from-file ../llmops/data/snapshots/ontology_export.json [--ref <sha|branche>]
 *   node scripts/sync-ontology-fixture.mjs --from-hub http://127.0.0.1:8099 [--token <jeton>] [--ref <sha|branche>]
 *   ajouter --check pour ne rien écrire et échouer (code 1) si la fixture diffère de la source.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json');
const PROVENANCE = resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.provenance.json');

/** @param {string[]} argv */
export function parseArgs(argv) {
	/** @type {{ fromFile?: string; fromHub?: string; token?: string; ref?: string; check: boolean }} */
	const out = { check: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--check') out.check = true;
		else if (a === '--from-file') out.fromFile = argv[++i];
		else if (a === '--from-hub') out.fromHub = argv[++i];
		else if (a === '--token') out.token = argv[++i];
		else if (a === '--ref') out.ref = argv[++i];
		else throw new Error(`Option inconnue : ${a}`);
	}
	if (Boolean(out.fromFile) === Boolean(out.fromHub)) {
		throw new Error('Indiquer exactement une source : --from-file <chemin> ou --from-hub <url>.');
	}
	return out;
}

/**
 * Forme canonique de la fixture : JSON indenté de 2 espaces, retour à la ligne final.
 * @param {unknown} catalog
 */
export function canonical(catalog) {
	return `${JSON.stringify(catalog, null, 2)}\n`;
}

/** @param {string} text */
export function sha256(text) {
	return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * Valide la forme minimale d'un catalogue d'ontologie (le Hub valide le fond, voir `kb ontology catalog-check`).
 * @param {any} catalog
 */
export function assertCatalogShape(catalog) {
	if (!catalog || typeof catalog !== 'object') throw new Error('Catalogue invalide : objet attendu.');
	if (!catalog.entities || typeof catalog.entities !== 'object' || Array.isArray(catalog.entities)) {
		throw new Error('Catalogue invalide : "entities" (objet indexé par URN) requis.');
	}
	if (!Array.isArray(catalog.triplets)) throw new Error('Catalogue invalide : "triplets" (tableau) requis.');
	if (typeof catalog.catalog_version !== 'string') throw new Error('Catalogue invalide : "catalog_version" requis.');
}

/** @param {ReturnType<typeof parseArgs>} args */
async function readSource(args) {
	if (args.fromFile) {
		const path = resolve(process.cwd(), args.fromFile);
		if (!existsSync(path)) throw new Error(`Source introuvable : ${path}`);
		const parsed = JSON.parse(readFileSync(path, 'utf-8'));
		return { catalog: parsed, origin: { kind: 'file', path: 'data/snapshots/ontology_export.json' } };
	}
	const url = `${String(args.fromHub).replace(/\/$/, '')}/api/knowledge/ontology/export`;
	/** @type {Record<string, string>} */
	const headers = { Accept: 'application/json' };
	if (args.token) headers.Authorization = `Bearer ${args.token}`;
	const res = await fetch(url, { headers });
	if (!res.ok) throw new Error(`Knowledge Hub indisponible (${url}) : code HTTP ${res.status}`);
	const json = await res.json();
	return { catalog: json.data || json, origin: { kind: 'hub', endpoint: '/api/knowledge/ontology/export' } };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const { catalog, origin } = await readSource(args);
	assertCatalogShape(catalog);
	const text = canonical(catalog);

	if (args.check) {
		const current = existsSync(FIXTURE) ? readFileSync(FIXTURE, 'utf-8') : '';
		if (current !== text) {
			console.error(
				'La fixture d\'ontologie diffère de la source du Hub. Relancer sans --check pour la resynchroniser ' +
					'(puis relire les tests qui en dépendent).'
			);
			process.exit(1);
		}
		console.log(`Fixture d'ontologie conforme à la source (${Object.keys(catalog.entities).length} entités).`);
		return;
	}

	writeFileSync(FIXTURE, text, 'utf-8');
	const provenance = {
		_comment:
			'Généré par scripts/sync-ontology-fixture.mjs : ne pas modifier à la main. La fixture est une copie de l\'export du Hub (LLMOps).',
		source: 'MauriceIsrael/LLMOps',
		origin,
		llmops_ref: args.ref ?? null,
		catalog_version: catalog.catalog_version,
		generated_at: catalog.generated_at ?? null,
		entities: Object.keys(catalog.entities).length,
		triplets: catalog.triplets.length,
		sha256: sha256(text)
	};
	writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`, 'utf-8');
	console.log(
		`Fixture d'ontologie synchronisée : ${provenance.entities} entités, ${provenance.triplets} triplets, sha256 ${provenance.sha256.slice(0, 12)}…`
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
