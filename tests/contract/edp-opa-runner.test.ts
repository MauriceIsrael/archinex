import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  checkOpaVersion,
  runOpaEval,
  runOpaTest,
  resolveOpaBinary
} from '../../src/lib/server/edp/opaRunner.js';

describe('EDP OPA Executor Contract (Issue #171)', () => {
  const localOpaPath = resolveOpaBinary();

  describe('Disponibilité et Détection de Version', () => {
    it('détecte le binaire officiel OPA 1.21.4 avec support Rego v1', async () => {
      expect(localOpaPath).not.toBeNull();
      const versionInfo = await checkOpaVersion(localOpaPath!);
      expect(versionInfo.available).toBe(true);
      expect(versionInfo.regoV1).toBe(true);
      expect(versionInfo.version).toBe('1.21.4');
    });

    it('retourne le statut "unavailable" (JAMAIS "pass") si le binaire est absent', async () => {
      const nonExistentPath = resolve(process.cwd(), 'tools/bin/non-existent-opa-binary');
      const testResult = await runOpaTest({
        policyFiles: ['dummy.rego'],
        opaPath: nonExistentPath
      });

      expect(testResult.status).toBe('unavailable');
      expect(testResult.status).not.toBe('pass');
      expect(testResult.error).toContain('Binaire OPA indisponible');

      const evalResult = await runOpaEval({
        query: '1 + 1',
        opaPath: nonExistentPath
      });
      expect(evalResult.status).toBe('unavailable');
      expect(evalResult.status).not.toBe('pass');
    });
  });

  describe('Résilience face aux Erreurs et Délais (Faux Binaire & Défaillances)', () => {
    it('gère le dépassement du délai maximal avec le statut typé "runner_error"', async () => {
      // Évaluation avec un timeout microscopique de 1ms pour déclencher un dépassement garanti
      const result = await runOpaEval({
        query: 'x := [i | i := numbers.range(1, 1000000)]',
        timeoutMs: 1,
        opaPath: localOpaPath!
      });

      expect(result.status).toBe('runner_error');
      expect(result.error).toContain('délai');
    });

    it('retourne runner_error en cas de syntaxe Rego invalide', async () => {
      const result = await runOpaEval({
        query: 'this is completely invalid rego syntax %%%',
        opaPath: localOpaPath!
      });

      expect(result.status).toBe('runner_error');
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('Déterminisme et Évaluation OPA', () => {
    it('produit des sorties strictement identiques pour deux exécutions identiques', async () => {
      const evalOptions = {
        query: 'data.result',
        data: { result: { compliant: true, score: 42 } },
        opaPath: localOpaPath!
      };

      const run1 = await runOpaEval(evalOptions);
      const run2 = await runOpaEval(evalOptions);

      expect(run1.status).toBe('pass');
      expect(run2.status).toBe('pass');
      expect(run1.output).toEqual(run2.output);
      expect(run1.output).toEqual({ compliant: true, score: 42 });
    });
  });
});
