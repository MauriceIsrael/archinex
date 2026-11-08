import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runOpaEval } from './opaRunner.js';

let cachedValidator: ReturnType<Ajv['compile']> | null = null;

function getValidator(): ReturnType<Ajv['compile']> {
  if (cachedValidator) {
    return cachedValidator;
  }
  const schemaPath = resolve(
    process.cwd(),
    'tests/fixtures/sylva/sylva-workload-cluster.schema.json'
  );
  if (!existsSync(schemaPath)) {
    throw new Error(`Sylva JSON Schema not found at: ${schemaPath}`);
  }
  const schemaContent = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(schemaContent);
  return cachedValidator;
}

export interface SylvaSchemaValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    keyword: string;
    field?: string;
  }>;
}

/**
 * Valide un descripteur SylvaWorkloadCluster ou sylva_workload_cluster_values
 * contre le schéma JSON officiel Sylva.
 */
export function validateSylvaWorkloadClusterSchema(
  manifest: unknown
): SylvaSchemaValidationResult {
  const validator = getValidator();
  const valid = Boolean(validator(manifest));
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validator.errors || []).map((err) => {
    const path = err.instancePath || '#';
    const field =
      (err.params as any)?.missingProperty ||
      path.split('/').filter(Boolean).pop();
    return {
      path,
      message: err.message || 'Validation error',
      keyword: err.keyword,
      field
    };
  });

  return { valid: false, errors };
}

export interface SylvaGoldenRuleViolation {
  rule: string;
  category?: string;
  message: string;
}

export interface SylvaGoldenRulesResult {
  verdict: 'compliant' | 'violated';
  violations: SylvaGoldenRuleViolation[];
  violationMessages: string[];
  ruleCount: number;
  passedRulesCount: number;
  durationMs: number;
}

/**
 * Évalue les 15 règles d'or de Sylva via Open Policy Agent (edp/policies/sylva_golden_rules.rego)
 */
export async function evaluateSylvaGoldenRules(
  manifest: unknown
): Promise<SylvaGoldenRulesResult> {
  const policyPath = resolve(
    process.cwd(),
    'edp/policies/sylva_golden_rules.rego'
  );
  const startTime = Date.now();

  const opaRes = await runOpaEval<{
    verdict: 'compliant' | 'violated';
    violations: SylvaGoldenRuleViolation[];
    violation_messages: string[];
    rule_count: number;
    passed_rules_count: number;
  }>({
    query: 'data.archinex.edp.sylva.evaluation',
    input: manifest,
    policyFiles: [policyPath]
  });

  const durationMs = Date.now() - startTime;

  if (opaRes.status !== 'pass' || !opaRes.output) {
    throw new Error(
      `Échec d'évaluation OPA des règles d'or Sylva: ${opaRes.error || opaRes.rawOutput}`
    );
  }

  const out = opaRes.output;
  return {
    verdict: out.verdict,
    violations: out.violations || [],
    violationMessages: out.violation_messages || [],
    ruleCount: out.rule_count || 15,
    passedRulesCount: out.passed_rules_count ?? (15 - (out.violations?.length || 0)),
    durationMs
  };
}
