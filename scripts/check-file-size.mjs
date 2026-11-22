#!/usr/bin/env node
/**
 * Garde-fou de taille de fichiers et de propreté des routes API (Issue #396).
 *
 * Règles :
 *  - ERREUR (bloquant) : toute route serveur SvelteKit (`src/routes/**\/+{server,page.server,layout.server}.ts`) > 300 lignes.
 *  - ERREUR (bloquant) : toute route API (`+server.ts`) contenant une chaîne `if (action === ...)`.
 *  - AVERTISSEMENT (non bloquant sauf `--strict`) : tout fichier `.ts` / `.svelte` de `src/` > 600 lignes.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, 'src');
const ROUTE_MAX_LINES = 300;
const FILE_WARN_LINES = 600;
const STRICT = process.argv.includes('--strict');

const EXCLUDED_SEGMENTS = new Set(['generated', 'node_modules', '.svelte-kit']);
const SERVER_ROUTE_RE = /[/\\]src[/\\]routes[/\\].*[/\\]\+(server|page\.server|layout\.server)\.ts$/;
const API_ROUTE_RE = /[/\\]src[/\\]routes[/\\].*[/\\]\+server\.ts$/;
const ACTION_IF_CHAIN_RE = /\bif\s*\(\s*action\s*===/g;

function walk(dir, acc = []) {
	if (!fs.existsSync(dir)) return acc;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, acc);
		} else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte'))) {
			acc.push(full);
		}
	}
	return acc;
}

const files = walk(SRC_DIR);
const routeErrors = [];
const actionChainErrors = [];
const sizeWarnings = [];

for (const file of files) {
	const content = fs.readFileSync(file, 'utf-8');
	const lineCount = content.split(/\r?\n/).length;
	const rel = path.relative(ROOT, file).replace(/\\/g, '/');

	if (SERVER_ROUTE_RE.test(file) && lineCount > ROUTE_MAX_LINES) {
		routeErrors.push({ rel, lineCount });
	}
	if (API_ROUTE_RE.test(file) && (content.match(ACTION_IF_CHAIN_RE)?.length ?? 0) >= 2) {
		actionChainErrors.push({ rel });
	}
	if (lineCount > FILE_WARN_LINES) {
		sizeWarnings.push({ rel, lineCount });
	}
}

sizeWarnings.sort((a, b) => b.lineCount - a.lineCount);

if (sizeWarnings.length > 0) {
	console.warn(
		`⚠️  [lint:size] ${sizeWarnings.length} fichier(s) dépassent le seuil d'avertissement de ${FILE_WARN_LINES} lignes :`
	);
	for (const w of sizeWarnings.slice(0, 15)) {
		console.warn(`   - ${w.rel} (${w.lineCount} lignes)`);
	}
	if (sizeWarnings.length > 15) {
		console.warn(`   ... et ${sizeWarnings.length - 15} autre(s) fichier(s).`);
	}
}

let failed = false;
if (routeErrors.length > 0) {
	failed = true;
	console.error(`❌ [lint:size] Route(s) serveur dépassant ${ROUTE_MAX_LINES} lignes :`);
	for (const e of routeErrors) {
		console.error(`   - ${e.rel} (${e.lineCount} lignes)`);
	}
}

if (actionChainErrors.length > 0) {
	failed = true;
	console.error(`❌ [lint:size] Route(s) API utilisant une chaîne \`if (action === ...)\` :`);
	for (const e of actionChainErrors) {
		console.error(`   - ${e.rel}`);
	}
}

if (STRICT && sizeWarnings.length > 0) {
	failed = true;
}

if (failed) {
	process.exit(1);
}

console.log(
	`✓ [lint:size] Toutes les routes serveur <= ${ROUTE_MAX_LINES} lignes et sans chaîne \`if (action === ...)\` (${sizeWarnings.length} avertissement(s) > ${FILE_WARN_LINES} lignes).`
);
process.exit(0);
