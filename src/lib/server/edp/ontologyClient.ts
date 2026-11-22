import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export type OntologyPredicate =
  | 'requires_aspect'
  | 'implemented_by'
  | 'depends_on'
  | 'constrains'
  | 'conflicts_with'
  | 'satisfies_clause'
  | 'requires_prerequisite_axis'
  | 'instantiates_component';

export const VALID_ONTOLOGY_PREDICATES: readonly OntologyPredicate[] = [
  'requires_aspect',
  'implemented_by',
  'depends_on',
  'constrains',
  'conflicts_with',
  'satisfies_clause',
  'requires_prerequisite_axis',
  'instantiates_component'
];

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
  togaf_domain?: string;
  document_engine_layer?: string;
  instantiated_component?: string;
  default_decision_type?: 'type1_deliberate' | 'type2_default_ratify';
  keywords?: string[];
  governed_by_clauses?: string[];
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
  fallbackToFixture?: boolean;
  /**
   * Extension de projet : fichier JSON appliqué PAR-DESSUS l'ontologie du Hub (voir `OntologyProjectOverlay`).
   * Plusieurs fichiers possibles, séparés par des virgules, appliqués dans l'ordre.
   * Par défaut, la variable d'environnement ARCHINEX_ONTOLOGY_PROJECT_OVERLAY ; absente, aucune extension.
   * Avec `fixturePath` (mode isolé), seule l'option explicite s'applique.
   */
  projectOverlayPath?: string;
}

/**
 * Extension de PROJET de l'ontologie. L'ontologie commune appartient au Knowledge Hub (LLMOps#192) : tout ce qui
 * est propre à un projet (identifiants d'exigences, mots-clés de scénario, instances d'un graphe de réconciliation)
 * n'y a pas sa place et se déclare ici, par-dessus.
 *
 * - `entityPatches` : par URN d'une entité EXISTANTE du Hub ; les objets sont fusionnés récursivement, les tableaux
 *   réunis (sans doublon), les scalaires remplacés ; `{ "$replace": valeur }` remplace explicitement la valeur du Hub
 *   (utile pour un lot « règles d'oracle + paramètres », qui ne se mélange pas). Une URN absente du Hub est une
 *   erreur (pas d'ajout silencieux quand le Hub retire ou renomme une entité) ;
 * - `addedTriplets` : relations propres au projet (ex. feuille → exigence).
 */
