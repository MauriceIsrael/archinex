import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TESTED_DOCS_FOR_VERIFY = new Set([
	'docs/backup-restore.md',
	'docs/fresh-install.md',
	'docs/developer-guide.md'
]);

/**
 * Normalize repository-relative paths to forward slashes without leading `./`.
 * @param {string} filePath
 * @returns {string}
 */
export function normalizeRepoPath(filePath) {
	return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Return true when modifying `filePath` cannot affect the specified CI workflow (`verify` or `hub-live`).
 * @param {string} filePath
 * @param {string} [workflow]
 * @returns {boolean}
 */
export function isDocOrChangelogOnlyPath(filePath, workflow = 'verify') {
	const p = normalizeRepoPath(filePath);
	if (!p) return false;

	if (p.startsWith('changelog.d/')) return true;
	if (p === '.github/pull_request_template.md' || p === 'LICENSE') return true;
	if (/^[^/]+\.md$/i.test(p)) return true;

	if (/^docs\/.*\.md$/i.test(p)) {
		if (workflow === 'verify' && TESTED_DOCS_FOR_VERIFY.has(p)) {
			return false;
		}
		return true;
	}

	return false;
}

/**
 * Compute a deterministic SHA-256 signature of all git-tracked files excluding doc/changelog-only paths.
 * @param {string} lsFilesOutput
 * @param {string} [workflow]
 * @returns {string}
 */
export function computeCodeTreeSignature(lsFilesOutput, workflow = 'verify') {
	const keptLines = lsFilesOutput
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => {
			if (!line) return false;
			const tabIdx = line.indexOf('\t');
			if (tabIdx === -1) return true;
			const filePath = line.slice(tabIdx + 1);
			return !isDocOrChangelogOnlyPath(filePath, workflow);
		})
		.sort((a, b) => a.localeCompare(b, 'en'));

	return crypto.createHash('sha256').update(keptLines.join('\n')).digest('hex');
}

/**
 * Decide whether heavy CI steps must execute for the current run.
 * @param {{ eventName: string, runAttempt?: string, changedFilesVsBase?: string[], cacheHit?: boolean, workflow?: string }} params
 * @returns {{ shouldRun: boolean, reason: string }}
 */
export function evaluatePreflightDecision({
	eventName,
	runAttempt = '1',
	changedFilesVsBase = [],
	cacheHit = false,
	workflow = 'verify'
}) {
	if (eventName !== 'pull_request') {
		return {
			shouldRun: true,
			reason: `Exécution complète requise (événement ${eventName || 'local'})`
		};
	}

	if (Number(runAttempt) > 1) {
		return {
			shouldRun: true,
			reason: `Ré-exécution manuelle demandée (tentative ${runAttempt})`
		};
	}

	if (
		Array.isArray(changedFilesVsBase) &&
		changedFilesVsBase.length > 0 &&
		changedFilesVsBase.every((f) => isDocOrChangelogOnlyPath(f, workflow))
	) {
		return {
			shouldRun: false,
			reason: `La PR ne modifie que de la documentation / changelog.d/ (${changedFilesVsBase.length} fichier(s))`
		};
	}

	if (cacheHit === true) {
		return {
			shouldRun: false,
			reason: `Arbre de code inchangé depuis le dernier run ${workflow} vert sur cette PR`
		};
	}

	return {
		shouldRun: true,
		reason: `Changements de code détectés : exécution complète de ${workflow} requise`
	};
}

/**
 * @param {Record<string, string>} outputs
 */
function appendGithubOutputs(outputs) {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (!outputFile) return;
	const lines = Object.entries(outputs).map(([k, v]) => `${k}=${String(v)}`);
	fs.appendFileSync(outputFile, `${lines.join('\n')}\n`, 'utf-8');
}

/**
 * @param {string} baseSha
 * @returns {string[]}
 */
function getChangedFilesVsBase(baseSha) {
	if (!baseSha) return [];
	try {
		const out = execFileSync('git', ['diff', '--name-only', baseSha, 'HEAD'], {
			encoding: 'utf-8'
		});
		return out
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * @param {string[]} argv
 * @returns {{ mode: string, workflow: string }}
 */
function parseArgs(argv) {
	const parsed = { mode: 'hash', workflow: 'verify' };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--mode' && argv[i + 1]) parsed.mode = argv[++i];
		if (argv[i] === '--workflow' && argv[i + 1]) parsed.workflow = argv[++i];
	}
	return parsed;
}

function runCli() {
	const { mode, workflow } = parseArgs(process.argv.slice(2));

	if (mode === 'hash') {
		const lsFiles = execFileSync('git', ['ls-files', '-s'], {
			encoding: 'utf-8',
			maxBuffer: 20 * 1024 * 1024
		});
		const codeHash = computeCodeTreeSignature(lsFiles, workflow);
		const utcDate = new Date().toISOString().slice(0, 10);
		appendGithubOutputs({ code_hash: codeHash, utc_date: utcDate });
		console.log(`[ci-preflight:${workflow}] code_hash=${codeHash} utc_date=${utcDate}`);
		return;
	}

	if (mode === 'eval') {
		const eventName = process.env.GITHUB_EVENT_NAME || '';
		const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '1';
		const baseSha = process.env.BASE_SHA || '';
		const cacheHit = process.env.CACHE_HIT === 'true';
		const changedFilesVsBase =
			eventName === 'pull_request' ? getChangedFilesVsBase(baseSha) : [];

		const decision = evaluatePreflightDecision({
			eventName,
			runAttempt,
			changedFilesVsBase,
			cacheHit,
			workflow
		});

		appendGithubOutputs({
			should_run: decision.shouldRun ? 'true' : 'false',
			reason: decision.reason
		});
		console.log(
			`[ci-preflight:${workflow}] should_run=${decision.shouldRun} — ${decision.reason}`
		);
		return;
	}

	console.error(`Mode inconnu : ${mode} (attendu: hash | eval)`);
	process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	runCli();
}
