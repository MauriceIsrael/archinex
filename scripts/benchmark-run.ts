#!/usr/bin/env node
/**
 * Point d'Entrée par Lot pour le Banc de Test Boîte Noire (Jalon J3).
 *
 * Usage :
 *   npx tsx scripts/benchmark-run.ts --rfp <chemin/vers/rfp.txt> --output <bundle.json> [--mode s2|s3] [--expert-fixture <expert.json>]
 *
 * Options :
 *   --rfp <path>              Fichier texte brut ou JSON du cas RFP
 *   --output <path>           Chemin où sauvegarder l'EngagementBundle scellé
 *   --mode <s2|s3>            Mode d'exécution (défaut: s2, ou s3 si --expert-fixture est spécifié)
 *   --expert-fixture <path>   Fichier JSON contenant les réponses d'experts annotées (pour S3)
 *   --case-id <id>            Identifiant du cas de test (défaut: extrait du fichier ou TC-001)
 *   --summary-out <path>      Fichier JSON pour le rapport de métriques (RunArtifact)
 *   --verify                  Vérifie immédiatement la validité du bundle scellé
 *   --help                    Affiche l'aide
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
	runBenchmarkCase,
	type RFPCaseInput,
	type ExpertActionFixture
} from '../src/lib/server/benchmark/benchmarkRunner';
import { verifyEngagementBundle } from '../src/lib/domain/bundleVerifier';

function getArg(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	return idx >= 0 && idx < process.argv.length - 1 ? process.argv[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

function printUsage() {
	console.log(`
Usage: npx tsx scripts/benchmark-run.ts --rfp <fichier> --output <fichier.json> [options]

Options :
  --rfp <path>              Chemin vers le texte du RFP ou le cas JSON (requis)
  --output <path>           Chemin de sortie pour l'EngagementBundle (requis)
  --mode <s2|s3>            Mode S2 (autonome) ou S3 (assisté)
  --expert-fixture <path>   Fixture de sollicitations d'experts rejouées (requis pour S3)
  --case-id <id>            Identifiant du cas de test (ex: TC-CONTRA-001)
  --summary-out <path>      Chemin où écrire le résumé d'exécution RunArtifact
  --verify                  Vérifie la conformité cryptographique du bundle
  --help                    Affiche cette aide
`);
}

async function main() {
	if (hasFlag('--help') || hasFlag('-h')) {
		printUsage();
		process.exit(0);
	}

	const rfpPath = getArg('--rfp');
	const outputPath = getArg('--output');
	const expertFixturePath = getArg('--expert-fixture');
	let modeArg = getArg('--mode')?.toLowerCase();

	if (!rfpPath || !outputPath) {
		console.error('❌ Erreur : --rfp et --output sont obligatoires.');
		printUsage();
		process.exit(1);
	}

	if (!modeArg) {
		modeArg = expertFixturePath ? 's3' : 's2';
	}

	if (modeArg !== 's2' && modeArg !== 's3') {
		console.error(`❌ Erreur : Mode inconnu "${modeArg}". Utilisez "s2" ou "s3".`);
		process.exit(1);
	}

	// 1. Chargement du RFP
	const resolvedRfpPath = resolve(rfpPath);
	const rawContent = readFileSync(resolvedRfpPath, 'utf-8');

	let caseInput: RFPCaseInput;
	try {
		const parsed = JSON.parse(rawContent);
		if (parsed.rfp_text) {
			caseInput = {
				id: getArg('--case-id') || parsed.id || basename(rfpPath, '.json'),
				title: parsed.title || parsed.id,
				rfp_text: parsed.rfp_text,
				category: parsed.category,
				language: parsed.language
			};
		} else {
			// Si le JSON ne contient pas rfp_text, traiter comme texte brut
			caseInput = {
				id: getArg('--case-id') || basename(rfpPath, '.json'),
				rfp_text: rawContent
			};
		}
	} catch {
		caseInput = {
			id: getArg('--case-id') || basename(rfpPath).replace(/\.[^/.]+$/, ''),
			rfp_text: rawContent
		};
	}

	// 2. Chargement des fixtures d'experts pour S3
	let expertFixtures: ExpertActionFixture[] = [];
	if (expertFixturePath) {
		const fixtureContent = readFileSync(resolve(expertFixturePath), 'utf-8');
		const parsedFixtures = JSON.parse(fixtureContent);
		expertFixtures = Array.isArray(parsedFixtures) ? parsedFixtures : parsedFixtures.fixtures ?? [];
	}

	console.log(`\n======================================================`);
	console.log(`🚀 Archinex Benchmark Runner — Mode ${modeArg.toUpperCase()}`);
	console.log(`======================================================`);
	console.log(`Cas        : ${caseInput.id}`);
	console.log(`RFP Source : ${rfpPath} (${caseInput.rfp_text.length} caractères)`);
	if (modeArg === 's3') {
		console.log(`Fixtures   : ${expertFixturePath ?? 'inline'} (${expertFixtures.length} action(s) d'expert)`);
	}

	// 3. Exécution du cas
	const result = await runBenchmarkCase(caseInput, {
		mode: modeArg as 's2' | 's3',
		expertFixtures
	});

	// 4. Sauvegarde de l'EngagementBundle
	const resolvedOut = resolve(outputPath);
	mkdirSync(dirname(resolvedOut), { recursive: true });
	writeFileSync(resolvedOut, JSON.stringify(result.bundle, null, 2), 'utf-8');

	// 5. Sauvegarde optionnelle du résumé RunArtifact
	const summaryOut = getArg('--summary-out');
	if (summaryOut) {
		const resolvedSummary = resolve(summaryOut);
		mkdirSync(dirname(resolvedSummary), { recursive: true });
		const artifactData = {
			system: result.system,
			case_id: result.case_id,
			iteration: result.iteration,
			declared_provisional: result.declared_provisional,
			questions: result.questions,
			conflicts: result.conflicts,
			expert_interactions: result.expert_interactions,
			expert_unanswered: result.expert_unanswered,
			wall_seconds: result.wall_seconds,
			checksum: result.bundle.checksum
		};
		writeFileSync(resolvedSummary, JSON.stringify(artifactData, null, 2), 'utf-8');
	}

	// 6. Vérification instrumentale stricte
	let isValid = true;
	if (hasFlag('--verify')) {
		const problems = verifyEngagementBundle(result.bundle);
		if (problems.length > 0) {
			console.error(`\n❌ Échec de la vérification instrumentale (${problems.length} problème(s)) :`);
			problems.forEach((p) => console.error(`  - [${p.code}] ${p.message}`));
			isValid = false;
		} else {
			console.log(`\n✅ Vérification instrumentale validée à 100% (Sceau: ${result.bundle.checksum})`);
		}
	}

	console.log(`\n------------------------------------------------------`);
	console.log(`Résultats d'exécution :`);
	console.log(`- Statut Provisoire     : ${result.declared_provisional ? 'OUI (unripe)' : 'NON (scellé complet)'}`);
	console.log(`- Conflits identifiés   : ${result.conflicts.length}`);
	console.log(`- Questions ouvertes    : ${result.questions.length}`);
	console.log(`- Actions expert jouées : ${result.expert_interactions}`);
	console.log(`- Sollicitations manquées: ${result.expert_unanswered}`);
	console.log(`- Temps de calcul       : ${result.wall_seconds} s`);
	console.log(`- Fichier généré        : ${resolvedOut}`);
	console.log(`------------------------------------------------------\n`);

	if (!isValid) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('❌ Erreur critique lors de l\'exécution du benchmark :', err);
	process.exit(1);
});
