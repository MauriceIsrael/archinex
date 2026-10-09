/**
 * Évalue le pipeline d'audit des exigences sur un RFP, avec le modèle réellement configuré.
 *
 *   npm run eval:requirements -- examples/lumicc-noc/rfp-section4-noc.md \
 *       --reference examples/lumicc-noc/reference-analysis.json [--model claude-...] [--out resultat.json] [--report rapport.md]
 *
 * Le modèle vient de l'environnement (ANTHROPIC_API_KEY / LLM_PROVIDER / LLM_LOCAL_*), comme dans l'application.
 * Sans référence, seules les statistiques de répartition sont affichées.
 * --report écrit un rapport lisible : pourquoi ces sujets, ce que devient chaque autre clause, ce qu'il faut relire.
 * Code de sortie : 0 si l'intégrité est respectée, 1 sinon, 2 si le modèle était injoignable.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { shredRfpTextToClauses } from '../src/lib/domain/rfpConfrontation';
import { computeAuditMetrics, type AuditReference } from '../src/lib/domain/requirementsAuditEval';
import { buildAuditReportMarkdown } from '../src/lib/domain/requirementsAuditReport';
import { runRequirementsAudit } from '../src/lib/server/ingest/arckitRequirementsPipeline';
import { localLlmClient } from '../src/lib/server/llm/localLlmClient';

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

const rfpPath = process.argv[2];
if (!rfpPath || rfpPath.startsWith('--')) {
	console.error('Usage : npm run eval:requirements -- <rfp.md|txt> [--reference ref.json] [--model id] [--out fichier.json] [--report rapport.md]');
	process.exit(64);
}

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;

async function main() {
	const clauses = shredRfpTextToClauses(readFileSync(resolve(rfpPath), 'utf-8'));
	const model = arg('model') || localLlmClient.getDefaultModel();
	console.log(`RFP : ${rfpPath} — ${clauses.length} clauses`);
	console.log(`Modèle : ${model} (fournisseur : ${localLlmClient.getProvider()})`);

	const started = Date.now();
	const result = await runRequirementsAudit(clauses, { model });
	const seconds = (Date.now() - started) / 1000;

	console.log(`\nStatut : ${result.status} — ${seconds.toFixed(1)} s — ${result.subjects.length} sujets`);
	const r = result.report;
	console.log(
		`Répartition : ${r.deliberatedCount} à délibérer · ${r.evacuatedCount} évacuées · ${r.clarificationCount} à clarifier · ${r.toQualifyCount} à qualifier`
	);
	for (const w of result.warnings) console.log(`  ⚠ ${w}`);

	let integrityOk = true;
	const refPath = arg('reference');
	let metrics = null;
	if (refPath) {
		const reference = JSON.parse(readFileSync(resolve(refPath), 'utf-8')) as AuditReference;
		metrics = computeAuditMetrics(r.requirements, result.subjects, reference);
		integrityOk = metrics.integrityOk;

		console.log('\n── Comparaison avec l\'analyse de référence ──');
		console.log(`Rappel « à délibérer »        : ${pct(metrics.deliberateRecall)}`);
		console.log(`Faux négatifs dangereux       : ${metrics.dangerousFalseNegatives.length}${metrics.dangerousFalseNegatives.length ? ` → ${metrics.dangerousFalseNegatives.join(', ')}` : ''}`);
		console.log(`Référence laissée « à qualifier » : ${metrics.referenceLeftToQualify.length}`);
		console.log(`Rappel « à clarifier »        : ${pct(metrics.clarificationRecall)}`);
		console.log(`Taux d'évacuation             : ${pct(metrics.evacuationRate)}`);
		console.log('Points durs de référence :');
		for (const m of metrics.hardPointMatches) {
			console.log(
				`  ${m.referenceId.padEnd(11)} rappel ${pct(m.recall).padStart(5)} · précision ${pct(m.precision).padStart(5)} → ${m.bestSubjectName ?? '(aucun sujet correspondant)'}`
			);
		}
		console.log(`\nIntégrité (0 faux négatif dangereux, 0 évacuation bloquante) : ${integrityOk ? 'OK' : 'ÉCHEC'}`);
	}

	const reportOut = arg('report');
	if (reportOut) {
		mkdirSync(dirname(resolve(reportOut)), { recursive: true });
		writeFileSync(
			resolve(reportOut),
			buildAuditReportMarkdown({
				title: basename(rfpPath),
				model,
				status: result.status,
				generatedAt: new Date().toISOString(),
				requirements: r.requirements,
				subjects: result.subjects,
				warnings: result.warnings,
				metrics
			})
		);
		console.log(`Rapport lisible : ${reportOut}`);
	}

	const out = arg('out');
	if (out) {
		mkdirSync(dirname(resolve(out)), { recursive: true });
		writeFileSync(
			resolve(out),
			JSON.stringify({ rfp: rfpPath, model, seconds, status: result.status, warnings: result.warnings, metrics, subjects: result.subjects, report: r }, null, 2)
		);
		console.log(`Résultat détaillé : ${out}`);
	}

	if (result.status === 'unavailable') process.exit(2);
	process.exit(integrityOk ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
