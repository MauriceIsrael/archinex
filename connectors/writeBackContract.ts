import { fetchWithTimeout, sanitizeBaseUrl, type AdapterMode, type BaseAdapterOptions } from './adapterTypes.js';

/**
 * Contrat de write-back Nautobot pour les connecteurs derrière Nautobot (ADR-017, #399, #411).
 *
 * Un connecteur lit les objets Nautobot, agit (ou vérifie) dans l'outil d'implémentation,
 * puis remonte son statut réalisé et sa preuve vérifiable dans Nautobot via son propre jeton
 * au moindre privilège (champs `realized_*` et `status` uniquement — jamais de champ d'intention).
 */
export const WRITE_BACK_CONTRACT_VERSION = '1.0' as const;

export type RealizedStatus =
  | 'staged'
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'decommissioning'
  | 'decommissioned'
  | 'unverified';

export interface ConnectorWriteBackPayload {
  schema_version: typeof WRITE_BACK_CONTRACT_VERSION;
  realized_status: RealizedStatus;
  realized_at: string;
  realized_revision: string | number;
  realized_by: string;
  evidence_ref: string;
}

export interface WriteBackValidationResult {
  valid: boolean;
  proven: boolean;
  errors: string[];
}

export interface NautobotWriteBackTarget extends BaseAdapterOptions {
  /** Jeton Nautobot dédié au connecteur (moindre privilège : champs realized_* et status). */
  nautobotToken: string;
  /** Chemin REST Nautobot de l'objet cible, ex. `/api/dcim/devices/<uuid>/`. */
  objectPath: string;
  /** Optionnel : statut Nautobot à mettre à jour en parallèle des custom fields. */
  nautobotStatus?: string;
}

export interface NautobotWriteBackResult {
  reachable: boolean;
  mode: AdapterMode;
  applied: boolean;
  objectPath: string;
  statusCode: number;
  payload: ConnectorWriteBackPayload;
  checkedAt: string;
  errors: string[];
}

const VALID_REALIZED_STATUSES: ReadonlySet<string> = new Set([
  'staged',
  'provisioning',
  'active',
  'failed',
  'decommissioning',
  'decommissioned',
  'unverified'
]);

/**
 * Construit un payload de write-back conforme au contrat #399.
 */
export function buildConnectorWriteBackPayload(input: {
  realizedStatus: RealizedStatus;
  realizedRevision: string | number;
  connectorName: string;
  connectorVersion: string;
  evidenceRef: string;
  realizedAt?: string;
}): ConnectorWriteBackPayload {
  return {
    schema_version: WRITE_BACK_CONTRACT_VERSION,
    realized_status: input.realizedStatus,
    realized_at: input.realizedAt || new Date().toISOString(),
    realized_revision: input.realizedRevision,
    realized_by: `${input.connectorName}@${input.connectorVersion}`,
    evidence_ref: input.evidenceRef.trim()
  };
}

/**
 * Valide un payload de write-back selon le contrat #399.
 * Un objet n'est considéré « prouvé » que si `realized_revision` correspond à la révision
 * attendue (si fournie) ET `evidence_ref` est non vide.
 */
export function validateWriteBackPayload(
  payload: Partial<ConnectorWriteBackPayload>,
  expectedRevision?: string | number
): WriteBackValidationResult {
  const errors: string[] = [];

  if (payload.schema_version !== WRITE_BACK_CONTRACT_VERSION) {
    errors.push(`schema_version invalide (attendu "${WRITE_BACK_CONTRACT_VERSION}")`);
  }
  if (!payload.realized_status || !VALID_REALIZED_STATUSES.has(payload.realized_status)) {
    errors.push(`realized_status invalide ("${String(payload.realized_status ?? '')}")`);
  }
  if (!payload.realized_at || Number.isNaN(Date.parse(payload.realized_at))) {
    errors.push('realized_at doit être un horodatage ISO-8601 valide');
  }
  if (
    payload.realized_revision === undefined ||
    payload.realized_revision === null ||
    String(payload.realized_revision).trim() === ''
  ) {
    errors.push('realized_revision est obligatoire');
  }
  if (!payload.realized_by || !String(payload.realized_by).trim()) {
    errors.push('realized_by (connecteur + version) est obligatoire');
  }
  if (!payload.evidence_ref || !String(payload.evidence_ref).trim()) {
    errors.push('evidence_ref (URL de run, commit, PR ou résultat de Job) est obligatoire');
  }

  const revisionMatches =
    expectedRevision === undefined ||
    String(payload.realized_revision) === String(expectedRevision);

  const valid = errors.length === 0;
  const proven = valid && revisionMatches && Boolean(payload.evidence_ref?.trim());

  if (valid && !revisionMatches) {
    errors.push(
      `realized_revision ("${String(payload.realized_revision)}") ne correspond pas à la révision attendue ("${String(expectedRevision)}")`
    );
  }

  return { valid, proven, errors };
}

/**
 * Formate le corps PATCH REST Nautobot en ne touchant exclusivement qu'aux champs
 * `realized_*` / `evidence_ref` (custom_fields) et éventuellement `status`.
 * Ne touche jamais aux champs d'intention (`archinex_*`, etc.).
 */
export function toNautobotPatchBody(
  payload: ConnectorWriteBackPayload,
  nautobotStatus?: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    custom_fields: {
      realized_status: payload.realized_status,
      realized_at: payload.realized_at,
      realized_revision: String(payload.realized_revision),
      realized_by: payload.realized_by,
      evidence_ref: payload.evidence_ref
    }
  };
  if (nautobotStatus) {
    body.status = nautobotStatus;
  }
  return body;
}

/**
 * Exécute le write-back vers Nautobot (PATCH) avec validation préalable du contrat,
 * timeout déterministe et dégradation propre si Nautobot est injoignable.
 */
export async function writeBackToNautobot(
  target: NautobotWriteBackTarget,
  payload: ConnectorWriteBackPayload
): Promise<NautobotWriteBackResult> {
  const checkedAt = new Date().toISOString();
  const validation = validateWriteBackPayload(payload);
  if (!validation.valid) {
    return {
      reachable: false,
      mode: 'degraded',
      applied: false,
      objectPath: target.objectPath,
      statusCode: 0,
      payload,
      checkedAt,
      errors: validation.errors
    };
  }

  const baseUrl = sanitizeBaseUrl(target.baseUrl || process.env.NAUTOBOT_URL || 'http://127.0.0.1:8080');
  const cleanPath = target.objectPath.startsWith('/') ? target.objectPath : `/${target.objectPath}`;
  const url = `${baseUrl}${cleanPath}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Token ${target.nautobotToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(toNautobotPatchBody(payload, target.nautobotStatus))
    },
    target.timeoutMs ?? 5000,
    target.fetchImpl
  );

  if (res.networkError) {
    return {
      reachable: false,
      mode: 'degraded',
      applied: false,
      objectPath: cleanPath,
      statusCode: 0,
      payload,
      checkedAt,
      errors: [res.error || 'Nautobot injoignable lors du write-back']
    };
  }

  return {
    reachable: true,
    mode: res.ok ? 'live' : 'degraded',
    applied: res.ok,
    objectPath: cleanPath,
    statusCode: res.status,
    payload,
    checkedAt,
    errors: res.ok ? [] : [res.error || `Échec PATCH Nautobot (${res.status})`]
  };
}
