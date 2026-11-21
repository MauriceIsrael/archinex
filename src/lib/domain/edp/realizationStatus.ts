/**
 * Évaluation de l'état de réalisation d'un objet Nautobot selon le contrat de write-back (#399)
 * et génération de liens directs vers Nautobot (Issue #379).
 *
 * Module pur (sans E/S) partagé entre le job de réconciliation, la vue « Dérive » (#379)
 * et la vue de couverture (#402).
 *
 * États de réalisation :
 *  - `unverified`        : Nautobot injoignable, réconciliation jamais exécutée, donnée périmée ou connecteur muet.
 *  - `realized_proven`   : objet actif/réalisé ET `realized_revision` === révision de la décision ET `evidence_ref` présent.
 *  - `declared_unproven` : objet déclaré actif/réalisé sans preuve (`evidence_ref`) ou révision divergente.
 *  - `planned`           : objet planifié (non encore réalisé) dans une réconciliation fraîche.
 */

import { normalizeStatus } from './fieldOwnership.js';

export type RealizationState =
  | 'planned'
  | 'realized_proven'
  | 'declared_unproven'
  | 'unverified';

export interface WriteBackEvidence {
  realizedStatus: string | null;
  realizedAt: string | null;
  realizedRevision: number | null;
  realizedBy: string | null;
  evidenceRef: string | null;
}

export interface RealizationEvaluation {
  state: RealizationState;
  reason: string;
  observedStatus: string | null;
  evidence: WriteBackEvidence;
}

export interface RealizationItem {
  objectType: string;
  objectId: string;
  objectName: string;
  subjectId: string | null;
  decisionId: string | null;
  decisionRevision: number | null;
  clauseRefs: string[];
  state: RealizationState;
  reason: string;
  observedStatus: string | null;
  evidence: WriteBackEvidence;
  nautobotUrl: string | null;
}

export interface RealizationCounts {
  planned: number;
  realized_proven: number;
  declared_unproven: number;
  unverified: number;
  total: number;
}

