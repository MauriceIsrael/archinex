import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export type OntologyPredicate =
  | 'requires_aspect'
  | 'implemented_by'
  | 'depends_on'
  | 'constrains'
  | 'conflicts_with';

export interface OntologyTriplet {
  id: string;
  subject: string;
  predicate: OntologyPredicate;
  object: string;
  rationale?: string;
}

export interface OntologyEntity {
  urn: string;
  revision: number | string;
  kind?: 'concept' | 'axis' | 'leaf';
  title?: string;
  domain?: string;
  keywords?: string[];
  oracle_rules?: string[];
  hydration_template?: Record<string, unknown>;
  projections?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OntologyCatalog {
  catalog_version: string;
  generated_at: string;
  entities: Record<string, OntologyEntity>;
  triplets?: OntologyTriplet[];
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
  includeRuntimeOverlay?: boolean;
}

const DEFAULT_FIXTURE_PATH = resolve(process.cwd(), 'tests/fixtures/edp/ontology_export.json');
const RUNTIME_OVERLAY_PATH = resolve(process.cwd(), '.archinex-ontology-overlay.json');

interface RuntimeOntologyOverlay {
  addedEntities: Record<string, OntologyEntity>;
  addedTriplets: OntologyTriplet[];
  deletedTripletIds: string[];
}

let memoryOverlay: RuntimeOntologyOverlay | null = null;

function getRuntimeOverlay(): RuntimeOntologyOverlay {
  if (memoryOverlay) return memoryOverlay;
  if (existsSync(RUNTIME_OVERLAY_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(RUNTIME_OVERLAY_PATH, 'utf-8'));
      memoryOverlay = {
        addedEntities: parsed.addedEntities || {},
        addedTriplets: Array.isArray(parsed.addedTriplets) ? parsed.addedTriplets : [],
        deletedTripletIds: Array.isArray(parsed.deletedTripletIds) ? parsed.deletedTripletIds : []
      };
      return memoryOverlay;
    } catch {
      // ignore corrupted overlay
    }
  }
  memoryOverlay = { addedEntities: {}, addedTriplets: [], deletedTripletIds: [] };
  return memoryOverlay;
}

function saveRuntimeOverlay(overlay: RuntimeOntologyOverlay): void {
  memoryOverlay = overlay;
  try {
    const dir = dirname(RUNTIME_OVERLAY_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(RUNTIME_OVERLAY_PATH, JSON.stringify(overlay, null, 2), 'utf-8');
  } catch {
    // fallback to memory-only if filesystem is read-only
  }
}

export function resetRuntimeOntologyOverlay(): void {
  memoryOverlay = { addedEntities: {}, addedTriplets: [], deletedTripletIds: [] };
  try {
    if (existsSync(RUNTIME_OVERLAY_PATH)) {
      writeFileSync(RUNTIME_OVERLAY_PATH, JSON.stringify(memoryOverlay, null, 2), 'utf-8');
    }
  } catch {
    // ignore
  }
}

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
    const parsed = JSON.parse(raw) as OntologyCatalog;
    if (!parsed || typeof parsed !== 'object' || !parsed.entities) {
      throw new Error('Structure du fichier d’ontologie invalide (champ "entities" requis).');
    }

    if (options.includeRuntimeOverlay) {
      const overlay = getRuntimeOverlay();
      const mergedEntities: Record<string, OntologyEntity> = {
        ...parsed.entities,
        ...overlay.addedEntities
      };
      const baseTriplets = Array.isArray(parsed.triplets) ? parsed.triplets : [];
      const mergedTriplets = [
        ...baseTriplets.filter((t) => !overlay.deletedTripletIds.includes(t.id)),
        ...overlay.addedTriplets.filter((t) => !overlay.deletedTripletIds.includes(t.id))
      ];
      return {
        ...parsed,
        entities: mergedEntities,
        triplets: mergedTriplets
      };
    }

    return parsed;
  } catch (err: any) {
    throw new Error(`Impossible de charger l’ontologie depuis la fixture : ${err.message}`);
  }
}

/**
 * Requête déclarative sur le graphe de triplets { Sujet, Verbe (predicate), Complément (object) }.
 */
export function queryOntologyTriplets(
  catalog: OntologyCatalog,
  filter: { subject?: string; predicate?: OntologyPredicate; object?: string } = {}
): OntologyTriplet[] {
  const triplets = catalog.triplets || [];
  return triplets.filter((t) => {
    if (filter.subject && t.subject !== filter.subject) return false;
    if (filter.predicate && t.predicate !== filter.predicate) return false;
    if (filter.object && t.object !== filter.object) return false;
    return true;
  });
}

