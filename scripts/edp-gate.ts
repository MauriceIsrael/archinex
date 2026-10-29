import { resolve, dirname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { validateEdpPackage } from '../src/lib/domain/edp/validateEdp.js';
import { runOpaTest, resolveOpaBinary } from '../src/lib/server/edp/opaRunner.js';
import { runMutationGate } from './edp-mutation-gate.js';
import { verifyEdp } from '../src/lib/server/edp/edpVerify.js';

export interface EdpGateTarget {
  edpPath: string;
  policyPath: string;
  testPath: string;
  passInputPath: string;
  failInputPaths?: string[];
}

export interface EdpGateResult {
  edpId: string;
  schemaValid: boolean;
  opaTestPassed: boolean;
  mutationScore: number;
  allMutantsKilled: boolean;
  passVerifyVerdict: string;
  failVerifications: Array<{ input: string; verdict: string; expectedFail: boolean }>;
  gatePassed: boolean;
  errors: string[];
}

/**
 * Exécute la garde d'architecture complète pour un EDP cible (Issue #185).
 */
export async function runEdpArchitectureGate(target: EdpGateTarget): Promise<EdpGateResult> {
  const errors: string[] = [];
  const opaPath = resolveOpaBinary();

  if (!opaPath) {
    throw new Error('Binaire OPA introuvable pour edp-gate.');
  }

  // 1. Validation de schéma de l'EDP
  const edpRaw = JSON.parse(readFileSync(target.edpPath, 'utf-8'));
  const schemaRes = validateEdpPackage(edpRaw);
  const edpId = edpRaw.metadata?.id || 'UNKNOWN';

  if (!schemaRes.valid) {
    errors.push(...schemaRes.errors.map((e) => `[Schéma] ${e.path}: ${e.message}`));
    return {
      edpId,
      schemaValid: false,
      opaTestPassed: false,
      mutationScore: 0,
      allMutantsKilled: false,
      passVerifyVerdict: 'invalid_schema',
      failVerifications: [],
      gatePassed: false,
      errors
    };
  }

  // 2. Exécution d'OPA Test
  const commonRego = resolve(process.cwd(), 'policies/lib/edp_common.rego');
  const opaTestRes = await runOpaTest({
    policyFiles: [commonRego, target.policyPath, target.testPath],
    opaPath
  });

  const opaTestPassed = opaTestRes.status === 'pass';
  if (!opaTestPassed) {
    errors.push(`[OPA Test] ${opaTestRes.error || 'Échec des tests Rego'}`);
  }

  // 3. Exécution de la Garde de Mutation
  const mutationRes = await runMutationGate({
    policyFile: target.policyPath,
    testFile: target.testPath,
    additionalPolicyFiles: [commonRego],
    opaPath
  });

  const allMutantsKilled = mutationRes.survived === 0 && mutationRes.killed > 0;
  if (!allMutantsKilled) {
    errors.push(`[Mutation Gate] ${mutationRes.survived} mutant(s) ont survécu à la suite d’auto-test !`);
  }

  // 4. Vérification d'entrée conforme (pass)
  const passVerify = await verifyEdp({
    edpInput: target.edpPath,
    inputPathOrData: target.passInputPath,
    policyDir: dirname(target.policyPath),
    opaPath
  });

  const passVerifyPassed = passVerify.verdict === 'compliant' && passVerify.exitCode === 0;
  if (!passVerifyPassed) {
    errors.push(`[Verify Pass] Verdict inattendu : "${passVerify.verdict}" (attendu: "compliant")`);
  }

  // 5. Vérification des entrées défaillantes (fail)
  const failVerifications: EdpGateResult['failVerifications'] = [];
  if (target.failInputPaths) {
    for (const failInput of target.failInputPaths) {
      const failVerify = await verifyEdp({
        edpInput: target.edpPath,
        inputPathOrData: failInput,
        policyDir: dirname(target.policyPath),
        opaPath
      });

      const isViolated = failVerify.verdict === 'violated' && failVerify.exitCode === 1;
      failVerifications.push({
        input: failInput,
        verdict: failVerify.verdict,
        expectedFail: isViolated
      });

      if (!isViolated) {
        errors.push(`[Verify Fail] L'entrée ${failInput} n'a pas été rejetée avec "violated" (verdict: ${failVerify.verdict})`);
      }
    }
  }

  const gatePassed =
    schemaRes.valid &&
    opaTestPassed &&
    allMutantsKilled &&
    passVerifyPassed &&
    failVerifications.every((f) => f.expectedFail);

  return {
    edpId,
    schemaValid: schemaRes.valid,
    opaTestPassed,
    mutationScore: mutationRes.scorePercent,
    allMutantsKilled,
    passVerifyVerdict: passVerify.verdict,
    failVerifications,
    gatePassed,
    errors
  };
}

// Point d'entrée CLI
if (process.argv[1] && process.argv[1].endsWith('edp-gate.ts')) {
  console.log('🚪 [EDP Architecture Gate] Démarrage de la vérification CI...');

  const defaultTarget: EdpGateTarget = {
    edpPath: resolve(process.cwd(), 'edp/examples/adr012-baremetal/edp.json'),
    policyPath: resolve(process.cwd(), 'edp/examples/adr012-baremetal/policy.rego'),
    testPath: resolve(process.cwd(), 'edp/examples/adr012-baremetal/policy_test.rego'),
    passInputPath: resolve(process.cwd(), 'edp/examples/adr012-baremetal/mocks/pass.json'),
    failInputPaths: [
      resolve(process.cwd(), 'edp/examples/adr012-baremetal/mocks/fail_rule_1_missing_oob.json'),
      resolve(process.cwd(), 'edp/examples/adr012-baremetal/mocks/fail_rule_2_bmc_url_mismatch.json')
    ]
  };

  runEdpArchitectureGate(defaultTarget)
    .then((result) => {
      console.log('\n============================================================');
      console.log(`🛡️  Résultat de la Garde d'Architecture pour ${result.edpId}`);
      console.log('============================================================');
      console.log(`  1. Schéma JSON valide  : ${result.schemaValid ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`  2. Tests OPA natifs    : ${result.opaTestPassed ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`  3. Score de Mutation   : ${result.mutationScore}% (${result.allMutantsKilled ? '✅ 100% tué' : '❌ SURVIVANTS'})`);
      console.log(`  4. Entrée conforme     : ${result.passVerifyVerdict === 'compliant' ? '✅ COMPLIANT' : '❌ ' + result.passVerifyVerdict}`);
      console.log(`  5. Entrées défaillantes: ${result.failVerifications.every((f) => f.expectedFail) ? '✅ REJETÉES (VIOLATED)' : '❌ FAIL'}`);
      console.log('============================================================');

      if (result.errors.length > 0) {
        console.log('\nAnomalies détectées :');
        for (const err of result.errors) {
          console.log(`  ❌ ${err}`);
        }
      }

      if (result.gatePassed) {
        console.log('\n🎉 SUCCÈS : La porte d’architecture est franchie avec succès.');
        process.exit(0);
      } else {
        console.error('\n❌ ÉCHEC : La topologie ou l’oracle ne satisfait pas la garde d’architecture.');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('❌ Erreur d’exécution de la porte d’architecture :', err);
      process.exit(1);
    });
}
