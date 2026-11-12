import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const UNPUBLISHED_HEADER_RE = /^## Non publié[ \t]*$/m;

/**
 * List sorted markdown fragment filenames inside `changelogDir`, excluding README.md.
 * @param {string} changelogDir
 * @returns {string[]}
 */
export function listFragments(changelogDir) {
	if (!fs.existsSync(changelogDir)) return [];
	return fs
		.readdirSync(changelogDir, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'readme.md')
		.sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Validate a single changelog fragment and return its normalized LF text.
 * @param {string} content
 * @param {string} filename
 * @returns {{ valid: boolean, error?: string, normalized: string }}
 */
export function validateFragment(content, filename) {
	const normalized = content.replace(/\r\n/g, '\n').trim();
	if (!normalized) {
		return { valid: false, error: `${filename}: le fragment est vide.`, normalized: '' };
	}
	if (/^## Non publié\b/m.test(normalized)) {
		return {
			valid: false,
			error: `${filename}: ne pas inclure le titre "## Non publié" dans un fragment.`,
			normalized
		};
	}
	if (!/^(###\s+\S|-\s+\S)/.test(normalized)) {
		return {
			valid: false,
			error: `${filename}: le fragment doit commencer par un titre "### ..." ou une puce "- ...".`,
			normalized
		};
	}
	return { valid: true, normalized };
}

/**
 * Insert validated fragment contents right under the "## Non publié" heading.
 * @param {string} changelogContent
 * @param {string[]} normalizedFragments
 * @returns {string}
 */
export function insertFragmentsIntoChangelog(changelogContent, normalizedFragments) {
	if (normalizedFragments.length === 0) return changelogContent;

	const usesCrlf = changelogContent.includes('\r\n');
	const lfContent = changelogContent.replace(/\r\n/g, '\n');
	const match = UNPUBLISHED_HEADER_RE.exec(lfContent);
	if (!match) {
		throw new Error('Section "## Non publié" introuvable dans CHANGELOG.md.');
	}

	const insertAt = match.index + match[0].length;
	const before = lfContent.slice(0, insertAt);
	const after = lfContent.slice(insertAt).replace(/^\n+/, '');
	const joinedFragments = normalizedFragments.map((f) => f.trim()).join('\n\n');

	const rebuilt = after
		? `${before}\n\n${joinedFragments}\n\n${after}`
		: `${before}\n\n${joinedFragments}\n`;

	return usesCrlf ? rebuilt.replace(/\n/g, '\r\n') : rebuilt;
}

/**
 * Validate and optionally consolidate all `changelog.d/*.md` fragments into `CHANGELOG.md`.
 * @param {{ rootDir?: string, dryRun?: boolean, check?: boolean }} [options]
 * @returns {{ fragments: string[], changed: boolean, checked?: boolean, dryRun?: boolean, updatedChangelog?: string }}
 */
export function consolidateChangelog({
	rootDir = process.cwd(),
	dryRun = false,
	check = false
} = {}) {
	const changelogDir = path.join(rootDir, 'changelog.d');
	const changelogPath = path.join(rootDir, 'CHANGELOG.md');
	const fragmentNames = listFragments(changelogDir);

	/** @type {string[]} */
	const errors = [];
	/** @type {string[]} */
	const normalizedFragments = [];
	for (const name of fragmentNames) {
		const raw = fs.readFileSync(path.join(changelogDir, name), 'utf-8');
		const validation = validateFragment(raw, name);
		if (!validation.valid) {
			errors.push(validation.error ?? `${name}: fragment invalide.`);
		} else {
			normalizedFragments.push(validation.normalized);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Fragments invalides dans changelog.d/:\n- ${errors.join('\n- ')}`);
	}

	if (check) {
		return { fragments: fragmentNames, changed: false, checked: true };
	}

	if (fragmentNames.length === 0) {
		return { fragments: [], changed: false, checked: true };
	}

	if (!fs.existsSync(changelogPath)) {
		throw new Error(`Fichier CHANGELOG.md introuvable à ${changelogPath}`);
	}

	const currentChangelog = fs.readFileSync(changelogPath, 'utf-8');
	const updatedChangelog = insertFragmentsIntoChangelog(currentChangelog, normalizedFragments);

	if (!dryRun) {
		fs.writeFileSync(changelogPath, updatedChangelog, 'utf-8');
		for (const name of fragmentNames) {
			fs.unlinkSync(path.join(changelogDir, name));
		}
	}

	return {
		fragments: fragmentNames,
		changed: true,
		dryRun,
		updatedChangelog
	};
}

function runCli() {
	const args = new Set(process.argv.slice(2));
	const check = args.has('--check');
	const dryRun = args.has('--dry-run');

	try {
		const result = consolidateChangelog({ rootDir: process.cwd(), check, dryRun });
		if (check) {
			console.log(
				`✅ Changelog fragments check passed (${result.fragments.length} fragment(s) validé(s)).`
			);
			return;
		}
		if (!result.changed) {
			console.log('ℹ️ Aucun fragment à consolider dans changelog.d/.');
			return;
		}
		const action = dryRun ? 'Simulation de consolidation' : 'Consolidation terminée';
		console.log(`✅ ${action} : ${result.fragments.join(', ')} -> CHANGELOG.md`);
	} catch (err) {
		console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	runCli();
}
