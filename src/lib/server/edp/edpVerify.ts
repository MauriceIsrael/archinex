import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { validateEdpPackage } from '../../domain/edp/validateEdp.js';
import { validateRefinedInput, type EdpVerdict } from '../../domain/edp/validateRefinedInput.js';
import { runOpaEval, checkOpaVersion, resolveOpaBinary } from './opaRunner.js';
import { loadOntologyCatalog, checkOntologyBindings } from './ontologyClient.js';
import { compileOntologyProjections } from './projectionCompiler.js';
import { getEdpPackage } from './edpRepository.js';

export interface EvidenceBundle {
  edp_id: string;
  revision: number;
  policy_sha256: string;
  ontology_fingerprint: string;
  input_sha256: string;
  input_provenance: Record<string, unknown>;
  opa_version: string;
  runner_version: string;
  verdict: EdpVerdict;
  violations: string[];
  verified_at: string;
  duration_ms: number;
}

export interface VerifyEdpOptions {
  edpInput: string | Record<string, unknown>; // id ou chemin de fichier ou objet EDP
  inputPathOrData: string | Record<string, unknown>; // chemin ou objet refined_input
  policyDir?: string;
  ontologyFixturePath?: string;
  opaPath?: string;
  timeoutMs?: number;
}

export interface VerifyEdpResult {
  exitCode: number; // 0 = compliant, 1 = violated, 2 = insufficient_input / not_applicable, 3 = runner_error / unavailable
  verdict: EdpVerdict;
  evidenceBundle?: EvidenceBundle;
  errors: string[];
  durationMs: number;
}

