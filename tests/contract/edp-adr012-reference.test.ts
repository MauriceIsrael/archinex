import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEdpPackage } from '../../src/lib/domain/edp/validateEdp.js';
import { runOpaTest, runOpaEval, resolveOpaBinary } from '../../src/lib/server/edp/opaRunner.js';
import { validateFixturesContract } from '../../src/lib/domain/edp/validateFixturesContract.js';
import { runMutationGate } from '../../scripts/edp-mutation-gate.js';

function loadJson(relPath: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), relPath), 'utf-8'));
}

describe('EDP Reference ADR-012, Fixtures Contract & Mutation Gate (#172, #176, #180)', () => {
  const opaPath = resolveOpaBinary()!;
  const baseDir = 'edp/examples/adr012-baremetal';
  const commonFile = resolve(process.cwd(), 'policies/lib/edp_common.rego');
  const policyFile = resolve(process.cwd(), `${baseDir}/policy.rego`);
  const testFile = resolve(process.cwd(), `${baseDir}/policy_test.rego`);

  const rules = [
    'rule_oob_required',
    'rule_bmc_exact_match',
    'rule_role_valid',
    'rule_partitioned_interfaces',
    'rule_cluster_spec_non_empty',
    'rule_planned_status'
  ];

  describe('Conformité de l’EDP ADR-012 au Schéma (#168 & #180)', () => {
    it('valide avec succès le descripteur edp.json face au schéma officiel', () => {
      const edp = loadJson(`${baseDir}/edp.json`);
      const result = validateEdpPackage(edp);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('exécute et passe avec succès tous les tests Rego natifs de la suite', async () => {
      const testResult = await runOpaTest({
        policyFiles: [commonFile, policyFile, testFile],
        opaPath
      });

      expect(testResult.status).toBe('pass');
      expect(testResult.exitCode).toBe(0);
    });
  });

  describe('Évaluation des Mocks & Règle par Règle (#180)', () => {
    it('retourne le verdict "compliant" sur le mock conforme pass.json', async () => {
      const passMock = loadJson(`${baseDir}/mocks/pass.json`);
      const evalResult = await runOpaEval<any>({
        policyFiles: [commonFile, policyFile],
        query: 'data.archinex.edp.adr012.status',
        input: passMock,
        opaPath
      });

      expect(evalResult.status).toBe('pass');
      expect(evalResult.output.verdict).toBe('compliant');
      expect(evalResult.output.applicable).toBe(true);
      expect(evalResult.output.violations).toHaveLength(0);
    });

    const singleDefectMocks = [
      { file: 'fail_rule_1_missing_oob.json', expectedRule: 'rule_oob_required' },
      { file: 'fail_rule_2_bmc_url_mismatch.json', expectedRule: 'rule_bmc_exact_match' },
      { file: 'fail_rule_3_invalid_role.json', expectedRule: 'rule_role_valid' },
      { file: 'fail_rule_4_missing_partitioning.json', expectedRule: 'rule_partitioned_interfaces' },
      { file: 'fail_rule_5_empty_spec.json', expectedRule: 'rule_cluster_spec_non_empty' },
      { file: 'fail_rule_6_invalid_status.json', expectedRule: 'rule_planned_status' }
    ];

    it.each(singleDefectMocks)(
      'évalue $file avec le verdict "violated" et le défaut unique "$expectedRule"',
      async ({ file, expectedRule }) => {
        const mock = loadJson(`${baseDir}/mocks/${file}`);
        const evalResult = await runOpaEval<any>({
          policyFiles: [commonFile, policyFile],
          query: 'data.archinex.edp.adr012.status',
          input: mock,
          opaPath
        });

        expect(evalResult.status).toBe('pass');
        expect(evalResult.output.verdict).toBe('violated');
        expect(evalResult.output.violations).toEqual([expectedRule]);
      }
    );

    it('évalue le mock d’agrégation drift_multiple.json avec les violations cumulées', async () => {
      const driftMock = loadJson(`${baseDir}/mocks/drift_multiple.json`);
      const evalResult = await runOpaEval<any>({
        policyFiles: [commonFile, policyFile],
        query: 'data.archinex.edp.adr012.status',
        input: driftMock,
        opaPath
      });

      expect(evalResult.status).toBe('pass');
      expect(evalResult.output.verdict).toBe('violated');
      expect(evalResult.output.violations).toContain('rule_cluster_spec_non_empty');
      expect(evalResult.output.violations).toContain('rule_role_valid');
      expect(evalResult.output.violations).toContain('rule_planned_status');
    });
  });

  describe('Contrat des Fixtures & Adresses Réservées (#172)', () => {
    it('valide le contrat des fixtures (1 pass, 1 fail par règle, adresses RFC 5737)', () => {
      const passMock = loadJson(`${baseDir}/mocks/pass.json`);
      const mockFails = [
        { rule: 'rule_oob_required', name: 'fail_rule_1', content: loadJson(`${baseDir}/mocks/fail_rule_1_missing_oob.json`) },
        { rule: 'rule_bmc_exact_match', name: 'fail_rule_2', content: loadJson(`${baseDir}/mocks/fail_rule_2_bmc_url_mismatch.json`) },
        { rule: 'rule_role_valid', name: 'fail_rule_3', content: loadJson(`${baseDir}/mocks/fail_rule_3_invalid_role.json`) },
        { rule: 'rule_partitioned_interfaces', name: 'fail_rule_4', content: loadJson(`${baseDir}/mocks/fail_rule_4_missing_partitioning.json`) },
        { rule: 'rule_cluster_spec_non_empty', name: 'fail_rule_5', content: loadJson(`${baseDir}/mocks/fail_rule_5_empty_spec.json`) },
        { rule: 'rule_planned_status', name: 'fail_rule_6', content: loadJson(`${baseDir}/mocks/fail_rule_6_invalid_status.json`) }
      ];

      const evaluatedResults = [
        { name: 'fail_rule_1', violations: ['rule_oob_required'] },
        { name: 'fail_rule_2', violations: ['rule_bmc_exact_match'] },
        { name: 'fail_rule_3', violations: ['rule_role_valid'] },
        { name: 'fail_rule_4', violations: ['rule_partitioned_interfaces'] },
        { name: 'fail_rule_5', violations: ['rule_cluster_spec_non_empty'] },
        { name: 'fail_rule_6', violations: ['rule_planned_status'] }
      ];

      const result = validateFixturesContract({
        rules,
        mockPass: { name: 'pass.json', content: passMock },
        mockFails,
        evaluatedResults
      });

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.coverage.coveredRules).toBe(6);
      expect(result.coverage.missingRules).toHaveLength(0);
    });

    it('refuse une fixture contenant une adresse IP hors plages réservées (fuite de prod/privée)', () => {
      const dirtyMock = {
        devices: [{ oob_ip: '10.240.12.101' }] // IP privée du PoC historique
      };

      const result = validateFixturesContract({
        rules: ['rule_oob_required'],
        mockPass: { name: 'pass_dirty', content: dirtyMock },
        mockFails: [
          { rule: 'rule_oob_required', name: 'fail_clean', content: { oob_ip: '192.0.2.1' } }
        ]
      });

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.value === '10.240.12.101')).toBe(true);
    });

    it('refuse un mock fail qui déclenche deux règles simultanées (violation du défaut unique)', () => {
      const result = validateFixturesContract({
        rules: ['rule_1', 'rule_2'],
        mockPass: { name: 'pass', content: {} },
        mockFails: [
          { rule: 'rule_1', name: 'fail_multi', content: {} },
          { rule: 'rule_2', name: 'fail_2', content: {} }
        ],
        evaluatedResults: [
          { name: 'fail_multi', violations: ['rule_1', 'rule_2'] },
          { name: 'fail_2', violations: ['rule_2'] }
        ]
      });

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.reason.includes('défaut unique'))).toBe(true);
    });
  });

  describe('Garde de Mutation (#176)', () => {
    it('atteint un score de mutation de 6/6 (100% des mutants tués sur ADR-012)', async () => {
      const report = await runMutationGate({
        policyFile,
        testFile,
        additionalPolicyFiles: [commonFile],
        opaPath
      });

      expect(report.total).toBe(6);
      expect(report.killed).toBe(6);
      expect(report.survived).toBe(0);
      expect(report.scorePercent).toBe(100);
    });
  });
});
