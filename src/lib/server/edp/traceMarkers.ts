/**
 * Marquage de traçabilité des objets Nautobot et planification d'un push idempotent (ADR-017, issue #376).
 *
 * Chaque objet de la tranche minimale poussé par Archinex porte des champs personnalisés `archinex_*` qui disent de
 * quelle décision et de quelles clauses il vient, et l'empreinte `archinex_intent_hash` de son INTENTION. Cela permet :
 *  - un push idempotent : même intention = aucune écriture ;
 *  - de ne jamais toucher un objet qui n'est pas marqué (créé par un tiers ou par une ancienne version) ;
 *  - de rattacher une modification manuelle à une décision (détection de dérive).
 *
 * L'empreinte ne couvre que les champs d'INTENTION (registre de propriété, #398) : jamais le statut ni les champs
 * réalisés, qui évoluent légitimement sous l'action des connecteurs.
 */
import { createHash } from 'node:crypto';
import { classifyField, type OwnedObjectType } from '../../domain/edp/fieldOwnership.js';

export const TRACE_FIELD_KEYS = {
  project: 'archinex_project',
  subject: 'archinex_subject_id',
  decision: 'archinex_decision_id',
  decisionRevision: 'archinex_decision_revision',
  clauseRefs: 'archinex_clause_refs',
  intentHash: 'archinex_intent_hash'
} as const;

/** Version de la définition de l'empreinte : préfixe de `archinex_intent_hash` (`v1:<sha256>`). */
export const INTENT_HASH_VERSION = 'v1';

/** Définition des champs personnalisés à créer (idempotent) dans Nautobot, pour chaque type de la tranche minimale. */
export const TRACE_CUSTOM_FIELD_DEFINITIONS: ReadonlyArray<{ key: string; label: string; type: 'text' | 'integer' }> = [
  { key: TRACE_FIELD_KEYS.project, label: 'Archinex : projet', type: 'text' },
  { key: TRACE_FIELD_KEYS.subject, label: 'Archinex : sujet', type: 'text' },
  { key: TRACE_FIELD_KEYS.decision, label: 'Archinex : décision', type: 'text' },
  { key: TRACE_FIELD_KEYS.decisionRevision, label: 'Archinex : révision de la décision', type: 'integer' },
  { key: TRACE_FIELD_KEYS.clauseRefs, label: 'Archinex : clauses', type: 'text' },
  { key: TRACE_FIELD_KEYS.intentHash, label: "Archinex : empreinte d'intention", type: 'text' }
];

export const TRACE_CONTENT_TYPES: ReadonlyArray<string> = [
  'tenancy.tenant',
  'dcim.device',
  'ipam.prefix',
  'ipam.vlan',
  'ipam.ipaddress'
];

/** Contexte de gouvernance écrit sur chaque objet. Tout champ est optionnel. */
export interface TraceContext {
  projectId?: string;
  subjectId?: string;
  decisionId?: string;
  decisionRevision?: number;
  clauseRefs?: string[];
}

/** Champs exclus de l'empreinte : métadonnées de traçabilité, pas de l'intention. */
const HASH_EXCLUDED_FIELDS = new Set(['tags', 'custom_fields']);

function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

/** Sous-ensemble d'INTENTION d'un payload (hors statut, champs réalisés, opérationnels et métadonnées). */
export function intentView(type: OwnedObjectType, payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || HASH_EXCLUDED_FIELDS.has(k)) continue;
    if (classifyField(type, k) === 'intent') out[k] = v;
  }
  return out;
}

/** Empreinte déterministe `v1:<sha256>` de l'intention d'un objet. */
export function computeObjectIntentHash(type: OwnedObjectType, payload: Record<string, unknown>): string {
  const digest = createHash('sha256').update(canonical({ type, intent: intentView(type, payload) })).digest('hex');
  return `${INTENT_HASH_VERSION}:${digest}`;
}

