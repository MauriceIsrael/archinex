import type { PageServerLoad } from './$types';
import { llmopsClient } from '$lib/server/llmops/client';
import type { KnowledgeSnapshot } from '$lib/domain/knowledgeGraph';

export const load: PageServerLoad = async ({ url }) => {
  const initialFramework = url.searchParams.get('framework') || '';
  const initialTab = url.searchParams.get('tab') || '';
  try {
    const [result, complianceRes, clausesRes, publicationsRes] = await Promise.all([
      llmopsClient.getLatestSnapshot(),
      llmopsClient.getComplianceFrameworks(),
      llmopsClient.listCheckClauses(),
      llmopsClient.listKbPublications()
    ]);

    const snapshot = result.data as unknown as KnowledgeSnapshot;
    const validatedMap = new Map<string, { validated_by: string[]; validated_at?: string | null }>();
    for (const cf of complianceRes.data || []) {
      for (const vc of cf.validated_controls || []) {
        if (vc.id) {
          validatedMap.set(vc.id, {
            validated_by: vc.validated_by || [],
            validated_at: vc.validated_at ?? null
          });
        }
      }
    }

    if (Array.isArray(snapshot.controls)) {
      snapshot.controls = snapshot.controls.map((c) => {
        const existingValidated = Array.isArray(c.validated_by) ? c.validated_by : undefined;
        const fromCompliance = validatedMap.get(c.id);
        return {
          ...c,
          validated_by:
            existingValidated && existingValidated.length > 0
              ? existingValidated
              : fromCompliance?.validated_by || [],
          validated_at: (c.validated_at as string | null | undefined) ?? fromCompliance?.validated_at ?? null
        };
      });
    }

    return {
      snapshot,
      source: result.source,
      initialFramework,
      checkClauses: clausesRes.data?.clauses || [],
      publications: publicationsRes.data || [],
      initialTab
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
      initialFramework,
      checkClauses: [],
      publications: [],
      initialTab,
      error: errorMsg
    };
  }
};
