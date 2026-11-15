import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { RefinedInputPayload } from '../../domain/edp/validateRefinedInput.js';
import type {
  SylvaTopologyProfileId,
  SylvaTwinArbitrationReport,
  TwinArbitrationViolation
} from '../../domain/edp/sylvaTwin.js';
import { runOpaEval } from './opaRunner.js';

export interface TwinRefinedInputOptions {
  report: SylvaTwinArbitrationReport;
  generatedAt?: string;
}

export interface SylvaTwinOpaEvaluationResult {
  verdict: 'compliant' | 'violated' | 'insufficient_input';
  targetProfileId: SylvaTopologyProfileId;
  mode: string;
  recommendedProfileId: SylvaTopologyProfileId;
  violations: TwinArbitrationViolation[];
  violationMessages: string[];
  ruleCount: number;
  passedRulesCount: number;
  durationMs: number;
}

/**
 * Encapsule un rapport du Jumeau Numérique de Sylva dans une source `refined_input.sources.twin_report`
 * scellée cryptographiquement (SHA-256 déterministe) conformément au contrat `refined_input.schema.json`.
 */
export function buildTwinRefinedInputSource(
  options: TwinRefinedInputOptions
): RefinedInputPayload {
  const canonicalContent = JSON.stringify(options.report);
  const sha256 = createHash('sha256').update(canonicalContent).digest('hex');

  return {
    sources: {
      twin_report: {
        provenance: {
          tool: options.report.engine,
          version: options.report.sylvaRelease,
          command: `archinex-twin run --mode=${options.report.mode} --default=${options.report.defaultProfileId}`,
          sha256,
          generated_at: options.generatedAt || new Date().toISOString()
        },
        content: options.report
      }
    }
  };
}

/**
 * Évalue le rapport du Jumeau Numérique de Sylva via Open Policy Agent (`edp/policies/twin_resilience.rego`).
 */
export async function evaluateSylvaTwinResilienceOpa(
  input: SylvaTwinArbitrationReport | RefinedInputPayload | Record<string, unknown>
): Promise<SylvaTwinOpaEvaluationResult> {
  const policyPath = resolve(process.cwd(), 'edp/policies/twin_resilience.rego');
  const startTime = Date.now();

  const opaRes = await runOpaEval<{
    verdict: 'compliant' | 'violated' | 'insufficient_input';
    target_profile_id: SylvaTopologyProfileId;
    mode: string;
    recommended_profile_id: SylvaTopologyProfileId;
    violations: TwinArbitrationViolation[];
    violation_messages: string[];
    rule_count: number;
    passed_rules_count: number;
  }>({
    query: 'data.archinex.edp.twin.evaluation',
    input,
    policyFiles: [policyPath]
  });

  const durationMs = Date.now() - startTime;

  if (opaRes.status !== 'pass' || !opaRes.output) {
    throw new Error(
      `Échec d'évaluation OPA du Jumeau Numérique Sylva: ${opaRes.error || opaRes.rawOutput}`
    );
  }

  const out = opaRes.output;
  return {
    verdict: out.verdict,
    targetProfileId: out.target_profile_id,
    mode: out.mode,
    recommendedProfileId: out.recommended_profile_id,
    violations: out.violations || [],
    violationMessages: out.violation_messages || [],
    ruleCount: out.rule_count || 7,
    passedRulesCount: out.passed_rules_count ?? 7 - (out.violations?.length || 0),
    durationMs
  };
}
