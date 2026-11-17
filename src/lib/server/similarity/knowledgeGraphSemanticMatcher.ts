/**
 * Rapprochement sémantique des actifs et contrôles du Knowledge Graph
 * par comparateur cosinus sur embeddings (`matchEntitiesSemantically`).
 *
 * Complète le matching déterministe par ID exact (`ADR-*`, `P-*`, `CTRL-*`)
 * de `src/lib/domain/knowledgeGraph.ts` sans dépendre des mots-clés statiques par domaine.
 */
import type { KnowledgeSnapshot } from '$lib/domain/knowledgeGraph';
import type { Encoder } from './encoder';
import { matchEntitiesSemantically, tryResolveSemanticEncoder, type MatchMode } from './semanticClassifier';

export interface SemanticAssetMatch {
  assetId: string;
  score: number;
  matchMode: MatchMode;
}

export async function matchKnowledgeAssetsSemantically(
  projectText: string,
  snapshot: KnowledgeSnapshot,
  encoderOverride?: Encoder
): Promise<Map<string, SemanticAssetMatch>> {
  const result = new Map<string, SemanticAssetMatch>();
  const encoder = tryResolveSemanticEncoder(encoderOverride);
  if (!encoder || !projectText.trim() || snapshot.assets.length === 0) {
    return result;
  }

  const candidates = snapshot.assets.map((asset) => ({
    item: asset,
    text: `${asset.id} ${asset.title} (${asset.domain || ''})`
  }));

  const matches = await matchEntitiesSemantically(projectText, candidates, {
    encoder,
    threshold: 0.65,
    topK: snapshot.assets.length
  });

  for (const m of matches) {
    result.set(m.item.id, {
      assetId: m.item.id,
      score: m.score,
      matchMode: m.matchMode
    });
  }
  return result;
}
