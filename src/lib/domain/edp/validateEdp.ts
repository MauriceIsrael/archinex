import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import edpSchema from '../../schemas/edp.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(edpSchema);

export interface EdpValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    keyword: string;
    field?: string;
  }>;
}

export function validateEdpPackage(data: unknown): EdpValidationResult {
  const valid = Boolean(validate(data));
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors || []).map((err) => {
    const path = err.instancePath || '#';
    const field = err.params?.missingProperty || path.split('/').filter(Boolean).pop();
    return {
      path,
      message: err.message || 'Validation error',
      keyword: err.keyword,
      field
    };
  });

  return { valid: false, errors };
}

