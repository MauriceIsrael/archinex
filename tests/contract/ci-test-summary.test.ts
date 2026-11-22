import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('Outils de qualité CI : résumé des tests ignorés, couverture et bootstrap OPA (#394)', () => {
	it('scripts/ci-test-summary.mjs compte explicitement les tests ignorés, affiche la couverture et alimente GITHUB_STEP_SUMMARY', () => {
		const dir = mkdtempSync(join(tmpdir(), 'archinex-ci-summary-'));
		try {
			const vitestReportPath = join(dir, 'vitest-report.json');
			const coverageSummaryPath = join(dir, 'coverage-summary.json');
			const stepSummaryPath = join(dir, 'step-summary.md');

			writeFileSync(
				vitestReportPath,
				JSON.stringify({
					numTotalTests: 15,
					numPassedTests: 12,
					numFailedTests: 0,
					numPendingTests: 2,
					numTodoTests: 1,
					testResults: [
						{
							name: resolve(process.cwd(), 'tests/contract/fake-live.test.ts'),
							assertionResults: [
								{ status: 'passed' },
								{ status: 'pending' },
								{ status: 'pending' },
								{ status: 'todo' }
							]
						}
					]
				}),
				'utf-8'
			);

			writeFileSync(
				coverageSummaryPath,
				JSON.stringify({
					total: {
						statements: { pct: 94.5, covered: 189, total: 200 },
						branches: { pct: 80.0, covered: 40, total: 50 },
						functions: { pct: 99.0, covered: 99, total: 100 },
						lines: { pct: 94.5, covered: 189, total: 200 }
					}
				}),
				'utf-8'
			);

			const stdout = execFileSync(
				process.execPath,
				[resolve(process.cwd(), 'scripts/ci-test-summary.mjs'), vitestReportPath, coverageSummaryPath],
				{
					encoding: 'utf-8',
					env: { ...process.env, GITHUB_STEP_SUMMARY: stepSummaryPath }
				}
			);

			expect(stdout).toContain('| **Ignorés (skipped / todo)** | **3** |');
			expect(stdout).toContain('tests/contract/fake-live.test.ts');
			expect(stdout).toContain('94.50% (189/200)');

			const summaryFile = readFileSync(stepSummaryPath, 'utf-8');
			expect(summaryFile).toContain('Résumé des tests & couverture (Vitest)');
			expect(summaryFile).toContain('**3**');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('scripts/ensure-test-env.mjs échoue explicitement et lisiblement quand OPA est absent et le bootstrap désactivé', () => {
		const res = spawnSync(
			process.execPath,
			[resolve(process.cwd(), 'scripts/ensure-test-env.mjs')],
			{
				encoding: 'utf-8',
				env: {
					...process.env,
					OPA_PATH: resolve(process.cwd(), 'tools/bin/nonexistent-opa-for-test'),
					ARCHINEX_SKIP_OPA_BOOTSTRAP: '1'
				}
			}
		);

		expect(res.status).toBe(1);
		expect(res.stderr).toContain('Binaire OPA introuvable');
		expect(res.stderr).toContain('OPA_PATH');
	});
});