const REALIZED_STATUSES = new Set(['active', 'deployed', 'running', 'online']);
const PLANNED_STATUSES = new Set(['planned', 'staged', 'provisioning']);
const REGRESSED_STATUSES = new Set([
  'failed',
  'offline',
  'quarantined',
  'deprecated',
  'decommissioning',
  'decommissioned',
  'retired'
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStringField(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key];
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPositiveIntField(obj: Record<string, unknown>, key: string): number | null {
  const val = obj[key];
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  return null;
}

/**
 * Extrait les champs du contrat de write-back (#399) depuis un objet Nautobot
 * (`_custom_field_data` ou `custom_fields`).
 */
export function extractWriteBackEvidence(
  nautobotObject: Record<string, unknown> | null | undefined
): WriteBackEvidence {
  if (!nautobotObject || typeof nautobotObject !== 'object') {
    return {
      realizedStatus: null,
      realizedAt: null,
      realizedRevision: null,
      realizedBy: null,
      evidenceRef: null
    };
  }
  const cf = (nautobotObject._custom_field_data ||
    nautobotObject.custom_fields ||
    {}) as Record<string, unknown>;

  return {
    realizedStatus: readStringField(cf, 'realized_status'),
    realizedAt: readStringField(cf, 'realized_at'),
    realizedRevision: readPositiveIntField(cf, 'realized_revision'),
    realizedBy: readStringField(cf, 'realized_by'),
    evidenceRef: readStringField(cf, 'evidence_ref')
  };
}

/**
 * Évalue l'état de réalisation d'un objet attendu face à son observation dans Nautobot.
 * Règle stricte (#399 / #379) :
 *  - Nautobot injoignable ou donnée périmée => toujours `unverified` (jamais `realized_proven`).
 *  - Statut actif sans `evidence_ref` ou avec `realized_revision` != révision de la décision => `declared_unproven`.
 */
export function evaluateRealizationStatus(input: {
  nautobotReachable: boolean;
  isStale?: boolean;
  observedObject: Record<string, unknown> | null | undefined;
  expectedDecisionRevision?: number | null;
  now?: Date;
  connectorSilentDays?: number;
  plannedSince?: Date | string | null;
}): RealizationEvaluation {
  const now = input.now ?? new Date();
  const evidence = extractWriteBackEvidence(input.observedObject);
  const observedStatus = input.observedObject
    ? normalizeStatus(input.observedObject.status) || null
    : null;

  if (!input.nautobotReachable) {
    return {
      state: 'unverified',
      reason: 'Nautobot injoignable : état de réalisation non vérifiable.',
      observedStatus,
      evidence
    };
  }

  if (input.isStale) {
    return {
      state: 'unverified',
      reason: 'Dernière réconciliation périmée : état de réalisation non vérifié.',
      observedStatus,
      evidence
    };
  }

  if (!input.observedObject) {
    return {
      state: 'planned',
      reason: 'Objet planifié dans Archinex mais non encore observé dans Nautobot.',
      observedStatus: null,
      evidence
    };
  }

  const effectiveStatus = normalizeStatus(evidence.realizedStatus || observedStatus || '');

  // Connecteur muet depuis plus de N jours sur un objet qui n'a aucune preuve récente (#399)
  const silentDays = input.connectorSilentDays ?? 7;
  if (silentDays > 0 && evidence.realizedAt) {
    const realizedTs = Date.parse(evidence.realizedAt);
    if (Number.isFinite(realizedTs)) {
      const ageDays = (now.getTime() - realizedTs) / (1000 * 60 * 60 * 24);
      if (ageDays > silentDays && !evidence.evidenceRef) {
        return {
          state: 'unverified',
          reason: `Connecteur muet depuis ${Math.floor(ageDays)} j (seuil : ${silentDays} j) sans preuve d'exécution.`,
          observedStatus,
          evidence
        };
      }
    }
  }

  if (REGRESSED_STATUSES.has(effectiveStatus)) {
    return {
      state: 'declared_unproven',
      reason: `Statut observé en régression (« ${effectiveStatus} ») : non conforme à la réalisation attendue.`,
      observedStatus,
      evidence
    };
  }

  if (REALIZED_STATUSES.has(effectiveStatus)) {
    const hasEvidence = Boolean(evidence.evidenceRef);
    const expectedRev = input.expectedDecisionRevision ?? null;
    const revisionMatches =
      expectedRev !== null && expectedRev > 0
        ? evidence.realizedRevision === expectedRev
        : evidence.realizedRevision !== null && evidence.realizedRevision > 0;

    if (hasEvidence && revisionMatches) {
      return {
        state: 'realized_proven',
        reason: `Réalisé et prouvé (rév. ${evidence.realizedRevision}${evidence.realizedBy ? `, par ${evidence.realizedBy}` : ''}).`,
        observedStatus,
        evidence
      };
    }

    const missingParts: string[] = [];
    if (!hasEvidence) missingParts.push('preuve `evidence_ref` absente');
    if (!revisionMatches) {
      missingParts.push(
        expectedRev
          ? `révision réalisée (${evidence.realizedRevision ?? 'absente'}) ≠ révision décidée (${expectedRev})`
          : 'révision réalisée (`realized_revision`) absente'
      );
    }

    return {
      state: 'declared_unproven',
      reason: `Déclaré « ${effectiveStatus} » mais non prouvé (${missingParts.join(' ; ')}).`,
      observedStatus,
      evidence
    };
  }

  if (!effectiveStatus || PLANNED_STATUSES.has(effectiveStatus)) {
    // Vérifier le silence prolongé sur un objet planifié depuis longtemps si demandé
    if (silentDays > 0 && input.plannedSince) {
      const plannedTs =
        input.plannedSince instanceof Date
          ? input.plannedSince.getTime()
          : Date.parse(String(input.plannedSince));
      if (Number.isFinite(plannedTs)) {
        const waitDays = (now.getTime() - plannedTs) / (1000 * 60 * 60 * 24);
        if (waitDays > silentDays && !evidence.realizedAt) {
          return {
            state: 'unverified',
            reason: `Aucun retour connecteur depuis ${Math.floor(waitDays)} j (seuil : ${silentDays} j).`,
            observedStatus,
            evidence
          };
        }
      }
    }
    return {
      state: 'planned',
      reason: effectiveStatus
        ? `Objet au statut « ${effectiveStatus} » (en attente de réalisation par un connecteur).`
        : 'Objet planifié (en attente de réalisation).',
      observedStatus,
      evidence
    };
  }

  return {
    state: 'declared_unproven',
    reason: `Statut « ${effectiveStatus} » sans preuve conforme au contrat de write-back.`,
    observedStatus,
    evidence
  };
}

/**
 * Agrège les compteurs de réalisation d'une liste d'éléments.
 */
export function summarizeRealizationItems(items: ReadonlyArray<{ state: RealizationState }>): RealizationCounts {
  const counts: RealizationCounts = {
    planned: 0,
    realized_proven: 0,
    declared_unproven: 0,
    unverified: 0,
    total: items.length
  };
  for (const item of items) {
    if (item.state in counts) {
      counts[item.state] += 1;
    }
  }
  return counts;
}

/**
 * Construit un lien direct vers la fiche de l'objet dans l'interface web Nautobot.
 * Retourne `null` si aucune URL de base valide n'est configurée.
 */
export function buildNautobotObjectUrl(
  baseUrl: string | null | undefined,
  objectRef: { type: string; id: string; name?: string }
): string | null {
  if (!baseUrl) return null;
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  if (!cleanBase || !/^https?:\/\//i.test(cleanBase)) return null;

  const type = String(objectRef.type || '').trim().toLowerCase();
  const id = String(objectRef.id || '').trim();
  const name = String(objectRef.name || '').trim();
  const isUuid = UUID_RE.test(id);

  const pathByType: Record<string, string> = {
    'dcim.device': '/dcim/devices',
    'tenancy.tenant': '/tenancy/tenants',
    'ipam.prefix': '/ipam/prefixes',
    'ipam.vlan': '/ipam/vlans',
    'ipam.ipaddress': '/ipam/ip-addresses',
    'circuits.circuit': '/circuits/circuits'
  };

  const basePath = pathByType[type];
  if (basePath && isUuid) {
    return `${cleanBase}${basePath}/${encodeURIComponent(id)}/`;
  }
  if (basePath) {
    const query = name || id;
    return query ? `${cleanBase}${basePath}/?q=${encodeURIComponent(query)}` : `${cleanBase}${basePath}/`;
  }

  const query = name || id;
  return query ? `${cleanBase}/search/?q=${encodeURIComponent(query)}` : `${cleanBase}/`;
}