export interface OntologyProjectOverlay {
  description?: string;
  entityPatches?: Record<string, Record<string, unknown>>;
  addedTriplets?: OntologyTriplet[];
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
  const dir = dirname(RUNTIME_OVERLAY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(RUNTIME_OVERLAY_PATH, JSON.stringify(overlay, null, 2), 'utf-8');
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

function applyRuntimeOverlay(catalog: OntologyCatalog): OntologyCatalog {
  const overlay = getRuntimeOverlay();
  const mergedEntities: Record<string, OntologyEntity> = {
    ...catalog.entities,
    ...overlay.addedEntities
  };
  const baseTriplets = Array.isArray(catalog.triplets) ? catalog.triplets : [];
  const mergedTriplets = [
    ...baseTriplets.filter((t) => !overlay.deletedTripletIds.includes(t.id)),
    ...overlay.addedTriplets.filter((t) => !overlay.deletedTripletIds.includes(t.id))
  ];
  return {
    ...catalog,
    entities: mergedEntities,
    triplets: mergedTriplets
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mergePatchValue(base: unknown, patch: unknown): unknown {
  // `{ "$replace": valeur }` : remplace la valeur du Hub au lieu de la fusionner (lot règles d'oracle + paramètres).
  if (isPlainObject(patch) && Object.keys(patch).length === 1 && '$replace' in patch) return patch.$replace;
  if (Array.isArray(patch)) {
    const baseArr = Array.isArray(base) ? base : [];
    const seen = new Set(baseArr.map((x) => JSON.stringify(x)));
    return [...baseArr, ...patch.filter((x) => !seen.has(JSON.stringify(x)))];
  }
  if (isPlainObject(patch)) {
    const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
    for (const [k, v] of Object.entries(patch)) out[k] = mergePatchValue(out[k], v);
    return out;
  }
  return patch;
}

/** Applique une extension de projet à un catalogue (sans le modifier). Erreur si une URN ciblée n'existe pas. */
export function applyProjectOverlay(catalog: OntologyCatalog, overlay: OntologyProjectOverlay): OntologyCatalog {
  const entities = { ...catalog.entities };
  for (const [urn, patch] of Object.entries(overlay.entityPatches ?? {})) {
    const target = entities[urn];
    if (!target) {
      throw new Error(
        `[OntologyClient] L'extension de projet cible une entité absente de l'ontologie du Hub : ${urn}. ` +
          `Le Hub l'a retirée ou renommée : mettre l'extension à jour.`
      );
    }
    entities[urn] = mergePatchValue(target, patch) as OntologyEntity;
  }
  const baseTriplets = Array.isArray(catalog.triplets) ? catalog.triplets : [];
  const known = new Set(baseTriplets.map((t) => t.id));
  const added = (overlay.addedTriplets ?? []).filter((t) => !known.has(t.id));
  return { ...catalog, entities, triplets: [...baseTriplets, ...added] };
}

export function loadProjectOverlays(paths: string | undefined): OntologyProjectOverlay[] {
  return (paths ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((path) => {
      const abs = resolve(process.cwd(), path);
      if (!existsSync(abs)) {
        throw new Error(`[OntologyClient] Extension de projet introuvable : ${abs}`);
      }
      const parsed = JSON.parse(readFileSync(abs, 'utf-8')) as OntologyProjectOverlay;
      if (!isPlainObject(parsed)) throw new Error(`[OntologyClient] Extension de projet invalide : ${abs}`);
      return parsed;
    });
}

/**
 * Charge le catalogue d'ontologie en interrogeant en priorité le Knowledge Hub LLMOps (REST / MCP),
 * avec repli propre sur les fixtures en environnement hors-ligne ou de test (Issue #253).
 * En production (NODE_ENV=production), tout repli est strictement interdit si le Hub est injoignable.
 */
export async function loadOntologyCatalog(options: LoadOntologyOptions = {}): Promise<OntologyCatalog> {
  const base = await loadBaseOntologyCatalog(options);
  // Mode isolé (fixture explicite) : aucune extension implicite, seule l'option explicite s'applique.
  const overlayPath = options.projectOverlayPath ?? (options.fixturePath ? undefined : process.env.ARCHINEX_ONTOLOGY_PROJECT_OVERLAY);
  const withProject = loadProjectOverlays(overlayPath).reduce(applyProjectOverlay, base);
  return options.includeRuntimeOverlay ? applyRuntimeOverlay(withProject) : withProject;
}

async function loadBaseOntologyCatalog(options: LoadOntologyOptions): Promise<OntologyCatalog> {
  // 1. Mode Fixture explicite (tests contractuels isolés avec fixture dédiée passée en paramètre)
  if (options.fixturePath) {
    if (!existsSync(options.fixturePath)) {
      throw new Error(`[OntologyClient] Fichier d'ontologie introuvable : ${options.fixturePath}`);
    }
    const raw = readFileSync(options.fixturePath, 'utf-8');
    const parsed = JSON.parse(raw) as OntologyCatalog;
    if (!parsed || typeof parsed !== 'object' || !parsed.entities) {
      throw new Error('[OntologyClient] Structure d\'ontologie invalide (champ "entities" requis).');
    }
    return parsed;
  }

  const isVitestTest = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';

  // 2. Mode API Hub souverain (LLMOps)
  // En test, LLMOPS_BASE_URL est intentionnellement fixé à 127.0.0.1:1 par vitest.config.ts pour bloquer les fuites réseau.
  // Par conséquent, un appel réseau au Hub en test requiert options.hubUrl explicite ou LLMOPS_LIVE_URL.
  const targetHubUrl = options.hubUrl || (isVitestTest ? process.env.LLMOPS_LIVE_URL : process.env.LLMOPS_BASE_URL);

  if (targetHubUrl) {
    const url = `${targetHubUrl.replace(/\/$/, '')}/api/knowledge/ontology/export`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = options.authToken || process.env.LLMOPS_AUTH_TOKEN || process.env.LLMOPS_LIVE_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`code HTTP ${res.status} (${res.statusText})`);
      }
      const json = await res.json();
      const payload = json.data || json;
      if (!payload || typeof payload !== 'object' || !payload.entities) {
        throw new Error("champ 'entities' manquant");
      }
      return payload as OntologyCatalog;
    } catch (err: any) {
      // Si une URL spécifique de Hub a été exigée par l'appelant sans autoriser le fallback, on propage l'erreur
      if (options.hubUrl && !options.fallbackToFixture) {
        throw new Error(
          `Knowledge Hub indisponible pour la synchronisation d’ontologie (${url}) : ${err.message}. Aucun repli silencieux autorisé.`
        );
      }

      // En production : interdiction absolue de repli silencieux sur fixture
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `[OntologyClient] Knowledge Hub indisponible (${url}) : ${err.message}. Conformément aux règles d'architecture et de non-complaisance, aucun mock en dur ni repli gracieux n'est autorisé en production.`
        );
      }

      // En mode hors-ligne / test / dev : repli propre sur les fixtures
      console.warn(
        `[OntologyClient] Knowledge Hub distant injoignable ou en erreur (${url} — ${err.message}), bascule propre sur les fixtures hors-ligne scellées.`
      );
    }
  }

  // 3. En production (NODE_ENV=production) : interdiction absolue de fallback sur fixture
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "[OntologyClient] Aucun Knowledge Hub configuré (LLMOPS_BASE_URL manquant). Conformément aux règles d'architecture et de non-complaisance, aucun mock en dur ni repli gracieux n'est autorisé en production."
    );
  }

  // 4. Mode CI hermétique déconnecté pour tests Vitest
  const filePath = DEFAULT_FIXTURE_PATH;
  if (!existsSync(filePath)) {
    throw new Error(`[OntologyClient] Fichier d'ontologie introuvable : ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as OntologyCatalog;
  if (!parsed || typeof parsed !== 'object' || !parsed.entities) {
    throw new Error('[OntologyClient] Structure d\'ontologie invalide (champ "entities" requis).');
  }

  return parsed;
}

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
