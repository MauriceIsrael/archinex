#!/usr/bin/env node
/**
 * Produit un résumé lisible des résultats Vitest (passés, échoués, et IGNORÉS explicitement comptés)
 * ainsi que de la couverture v8 (`src/lib/domain/**`), et l'écrit dans `$GITHUB_STEP_SUMMARY` si défini.
 *
 * Usage :
 *   node scripts/ci-test-summary.mjs [vitest-report.json] [coverage-summary.json]
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const reportPath = resolve(process.cwd(), process.argv[2] || 'test-results/vitest-report.json');
const coveragePath = resolve(process.cwd(), process.argv[3] || 'coverage/coverage-summary.json');

const lines = [];
lines.push('## Résumé des tests & couverture (Vitest)');
lines.push('');

if (existsSync(reportPath)) {
	const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
	const passed = Number(report.numPassedTests ?? 0);
	const failed = Number(report.numFailedTests ?? 0);
	const pending = Number(report.numPendingTests ?? 0);
	const todo = Number(report.numTodoTests ?? 0);
	const total = Number(report.numTotalTests ?? passed + failed + pending + todo);
	const skippedTotal = pending + todo;

	lines.push('| Métrique | Valeur |');
	lines.push('|---|---:|');
	lines.push(`| Total | ${total} |`);
	lines.push(`| Réussis | ${passed} |`);
	lines.push(`| Échoués | ${failed} |`);
	lines.push(`| **Ignorés (skipped / todo)** | **${skippedTotal}** |`);
	lines.push('');

	// Liste détaillée des fichiers contenant des tests ignorés pour éviter tout « vert » trompeur
	const skippedFiles = [];
	for (const suite of report.testResults || []) {
		const skippedInSuite = (suite.assertionResults || []).filter(
			(t) => t.status === 'pending' || t.status === 'skipped' || t.status === 'todo'
		);
		if (skippedInSuite.length > 0) {
			const relPath = relative(process.cwd(), suite.name || 'inconnu').replace(/\\/g, '/');
			skippedFiles.push({ file: relPath, count: skippedInSuite.length });
		}
	}

	if (skippedFiles.length > 0) {
		lines.push('<details>');
		lines.push(
			`<summary>Détail des ${skippedTotal} test(s) ignoré(s) répartis sur ${skippedFiles.length} fichier(s)</summary>`
		);
		lines.push('');
		lines.push('| Fichier | Tests ignorés |');
		lines.push('|---|---:|');
		for (const item of skippedFiles.sort((a, b) => b.count - a.count)) {
			lines.push(`| \`${item.file}\` | ${item.count} |`);
		}
		lines.push('');
		lines.push('</details>');
		lines.push('');
	}
} else {
	lines.push(`> ⚠️ Rapport Vitest JSON introuvable (\`${reportPath}\`).`);
	lines.push('');
}

if (existsSync(coveragePath)) {
	const cov = JSON.parse(readFileSync(coveragePath, 'utf-8'));
	const t = cov.total || {};
	const fmt = (m) => (m && typeof m.pct === 'number' ? `${m.pct.toFixed(2)}% (${m.covered}/${m.total})` : 'n/a');

	lines.push('### Couverture `src/lib/domain/**` (v8)');
	lines.push('');
	lines.push('| Indicateur | Couverture |');
	lines.push('|---|---:|');
	lines.push(`| Instructions (Statements) | ${fmt(t.statements)} |`);
	lines.push(`| Branches | ${fmt(t.branches)} |`);
	lines.push(`| Fonctions | ${fmt(t.functions)} |`);
	lines.push(`| Lignes | ${fmt(t.lines)} |`);
	lines.push('');
} else {
	lines.push(`> ⚠️ Résumé de couverture introuvable (\`${coveragePath}\`).`);
	lines.push('');
}

const markdown = lines.join('\n');
console.log(markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf-8');
}
