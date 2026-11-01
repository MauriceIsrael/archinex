import { resolve } from 'node:path';
import { verifyEdp } from '../src/lib/server/edp/edpVerify.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    }
  }

  return options;
}

async function main() {
  const opts = parseArgs();

  if (!opts.edp || !opts.input) {
    console.error('Usage : npx tsx scripts/edp-verify.ts --edp <path_to_edp.json> --input <path_to_refined_input.json> [--policy-dir <dir>] [--json]');
    process.exit(3);
  }

  const result = await verifyEdp({
    edpInput: resolve(process.cwd(), opts.edp),
    inputPathOrData: resolve(process.cwd(), opts.input),
    policyDir: opts['policy-dir'] ? resolve(process.cwd(), opts['policy-dir']) : undefined,
    ontologyFixturePath: opts.ontology ? resolve(process.cwd(), opts.ontology) : undefined
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n============================================================');
    console.log(`🔍 [EDP Verify] Résultat pour ${opts.edp}`);
    console.log('============================================================');
    console.log(`📌 Verdict     : ${result.verdict.toUpperCase()}`);
    console.log(`⏱️  Durée       : ${result.durationMs} ms`);
    console.log(`🔢 Code sortie : ${result.exitCode}`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Erreurs / Remarques :');
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }

    if (result.evidenceBundle) {
      console.log('\n📦 Lot de Preuves Scellé :');
      console.log(`  - EDP ID            : ${result.evidenceBundle.edp_id} (rev ${result.evidenceBundle.revision})`);
      console.log(`  - Empreinte Onto    : ${result.evidenceBundle.ontology_fingerprint.substring(0, 16)}...`);
      console.log(`  - SHA-256 Entrée    : ${result.evidenceBundle.input_sha256.substring(0, 16)}...`);
      console.log(`  - Version OPA       : ${result.evidenceBundle.opa_version}`);
      console.log(`  - Violations (${result.evidenceBundle.violations.length})   : ${result.evidenceBundle.violations.join(', ') || 'aucune'}`);
    }
    console.log('============================================================\n');
  }

  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error('❌ Erreur fatale dans edp verify :', err);
  process.exit(3);
});
