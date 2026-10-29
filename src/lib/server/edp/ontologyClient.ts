import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface OntologyEntity {
  urn: string;
  revision: number | string;
  title?: string;
  domain?: string;
  projections?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OntologyCatalog {
  catalog_version: string;
  generated_at: string;
  entities: Record<string, OntologyEntity>;
}

export interface OntologyBindingItem {
  urn: string;
  revision: number | string;
}

export interface BindingIssue {
  urn: string;
  message: string;
  code: 'urn_not_found' | 'revision_mismatch' | 'stale_binding';
  currentRevision?: number | string;
  boundRevision?: number | string;
}

export interface OntologyBindingCheckResult {
  valid: boolean;
  errors: BindingIssue[];
  warnings: BindingIssue[];
}

export interface LoadOntologyOptions {
  fixturePath?: string;
  hubUrl?: string;
  authToken?: string;
}

const DEFAULT_FIXTURE_PATH = resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json');

/**
 * Charge le catalogue d'ontologie depuis une source locale (mode fixture) ou le Knowledge Hub (Issue #173).
 * En cas d'indisponibilité du Hub, lève une erreur explicite sans jamais inventer de données.
 */
export async function loadOntologyCatalog(options: LoadOntologyOptions = {}): Promise<OntologyCatalog> {
  // 1. Mode API Hub si hubUrl est configuré
  if (options.hubUrl) {
    const url = `${options.hubUrl.replace(/\/$/, '')}/api/knowledge/ontology/export`;
    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (options.authToken) {
        headers['Authorization'] = `Bearer ${options.authToken}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`Le Knowledge Hub a répondu avec le statut ${res.status} (${res.statusText})`);
      }

      const json = await res.json();
      if (!json || typeof json !== 'object' || !json.entities) {
        throw new Error('Format de catalogue d’ontologie renvoyé par le Hub invalide.');
      }

      return json as OntologyCatalog;
    } catch (err: any) {
      throw new Error(`Knowledge Hub indisponible pour la synchronisation d’ontologie : ${err.message}`);
    }
  }

  // 2. Mode Fixture hors-ligne (CI et tests déconnectés)
  const filePath = options.fixturePath || DEFAULT_FIXTURE_PATH;
  if (!existsSync(filePath)) {
    throw new Error(`Fichier d’export d’ontologie introuvable : ${filePath}`);
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.entities) {
      throw new Error('Structure du fichier d’ontologie invalide (champ "entities" requis).');
    }
    return parsed as OntologyCatalog;
  } catch (err: any) {
    throw new Error(`Impossible de charger l’ontologie depuis la fixture : ${err.message}`);
  }
}

/**
 * Vérifie la validité des liaisons ontologiques d'un EDP face au catalogue (Issue #173).
 * - URN inexistante -> erreur bloquante
 * - Révision périmée -> avertissement `stale_binding`
 */
export function checkOntologyBindings(
  bindings: OntologyBindingItem[],
  catalog: OntologyCatalog
): OntologyBindingCheckResult {
  const errors: BindingIssue[] = [];
  const warnings: BindingIssue[] = [];

  for (const b of bindings) {
    const entity = catalog.entities[b.urn];

    if (!entity) {
      errors.push({
        urn: b.urn,
        code: 'urn_not_found',
        message: `L'URN "${b.urn}" est inconnue dans le catalogue d’ontologie d'entreprise.`
      });
      continue;
    }

    const boundRev = Number(b.revision);
    const currentRev = Number(entity.revision);

    if (isNaN(boundRev) || isNaN(currentRev)) {
      // Comparaison chaîne
      if (String(b.revision) !== String(entity.revision)) {
        warnings.push({
          urn: b.urn,
          code: 'stale_binding',
          boundRevision: b.revision,
          currentRevision: entity.revision,
          message: `La liaison pour "${b.urn}" est sur la révision ${b.revision}, mais la révision courante est ${entity.revision}.`
        });
      }
    } else {
      if (boundRev < currentRev) {
        warnings.push({
          urn: b.urn,
          code: 'stale_binding',
          boundRevision: b.revision,
          currentRevision: entity.revision,
          message: `Liaison périmée : "${b.urn}" est liée à la révision ${b.revision}, or la révision courante est ${entity.revision}.`
        });
      } else if (boundRev > currentRev) {
        errors.push({
          urn: b.urn,
          code: 'revision_mismatch',
          boundRevision: b.revision,
          currentRevision: entity.revision,
          message: `Révision future introuvable : "${b.urn}" référence la révision ${b.revision}, alors que le catalogue s'arrête à ${entity.revision}.`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
