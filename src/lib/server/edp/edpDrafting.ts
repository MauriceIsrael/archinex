import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { validateEdpPackage } from '../../domain/edp/validateEdp.js';
import { checkIntentionPurity } from '../../domain/edp/intentionPurity.js';
import { checkOntologyBindings, type OntologyCatalog } from './ontologyClient.js';
import { validateFixturesContract } from '../../domain/edp/validateFixturesContract.js';
import { runOpaTest, resolveOpaBinary } from './opaRunner.js';
import { runMutationGate } from '../../../../scripts/edp-mutation-gate.js';

export interface EdpDraftProposal {
  edp: Record<string, any>;
  policyRego: string;
  testRego: string;
  mocks: Array<{
    name: string;
    payload: Record<string, unknown>;
  }>;
}

export interface DraftingEvaluationResult {
  accepted: boolean;
  failedStage?: 'schema' | 'intention_purity' | 'ontology_bindings' | 'fixtures_contract' | 'opa_test' | 'mutation_gate' | 'invariant_check';
  errors: string[];
  finalPackage?: Record<string, unknown>;
  metrics: {
    durationMs: number;
    mutationScore: number;
    killedMutants: number;
    survivedMutants: number;
  };
}

export interface DraftingLogEntry {
  timestamp: string;
  edpId: string;
  accepted: boolean;
  failedStage?: string;
  durationMs: number;
  mutationScore: number;
  errorsCount: number;
}

// Registre des métriques de génération en mémoire pour évaluation #189
const DRAFTING_METRICS_LOG: DraftingLogEntry[] = [];

export function getDraftingMetricsLog(): readonly DraftingLogEntry[] {
  return [...DRAFTING_METRICS_LOG];
}

export function resetDraftingMetricsLog(): void {
  DRAFTING_METRICS_LOG.length = 0;
}

export interface ValidateDraftOptions {
  ontologyCatalog?: OntologyCatalog;
  opaPath?: string;
  enforcePureInvariantII?: boolean;
}

/**
 * Chaîne d'acceptation déterministe pour la rédaction assistée d'EDP par LLM (Issue #184).
 * Applique strictement la porte d'architecture AVANT toute présentation à l'humain.
 * Aucun EDP ne peut atteindre le statut 'validated' sans validation humaine explicite (Invariant II).
 */
