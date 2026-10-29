/**
 * Seed Lulu — Initialisation de l'engagement LUMICC à l'état "juste après ingestion".
 *
 * Cet état prépare l'espace de travail immédiatement après l'audit ArcKit J0 :
 * - Les 7 sujets d'architecture sont cadrés au niveau L1_framed
 * - Les options contrastées et les critères d'évaluation sont pré-positionnés en draft
 * - Aucun débat n'a encore été figé (dialogue vierge)
 * - Aucun énoncé n'a été scellé (statements vierge)
 * - Prêt pour dérouler les 4 scénarios de délibération en direct :
 *     1. Cas nominal : Matrice, évaluation, arbitrage opposable L3
 *     2. Cas de controverse / débat d'experts : Objection critique et résolution
 *     3. Cas de contradiction réglementaire : Blocage Porte G3 (NIS2 / GSMA)
 *     4. Cas de capitalisation : Porte G4, qualification de portabilité et push LLMOps
 *
 * Usage :
 *   npm run seed:lulu
 *   npx tsx scripts/seed-lulu.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/lib/server/prismaFactory';
import { seedProject } from './seed';

async function main() {
	const repoRoot = process.cwd();
	const ingestedDir = resolve(repoRoot, 'examples/lumicc-ingested');
	const prisma = createPrismaClient();

	console.log(`========================================================================`);
	console.log(`🚀 [seed-lulu] Ensemencement LUMICC ("Lulu") — État "Juste Après Ingestion"`);
	console.log(`========================================================================`);

	if (!existsSync(ingestedDir)) {
		throw new Error(`Dossier introuvable : ${ingestedDir}`);
	}

	try {
		// 1. Ensemencement de l'espace projet lumicc-lot1-noc
		console.log(`[1/2] Chargement du projet et des 7 sujets L1_framed depuis examples/lumicc-ingested...`);
		await seedProject('examples/lumicc-ingested', prisma);

		// 2. Enregistrement de l'audit live J0 dans factorization_runs pour l'IHM
		console.log(`[2/2] Enregistrement de l'audit de dépouillement J0 (run_lumicc_live_j0)...`);
		const factorizationPath = resolve(ingestedDir, 'factorization-result.json');
		const rfpDocPath = resolve(ingestedDir, 'rfp-section4-noc.md');

		if (existsSync(factorizationPath) && existsSync(rfpDocPath)) {
			const factorized = JSON.parse(readFileSync(factorizationPath, 'utf-8'));
			const rfpSourceText = readFileSync(rfpDocPath, 'utf-8');
			const runId = 'run_lumicc_live_j0';

			await prisma.factorizationRun.upsert({
				where: { id: runId },
				create: {
					id: runId,
					inputSha256: 'lumicc_noc_section4_j0_live_claude',
					documentTitle: 'LUMICC Statement of Work – Lot 1 (Section 4 : NOC & Résilience)',
					model: 'claude-sonnet-5-5',
					engine: 'arckit-requirements-audit',
					status: 'ok',
					clauseCount: factorized.totalClauses || 92,
					subjectCount: factorized.subjects?.length || 7,
					result: JSON.stringify(factorized),
					sourceText: rfpSourceText,
					startedAt: new Date(),
					finishedAt: new Date()
				},
				update: {
					inputSha256: 'lumicc_noc_section4_j0_live_claude',
					documentTitle: 'LUMICC Statement of Work – Lot 1 (Section 4 : NOC & Résilience)',
					model: 'claude-sonnet-5-5',
					engine: 'arckit-requirements-audit',
					status: 'ok',
					clauseCount: factorized.totalClauses || 92,
					subjectCount: factorized.subjects?.length || 7,
					result: JSON.stringify(factorized),
					sourceText: rfpSourceText,
					finishedAt: new Date()
				}
			});
			console.log(`      ✅ FactorizationRun "${runId}" disponible dans la liste des audits.`);
		}

		console.log(`\n🎉 [seed-lulu] Terminé avec succès !`);
		console.log(`------------------------------------------------------------------------`);
		console.log(`Espace disponible : "LUMICC · Lot 1 (NOC, Cœur 5G PPDR & Résilience)"`);
		console.log(`ID : lumicc-lot1-noc`);
		console.log(`Accès IHM : http://localhost:5173/deliberation ou /workspaces`);
		console.log(`Comptes de démo :`);
		console.log(`  - Lead Architect   : admin@archinex.local (ou lead@archinex.local)`);
		console.log(`  - Infra Architect  : architect@archinex.local`);
		console.log(`  - Security Expert  : expert@archinex.local`);
		console.log(`========================================================================\n`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error('❌ [seed-lulu] Erreur :', err);
	process.exit(1);
});
