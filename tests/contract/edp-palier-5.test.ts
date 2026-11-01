import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { validateEdpPackage } from '../../src/lib/domain/edp/validateEdp.js';
import { checkIntentionPurity } from '../../src/lib/domain/edp/intentionPurity.js';
import { runOpaTest, resolveOpaBinary } from '../../src/lib/server/edp/opaRunner.js';
import { runMutationGate } from '../../scripts/edp-mutation-gate.js';
import { verifyEdp } from '../../src/lib/server/edp/edpVerify.js';
import { validateAndAcceptEdpDraft, resetDraftingMetricsLog, getDraftingMetricsLog } from '../../src/lib/server/edp/edpDrafting.js';
import EdpCard from '../../src/lib/components/edp/EdpCard.svelte';
import { render } from 'svelte/server';

describe('EDP Palier 5 Contract Tests (Issues #184, #186, #187, #188, #189)', () => {
  const adr015Dir = resolve(process.cwd(), 'edp/examples/adr015-security-zones');
  const edpPath = resolve(adr015Dir, 'edp.json');
  const policyPath = resolve(adr015Dir, 'policy.rego');
  const testPath = resolve(adr015Dir, 'policy_test.rego');
  const passInputPath = resolve(adr015Dir, 'mocks/pass.json');
  const failInput1Path = resolve(adr015Dir, 'mocks/fail_rule_1_cross_zone_isolation.json');
  const failInput2Path = resolve(adr015Dir, 'mocks/fail_rule_2_unsecured_oam.json');
  const insufficientInputPath = resolve(adr015Dir, 'mocks/insufficient_unresolved_ip.json');

  const opaPath = resolveOpaBinary() || undefined;

  beforeEach(() => {
    resetDraftingMetricsLog();
  });

  describe('Second EDP de Référence ADR-015 (Issue #187)', () => {
    it('valide le schéma structurel et la pureté d’intension de l’EDP ADR-015', () => {
      const edp = JSON.parse(readFileSync(edpPath, 'utf-8'));
      const schemaRes = validateEdpPackage(edp);
      expect(schemaRes.valid).toBe(true);

      const purityRes = checkIntentionPurity(edp.decision_context);
      expect(purityRes.pure).toBe(true);
      expect(purityRes.violations).toHaveLength(0);
    });

    it('exécute les tests OPA natifs avec 100% de réussite', async () => {
      const commonRego = resolve(process.cwd(), 'policies/lib/edp_common.rego');
      const res = await runOpaTest({
        policyFiles: [commonRego, policyPath, testPath],
        opaPath
      });

      expect(res.status).toBe('pass');
      expect(res.exitCode).toBe(0);
      expect((res.output as any[])).toHaveLength(6);
    });

    it('tue 100% des mutants injectés sur ADR-015 (garde de mutation)', async () => {
      const res = await runMutationGate({
        policyFile: policyPath,
        testFile: testPath,
        opaPath
      });

      expect(res.scorePercent).toBe(100);
      expect(res.survived).toBe(0);
      expect(res.killed).toBe(2);
    });

    it('évalue l’entrée conforme avec le verdict "compliant" (exit code 0)', async () => {
      const res = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: passInputPath,
        opaPath
      });

      expect(res.exitCode).toBe(0);
      expect(res.verdict).toBe('compliant');
      expect(res.evidenceBundle?.violations).toHaveLength(0);
    });

    it('rejette les flux non autorisés avec le verdict "violated" (exit code 1)', async () => {
      const res1 = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: failInput1Path,
        opaPath
      });

      expect(res1.exitCode).toBe(1);
      expect(res1.verdict).toBe('violated');
      expect(res1.evidenceBundle?.violations).toContain('rule_cross_zone_isolation');

      const res2 = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: failInput2Path,
        opaPath
      });

      expect(res2.exitCode).toBe(1);
      expect(res2.verdict).toBe('violated');
      expect(res2.evidenceBundle?.violations).toContain('rule_unsecured_oam');
    });

    it('retourne "insufficient_input" lorsqu’une IP ne résout vers aucune zone (exit code 2)', async () => {
      const res = await verifyEdp({
        edpInput: edpPath,
        inputPathOrData: insufficientInputPath,
        opaPath
      });

      expect(res.exitCode).toBe(2);
      expect(res.verdict).toBe('insufficient_input');
    });
  });

  describe('Chaîne d’Acceptation Déterministe pour Rédaction Assistée LLM (Issue #184)', () => {
    it('accepte une proposition valide et applique le statut "proposed" avec provenance traçable', async () => {
      const edp = JSON.parse(readFileSync(edpPath, 'utf-8'));
      const policyRego = readFileSync(policyPath, 'utf-8');
      const testRego = readFileSync(testPath, 'utf-8');
      const passMock = JSON.parse(readFileSync(passInputPath, 'utf-8'));

      const result = await validateAndAcceptEdpDraft(
        {
          edp,
          policyRego,
          testRego,
          mocks: [
            { name: 'pass', payload: passMock },
            { name: 'fail_rule_1_cross_zone_isolation', payload: JSON.parse(readFileSync(failInput1Path, 'utf-8')) },
            { name: 'fail_rule_2_unsecured_oam', payload: JSON.parse(readFileSync(failInput2Path, 'utf-8')) }
          ]
        },
        { opaPath }
      );

      expect(result.accepted).toBe(true);
      expect((result.finalPackage as any)?.metadata?.status).toBe('proposed');
      expect((result.finalPackage?.provenance as any)?.production_mode).toBe('llm-proposed-human-approved');
      expect(result.metrics.mutationScore).toBe(100);

      const logs = getDraftingMetricsLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].accepted).toBe(true);
      expect(logs[0].mutationScore).toBe(100);
    });

    it('refuse immédiatement une proposition prétendant être "validated" (Invariant II)', async () => {
      const edp = JSON.parse(readFileSync(edpPath, 'utf-8'));
      edp.metadata.status = 'validated'; // Violation Invariant II

      const result = await validateAndAcceptEdpDraft({
        edp,
        policyRego: readFileSync(policyPath, 'utf-8'),
        testRego: readFileSync(testPath, 'utf-8'),
        mocks: []
      });

      expect(result.accepted).toBe(false);
      expect(result.failedStage).toBe('invariant_check');
      expect(result.errors[0]).toContain('Invariant II');
    });

    it('rejette une proposition contenant des adresses IP dans l’intension (Invariant X)', async () => {
      const edp = JSON.parse(readFileSync(edpPath, 'utf-8'));
      edp.decision_context.decision = 'Interdiction de communiquer avec le serveur 192.168.1.100.'; // Fuite d'adresse IP concrète

      const result = await validateAndAcceptEdpDraft({
        edp,
        policyRego: readFileSync(policyPath, 'utf-8'),
        testRego: readFileSync(testPath, 'utf-8'),
        mocks: []
      });

      expect(result.accepted).toBe(false);
      expect(result.failedStage).toBe('intention_purity');
      expect(result.errors.some((e) => e.includes('192.168.1.100'))).toBe(true);
    });

    it('rejette une proposition dont les mutants survivent (manque d’auto-tests)', async () => {
      const edp = JSON.parse(readFileSync(edpPath, 'utf-8'));
      const policyRego = readFileSync(policyPath, 'utf-8');
      const truncatedTest = `package archinex.adr015_test
import rego.v1
import data.archinex.adr015
test_pass if { 1 == 1 }`;

      const result = await validateAndAcceptEdpDraft(
        {
          edp,
          policyRego,
          testRego: truncatedTest,
          mocks: []
        },
        { opaPath }
      );

      expect(result.accepted).toBe(false);
      expect(result.failedStage).toBe('mutation_gate');
      expect(result.metrics.survivedMutants).toBeGreaterThan(0);
    });
  });

  describe('Composant IHM EdpCard (Issue #186)', () => {
    const mockEdp = {
      metadata: {
        id: 'EDP-ADR015-01',
        title: 'Isolation Stricte des Zones de Sécurité NIS2 (ADR-015)',
        status: 'proposed' as const,
        revision: 1
      },
      provenance: {
        production_mode: 'human-authored'
      },
      lastVerdict: {
        verdict: 'compliant' as const,
        verified_at: '2026-10-29T11:00:00Z',
        violations: [],
        mutation_score: 100
      }
    };

    it('ne rend rien lorsque le drapeau expérimental est inactif (ARCHINEX_EXPERIMENTAL_EDP absent)', () => {
      const { html } = render(EdpCard, {
        props: {
          edp: mockEdp,
          isExperimentalEnabled: false,
          currentUserRole: 'Lead Architect'
        }
      });

      expect(html).not.toContain('edp-card');
      expect(html).not.toContain('EXPÉRIMENTAL');
    });

    it('affiche le bandeau expérimental, le statut et l’action de validation pour un rôle habilité', () => {
      const { html } = render(EdpCard, {
        props: {
          edp: mockEdp,
          isExperimentalEnabled: true,
          currentUserRole: 'Lead Architect'
        }
      });

      expect(html).toContain('EXPÉRIMENTAL');
      expect(html).toContain('Isolation Stricte des Zones de Sécurité');
      expect(html).toContain('Valider le Paquet (G3)');
    });

    it('masque le bouton de validation lorsque le statut est "stale" et affiche l’alerte de caducité', () => {
      const staleEdp = {
        ...mockEdp,
        metadata: { ...mockEdp.metadata, status: 'stale' as const },
        staleReason: 'L’ADR-015 source a été rétracté.'
      };

      const { html } = render(EdpCard, {
        props: {
          edp: staleEdp,
          isExperimentalEnabled: true,
          currentUserRole: 'Lead Architect'
        }
      });

      expect(html).not.toContain('Valider le Paquet (G3)');
      expect(html).toContain('Validation désactivée (paquet caduc)');
      expect(html).toContain('L’ADR-015 source a été rétracté.');
    });

    it('masque le bouton de validation pour un utilisateur avec rôle non habilité (Viewer)', () => {
      const { html } = render(EdpCard, {
        props: {
          edp: mockEdp,
          isExperimentalEnabled: true,
          currentUserRole: 'Viewer'
        }
      });

      expect(html).not.toContain('Valider le Paquet (G3)');
      expect(html).toContain('Rôle architecte requis pour valider');
    });
  });
});