export async function validateAndAcceptEdpDraft(
  proposal: EdpDraftProposal,
  options: ValidateDraftOptions = {}
): Promise<DraftingEvaluationResult> {
  const start = Date.now();
  const errors: string[] = [];

  const edp = JSON.parse(JSON.stringify(proposal.edp)); // Clone défensif
  const edpId = edp.metadata?.id || 'PROPOSED-DRAFT';

  // Invariant II : Vérification que le draft n'a pas été pré-marqué 'validated'
  if (edp.metadata?.status === 'validated') {
    errors.push('Violation Invariant II : Un EDP généré par LLM ne peut pas revendiquer le statut "validated" sans validation humaine.');
    const res: DraftingEvaluationResult = {
      accepted: false,
      failedStage: 'invariant_check',
      errors,
      metrics: { durationMs: Date.now() - start, mutationScore: 0, killedMutants: 0, survivedMutants: 0 }
    };
    DRAFTING_METRICS_LOG.push({
      timestamp: new Date().toISOString(),
      edpId,
      accepted: false,
      failedStage: 'invariant_check',
      durationMs: res.metrics.durationMs,
      mutationScore: 0,
      errorsCount: errors.length
    });
    return res;
  }

  // Étape 1 : Validation de schéma JSON formel (#168)
  const schemaRes = validateEdpPackage(edp);
  if (!schemaRes.valid) {
    errors.push(...schemaRes.errors.map((e) => `[Schéma] ${e.path}: ${e.message}`));
    const res: DraftingEvaluationResult = {
      accepted: false,
      failedStage: 'schema',
      errors,
      metrics: { durationMs: Date.now() - start, mutationScore: 0, killedMutants: 0, survivedMutants: 0 }
    };
    DRAFTING_METRICS_LOG.push({
      timestamp: new Date().toISOString(),
      edpId,
      accepted: false,
      failedStage: 'schema',
      durationMs: res.metrics.durationMs,
      mutationScore: 0,
      errorsCount: errors.length
    });
    return res;
  }

  // Étape 2 : Contrôle de pureté de l'intension (#169)
  const purityRes = checkIntentionPurity(edp.decision_context);
  if (!purityRes.pure) {
    errors.push(...purityRes.violations.map((v) => `[Pureté Intension] ${v.field}: ${v.reason} ("${v.value}")`));
    const res: DraftingEvaluationResult = {
      accepted: false,
      failedStage: 'intention_purity',
      errors,
      metrics: { durationMs: Date.now() - start, mutationScore: 0, killedMutants: 0, survivedMutants: 0 }
    };
    DRAFTING_METRICS_LOG.push({
      timestamp: new Date().toISOString(),
      edpId,
      accepted: false,
      failedStage: 'intention_purity',
      durationMs: res.metrics.durationMs,
      mutationScore: 0,
      errorsCount: errors.length
    });
    return res;
  }

  // Étape 3 : Contrôle des liaisons d'ontologie (#173)
  if (options.ontologyCatalog && edp.decision_context?.ontology_bindings) {
    const bindingsRes = checkOntologyBindings(edp.decision_context.ontology_bindings, options.ontologyCatalog);
    if (!bindingsRes.valid) {
      errors.push(...bindingsRes.errors.map((e) => `[Liaisons Ontologie] ${e}`));
      const res: DraftingEvaluationResult = {
        accepted: false,
        failedStage: 'ontology_bindings',
        errors,
        metrics: { durationMs: Date.now() - start, mutationScore: 0, killedMutants: 0, survivedMutants: 0 }
      };
      DRAFTING_METRICS_LOG.push({
        timestamp: new Date().toISOString(),
        edpId,
        accepted: false,
        failedStage: 'ontology_bindings',
        durationMs: res.metrics.durationMs,
        mutationScore: 0,
        errorsCount: errors.length
      });
      return res;
    }
  }

  // Étape 4 : Validation du contrat des fixtures (#172)
  if (proposal.mocks && proposal.mocks.length > 0) {
    const declaredRules = (edp.verification_oracle?.mutation_manifest?.mutants || []).map((m: any) => m.target_rule || m.rule || m.id);
    const passCandidate = proposal.mocks.find((m) => m.name.toLowerCase().includes('pass')) || proposal.mocks[0];
    const failCandidates = proposal.mocks.filter((m) => m !== passCandidate);

    const fixturesRes = validateFixturesContract({
      rules: declaredRules,
      mockPass: { name: passCandidate.name, content: passCandidate.payload },
      mockFails: failCandidates.map((fc, idx) => ({
        rule: (fc as any).target_rule || declaredRules.find((r: string) => fc.name.includes(r)) || declaredRules[idx] || 'rule_unknown',
        name: fc.name,
        content: fc.payload
      }))
    });

    if (!fixturesRes.valid) {
      errors.push(...fixturesRes.violations.map((v) => `[Contrat Fixtures] ${v.fixture}: ${v.reason}`));
      const res: DraftingEvaluationResult = {
        accepted: false,
        failedStage: 'fixtures_contract',
        errors,
        metrics: { durationMs: Date.now() - start, mutationScore: 0, killedMutants: 0, survivedMutants: 0 }
      };
      DRAFTING_METRICS_LOG.push({
        timestamp: new Date().toISOString(),
        edpId,
        accepted: false,
        failedStage: 'fixtures_contract',
        durationMs: res.metrics.durationMs,
        mutationScore: 0,
        errorsCount: errors.length
      });
      return res;
    }
  }

  // Étape 5 & 6 : Exécution OPA Test et Mutation Gate sur fichiers temporaires isolés (#171, #176)
  const opaPath = options.opaPath || resolveOpaBinary();
  if (!opaPath) {
    errors.push('Binaire OPA introuvable pour la chaîne d’acceptation déterministe.');
    return {
      accepted: false,
      failedStage: 'opa_test',
      errors,
      metrics: { durationMs: Date.now() - start, mutationScore: 0, killedMutants: 0, survivedMutants: 0 }
    };
  }

  const tempDir = join(tmpdir(), `archinex-draft-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  const policyFile = join(tempDir, 'policy.rego');
  const testFile = join(tempDir, 'policy_test.rego');

  writeFileSync(policyFile, proposal.policyRego, 'utf-8');
  writeFileSync(testFile, proposal.testRego, 'utf-8');

  try {
    const commonRego = resolve(process.cwd(), 'policies/lib/edp_common.rego');
    const policyFilesToTest = existsSync(commonRego) ? [commonRego, policyFile, testFile] : [policyFile, testFile];

    // Exécution OPA Test (#171)
    const opaTestRes = await runOpaTest({
      policyFiles: policyFilesToTest,
      opaPath
    });

    if (opaTestRes.status !== 'pass') {
      errors.push(`[OPA Test] ${opaTestRes.error || 'Échec de la suite d’auto-test Rego'}`);
      const res: DraftingEvaluationResult = {
        accepted: false,
        failedStage: 'opa_test',
        errors,
        metrics: { durationMs: Date.now() - start, mutationScore: 0, killedMutants: 0, survivedMutants: 0 }
      };
      DRAFTING_METRICS_LOG.push({
        timestamp: new Date().toISOString(),
        edpId,
        accepted: false,
        failedStage: 'opa_test',
        durationMs: res.metrics.durationMs,
        mutationScore: 0,
        errorsCount: errors.length
      });
      return res;
    }

    // Exécution Garde de Mutation (#176)
    const mutationRes = await runMutationGate({
      policyFile,
      testFile,
      additionalPolicyFiles: existsSync(commonRego) ? [commonRego] : [],
      opaPath
    });

    if (mutationRes.killed !== mutationRes.total || mutationRes.survived > 0 || mutationRes.total === 0) {
      errors.push(`[Mutation Gate] Échec : ${mutationRes.survived} mutant(s) survivant(s) sur ${mutationRes.total} (Score: ${mutationRes.scorePercent}%)`);
      const res: DraftingEvaluationResult = {
        accepted: false,
        failedStage: 'mutation_gate',
        errors,
        metrics: {
          durationMs: Date.now() - start,
          mutationScore: mutationRes.scorePercent,
          killedMutants: mutationRes.killed,
          survivedMutants: mutationRes.survived
        }
      };
      DRAFTING_METRICS_LOG.push({
        timestamp: new Date().toISOString(),
        edpId,
        accepted: false,
        failedStage: 'mutation_gate',
        durationMs: res.metrics.durationMs,
        mutationScore: mutationRes.scorePercent,
        errorsCount: errors.length
      });
      return res;
    }

    // Toutes les étapes déterministes ont été franchies avec succès
    // Scellement du paquet de sortie avec statut obligatoire 'proposed' et provenance 'llm-proposed-human-approved' sans validateur
    edp.metadata.status = 'proposed';
    edp.provenance = {
      production_mode: 'llm-proposed-human-approved',
      created_at: new Date().toISOString()
      // Pas de validator tant qu'un humain n'a pas validé
    };

    // Mise à jour du hash SHA-256 de la politique
    const policySha256 = createHash('sha256').update(proposal.policyRego).digest('hex');
    if (edp.verification_oracle?.policy_files?.[0]) {
      edp.verification_oracle.policy_files[0].sha256 = policySha256;
    }

    const durationMs = Date.now() - start;
    const res: DraftingEvaluationResult = {
      accepted: true,
      errors: [],
      finalPackage: edp,
      metrics: {
        durationMs,
        mutationScore: mutationRes.scorePercent,
        killedMutants: mutationRes.killed,
        survivedMutants: mutationRes.survived
      }
    };

    DRAFTING_METRICS_LOG.push({
      timestamp: new Date().toISOString(),
      edpId,
      accepted: true,
      durationMs,
      mutationScore: mutationRes.scorePercent,
      errorsCount: 0
    });

    return res;
  } finally {
    try {
      if (existsSync(policyFile)) unlinkSync(policyFile);
      if (existsSync(testFile)) unlinkSync(testFile);
    } catch {
      // Nettoyage au mieux
    }
  }
}
