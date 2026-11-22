#!/usr/bin/env node
/**
 * Prépare automatiquement l'environnement de test sur un clone propre :
 * 1. Vérifie/installe le binaire OPA (v1.21.4 avec vérification SHA-256) sans jamais ignorer silencieusement.
 * 2. Génère le client Prisma et pousse le schéma SQLite si la base locale est absente.
 * 3. Synchronise SvelteKit (`svelte-kit sync`).
 *
 * Appelé par `npm run pretest` et `npm run verify`.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const ROOT_DIR = process.cwd();
const isWin = process.platform === 'win32';

function resolveOpaBinary() {
	if (process.env.OPA_PATH) {
		return existsSync(process.env.OPA_PATH) ? process.env.OPA_PATH : null;
	}

	const localBin = resolve(ROOT_DIR, 'tools/bin', isWin ? 'opa.exe' : 'opa');
	if (existsSync(localBin)) {
		return localBin;
	}

	try {
		const cmd = isWin ? 'opa.exe' : 'opa';
		const check = spawnSync(cmd, ['version'], { stdio: 'ignore' });
		if (check.status === 0) {
			return cmd;
		}
	} catch {
		// Absent du PATH
	}

	return null;
}

function ensureOpa() {
	const existing = resolveOpaBinary();
	if (existing) {
		return existing;
	}

	if (process.env.ARCHINEX_SKIP_OPA_BOOTSTRAP === '1') {
		console.error(
			'❌ Binaire OPA introuvable et bootstrap désactivé (ARCHINEX_SKIP_OPA_BOOTSTRAP=1).\n' +
				'   Installez OPA v1.21.4 via `bash scripts/install-opa.sh` (Linux) ou `powershell -File scripts/install-opa.ps1` (Windows),\n' +
				'   ou définissez OPA_PATH vers un binaire OPA >= 1.x.'
		);
		process.exit(1);
	}

	console.log('[pretest] Binaire OPA introuvable : installation automatique en cours...');
	try {
		if (isWin) {
			const psScript = resolve(ROOT_DIR, 'scripts/install-opa.ps1');
			execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`, {
				stdio: 'inherit',
				cwd: ROOT_DIR
			});
		} else if (process.platform === 'linux') {
			const shScript = resolve(ROOT_DIR, 'scripts/install-opa.sh');
			execSync(`bash "${shScript}"`, {
				stdio: 'inherit',
				cwd: ROOT_DIR
			});
		} else {
			throw new Error(
				`Installation automatique OPA non prise en charge sur la plateforme "${process.platform}".`
			);
		}
	} catch (err) {
		console.error(
			'\n❌ Échec du bootstrap automatique OPA (aucun test OPA ne sera ignoré silencieusement).\n' +
				`   Détail : ${err instanceof Error ? err.message : String(err)}\n` +
				'   Action : installez OPA v1.21.4 manuellement dans tools/bin/opa (ou opa.exe), ou définissez OPA_PATH.'
		);
		process.exit(1);
	}

	const installed = resolveOpaBinary();
	if (!installed) {
		console.error(
			'❌ Le script d’installation OPA s’est terminé mais le binaire reste introuvable dans tools/bin/.'
		);
		process.exit(1);
	}

	return installed;
}

function resolveSqliteDbPath(databaseUrl) {
	if (!databaseUrl.startsWith('file:')) return null;
	const rawPath = databaseUrl.slice('file:'.length).split('?')[0];
	if (isAbsolute(rawPath) || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
		return rawPath;
	}
	return resolve(ROOT_DIR, 'prisma', rawPath);
}

function ensurePrismaAndSvelte() {
	const env = {
		...process.env,
		DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db'
	};

	// 1. Générer le client Prisma
	execSync('npx prisma generate', { stdio: 'inherit', env, cwd: ROOT_DIR });

	// 2. Créer la base SQLite si elle est absente (clone propre)
	const dbPath = resolveSqliteDbPath(env.DATABASE_URL);
	if (dbPath && !existsSync(dbPath)) {
		console.log(`[pretest] Base SQLite absente (${dbPath}) : exécution de prisma db push...`);
		execSync('npx prisma db push', { stdio: 'inherit', env, cwd: ROOT_DIR });
	}

	// 3. Synchroniser les types/routes SvelteKit
	execSync('npx svelte-kit sync', { stdio: 'inherit', env, cwd: ROOT_DIR });
}

function main() {
	ensureOpa();
	ensurePrismaAndSvelte();
}

main();
