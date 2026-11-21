/**
 * Propriété des champs et cycle de vie des statuts des objets Nautobot (ADR-017, issue #398).
 *
 * Principe : Archinex crée les objets au statut `planned` ; ils évoluent ensuite par les connecteurs et l'enforcement
 * dans le système réel. Sans règle de propriété, toute allocation légitime serait vue comme une dérive, et chaque
 * nouveau push d'intention écraserait la réalité. Ce module (pur, sans E/S) porte :
 *  - le registre déclaratif versionné « qui possède quel champ » (intention / réalisé / opérationnel) ;
 *  - la table des statuts et des transitions autorisées, selon l'acteur ;
 *  - l'évaluation d'un statut observé par rapport à l'attendu (progression légitime, régression, inattendu) ;
 *  - la protection d'un push de mise à jour (jamais de champ réalisé ni de statut sur un objet existant).
 *
 * ⚠️ Hypothèses de portée (AGENTS.md §2) : la tranche minimale (Tenant, Device, Prefix/VLAN/IP) est seule couverte.
 * Un type d'objet ou un champ inconnu du registre est traité comme `operational` (non surveillé, jamais écrasé),
 * et un statut inconnu comme `unexpected`. Le registre est une donnée du moteur, pas un scénario de projet.
 */

export const FIELD_OWNERSHIP_REGISTRY_VERSION = 1;

/** `intent` : posé par Archinex ; `realized` : posé par les connecteurs ; `operational` : libre, non surveillé. */
export type FieldOwnership = 'intent' | 'realized' | 'operational';

export type OwnedObjectType =
  | 'tenancy.tenant'
  | 'dcim.device'
  | 'ipam.prefix'
  | 'ipam.vlan'
  | 'ipam.ipaddress';

export type FieldOwnershipMap = Readonly<Record<string, FieldOwnership>>;

/**
 * Registre de propriété (tranche minimale). Les marqueurs de traçabilité `archinex_*` sont de l'intention :
 * une modification externe est un écart.
 */
export const FIELD_OWNERSHIP_REGISTRY: Readonly<Record<OwnedObjectType, FieldOwnershipMap>> = {
  'tenancy.tenant': {
    tags: 'intent',
    custom_fields: 'intent',
    name: 'intent',
    tenant_group: 'intent',
    description: 'operational',
    comments: 'operational'
  },
  'dcim.device': {
    tags: 'intent',
    custom_fields: 'intent',
    name: 'intent',
    device_type: 'intent',
    role: 'intent',
    tenant: 'intent',
    location: 'intent',
    platform: 'intent',
    oob_ip: 'intent',
    power_feeds: 'intent',
    interfaces: 'intent',
    status: 'realized',
    serial: 'realized',
    software_version: 'realized',
    primary_ip4: 'realized',
    primary_ip6: 'realized',
    // `comments` porte l'intention OOB / PDU sous forme structurée (lue par la détection de dérive).
    comments: 'intent',
    asset_tag: 'operational',
    description: 'operational'
  },
  'ipam.prefix': {
    tags: 'intent',
    custom_fields: 'intent',
    prefix: 'intent',
    namespace: 'intent',
    tenant: 'intent',
    vlan: 'intent',
    status: 'realized',
    description: 'operational',
    comments: 'operational'
  },
  'ipam.vlan': {
    tags: 'intent',
    custom_fields: 'intent',
    vid: 'intent',
    name: 'intent',
    vlan_group: 'intent',
    tenant: 'intent',
    location: 'intent',
    status: 'realized',
    description: 'operational',
    comments: 'operational'
  },
  'ipam.ipaddress': {
    tags: 'intent',
    custom_fields: 'intent',
    // Calculée par Archinex tant que l'allocation n'est pas déléguée à l'IPAM de Nautobot (#351) ; elle devient alors réalisée.
    address: 'intent',
    dns_name: 'intent',
    parent: 'intent',
    tenant: 'intent',
    status: 'realized',
    description: 'operational'
  }
};

