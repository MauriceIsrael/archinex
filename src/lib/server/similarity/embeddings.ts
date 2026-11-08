import crypto from 'node:crypto';
import type {
  EmbeddingDeposit,
  EmbeddingDepositItem,
  EmbeddingPendingItem
} from '$lib/types/llmops';

import type { Encoder } from './encoder';
import { resolveEncoder } from './encoder';

export const TOY_BOW_DIM = 128;
export const DEFAULT_SIMILARITY_MODEL = 'toy-bow';
export const DEFAULT_SIMILARITY_MODEL_VERSION = '1';

/**
 * Encodeur déterministe bag-of-words (128 dimensions).
 * Strictement aligné sur le toy encoder de test LLMOps.
 */
export function encodeToyBow(text: string, dim: number = TOY_BOW_DIM): number[] {
  const vec = new Array(dim).fill(0.0);
  const lower = text.toLowerCase();
  const words = lower.match(/[a-zà-ÿ0-9]+/g) || [];
  for (const w of words) {
    if (w.length > 2) {
      const hash = crypto.createHash('sha256').update(Buffer.from(w, 'utf-8')).digest('hex');
      const idx = Number(BigInt('0x' + hash) % BigInt(dim));
      vec[idx] += 1.0;
    }
  }
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq) || 1.0;
  return vec.map((x) => x / norm);
}

/**
 * Normalisation stricte d'un sujet (minuscules, espaces normalisés, accents préservés).
 */
export function normalizeSubject(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calcul du SHA-256 (64 hex) du sujet normalisé.
 */
export function computeSubjectFingerprint(text: string): string {
  const norm = normalizeSubject(text);
  return crypto.createHash('sha256').update(Buffer.from(norm, 'utf-8')).digest('hex');
}

/**
 * Calcul du SHA-256 du texte verbatim (pour intégrité de l'actif).
 */
export function computeTextSha256(text: string): string {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex');
}

/**
 * Anonymisation du texte d'une requête ou d'un fragment de RFP
 * avant transmission à l'index sémantique (zéro fuite de données personnelles ou infra).
 */
export function anonymizeSubjectText(text: string): string {
  return text
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[EMAIL_REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]');
}

/**
 * Détecte la langue (heuristique simple 'fr' vs 'en' pour le dépôt).
 */
export function detectLanguage(text: string): 'fr' | 'en' {
  const frenchWords = /\b(le|la|les|un|une|des|du|de|en|est|dans|pour|avec|sur|par|qui|que)\b/i;
  return frenchWords.test(text) ? 'fr' : 'en';
}

/**
 * Prépare un lot de dépôt d'embeddings pour LLMOps à partir des items en attente, avec l'encodeur du modèle
 * demandé (jamais un autre modèle sous le même nom).
 */
export async function prepareEmbeddingDeposit(
  pendingItems: EmbeddingPendingItem[],
  encoder: Encoder
): Promise<EmbeddingDeposit> {
  const items: EmbeddingDepositItem[] = [];
  for (const p of pendingItems) {
    items.push({
      ref: p.ref,
      // Empreinte du texte verbatim fourni par LLMOps : elle doit correspondre.
      text_sha256: computeTextSha256(p.text),
      vector: await encoder.encode(p.text),
      language: detectLanguage(p.text)
    });
  }
  return { model: encoder.model, model_version: await encoder.version(), items };
}

/**
 * Interface minimale de client LLMOps pour la synchronisation.
 */
export interface LLMOpsEmbeddingClient {
  getEmbeddingsPending(
    model?: string,
    actorEmail?: string
  ): Promise<{ status: string; pending: EmbeddingPendingItem[]; error?: string }>;
  depositEmbeddings(
    deposit: EmbeddingDeposit,
    actorEmail?: string
  ): Promise<{ status: string; count?: number; dim?: number; error?: string }>;
}

/**
 * Synchronise en une passe tous les actifs en attente d'embedding avec LLMOps.
 */
export async function syncEmbeddingsWithLLMOps(
  client: LLMOpsEmbeddingClient,
  options?: { model?: string; actorEmail?: string; encoder?: Encoder }
): Promise<{ status: string; count: number; error?: string }> {
  let encoder: Encoder;
  try {
    encoder = options?.encoder ?? resolveEncoder(options?.model);
  } catch (e: any) {
    return { status: 'unavailable', count: 0, error: e?.message ?? String(e) };
  }
  const model = encoder.model;
  const pendingRes = await client.getEmbeddingsPending(model, options?.actorEmail);
  if (pendingRes.status !== 'ok') {
    return { status: pendingRes.status, count: 0, error: pendingRes.error };
  }
  if (!pendingRes.pending || pendingRes.pending.length === 0) {
    return { status: 'ok', count: 0 };
  }

  let deposit: EmbeddingDeposit;
  try {
    deposit = await prepareEmbeddingDeposit(pendingRes.pending, encoder);
  } catch (e: any) {
    return { status: 'unavailable', count: 0, error: e?.message ?? String(e) };
  }
  const depositRes = await client.depositEmbeddings(deposit, options?.actorEmail);
  if (depositRes.status !== 'ok') {
    return { status: depositRes.status, count: 0, error: depositRes.error };
  }
  return { status: 'ok', count: depositRes.count ?? deposit.items.length };
}

const inFlightSyncByModel = new Map<string, Promise<{ status: string; count: number; error?: string }>>();

/**
 * Détermine si un état de santé KB indique des vecteurs manquants ou obsolètes pour le modèle cible.
 */
export function needsEmbeddingSync(
  health:
    | {
        embeddings?: Array<{
          model_id: string;
          vectors: number;
          missing: number;
          stale: number;
          active_assets?: number;
        }>;
        assets?: { active?: number };
      }
    | null
    | undefined,
  model: string
): boolean {
  if (!health) return false;
  const activeCount = health.assets?.active ?? 0;
  const entry = health.embeddings?.find((e) => e.model_id === model);
  if (!entry) {
    return activeCount > 0 || (health.embeddings?.length ?? 0) > 0;
  }
  return entry.missing > 0 || entry.stale > 0;
}

/**
 * Synchronise automatiquement et de manière dédupliquée les vecteurs en attente avec LLMOps.
 * Ne fait rien si aucun actif n'est en attente (`missing === 0 && stale === 0`).
 */
export async function ensureEmbeddingsSynced(
  client: LLMOpsEmbeddingClient,
  options?: { model?: string; actorEmail?: string; encoder?: Encoder }
): Promise<{ status: string; count: number; error?: string }> {
  let encoder: Encoder;
  try {
    encoder = options?.encoder ?? resolveEncoder(options?.model);
  } catch (e: any) {
    return { status: 'unavailable', count: 0, error: e?.message ?? String(e) };
  }
  const modelKey = encoder.model;
  const existing = inFlightSyncByModel.get(modelKey);
  if (existing) {
    return existing;
  }
  const promise = syncEmbeddingsWithLLMOps(client, {
    ...options,
    model: modelKey,
    encoder
  }).finally(() => {
    inFlightSyncByModel.delete(modelKey);
  });
  inFlightSyncByModel.set(modelKey, promise);
  return promise;
}

