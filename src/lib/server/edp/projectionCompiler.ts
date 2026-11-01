import { createHash } from 'node:crypto';
import type { OntologyCatalog, OntologyBindingItem } from './ontologyClient.js';

export interface CompiledProjections {
  ontology: Record<string, unknown>;
  fingerprint: string;
  metadata: {
    compiled_at: string;
    bindings_count: number;
    used_urns: Array<{ urn: string; revision: number | string }>;
  };
}

export interface DuplicateLiteralWarning {
  literal: string | number;
  projectionPath: string;
  line: number;
  message: string;
}

/**
 * Sérialisation JSON canonique récursive avec clés triées (garantit l'exactitude octet pour octet).
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Compile les projections des URNs liées en un document `data.ontology` pour OPA (Issue #181).
 * Calcule une empreinte cryptographique SHA-256 déterministe.
 */
export function compileOntologyProjections(
  bindings: OntologyBindingItem[],
  catalog: OntologyCatalog
): CompiledProjections {
  const ontologyData: Record<string, unknown> = {};
  const usedUrns: Array<{ urn: string; revision: number | string }> = [];

  // Trier les liaisons pour garantir un ordre d'évaluation strictement déterministe
  const sortedBindings = [...bindings].sort((a, b) => a.urn.localeCompare(b.urn));

  for (const b of sortedBindings) {
    const entity = catalog.entities[b.urn];
    if (!entity) continue;

    usedUrns.push({ urn: b.urn, revision: b.revision });

    // Extraction du fragment d'URN pour former la clé hiérarchique
    // ex: urn:archinex:ontology:infrastructure:server:baremetal -> infrastructure_server_baremetal
    const cleanKey = b.urn
      .replace(/^urn:[^:]+:ontology:/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_');

    ontologyData[cleanKey] = {
      urn: b.urn,
      revision: b.revision,
      title: entity.title,
      domain: entity.domain,
      ...(entity.projections || {})
    };
  }

  // Calcul de l'empreinte SHA-256 canonique
  const canonicalRepresentation = canonicalJsonStringify(ontologyData);
  const fingerprint = createHash('sha256').update(canonicalRepresentation, 'utf-8').digest('hex');

  return {
    ontology: ontologyData,
    fingerprint,
    metadata: {
      compiled_at: '2026-10-29T10:00:00Z', // Date figée ou stable pour déterminisme
      bindings_count: usedUrns.length,
      used_urns: usedUrns
    }
  };
}

/**
 * Détecte les littéraux écrits en dur dans une politique Rego qui doublonnent des valeurs d'ontologie (Linter Issue #181).
 */
export function detectDuplicateLiterals(
  policyContent: string,
  projections: Record<string, unknown>
): DuplicateLiteralWarning[] {
  const warnings: DuplicateLiteralWarning[] = [];
  const lines = policyContent.split('\n');

  // Extraction récursive de toutes les valeurs scalaires des projections
  const projectionValues: Array<{ path: string; value: string | number }> = [];

  function walk(current: unknown, currentPath: string) {
    if (current === null || current === undefined) return;
    if (typeof current === 'string' || typeof current === 'number') {
      // Ignorer les chaînes trop courtes ou génériques (ex: 'v1', '1', 'name')
      if (typeof current === 'string' && current.length <= 2) return;
      projectionValues.push({ path: currentPath, value: current });
    } else if (Array.isArray(current)) {
      current.forEach((val, i) => walk(val, `${currentPath}[${i}]`));
    } else if (typeof current === 'object') {
      for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
        walk(v, currentPath ? `${currentPath}.${k}` : k);
      }
    }
  }

  walk(projections, '');

  // Parcours des lignes de politique
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    for (const pv of projectionValues) {
      const literalStr = typeof pv.value === 'string' ? `"${pv.value}"` : String(pv.value);

      if (line.includes(literalStr)) {
        warnings.push({
          literal: pv.value,
          projectionPath: pv.path,
          line: lineIdx + 1,
          message: `Le littéral ${literalStr} est codé en dur à la ligne ${lineIdx + 1} mais correspond à la projection d'ontologie "${pv.path}". Utilisez "data.ontology.${pv.path}".`
        });
      }
    }
  }

  return warnings;
}