const ARCHINEX_MARKER_PREFIX = 'archinex_';

/** Classe d'un champ ; `archinex_*` = intention ; inconnu = opérationnel. */
export function classifyField(type: string, field: string): FieldOwnership {
  if (field.startsWith(ARCHINEX_MARKER_PREFIX)) return 'intent';
  if (field.startsWith('realized_')) return 'realized';
  const map = (FIELD_OWNERSHIP_REGISTRY as Record<string, FieldOwnershipMap>)[type];
  return map?.[field] ?? 'operational';
}

export function isOwnedObjectType(type: string): type is OwnedObjectType {
  return Object.prototype.hasOwnProperty.call(FIELD_OWNERSHIP_REGISTRY, type);
}

/** Déduit le type d'objet du chemin de liste de l'API Nautobot (`/api/dcim/devices/` → `dcim.device`). */
export function ownedTypeFromListPath(listPath: string): OwnedObjectType | null {
  const path = listPath.split('?')[0].replace(/\/+$/, '');
  switch (path) {
    case '/api/tenancy/tenants':
      return 'tenancy.tenant';
    case '/api/dcim/devices':
      return 'dcim.device';
    case '/api/ipam/prefixes':
      return 'ipam.prefix';
    case '/api/ipam/vlans':
      return 'ipam.vlan';
    case '/api/ipam/ip-addresses':
      return 'ipam.ipaddress';
    default:
      return null;
  }
}

// ── Statuts ──────────────────────────────────────────────────────────────────

export type Actor = 'archinex' | 'connector';

/** Rang de progression nominale : planned → staged → active. */
const FORWARD_RANK: Readonly<Record<string, number>> = {
  planned: 0,
  staged: 1,
  provisioning: 1,
  active: 2
};
/** Mise hors service (légitime seulement si elle est décidée). */
const RETIREMENT_STATUSES = new Set(['decommissioning', 'decommissioned', 'retired']);
/** Signaux de panne ou de retrait : toujours une régression par rapport à l'intention. */
const FAILURE_STATUSES = new Set(['failed', 'offline', 'quarantined', 'deprecated']);

export function normalizeStatus(raw: unknown): string {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return normalizeStatus(o.value ?? o.name ?? o.display ?? '');
  }
  return String(raw ?? '').trim().toLowerCase();
}

export function isKnownStatus(status: string): boolean {
  return status in FORWARD_RANK || RETIREMENT_STATUSES.has(status) || FAILURE_STATUSES.has(status);
}

export type StatusObservationVerdict = 'unchanged' | 'progress' | 'regression' | 'unexpected';

export interface StatusObservation {
  verdict: StatusObservationVerdict;
  expected: string;
  observed: string;
  reason: string;
}

/**
 * Compare le statut observé dans Nautobot à celui attendu par l'intention.
 *  - `progress` : avancée légitime dans le chemin nominal (ex. planned → active par un connecteur) : PAS un écart ;
 *  - `regression` : recul, panne ou retrait (ex. active → planned, active → failed) : écart `status_regression` ;
 *  - `unexpected` : statut inconnu du registre : écart `attribute_mismatch` (jamais ignoré).
 */
