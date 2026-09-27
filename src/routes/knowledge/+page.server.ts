import type { PageServerLoad } from './$types';
import { llmopsClient } from '$lib/server/llmops/client';
import type { KnowledgeSnapshot } from '$lib/domain/knowledgeGraph';

export const load: PageServerLoad = async () => {
  try {
    const result = await llmopsClient.getLatestSnapshot();
    return {
      snapshot: result.data as unknown as KnowledgeSnapshot,
      source: result.source
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Impossible de charger le snapshot de connaissances';
    return {
      snapshot: {
        snapshot_id: 'snapshot-fallback-empty',
        created_at: new Date().toISOString(),
        assets: [],
        controls: [],
        frameworks: []
      } as KnowledgeSnapshot,
      source: 'offline-error',
      error: errorMsg
    };
  }
};