/** Valeurs `custom_fields` de traçabilité à écrire ; seuls les champs renseignés sont émis. */
export function buildTraceCustomFields(
  ctx: TraceContext | undefined,
  fallbackProject: string | undefined,
  intentHash: string
): Record<string, unknown> {
  const cf: Record<string, unknown> = {};
  const project = ctx?.projectId || fallbackProject;
  if (project) cf[TRACE_FIELD_KEYS.project] = project;
  if (ctx?.subjectId) cf[TRACE_FIELD_KEYS.subject] = ctx.subjectId;
  if (ctx?.decisionId) cf[TRACE_FIELD_KEYS.decision] = ctx.decisionId;
  if (typeof ctx?.decisionRevision === 'number' && ctx.decisionRevision > 0) {
    cf[TRACE_FIELD_KEYS.decisionRevision] = ctx.decisionRevision;
  }
  if (ctx?.clauseRefs && ctx.clauseRefs.length > 0) {
    cf[TRACE_FIELD_KEYS.clauseRefs] = JSON.stringify([...ctx.clauseRefs].sort());
  }
  cf[TRACE_FIELD_KEYS.intentHash] = intentHash;
  return cf;
}

/** Valeur de l'empreinte d'intention portée par un objet Nautobot existant (undefined si non marqué). */
export function readIntentHash(nautobotObject: Record<string, unknown> | null | undefined): string | undefined {
  if (!nautobotObject) return undefined;
  const cf = (nautobotObject._custom_field_data || nautobotObject.custom_fields || {}) as Record<string, unknown>;
  const h = cf[TRACE_FIELD_KEYS.intentHash];
  return typeof h === 'string' && h.trim() ? h.trim() : undefined;
}

export type IntentWriteAction = 'create' | 'update' | 'noop' | 'skip_unmarked' | 'adopt';

export interface IntentWriteDecision {
  action: IntentWriteAction;
  reason: string;
}

/**
 * Décide quoi faire d'un objet d'intention (fonction pure).
 *  - absent → `create` ;
 *  - marqué, même empreinte → `noop` (idempotence) ;
 *  - marqué, empreinte différente → `update` (l'intention a changé) ;
 *  - NON marqué → `skip_unmarked` : jamais modifié ni supprimé, sauf adoption explicite (`adopt`).
 */
export function planIntentWrite(input: {
  exists: boolean;
  existingHash: string | undefined;
  desiredHash: string;
  adoptUnmarked?: boolean;
}): IntentWriteDecision {
  if (!input.exists) return { action: 'create', reason: "Objet absent : création en Planned." };
  if (!input.existingHash) {
    return input.adoptUnmarked
      ? { action: 'adopt', reason: "Objet existant non marqué : adoption explicite (ajout des marqueurs archinex_*)." }
      : { action: 'skip_unmarked', reason: "Objet existant sans marqueur archinex_* : non modifié (créé par un tiers ou une ancienne version)." };
  }
  if (input.existingHash === input.desiredHash) return { action: 'noop', reason: "Empreinte d'intention identique : aucune écriture." };
  return { action: 'update', reason: "Empreinte d'intention différente : l'intention a changé." };
}

/** Entrée du plan d'une synchronisation (mode `dryRun` ou compte rendu). */
export type SyncPlanEntry =
  | { kind: 'intent'; action: IntentWriteAction; type: OwnedObjectType; name: string; reason: string }
  | { kind: 'write'; method: string; path: string };

/** Résumé lisible d'un plan : « 3 créations, 1 mise à jour, 12 inchangés, 2 non marqués ignorés ». */
export function summarizeSyncPlan(plan: ReadonlyArray<SyncPlanEntry>): string {
  const count = (a: IntentWriteAction) => plan.filter((p) => p.kind === 'intent' && p.action === a).length;
  const supporting = plan.filter((p) => p.kind === 'write').length;
  return [
    `${count('create')} création(s)`,
    `${count('update')} mise(s) à jour`,
    `${count('adopt')} adoption(s)`,
    `${count('noop')} inchangé(s)`,
    `${count('skip_unmarked')} non marqué(s) ignoré(s)`,
    `${supporting} écriture(s) d'objets de support`
  ].join(', ');
}
