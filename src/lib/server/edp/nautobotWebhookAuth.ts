import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../prisma';

export const WEBHOOK_SIGNATURE_HEADERS = ['x-hook-signature', 'x-archinex-signature'] as const;

export interface WebhookHmacVerificationResult {
  ok: boolean;
  projectId?: string;
  algorithm?: 'sha256' | 'sha512';
  error?: string;
}

/**
 * Vérifie la présence d'un en-tête de signature HMAC webhook (utilisé en pré-filtrage dans hooks.server.ts).
 */
export function hasWebhookSignatureHeader(headers: Headers): boolean {
  return WEBHOOK_SIGNATURE_HEADERS.some((h) => {
    const val = headers.get(h);
    return typeof val === 'string' && val.trim().length > 0;
  });
}

/**
 * Calcule une signature HMAC hexadécimale (sha512 par défaut, compatible Nautobot 2.x `X-Hook-Signature`).
 */
export function computeWebhookHmac(
  rawBody: string | Buffer,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha512'
): string {
  return createHmac(algorithm, secret).update(rawBody).digest('hex');
}

function parseSignatureHeader(rawHeader: string): {
  algorithm: 'sha256' | 'sha512';
  digestHex: string;
} | null {
  const trimmed = rawHeader.trim();
  if (!trimmed) return null;

  const prefixed = trimmed.match(/^(sha256|sha512)=([0-9a-fA-F]+)$/);
  if (prefixed) {
    return {
      algorithm: prefixed[1].toLowerCase() as 'sha256' | 'sha512',
      digestHex: prefixed[2].toLowerCase()
    };
  }

  // Nautobot 2.x envoie la signature hexadécimale SHA-512 brute (128 caractères hex) dans X-Hook-Signature.
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    return { algorithm: 'sha512', digestHex: trimmed.toLowerCase() };
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { algorithm: 'sha256', digestHex: trimmed.toLowerCase() };
  }

  return null;
}

function constantTimeHexEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  const aBuf = Buffer.from(aHex, 'hex');
  const bBuf = Buffer.from(bHex, 'hex');
  if (aBuf.length !== bBuf.length || aBuf.length === 0) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Résout le secret HMAC d'un projet à partir de sa stratégie persistée (`strategy.nautobot.webhookSecret`)
 * ou, à défaut, d'une carte d'environnement par projet (`NAUTOBOT_WEBHOOK_SECRETS` JSON ou `NAUTOBOT_WEBHOOK_SECRET_<ID>`).
 * Ne renvoie jamais de secret par défaut partagé : si aucun secret n'est configuré, la vérification échoue fermé (401).
 */
export async function resolveProjectWebhookSecret(
  projectId: string,
  db: any = prisma
): Promise<string | null> {
  const cleanId = String(projectId || '').trim();
  if (!cleanId) return null;

  const project = await db.project?.findUnique({
    where: { id: cleanId },
    select: { id: true, strategy: true }
  });

  if (project?.strategy) {
    try {
      const strategyObj =
        typeof project.strategy === 'string' ? JSON.parse(project.strategy) : project.strategy;
      const configured = strategyObj?.nautobot?.webhookSecret;
      if (typeof configured === 'string' && configured.trim().length > 0) {
        return configured.trim();
      }
    } catch {
      // Stratégie JSON illisible : on poursuit vers la résolution env explicite par projet
    }
  }

  const envMapRaw = process.env.NAUTOBOT_WEBHOOK_SECRETS;
  if (envMapRaw) {
    try {
      const envMap = JSON.parse(envMapRaw) as Record<string, unknown>;
      const mapped = envMap[cleanId];
      if (typeof mapped === 'string' && mapped.trim().length > 0) {
        return mapped.trim();
      }
    } catch {
      // Ignorer une variable d'environnement malformée
    }
  }

  const envKey = `NAUTOBOT_WEBHOOK_SECRET_${cleanId.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
  const envSingle = process.env[envKey];
  if (typeof envSingle === 'string' && envSingle.trim().length > 0) {
    return envSingle.trim();
  }

  return null;
}

/**
 * Extrait l'identifiant projet candidat pour la recherche du secret HMAC :
 * priorité à l'en-tête explicite `X-Archinex-Project` ou paramètre de requête `projectId`,
 * sinon marqueur `archinex_project` sur l'objet Nautobot (uniquement pour localiser le secret,
 * la signature HMAC sur les octets bruts restant toujours exigée).
 */
export function resolveCandidateWebhookProjectId(
  headers: Headers,
  url: URL,
  rawBody: string
): string | null {
  const fromHeader = headers.get('x-archinex-project')?.trim();
  if (fromHeader) return fromHeader;

  const fromQuery = url.searchParams.get('projectId')?.trim();
  if (fromQuery) return fromQuery;

  try {
    const parsed = JSON.parse(rawBody);
    const data = parsed?.data;
    const cf = data?._custom_field_data || data?.custom_fields || {};
    if (typeof cf.archinex_project === 'string' && cf.archinex_project.trim().length > 0) {
      return cf.archinex_project.trim();
    }
  } catch {
    // Corps non JSON : sera rejeté en aval
  }

  return null;
}

/**
 * Vérifie cryptographiquement la signature HMAC d'un webhook Nautobot pour un projet donné.
 * Échoue fermé (ok: false) si l'en-tête manque, si le projet n'a pas de secret ou si la signature ne correspond pas.
 */
export async function verifyNautobotWebhookHmac(params: {
  headers: Headers;
  url: URL;
  rawBody: string;
  db?: any;
}): Promise<WebhookHmacVerificationResult> {
  const { headers, url, rawBody, db = prisma } = params;

  const rawSig =
    headers.get('x-hook-signature') || headers.get('x-archinex-signature') || '';
  const parsedSig = parseSignatureHeader(rawSig);
  if (!parsedSig) {
    return {
      ok: false,
      error: 'Signature HMAC webhook manquante ou malformée (en-tête X-Hook-Signature ou X-Archinex-Signature requis).'
    };
  }

  const projectId = resolveCandidateWebhookProjectId(headers, url, rawBody);
  if (!projectId) {
    return {
      ok: false,
      error: 'Projet cible non identifié pour la vérification HMAC (en-tête X-Archinex-Project ou marqueur archinex_project requis).'
    };
  }

  const secret = await resolveProjectWebhookSecret(projectId, db);
  if (!secret) {
    return {
      ok: false,
      error: `Aucun secret webhook HMAC configuré pour le projet '${projectId}'.`
    };
  }

  const expectedHex = computeWebhookHmac(rawBody, secret, parsedSig.algorithm);
  if (!constantTimeHexEqual(expectedHex, parsedSig.digestHex)) {
    return {
      ok: false,
      error: 'Signature HMAC webhook invalide.'
    };
  }

  return {
    ok: true,
    projectId,
    algorithm: parsedSig.algorithm
  };
}
