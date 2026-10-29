import { createHash } from 'node:crypto';
import type { RefinedInputPayload } from '../../../domain/edp/validateRefinedInput.js';

export interface SylvaTransformOptions {
  manifests: Array<Record<string, unknown>>;
  chartVersion: string;
  command?: string;
  chartName?: string;
  generatedAt?: string;
}

const FORBIDDEN_SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /private_?key/i,
  /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/
];

/**
 * Nettoie récursivement un objet de tout secret (Issue #178).
 */
export function sanitizeManifests(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    // Si un manifeste est de kind: Secret, on l'exclut intégralement
    return data
      .filter((item) => {
        if (item && typeof item === 'object' && (item as any).kind === 'Secret') {
          return false;
        }
        return true;
      })
      .map((item) => sanitizeManifests(item));
  }

  if (typeof data === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      const isSecretKey = FORBIDDEN_SECRET_PATTERNS.some((p) => p.test(key));
      if (isSecretKey) {
        clean[key] = '[REDACTED_SECRET]';
      } else if (typeof val === 'string' && FORBIDDEN_SECRET_PATTERNS.some((p) => p.test(val))) {
        clean[key] = '[REDACTED_SECRET]';
      } else {
        clean[key] = sanitizeManifests(val);
      }
    }
    return clean;
  }

  return data;
}

/**
 * Transforme une liste de manifestes Kubernetes (Helm Sylva / CAPI)
 * en un payload 'refined_input' conforme avec métadonnées de provenance (Issue #178).
 */
export function transformSylvaManifestsToRefinedInput(
  options: SylvaTransformOptions
): RefinedInputPayload {
  if (!options.manifests || !Array.isArray(options.manifests)) {
    throw new Error('Les manifestes fournis doivent être un tableau d’objets Kubernetes non vide.');
  }

  const sanitized = sanitizeManifests(options.manifests) as Array<Record<string, unknown>>;
  const contentStr = JSON.stringify(sanitized);
  const sha256 = createHash('sha256').update(contentStr).digest('hex');

  return {
    sources: {
      k8s_manifests: {
        provenance: {
          tool: 'helm',
          version: options.chartVersion,
          command: options.command || `helm template ${options.chartName || 'sylva-core'}`,
          sha256,
          generated_at: options.generatedAt || new Date().toISOString()
        },
        content: sanitized
      }
    }
  };
}
