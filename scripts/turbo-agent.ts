/**
 * Agent CLI « Mode Turbo » — Peuplement rapide L3/L4 -> EDP -> Nautobot -> HLD.
 *
 * Usage :
 *   npm run turbo:run -- --project-id <id>
 *   npx tsx scripts/turbo-agent.ts --project-id <id> [--dry-run] [--skip-nautobot] [--export-hld ./out]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runTurboModeForProject } from '../src/lib/server/turbo/turboAgent';
import { loadProjectHldDossier } from '../src/lib/server/projects/hldFragmentDb';
import {
	compileDossierWithDocumentEngine,
	DocumentEngineUnavailableError
} from '../src/lib/server/projects/documentEngineBridge';

interface CliArgs {
	projectId?: string;
	actorId?: string;
	dryRun: boolean;
	skipNautobot: boolean;
	exportHldDir?: string;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { dryRun: false, skipNautobot: false };
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === '--project-id' && argv[i + 1]) {
			args.projectId = argv[++i];
		} else if (token === '--actor-id' && argv[i + 1]) {
			args.actorId = argv[++i];
		} else if (token === '--dry-run') {
			args.dryRun = true;
		} else if (token === '--skip-nautobot') {
			args.skipNautobot = true;
		} else if (token === '--export-hld' && argv[i + 1]) {
			args.exportHldDir = argv[++i];
		}
	}
	return args;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.projectId) {
		console.error(
			'Usage : tsx scripts/turbo-agent.ts --project-id <id> [--actor-id <id>] [--dry-run] [--skip-nautobot] [--export-hld <dir>]'
		);
		process.exit(1);
	}

	console.log(`========================================================================`);
	console.log(`⚡ [Turbo Agent] Projet : ${args.projectId} ${args.dryRun ? '(DRY-RUN)' : ''}`);
	console.log(`========================================================================`);

	const report = await runTurboModeForProject({
		projectId: args.projectId,
		actorId: args.actorId,
		dryRun: args.dryRun,
		skipNautobot: args.skipNautobot
	});

	console.log(`\n📊 Résumé (${report.durationMs} ms) :`);
	console.log(`  - Sujets traités      : ${report.processedCount}/${report.totalSubjects}`);
	console.log(`  - Décisions L3        : ${report.l3DecidedCount}`);
	console.log(`  - Homologations L4    : ${report.l4SpecifiedCount}`);
	console.log(`  - EDP synthétisés     : ${report.edpSynthesizedCount}`);
	console.log(`  - Sujets sync Nautobot: ${report.nautobotSyncedSubjects}`);
	console.log(`  - Objets Nautobot     : devices=${report.nautobotTotals.devicesSynced}, prefixes=${report.nautobotTotals.prefixesSynced}, interfaces=${report.nautobotTotals.interfacesSynced}, ips=${report.nautobotTotals.ipAddressesSynced}, vrfs=${report.nautobotTotals.vrfsSynced}, circuits=${report.nautobotTotals.circuitsSynced}, tunnels=${report.nautobotTotals.vpnTunnelsSynced}, tags=${report.nautobotTotals.tagsSynced}`);
	console.log(`  - Erreurs             : ${report.errorsCount}`);

	for (const s of report.subjects) {
		const status = s.error ? `❌ ${s.error}` : `✅ ${s.initialLevel} -> ${s.finalLevel} (${s.selectionMethod})`;
		console.log(`  • [${s.subjectId}] ${s.subjectName} : ${status}`);
		for (const w of s.warnings) {
			console.log(`      ⚠️  ${w}`);
		}
	}

	if (args.exportHldDir && !args.dryRun) {
		const outDir = resolve(process.cwd(), args.exportHldDir);
		mkdirSync(outDir, { recursive: true });
		const dossier = await loadProjectHldDossier(args.projectId);
		const mdPath = resolve(outDir, `hld-dossier-${args.projectId}.md`);
		writeFileSync(mdPath, dossier.markdown, 'utf-8');
		console.log(`\n📄 HLD Markdown exporté : ${mdPath}`);

		try {
			const docx = await compileDossierWithDocumentEngine(dossier, 'docx');
			const docxPath = resolve(outDir, docx.filename);
			writeFileSync(docxPath, Buffer.from(docx.buffer));
			console.log(`📘 HLD DOCX exporté     : ${docxPath}`);
		} catch (err) {
			if (err instanceof DocumentEngineUnavailableError) {
				console.warn(`⚠️  Document Engine indisponible (${err.url}) — export DOCX ignoré.`);
			} else {
				console.warn(`⚠️  Échec export DOCX : ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	if (report.errorsCount > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('❌ Erreur fatale Turbo Agent :', err);
	process.exit(1);
});
