import { describe, it, expect } from 'vitest';
import {
	isDocOrChangelogOnlyPath,
	computeCodeTreeSignature,
	evaluatePreflightDecision
} from '../../scripts/ci-preflight.mjs';

describe('Contract: Pré-vol CI (ci-preflight.mjs)', () => {
	it('identifie correctement les fichiers purement documentaires / changelog.d', () => {
		expect(isDocOrChangelogOnlyPath('changelog.d/feat-xyz.md', 'verify')).toBe(true);
		expect(isDocOrChangelogOnlyPath('CHANGELOG.md', 'verify')).toBe(true);
		expect(isDocOrChangelogOnlyPath('USER_GUIDE.md', 'verify')).toBe(true);
		expect(isDocOrChangelogOnlyPath('ARCHITECTURE.md', 'verify')).toBe(true);
		expect(isDocOrChangelogOnlyPath('docs/adr/0001.md', 'verify')).toBe(true);
		expect(isDocOrChangelogOnlyPath('.github/pull_request_template.md', 'verify')).toBe(true);

		// Les 3 docs vérifiées par persistence-isolation-guard.test.ts restent surveillées par verify, mais pas hub-live
		expect(isDocOrChangelogOnlyPath('docs/backup-restore.md', 'verify')).toBe(false);
		expect(isDocOrChangelogOnlyPath('docs/fresh-install.md', 'verify')).toBe(false);
		expect(isDocOrChangelogOnlyPath('docs/developer-guide.md', 'verify')).toBe(false);
		expect(isDocOrChangelogOnlyPath('docs/developer-guide.md', 'hub-live')).toBe(true);

		// Le code, les tests, les fixtures et la conf CI déclenchent toujours la CI
		expect(isDocOrChangelogOnlyPath('src/lib/domain/cascade.ts', 'verify')).toBe(false);
		expect(isDocOrChangelogOnlyPath('tests/fixtures/rfp/sample.md', 'verify')).toBe(false);
		expect(isDocOrChangelogOnlyPath('examples/lulu-noc/rfp-section4-noc.md', 'verify')).toBe(false);
		expect(isDocOrChangelogOnlyPath('.github/workflows/verify.yml', 'verify')).toBe(false);
	});

	it('produit la même empreinte code_hash quand seul changelog.d/ ou USER_GUIDE.md change', () => {
		const baseTree = [
			'100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tsrc/app.ts',
			'100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\tCHANGELOG.md',
			'100644 cccccccccccccccccccccccccccccccccccccccc 0\tUSER_GUIDE.md',
			'100644 dddddddddddddddddddddddddddddddddddddddd 0\tchangelog.d/feat-1.md'
		].join('\n');

		const docEditedTree = [
			'100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tsrc/app.ts',
			'100644 1111111111111111111111111111111111111111 0\tCHANGELOG.md',
			'100644 2222222222222222222222222222222222222222 0\tUSER_GUIDE.md',
			'100644 3333333333333333333333333333333333333333 0\tchangelog.d/feat-2.md'
		].join('\n');

		const codeEditedTree = [
			'100644 9999999999999999999999999999999999999999 0\tsrc/app.ts',
			'100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\tCHANGELOG.md'
		].join('\n');

		expect(computeCodeTreeSignature(baseTree, 'verify')).toBe(
			computeCodeTreeSignature(docEditedTree, 'verify')
		);
		expect(computeCodeTreeSignature(baseTree, 'verify')).not.toBe(
			computeCodeTreeSignature(codeEditedTree, 'verify')
		);
	});

	it('court-circuite uniquement sur PR doc-only ou PR avec cache vert et tentative 1', () => {
		expect(
			evaluatePreflightDecision({
				eventName: 'push',
				runAttempt: '1',
				changedFilesVsBase: ['CHANGELOG.md'],
				cacheHit: true,
				workflow: 'verify'
			}).shouldRun
		).toBe(true);

		expect(
			evaluatePreflightDecision({
				eventName: 'pull_request',
				runAttempt: '2',
				changedFilesVsBase: ['CHANGELOG.md'],
				cacheHit: true,
				workflow: 'verify'
			}).shouldRun
		).toBe(true);

		expect(
			evaluatePreflightDecision({
				eventName: 'pull_request',
				runAttempt: '1',
				changedFilesVsBase: ['changelog.d/feat-x.md', 'USER_GUIDE.md'],
				cacheHit: false,
				workflow: 'verify'
			}).shouldRun
		).toBe(false);

		expect(
			evaluatePreflightDecision({
				eventName: 'pull_request',
				runAttempt: '1',
				changedFilesVsBase: ['src/lib/domain/cascade.ts', 'changelog.d/feat-x.md'],
				cacheHit: true,
				workflow: 'verify'
			}).shouldRun
		).toBe(false);

		expect(
			evaluatePreflightDecision({
				eventName: 'pull_request',
				runAttempt: '1',
				changedFilesVsBase: ['src/lib/domain/cascade.ts', 'changelog.d/feat-x.md'],
				cacheHit: false,
				workflow: 'verify'
			}).shouldRun
		).toBe(true);
	});
});
