/**
 * Classificateur et rapprochement sémantique par comparateur cosinus sur vecteurs d'embeddings.
 *
 * Remplace les heuristiques syntaxiques fragiles (`.includes()`, sous-chaînes non bornées)
 * tout en conservant un repli lexical borné explicite (`matchMode: 'lexical-fallback'`)
 * lorsque aucun serveur d'embeddings réel n'est configuré (ex. `toy-bow` en CI/test).
 */
import crypto from 'node:crypto';
import { DEFAULT_SIMILARITY_MODEL } from './embeddings';
import { configuredModel, resolveEncoder, type Encoder } from './encoder';

export type MatchMode = 'semantic' | 'lexical-fallback';
export type ConfidenceZone = 'strong' | 'possible' | 'none';

export interface SemanticThresholds {
  /** Seuil de correspondance forte (défaut : 0.78). */
  high: number;
  /** Seuil de correspondance possible / suggestion (défaut : 0.65). */
  possible: number;
  /** Marge minimale entre top-1 et top-2 pour lever l'ambiguïté (défaut : 0.02). */
  minMargin: number;
}

export const DEFAULT_SEMANTIC_THRESHOLDS: SemanticThresholds = {
  high: 0.78,
  possible: 0.65,
  minMargin: 0.02
};

export interface AnchorDefinition {
  /** Phrases prototypes représentatives (français / anglais) de la catégorie. */
  prototypes: string[];
  /** Motifs lexicaux bornés (`\b...\b`) utilisés uniquement en mode `lexical-fallback`. */
  lexicalPatterns?: RegExp[];
}

export interface SemanticClassificationResult<TLabel extends string> {
  label: TLabel | null;
  score: number;
  zone: ConfidenceZone;
  matchMode: MatchMode;
  scores: Partial<Record<TLabel, number>>;
}

export interface SemanticEntityCandidate<TItem> {
  item: TItem;
  /** Texte représentatif de l'entité (titre + description + mots-clés). */
  text: string;
  /** Vecteur pré-calculé (ex. issu de la base vectorielle LLMOps). */
  vector?: number[];
}

export interface SemanticEntityMatch<TItem> {
  item: TItem;
  score: number;
  zone: ConfidenceZone;
  matchMode: MatchMode;
}

/**
 * Calcule la similarité cosinus entre deux vecteurs numériques de même dimension.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Détermine la zone de confiance d'un score cosinus (alignée sur l'UI Clauses KB).
 */
export function classifyConfidenceZone(
  score: number,
  thresholds: Partial<SemanticThresholds> = {}
): ConfidenceZone {
  const high = thresholds.high ?? DEFAULT_SEMANTIC_THRESHOLDS.high;
  const possible = thresholds.possible ?? DEFAULT_SEMANTIC_THRESHOLDS.possible;
  if (score >= high) return 'strong';
  if (score >= possible) return 'possible';
  return 'none';
}

/**
 * Résout un encodeur sémantique réel (exclut `toy-bow` sauf si fourni explicitement en test).
 */
export function tryResolveSemanticEncoder(encoderOverride?: Encoder): Encoder | null {
  if (encoderOverride) {
    return encoderOverride;
  }
  const model = configuredModel();
  if (!model || model === DEFAULT_SIMILARITY_MODEL) {
    return null;
  }
  try {
    return resolveEncoder(model);
  } catch {
    return null;
  }
}

const MAX_TEXT_VECTOR_CACHE = 2000;
const textVectorCache = new Map<string, number[]>();

function cacheKey(model: string, version: string, text: string): string {
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 24);
  return `${model}::${version}::${hash}`;
}

async function encodeWithCache(encoder: Encoder, version: string, text: string): Promise<number[]> {
  const key = cacheKey(encoder.model, version, text);
  const cached = textVectorCache.get(key);
  if (cached) return cached;

  const vec = await encoder.encode(text);
  if (textVectorCache.size >= MAX_TEXT_VECTOR_CACHE) {
    const firstKey = textVectorCache.keys().next().value;
    if (firstKey !== undefined) textVectorCache.delete(firstKey);
  }
  textVectorCache.set(key, vec);
  return vec;
}

/**
 * Classificateur par prototypes vectoriels (ancres sémantiques) avec cache de vecteurs
 * et repli lexical borné explicite si aucun modèle sémantique n'est disponible.
 */
export class SemanticAnchorClassifier<TLabel extends string> {
  private readonly anchors: Record<TLabel, AnchorDefinition>;
  private readonly thresholds: SemanticThresholds;
  private readonly anchorVectorCache = new Map<string, Map<TLabel, number[][]>>();

  constructor(
    anchors: Record<TLabel, AnchorDefinition>,
    thresholds: Partial<SemanticThresholds> = {}
  ) {
    this.anchors = anchors;
    this.thresholds = { ...DEFAULT_SEMANTIC_THRESHOLDS, ...thresholds };
  }

  private async getAnchorVectors(
    encoder: Encoder,
    version: string
  ): Promise<Map<TLabel, number[][]>> {
    const modelKey = `${encoder.model}::${version}`;
    const existing = this.anchorVectorCache.get(modelKey);
    if (existing) return existing;

    const map = new Map<TLabel, number[][]>();
    const entries = Object.entries(this.anchors) as Array<[TLabel, AnchorDefinition]>;
    for (const [label, def] of entries) {
      const vecs: number[][] = [];
      for (const proto of def.prototypes) {
        vecs.push(await encodeWithCache(encoder, version, proto));
      }
      map.set(label, vecs);
    }
    this.anchorVectorCache.set(modelKey, map);
    return map;
  }