export function evaluateStatusObservation(expectedRaw: unknown, observedRaw: unknown): StatusObservation {
  const expected = normalizeStatus(expectedRaw);
  const observed = normalizeStatus(observedRaw);
  const base = { expected, observed };

  if (!observed || observed === expected) return { ...base, verdict: 'unchanged', reason: 'Statut inchangé.' };
  if (!isKnownStatus(observed)) {
    return { ...base, verdict: 'unexpected', reason: `Statut « ${observed} » inconnu du registre de cycle de vie.` };
  }
  if (FAILURE_STATUSES.has(observed) || RETIREMENT_STATUSES.has(observed)) {
    return {
      ...base,
      verdict: 'regression',
      reason: `Passage à « ${observed} » sans décision de retrait : l'objet n'est plus conforme à l'intention.`
    };
  }
  const e = FORWARD_RANK[expected];
  const o = FORWARD_RANK[observed];
  if (e === undefined) {
    // Attendu hors chemin nominal (ex. intention de retrait) : tout retour dans le chemin nominal est un recul.
    return { ...base, verdict: 'regression', reason: `Retour à « ${observed} » alors que « ${expected} » était attendu.` };
  }
  if (o > e) return { ...base, verdict: 'progress', reason: `Progression légitime : ${expected} → ${observed}.` };
  return { ...base, verdict: 'regression', reason: `Recul : ${expected} → ${observed}.` };
}

export interface StatusTransitionCheck {
  allowed: boolean;
  /** Vrai si la transition exige une décision humaine tracée (mise hors service). */
  requiresDecision: boolean;
  reason: string;
}

/**
 * Transitions de statut autorisées par acteur.
 *  - Archinex : crée en `planned` ; peut demander `decommissioning` (décision explicite). Jamais d'autre statut.
 *  - Connecteur : progression nominale, retrait, et signalement de panne.
 */
export function evaluateStatusTransition(fromRaw: unknown, toRaw: unknown, actor: Actor): StatusTransitionCheck {
  const from = normalizeStatus(fromRaw);
  const to = normalizeStatus(toRaw);

  if (actor === 'archinex') {
    if (!from && to === 'planned') return { allowed: true, requiresDecision: false, reason: 'Création en planned.' };
    if (to === 'decommissioning' && from) {
      return { allowed: true, requiresDecision: true, reason: 'Demande de mise hors service : décision humaine tracée requise.' };
    }
    return {
      allowed: false,
      requiresDecision: false,
      reason: 'Archinex ne force jamais un statut réalisé ; seuls planned (création) et decommissioning (décidé) sont écrits.'
    };
  }

  if (!to) return { allowed: false, requiresDecision: false, reason: 'Statut cible vide.' };
  if (FAILURE_STATUSES.has(to)) return { allowed: true, requiresDecision: false, reason: 'Signalement de panne ou de retrait.' };
  if (RETIREMENT_STATUSES.has(to)) return { allowed: true, requiresDecision: false, reason: 'Mise hors service exécutée.' };
  const f = FORWARD_RANK[from];
  const t = FORWARD_RANK[to];
  if (t === undefined) return { allowed: false, requiresDecision: false, reason: `Statut cible « ${to} » inconnu.` };
  if (f === undefined || t > f) return { allowed: true, requiresDecision: false, reason: 'Progression nominale.' };
  return { allowed: false, requiresDecision: false, reason: 'Un connecteur ne fait pas reculer un objet sans signaler une panne.' };
}

// ── Protection du push d'intention ───────────────────────────────────────────

export interface PushGuardResult {
  payload: Record<string, unknown>;
  /** Champs retirés parce qu'ils ne sont pas de l'intention (réalisés ou opérationnels). */
  removed: string[];
}

/**
 * Prépare un payload d'écriture d'intention.
 *  - création (`isUpdate = false`) : le payload est inchangé (création en `planned` incluse) ;
 *  - mise à jour d'un objet existant : seuls les champs d'**intention** sont conservés. Jamais de statut, de champ
 *    réalisé ni de champ opérationnel : un nouveau push ne touche pas à la réalité.
 * Un type d'objet hors registre est renvoyé tel quel (comportement historique).
 */
export function guardIntentPush(type: string | null, payload: Record<string, unknown>, isUpdate: boolean): PushGuardResult {
  if (!isUpdate || !type || !isOwnedObjectType(type)) return { payload, removed: [] };
  const kept: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (classifyField(type, key) === 'intent') kept[key] = value;
    else removed.push(key);
  }
  return { payload: kept, removed };
}
