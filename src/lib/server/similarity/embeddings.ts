import crypto from 'node:crypto';
import type {
  EmbeddingDeposit,
  EmbeddingDepositItem,
  EmbeddingPendingItem
} from '$lib/types/llmops';

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
 * Encodeur vectoriel universel (par défaut : toy-bow déterministe).
 */
export function encodeText(text: string, model: string = DEFAULT_SIMILARITY_MODEL): number[] {
  return encodeToyBow(text);
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
 * Prépare un lot de dépôt d'embeddings pour LLMOps à partir des items en attente.
 */
export function prepareEmbeddingDeposit(
  pendingItems: EmbeddingPendingItem[],
  model: string = DEFAULT_SIMILARITY_MODEL,
  modelVersion: string = DEFAULT_SIMILARITY_MODEL_VERSION
): EmbeddingDeposit {
  const items: EmbeddingDepositItem[] = pendingItems.map((p) => {
    // Calcul de l'empreinte verbatim pour s'assurer qu'elle correspond
    const sha = computeTextSha256(p.text);
    return {
      ref: p.ref,
      text_sha256: sha,
      vector: encodeText(p.text, model),
      language: detectLanguage(p.text)
    };
  });

  return {
    model,
    model_version: modelVersion,
    items
  };
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
  options?: { model?: string; actorEmail?: string }
): Promise<{ status: string; count: number; error?: string }> {
  const model = options?.model || DEFAULT_SIMILARITY_MODEL;
  const pendingRes = await client.getEmbeddingsPending(model, options?.actorEmail);
  if (pendingRes.status !== 'ok') {
    return { status: pendingRes.status, count: 0, error: pendingRes.error };
  }
  if (!pendingRes.pending || pendingRes.pending.length === 0) {
    return { status: 'ok', count: 0 };
  }

  const deposit = prepareEmbeddingDeposit(pendingRes.pending, model);
  const depositRes = await client.depositEmbeddings(deposit, options?.actorEmail);
  if (depositRes.status !== 'ok') {
    return { status: depositRes.status, count: 0, error: depositRes.error };
  }
  return { status: 'ok', count: depositRes.count ?? deposit.items.length };
}