  /**
   * Classification purement lexicale (repli borné lorsque l'encodeur réel est absent).
   */
  classifyLexical(text: string): SemanticClassificationResult<TLabel> {
    const normalized = text.trim();
    const scores: Partial<Record<TLabel, number>> = {};
    let bestLabel: TLabel | null = null;
    let bestHits = 0;

    for (const [label, def] of Object.entries(this.anchors) as Array<[TLabel, AnchorDefinition]>) {
      const patterns = def.lexicalPatterns ?? [];
      let hits = 0;
      for (const rx of patterns) {
        if (rx.test(normalized)) hits++;
      }
      if (hits > 0) {
        const pseudoScore = Math.min(0.95, 0.65 + hits * 0.1);
        scores[label] = pseudoScore;
        if (hits > bestHits) {
          bestHits = hits;
          bestLabel = label;
        }
      } else {
        scores[label] = 0;
      }
    }

    const bestScore = bestLabel ? (scores[bestLabel] ?? 0) : 0;
    return {
      label: bestLabel,
      score: bestScore,
      zone: bestLabel ? classifyConfidenceZone(bestScore, this.thresholds) : 'none',
      matchMode: 'lexical-fallback',
      scores
    };
  }

  /**
   * Classe un texte contre les ancres sémantiques par similarité cosinus.
   */
  async classify(
    text: string,
    options?: { encoder?: Encoder; thresholds?: Partial<SemanticThresholds> }
  ): Promise<SemanticClassificationResult<TLabel>> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { label: null, score: 0, zone: 'none', matchMode: 'lexical-fallback', scores: {} };
    }

    const encoder = tryResolveSemanticEncoder(options?.encoder);
    if (!encoder) {
      return this.classifyLexical(trimmed);
    }

    const effThresholds = { ...this.thresholds, ...options?.thresholds };

    try {
      const version = await encoder.version();
      const anchorVecs = await this.getAnchorVectors(encoder, version);
      const queryVec = await encodeWithCache(encoder, version, trimmed);

      const scores: Partial<Record<TLabel, number>> = {};
      const ranked: Array<{ label: TLabel; score: number }> = [];

      for (const [label, vecs] of anchorVecs.entries()) {
        let maxSim = 0;
        for (const v of vecs) {
          const sim = cosineSimilarity(queryVec, v);
          if (sim > maxSim) maxSim = sim;
        }
        const rounded = Math.round(maxSim * 10000) / 10000;
        scores[label] = rounded;
        ranked.push({ label, score: rounded });
      }

      ranked.sort((a, b) => b.score - a.score);
      const top1 = ranked[0];
      const top2 = ranked[1];

      if (!top1 || top1.score < effThresholds.possible) {
        return {
          label: null,
          score: top1?.score ?? 0,
          zone: 'none',
          matchMode: 'semantic',
          scores
        };
      }

      const margin = top2 ? top1.score - top2.score : 1;
      const accepted =
        top1.score >= effThresholds.high || margin >= effThresholds.minMargin;

      return {
        label: accepted ? top1.label : null,
        score: top1.score,
        zone: accepted ? classifyConfidenceZone(top1.score, effThresholds) : 'none',
        matchMode: 'semantic',
        scores
      };
    } catch {
      return this.classifyLexical(trimmed);
    }
  }
}

/**
 * Rapproche un texte d'une liste d'entités dynamiques (feuilles d'ontologie, briques TOGAF,
 * règles de doctrine, clauses RFP) par similarité cosinus.
 */
export async function matchEntitiesSemantically<TItem>(
  queryText: string,
  candidates: ReadonlyArray<SemanticEntityCandidate<TItem>>,
  options?: {
    encoder?: Encoder;
    threshold?: number;
    topK?: number;
    lexicalScorer?: (candidate: SemanticEntityCandidate<TItem>) => number;
  }
): Promise<Array<SemanticEntityMatch<TItem>>> {
  const trimmed = queryText.trim();
  if (!trimmed || candidates.length === 0) return [];

  const threshold = options?.threshold ?? DEFAULT_SEMANTIC_THRESHOLDS.possible;
  const topK = options?.topK ?? 5;
  const encoder = tryResolveSemanticEncoder(options?.encoder);

  if (encoder) {
    try {
      const version = await encoder.version();
      const queryVec = await encodeWithCache(encoder, version, trimmed);
      const results: Array<SemanticEntityMatch<TItem>> = [];

      for (const cand of candidates) {
        const candVec =
          cand.vector && cand.vector.length === queryVec.length
            ? cand.vector
            : await encodeWithCache(encoder, version, cand.text);
        const sim = Math.round(cosineSimilarity(queryVec, candVec) * 10000) / 10000;
        if (sim >= threshold) {
          results.push({
            item: cand.item,
            score: sim,
            zone: classifyConfidenceZone(sim),
            matchMode: 'semantic'
          });
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
    } catch {
      // Repli explicite vers lexicalScorer ci-dessous
    }
  }

  if (!options?.lexicalScorer) return [];

  const fallbackResults: Array<SemanticEntityMatch<TItem>> = [];
  for (const cand of candidates) {
    const rawScore = options.lexicalScorer(cand);
    if (rawScore > 0) {
      const normalizedScore = Math.min(0.95, 0.55 + rawScore * 0.08);
      fallbackResults.push({
        item: cand.item,
        score: Math.round(normalizedScore * 1000) / 1000,
        zone: classifyConfidenceZone(normalizedScore),
        matchMode: 'lexical-fallback'
      });
    }
  }
  fallbackResults.sort((a, b) => b.score - a.score);
  return fallbackResults.slice(0, topK);
}
