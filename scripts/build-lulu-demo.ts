import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toFactorizationResponse, type FactorizationResponse } from '../src/lib/server/ingest/arckitRequirementsPipeline';
import { createPrismaClient } from '../src/lib/server/prismaFactory';
import { seedProject } from './seed';

async function main() {
	const repoRoot = process.cwd();
	const evalResultPath = resolve(repoRoot, 'eval-results/resultat-1.json');
	const outPath = resolve(repoRoot, 'examples/lulu-noc/factorization-result.json');

	let factorized: FactorizationResponse;

	if (existsSync(evalResultPath)) {
		console.log(`[build-lulu-demo] Lecture de ${evalResultPath}...`);
		const raw = JSON.parse(readFileSync(evalResultPath, 'utf-8'));
		factorized = toFactorizationResponse({
			report: raw.report,
			subjects: raw.subjects,
			warnings: raw.warnings || [],
			modelUsed: raw.model || 'claude-sonnet-5-5'
		});
		writeFileSync(outPath, JSON.stringify(factorized, null, 2), 'utf-8');
		console.log(`[build-lulu-demo] ✅ Sauvegardé dans ${outPath} (${factorized.totalClauses} clauses)`);
	} else if (existsSync(outPath)) {
		console.log(`[build-lulu-demo] Utilisation du snapshot de référence ${outPath}...`);
		factorized = JSON.parse(readFileSync(outPath, 'utf-8')) as FactorizationResponse;
	} else {
		throw new Error(`Aucune source trouvée pour la factorisation : ni ${evalResultPath} ni ${outPath}`);
	}

	// Initialisation dans Prisma
	const prisma = createPrismaClient();
	try {
		console.log(`[build-lulu-demo] Ensemencement du projet lulu-noc...`);
		await seedProject('examples/lulu-noc', prisma);

		// Sauvegarde de l'exécution dans factorization_runs pour que l'IHM l'ait déjà sous la main
		const runId = 'run_lulu_live_j0';
		await prisma.factorizationRun.upsert({
			where: { id: runId },
			create: {
				id: runId,
				inputSha256: 'lulu_noc_section4_j0_live_claude',
				documentTitle: 'Lulu Statement of Work – Lot 1 (Section 4 : NOC & Résilience)',
				model: 'claude-sonnet-5-5',
				engine: 'arckit-requirements-audit',
				status: 'ok',
				clauseCount: factorized.totalClauses,
				subjectCount: factorized.subjects.length,
				result: JSON.stringify(factorized),
				sourceText: readFileSync(resolve(repoRoot, 'examples/lulu-noc/rfp-section4-noc.md'), 'utf-8'),
				startedAt: new Date(),
				finishedAt: new Date()
			},
			update: {
				inputSha256: 'lulu_noc_section4_j0_live_claude',
				documentTitle: 'Lulu Statement of Work – Lot 1 (Section 4 : NOC & Résilience)',
				model: 'claude-sonnet-5-5',
				engine: 'arckit-requirements-audit',
				status: 'ok',
				clauseCount: factorized.totalClauses,
				subjectCount: factorized.subjects.length,
				result: JSON.stringify(factorized),
				sourceText: readFileSync(resolve(repoRoot, 'examples/lulu-noc/rfp-section4-noc.md'), 'utf-8'),
				finishedAt: new Date()
			}
		});
		console.log(`[build-lulu-demo] ✅ FactorizationRun "${runId}" inséré dans dev.db`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error('[build-lulu-demo] Erreur :', err);
	process.exit(1);
});