export function computeSha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Service central `edp verify` (Issue #182).
 * Exécute l'oracle d'un EDP sur une entrée de raffinement fournie et scelle le lot de preuves.
 */
export async function verifyEdp(options: VerifyEdpOptions): Promise<VerifyEdpResult> {
  const start = Date.now();
  const errors: string[] = [];

  // 1. Résolution de l'exécuteur OPA
  const opaPath = resolveOpaBinary(options.opaPath);
  if (!opaPath) {
    return {
      exitCode: 3,
      verdict: 'insufficient_input',
      errors: ['Binaire OPA indisponible. Impossible d’exécuter edp verify.'],
      durationMs: Date.now() - start
    };
  }

  const opaVersionInfo = await checkOpaVersion(opaPath);
  if (!opaVersionInfo.available) {
    return {
      exitCode: 3,
      verdict: 'insufficient_input',
      errors: [opaVersionInfo.error || 'Erreur lors de la détection d’OPA.'],
      durationMs: Date.now() - start
    };
  }

  // 2. Résolution du paquet EDP
  let edpObj: any;
  let edpDir = process.cwd();

  if (typeof options.edpInput === 'string') {
    if (existsSync(options.edpInput)) {
      edpDir = dirname(resolve(options.edpInput));
      edpObj = JSON.parse(readFileSync(options.edpInput, 'utf-8'));
    } else {
      // Recherche en base de données par ID
      try {
        const pkg = await getEdpPackage(options.edpInput);
        if (pkg) {
          edpObj = pkg.content;
        } else {
          errors.push(`EDP introuvable : ${options.edpInput}`);
        }
      } catch {
        errors.push(`Impossible de résoudre l'EDP par ID ou chemin : ${options.edpInput}`);
      }
    }
  } else if (typeof options.edpInput === 'object') {
    edpObj = options.edpInput;
  }

  if (!edpObj) {
    return {
      exitCode: 3,
      verdict: 'insufficient_input',
      errors: errors.length > 0 ? errors : ['EDP non spécifié ou invalide.'],
      durationMs: Date.now() - start
    };
  }

  // Validation du schéma de l'EDP
  const edpSchemaRes = validateEdpPackage(edpObj);
  if (!edpSchemaRes.valid) {
    return {
      exitCode: 3,
      verdict: 'insufficient_input',
      errors: edpSchemaRes.errors.map((e) => `[EDP Schema] ${e.path}: ${e.message}`),
      durationMs: Date.now() - start
    };
  }

  // 3. Résolution et validation du refined_input (#170)
  let refinedInputObj: any;
  let rawInputStr = '';

  if (typeof options.inputPathOrData === 'string') {
    if (!existsSync(options.inputPathOrData)) {
      return {
        exitCode: 2,
        verdict: 'insufficient_input',
        errors: [`Fichier refined_input introuvable : ${options.inputPathOrData}`],
        durationMs: Date.now() - start
      };
    }
    rawInputStr = readFileSync(options.inputPathOrData, 'utf-8');
    try {
      refinedInputObj = JSON.parse(rawInputStr);
    } catch {
      return {
        exitCode: 2,
        verdict: 'insufficient_input',
        errors: ['Le fichier refined_input ne contient pas un JSON valide.'],
        durationMs: Date.now() - start
      };
    }
  } else {
    refinedInputObj = options.inputPathOrData;
    rawInputStr = JSON.stringify(refinedInputObj);
  }

  const expectedInputs = edpObj.refinement_contract?.expected_inputs || [];
  const inputValidation = validateRefinedInput(refinedInputObj, expectedInputs);

  if (!inputValidation.valid) {
    const isInsufficient = inputValidation.verdict === 'insufficient_input';
    return {
      exitCode: isInsufficient ? 2 : 1,
      verdict: inputValidation.verdict,
      errors: inputValidation.errors,
      durationMs: Date.now() - start
    };
  }

  // 4. Résolution de l'ontologie et calcul des projections (#173 & #181)
  const bindings = edpObj.decision_context?.ontology_bindings || [];
  let ontologyFingerprint = '0'.repeat(64);
  let compiledOntologyData: Record<string, unknown> = {};

  if (bindings.length > 0) {
    const catalog = await loadOntologyCatalog({ fixturePath: options.ontologyFixturePath });
    const bindingCheck = checkOntologyBindings(bindings, catalog);
    if (!bindingCheck.valid) {
      return {
        exitCode: 3,
        verdict: 'insufficient_input',
        errors: bindingCheck.errors.map((e) => `[Ontology] ${e.message}`),
        durationMs: Date.now() - start
      };
    }
    const compiled = compileOntologyProjections(bindings, catalog);
    ontologyFingerprint = compiled.fingerprint;
    compiledOntologyData = compiled.ontology;
  }

  // 5. Exécution de l'Oracle Rego via OPA (#171 & #175)
  const oracle = edpObj.verification_oracle;
  const policyDir = options.policyDir || edpDir;
  const commonRegoPath = resolve(process.cwd(), 'policies/lib/edp_common.rego');

  const policyFiles: string[] = [commonRegoPath];
  for (const pf of oracle.policy_files) {
    const resolvedPf = resolve(policyDir, pf.filename);
    if (!existsSync(resolvedPf)) {
      return {
        exitCode: 3,
        verdict: 'insufficient_input',
        errors: [`Fichier de politique Rego introuvable : ${resolvedPf}`],
        durationMs: Date.now() - start
      };
    }
    policyFiles.push(resolvedPf);
  }

  const entrypoint = oracle.entrypoint; // ex: data.archinex.edp.adr012.status
  const opaData = {
    ontology: compiledOntologyData
  };

  const evalRes = await runOpaEval<{
    edp_id: string;
    verdict: EdpVerdict;
    applicable: boolean;
    violations: string[];
    missing_inputs: string[];
  }>({
    query: entrypoint,
    input: refinedInputObj,
    data: opaData,
    policyFiles,
    opaPath,
    timeoutMs: options.timeoutMs
  });

  const durationMs = Date.now() - start;

  if (evalRes.status === 'runner_error' || evalRes.status === 'unavailable') {
    return {
      exitCode: 3,
      verdict: 'insufficient_input',
      errors: [evalRes.error || 'Erreur lors de l’évaluation OPA.'],
      durationMs
    };
  }

  const rawVerdict = evalRes.output?.verdict || 'insufficient_input';
  const violations = evalRes.output?.violations || [];

  let exitCode = 0;
  if (rawVerdict === 'violated') {
    exitCode = 1;
  } else if (rawVerdict === 'insufficient_input' || rawVerdict === 'not_applicable') {
    exitCode = 2;
  }

  // 6. Assemblage du lot de preuves
  const inputSha256 = computeSha256(rawInputStr);
  const inputProvenance: Record<string, unknown> = {};
  if (refinedInputObj.sources) {
    for (const [k, v] of Object.entries(refinedInputObj.sources as Record<string, any>)) {
      inputProvenance[k] = v.provenance;
    }
  }

  const evidenceBundle: EvidenceBundle = {
    edp_id: edpObj.metadata.id,
    revision: edpObj.metadata.revision,
    policy_sha256: oracle.policy_files[0]?.sha256 || 'unknown',
    ontology_fingerprint: ontologyFingerprint,
    input_sha256: inputSha256,
    input_provenance: inputProvenance,
    opa_version: opaVersionInfo.version || 'unknown',
    runner_version: 'archinex-edp-verify/1.0',
    verdict: rawVerdict,
    violations,
    verified_at: new Date().toISOString(),
    duration_ms: durationMs
  };

  return {
    exitCode,
    verdict: rawVerdict,
    evidenceBundle,
    errors,
    durationMs
  };
}