/**
 * Ajoute ou met à jour un triplet { Sujet, Verbe, Complément } et crée les entités manquantes si nécessaire.
 */
export async function addOntologyTriplet(input: {
  id?: string;
  subject: string;
  predicate: OntologyPredicate;
  object: string;
  rationale?: string;
  subjectTitle?: string;
  subjectKind?: 'concept' | 'axis' | 'leaf';
  objectTitle?: string;
  objectKind?: 'concept' | 'axis' | 'leaf';
}): Promise<{ triplet: OntologyTriplet; catalog: OntologyCatalog }> {
  const overlay = getRuntimeOverlay();
  const baseCatalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });

  const cleanSubject = input.subject.trim();
  const cleanObject = input.object.trim();
  if (!cleanSubject || !cleanObject) {
    throw new Error('Le sujet et le complément du triplet sont obligatoires.');
  }

  // Création automatique des nœuds s'ils n'existent pas encore dans le catalogue
  if (!baseCatalog.entities[cleanSubject]) {
    overlay.addedEntities[cleanSubject] = {
      urn: cleanSubject,
      revision: 1,
      kind:
        input.subjectKind ||
        (input.predicate === 'requires_aspect'
          ? 'concept'
          : input.predicate === 'implemented_by'
            ? 'axis'
            : 'leaf'),
      title: input.subjectTitle || cleanSubject.split(':').slice(-2).join(' / '),
      domain: cleanSubject.split(':')[3] || 'architecture',
      keywords: cleanSubject
        .split(':')
        .slice(3)
        .flatMap((part) => part.split('_'))
        .filter((w) => w.length > 2),
      oracle_rules: [],
      projections: {}
    };
  }

  if (!baseCatalog.entities[cleanObject]) {
    overlay.addedEntities[cleanObject] = {
      urn: cleanObject,
      revision: 1,
      kind:
        input.objectKind ||
        (input.predicate === 'requires_aspect'
          ? 'axis'
          : input.predicate === 'implemented_by'
            ? 'leaf'
            : 'leaf'),
      title: input.objectTitle || cleanObject.split(':').slice(-2).join(' / '),
      domain: cleanObject.split(':')[3] || 'architecture',
      keywords: cleanObject
        .split(':')
        .slice(3)
        .flatMap((part) => part.split('_'))
        .filter((w) => w.length > 2),
      oracle_rules: [],
      projections: {}
    };
  }

  const id = input.id || `tr-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newTriplet: OntologyTriplet = {
    id,
    subject: cleanSubject,
    predicate: input.predicate,
    object: cleanObject,
    rationale: input.rationale || `Relation ${input.predicate} déclarée dans l'éditeur d'ontologie.`
  };

  overlay.deletedTripletIds = overlay.deletedTripletIds.filter((delId) => delId !== id);
  overlay.addedTriplets = [
    ...overlay.addedTriplets.filter(
      (t) => !(t.subject === cleanSubject && t.predicate === input.predicate && t.object === cleanObject)
    ),
    newTriplet
  ];

  saveRuntimeOverlay(overlay);
  const updatedCatalog = await loadOntologyCatalog({ includeRuntimeOverlay: true });
  return { triplet: newTriplet, catalog: updatedCatalog };
}

/**
 * Supprime un triplet par son identifiant.
 */
export async function removeOntologyTriplet(tripletId: string): Promise<OntologyCatalog> {
  const overlay = getRuntimeOverlay();
  if (!overlay.deletedTripletIds.includes(tripletId)) {
    overlay.deletedTripletIds.push(tripletId);
  }
  overlay.addedTriplets = overlay.addedTriplets.filter((t) => t.id !== tripletId);
  saveRuntimeOverlay(overlay);
  return loadOntologyCatalog({ includeRuntimeOverlay: true });
}

/**
 * Ajoute ou met à jour une entité dans l'ontologie (Concept, Axe ou Feuille avec projections/règles).
 */
export async function upsertOntologyEntity(entity: OntologyEntity): Promise<OntologyCatalog> {
  const overlay = getRuntimeOverlay();
  overlay.addedEntities[entity.urn] = {
    ...overlay.addedEntities[entity.urn],
    ...entity,
    revision: entity.revision ?? 1,
    projections: entity.projections ?? {}
  };
  saveRuntimeOverlay(overlay);
  return loadOntologyCatalog({ includeRuntimeOverlay: true });
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
