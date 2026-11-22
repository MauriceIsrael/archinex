import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_PREFIXES = [
	'src/',
	'scripts/',
	'edp/',
	'tests/',
	'docs/',
	'openspec/',
	'.github/',
	'prisma/'
];

const FILE_EXT_RE = /\.(ts|js|mjs|cjs|svelte|rego|json|md|sh|ps1|yml|yaml|prisma|css|html)$/i;

/**
 * Recursively list markdown documentation files to audit (README.md, ARCHITECTURE.md, docs/**\/*.md).
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listDocFiles(rootDir) {
	const results = [];
	for (const topFile of ['README.md', 'ARCHITECTURE.md']) {
		const abs = path.join(rootDir, topFile);
		if (fs.existsSync(abs)) results.push(abs);
	}

	const docsDir = path.join(rootDir, 'docs');
	if (fs.existsSync(docsDir)) {
		/** @param {string} dir */
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(full);
				} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
					results.push(full);
				}
			}
		};
		walk(docsDir);
	}

	return results.sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Strip fenced code blocks (``` or ~~~) while preserving line numbers.
 * @param {string} content
 * @returns {string[]}
 */
export function stripCodeFencesKeepLines(content) {
	const lines = content.split(/\r?\n/);
	let inFence = false;
	let fenceChar = '';
	return lines.map((line) => {
		const trimmed = line.trimStart();
		const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
		if (fenceMatch) {
			const char = fenceMatch[1][0];
			if (!inFence) {
				inFence = true;
				fenceChar = char;
			} else if (char === fenceChar) {
				inFence = false;
				fenceChar = '';
			}
			return '';
		}
		return inFence ? '' : line;
	});
}

/**
 * Check a single markdown document's content for:
 * 1. Absolute `file:///` URLs
 * 2. Broken relative markdown links `[label](target)`
 * 3. Broken backticked repository file paths (e.g. `` `src/.../foo.ts` ``)
 *
 * @param {{ filePath: string, content: string, rootDir: string }} params
 * @returns {Array<{ file: string, line: number, kind: string, target: string, message: string }>}
 */
export function checkMarkdownContent({ filePath, content, rootDir }) {
	/** @type {Array<{ file: string, line: number, kind: string, target: string, message: string }>} */
	const errors = [];
	const relFile = path.relative(rootDir, filePath).replace(/\\/g, '/');
	const fileDir = path.dirname(filePath);
	const lines = stripCodeFencesKeepLines(content);

	const linkRe = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	const backtickRe = /`([^`\r\n]+)`/g;

	lines.forEach((line, idx) => {
		const lineNumber = idx + 1;

		// 1. Disallow any file:/// absolute path or markdown link
		const fileUrlMatch = line.match(/file:\/\/\/[^\s)"'`>]+/i) || line.match(/\(file:\/\/\//i);
		if (fileUrlMatch) {
			errors.push({
				file: relFile,
				line: lineNumber,
				kind: 'absolute-file-url',
				target: fileUrlMatch[0],
				message: 'Lien absolu file:/// interdit dans la documentation (utiliser un chemin relatif).'
			});
		}

		// 2. Validate relative markdown links
		let linkMatch;
		linkRe.lastIndex = 0;
		while ((linkMatch = linkRe.exec(line)) !== null) {
			const rawTarget = linkMatch[1].trim();
			if (
				!rawTarget ||
				rawTarget.startsWith('#') ||
				/^(https?:|mailto:|tel:|data:|file:)/i.test(rawTarget)
			) {
				continue;
			}

			const cleanTarget = decodeURIComponent(rawTarget.split('#')[0].split('?')[0]);
			if (!cleanTarget) continue;

			const resolved = path.resolve(fileDir, cleanTarget);
			if (!fs.existsSync(resolved)) {
				errors.push({
					file: relFile,
					line: lineNumber,
					kind: 'broken-relative-link',
					target: rawTarget,
					message: `Lien relatif introuvable : "${rawTarget}" (résolu vers "${path.relative(rootDir, resolved).replace(/\\/g, '/')}").`
				});
			}
		}

		// 3. Validate backticked repository source paths (ignoring struck-through historical paths ~~`...`~~)
		const lineWithoutStrikethrough = line.replace(/~~[^~]*~~/g, '');
		let btMatch;
		backtickRe.lastIndex = 0;
		while ((btMatch = backtickRe.exec(lineWithoutStrikethrough)) !== null) {
			const token = btMatch[1].trim();
			if (/\s/.test(token)) continue;
			if (!SOURCE_PREFIXES.some((prefix) => token.startsWith(prefix))) continue;
			if (!FILE_EXT_RE.test(token)) continue;
			if (/[*<>{}\[\]:…]|\.\.\./.test(token)) continue;

			const resolved = path.resolve(rootDir, token);
			if (!fs.existsSync(resolved)) {
				errors.push({
					file: relFile,
					line: lineNumber,
					kind: 'broken-source-path',
					target: token,
					message: `Chemin source inexistant référencé dans la documentation : "${token}".`
				});
			}
		}
	});

	return errors;
}

/**
 * Audit all repository documentation files.
 * @param {string} [rootDir]
 * @returns {{ filesChecked: number, errors: Array<{ file: string, line: number, kind: string, target: string, message: string }> }}
 */
export function checkAllDocLinks(rootDir = process.cwd()) {
	const files = listDocFiles(rootDir);
	const errors = [];
	for (const filePath of files) {
		const content = fs.readFileSync(filePath, 'utf-8');
		errors.push(...checkMarkdownContent({ filePath, content, rootDir }));
	}
	return { filesChecked: files.length, errors };
}

function runCli() {
	const rootDir = process.cwd();
	const { filesChecked, errors } = checkAllDocLinks(rootDir);

	if (errors.length === 0) {
		console.log(`✓ Documentation links OK (${filesChecked} fichiers vérifiés, 0 lien cassé).`);
		process.exit(0);
	}

	console.error(`❌ ${errors.length} erreur(s) de lien détectée(s) dans ${filesChecked} fichiers :`);
	for (const err of errors) {
		console.error(`  - ${err.file}:${err.line} [${err.kind}] ${err.message}`);
	}
	process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	runCli();
}
