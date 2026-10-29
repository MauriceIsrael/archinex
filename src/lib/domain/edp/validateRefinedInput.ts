import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import refinedInputSchema from '../../schemas/refined_input.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validateSchema = ajv.compile(refinedInputSchema);

export interface ExpectedSourceContract {
  source: string;
  path?: string;
  schema_version: string;
  allow_empty?: boolean;
}

export type EdpVerdict = 'compliant' | 'violated' | 'not_applicable' | 'insufficient_input';

export interface RefinedInputValidationResult {
  valid: boolean;
  verdict: EdpVerdict;
  missing_sources: string[];
  errors: string[];
}

export interface RefinedInputSourceData {
  provenance: {
    tool: string;
    version: string;
    command: string;
    sha256: string;
    generated_at: string;
  };
  content: unknown;
}

export interface RefinedInputPayload {
  sources: Record<string, RefinedInputSourceData>;
}

function isContentEmpty(content: unknown): boolean {
  if (content === null || content === undefined) return true;
  if (typeof content === 'string' && content.trim() === '') return true;
  if (Array.isArray(content) && content.length === 0) return true;
  if (typeof content === 'object' && Object.keys(content as Record<string, unknown>).length === 0) {
    return true;
  }
  return false;
}

/**
 * Valide un lot d'entrées de raffinement (LLD) face au contrat d'attente d'un EDP (Issue #170).
 * Garantit qu'aucune règle universelle ne sera évaluée par vacuité sur des sources absentes ou vides.
 */
export function validateRefinedInput(
  input: unknown,
  expectedInputs: ExpectedSourceContract[] = []
): RefinedInputValidationResult {
  const errors: string[] = [];
  const missingSources: string[] = [];

  // 1. Validation de schéma structurel et de provenance
  const schemaValid = validateSchema(input);
  if (!schemaValid) {
    const ajvErrors = (validateSchema.errors || []).map((err) => {
      const field = err.params?.missingProperty || err.instancePath;
      return `${field ? `[${field}] ` : ''}${err.message}`;
    });
    errors.push(...ajvErrors);

    // Une provenance manquante ou un schéma erroné invalide l'entrée
    return {
      valid: false,
      verdict: 'insufficient_input',
      missing_sources: [],
      errors
    };
  }

  const payload = input as unknown as RefinedInputPayload;
  const declaredSourcesSet = new Set(expectedInputs.map((e) => e.source));
  const providedSources = Object.keys(payload.sources);

  // 2. Vérification des sources attendues
  for (const expected of expectedInputs) {
    const sourceData = payload.sources[expected.source];
    if (!sourceData) {
      missingSources.push(expected.source);
      errors.push(`Source requise absente : "${expected.source}"`);
      continue;
    }

    if (!expected.allow_empty && isContentEmpty(sourceData.content)) {
      missingSources.push(expected.source);
      errors.push(`Source requise vide : "${expected.source}" ne contient aucun élément.`);
    }
  }

  // 3. Détection des sources non déclarées
  for (const provided of providedSources) {
    if (!declaredSourcesSet.has(provided)) {
      errors.push(`Source fournie non déclarée dans le contrat de l'EDP : "${provided}"`);
    }
  }

  // 4. Détermination du verdict
  if (missingSources.length > 0) {
    return {
      valid: false,
      verdict: 'insufficient_input',
      missing_sources: missingSources,
      errors
    };
  }

  const hasUndeclared = providedSources.some((p) => !declaredSourcesSet.has(p));
  if (hasUndeclared) {
    return {
      valid: false,
      verdict: 'violated',
      missing_sources: [],
      errors
    };
  }

  return {
    valid: true,
    verdict: 'compliant',
    missing_sources: [],
    errors: []
  };
}

