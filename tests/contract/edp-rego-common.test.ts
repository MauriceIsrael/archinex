import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { runOpaTest, runOpaEval, resolveOpaBinary } from '../../src/lib/server/edp/opaRunner.js';

describe('EDP Common Rego Library Contract (Issue #175)', () => {
  const localOpaPath = resolveOpaBinary();
  const libFile = resolve(process.cwd(), 'policies/lib/edp_common.rego');
  const testFile = resolve(process.cwd(), 'policies/lib/edp_common_test.rego');

  it('exécute et passe avec succès tous les tests unitaires natifs OPA de la bibliothèque commune', async () => {
    expect(localOpaPath).not.toBeNull();
    const result = await runOpaTest({
      policyFiles: [libFile, testFile],
      opaPath: localOpaPath!
    });

    expect(result.status).toBe('pass');
    expect(result.exitCode).toBe(0);
    expect(result.output).toBeDefined();
    expect(Array.isArray(result.output)).toBe(true);
  });

  it('valide l’extraction d’hôte exacte et prévient le faux positif de sous-chaîne (10.0.0.100 vs 10.0.0.10)', async () => {
    const result = await runOpaEval<{ host: string; matches: boolean }>({
      policyFiles: [libFile],
      query: '{ "host": data.archinex.edp.common.host_of("https://10.0.0.100/redfish"), "matches": data.archinex.edp.common.host_of("https://10.0.0.100/redfish") == "10.0.0.10" }',
      opaPath: localOpaPath!
    });

    expect(result.status).toBe('pass');
    expect(result.output?.host).toBe('10.0.0.100');
    expect(result.output?.matches).toBe(false);
  });

  it('retourne le verdict "insufficient_input" sur une entrée vide {}', async () => {
    const result = await runOpaEval<{ verdict: string }>({
      policyFiles: [libFile],
      query: '{ "verdict": data.archinex.edp.common.compute_verdict(true, [], ["k8s_manifests"]) }',
      opaPath: localOpaPath!
    });

    expect(result.status).toBe('pass');
    expect(result.output?.verdict).toBe('insufficient_input');
  });
});
