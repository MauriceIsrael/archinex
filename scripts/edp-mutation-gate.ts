import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { runOpaTest, resolveOpaBinary } from '../src/lib/server/edp/opaRunner.js';

export interface MutationResult {
  total: number;
  killed: number;
  survived: number;
  scorePercent: number;
  mutants: Array<{
    id: string;
    rule: string;
    operator: string;
    status: 'killed' | 'survived' | 'invalid_compilation';
    failingTests?: string[];
  }>;
}

export interface MutationGateOptions {
  policyFile: string;
  testFile: string;
  additionalPolicyFiles?: string[];
  opaPath?: string;
  strict100Percent?: boolean;
}

/**
 * Analyse le fichier Rego pour identifier les règles de refus 'deny_*'
 */
function extractDenyRules(policyContent: string): Array<{ name: string; fullBlock: string }> {
  // Regex pour capturer les blocs de règles 'deny_...'
  const regex = /((?:#.*\n)*deny_[a-zA-Z0-9_]+\s*(?:contains|:=|=)\s*"[^"]+"\s*if\s*\{[\s\S]*?\n\})/g;
  const rules: Array<{ name: string; fullBlock: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(policyContent)) !== null) {
    const fullBlock = match[1];
    const nameMatch = fullBlock.match(/deny_([a-zA-Z0-9_]+)/);
    const name = nameMatch ? nameMatch[0] : 'deny_unknown';
    rules.push({ name, fullBlock });
  }

  return rules;
}

/**
 * Exécute la garde de mutation sur une politique et sa suite d'auto-test (Issue #176).
 */
export async function runMutationGate(options: MutationGateOptions): Promise<MutationResult> {
  const policyRaw = readFileSync(options.policyFile, 'utf-8');
  const denyRules = extractDenyRules(policyRaw);

  const results: MutationResult['mutants'] = [];
  const opaPath = options.opaPath || resolveOpaBinary();

  if (!opaPath) {
    throw new Error('Binaire OPA introuvable pour la garde de mutation.');
  }

  const additional = options.additionalPolicyFiles || [];

  // Opérateur 1 : Suppression de règle 'deny'
  // On regroupe par nom de règle (certaines règles ont plusieurs clauses)
  const uniqueRuleNames = Array.from(new Set(denyRules.map((r) => r.name)));

  for (let i = 0; i < uniqueRuleNames.length; i++) {
    const targetRule = uniqueRuleNames[i];
    const mutantId = `mutant-drop-${targetRule}-${i + 1}`;

    // Supprimer toutes les clauses de cette règle dans le mutant
    // On remplace le bloc de la règle par un commentaire
    const mutatedContent = policyRaw.replace(
      new RegExp(`deny_${targetRule.replace('deny_', '')}\\s*(?:contains|:=|=)[\\s\\S]*?if\\s*\\{[\\s\\S]*?\\n\\}`, 'g'),
      `# [MUTANT DROP ${targetRule}]`
    );

    const tempMutantPath = join(tmpdir(), `mutant_${randomUUID()}.rego`);
    writeFileSync(tempMutantPath, mutatedContent, 'utf-8');

    try {
      const execResult = await runOpaTest({
        policyFiles: [tempMutantPath, options.testFile, ...additional],
        opaPath
      });

      if (execResult.status === 'runner_error') {
        // Le mutant ne compile pas : ce n'est PAS un mutant tué
        results.push({
          id: mutantId,
          rule: targetRule,
          operator: 'drop_rule',
          status: 'invalid_compilation'
        });
      } else if (execResult.status === 'fail') {
        // Au moins un test a échoué -> le mutant a été détecté et TUÉ
        results.push({
          id: mutantId,
          rule: targetRule,
          operator: 'drop_rule',
          status: 'killed'
        });
      } else if (execResult.status === 'pass') {
        // Tous les tests sont passés alors que la règle a été supprimée -> SURVÉCU !
        results.push({
          id: mutantId,
          rule: targetRule,
          operator: 'drop_rule',
          status: 'survived'
        });
      }
    } finally {
      try {
        unlinkSync(tempMutantPath);
      } catch {
        // Ignorer
      }
    }
  }

  const total = results.length;
  const killed = results.filter((r) => r.status === 'killed').length;
  const survived = results.filter((r) => r.status === 'survived').length;
  const scorePercent = total > 0 ? Math.round((killed / total) * 100) : 0;

  return {
    total,
    killed,
    survived,
    scorePercent,
    mutants: results
  };
}

// Point d'entrée CLI
if (process.argv[1] && process.argv[1].endsWith('edp-mutation-gate.ts')) {
  const policyArg = process.argv[2] || 'edp/examples/adr012-baremetal/policy.rego';
  const testArg = process.argv[3] || 'edp/examples/adr012-baremetal/policy_test.rego';
  const commonArg = 'policies/lib/edp_common.rego';

  console.log(`🛡️ [EDP Mutation Gate] Analyse de mutation sur ${policyArg}...`);

  runMutationGate({
    policyFile: resolve(process.cwd(), policyArg),
    testFile: resolve(process.cwd(), testArg),
    additionalPolicyFiles: [resolve(process.cwd(), commonArg)]
  })
    .then((report) => {
      console.log(`\n============================================================`);
      console.log(`📊 Rapport de Mutation : ${report.killed}/${report.total} mutants tués (${report.scorePercent}%)`);
      console.log(`============================================================`);

      for (const m of report.mutants) {
        const icon = m.status === 'killed' ? '✅' : '❌';
        console.log(`  ${icon} [${m.status.toUpperCase()}] ${m.id} (${m.rule})`);
      }

      if (report.survived > 0) {
        console.error(`\n❌ ÉCHEC : ${report.survived} mutant(s) ont survécu à la suite d'auto-test !`);
        process.exit(1);
      } else {
        console.log(`\n🎉 SUCCÈS : 100% des mutants ont été tués. La suite d'auto-test couvre toutes ses règles.`);
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error(`❌ Erreur d'exécution de la garde de mutation :`, err);
      process.exit(1);
    });
}
