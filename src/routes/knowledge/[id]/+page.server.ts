import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { llmopsClient } from '$lib/server/llmops/client';
import type { KnowledgeSnapshot } from '$lib/domain/knowledgeGraph';

export const load: PageServerLoad = async ({ params }) => {
  const assetId = params.id;
  if (!assetId) {
    throw error(404, 'Identifiant d’actif manquant');
  }

  try {
    const [historyRes, snapshotRes, clausesRes, complianceRes] = await Promise.all([
      llmopsClient.getAssetHistory(assetId),
      llmopsClient.getLatestSnapshot(),
      llmopsClient.listCheckClauses(),
      llmopsClient.getComplianceFrameworks()
    ]);

    if (historyRes.status === 'not_found') {
      throw error(404, `Actif "${assetId}" introuvable`);
    }

    const snapshot = (snapshotRes.data || { assets: [], controls: [] }) as unknown as KnowledgeSnapshot;
    const allItems: any[] = [...(snapshot.assets || []), ...(snapshot.controls || [])];
    let asset = allItems.find((item) => item.id === assetId);

    if (!asset && historyRes.status === 'ok' && historyRes.data) {
      asset = {
        id: historyRes.data.asset_id,
        title: historyRes.data.title || assetId,
        type: historyRes.data.asset_type || 'asset',
        domain: Array.isArray(historyRes.data.domain) ? historyRes.data.domain.join(', ') : historyRes.data.domain,
        framework: historyRes.data.framework,
        summary: historyRes.data.title
      };
    }

    if (!asset && historyRes.status !== 'ok') {
      throw error(404, `Actif "${assetId}" introuvable`);
    }

    const clauses = (clausesRes.data?.clauses || []).filter((cl: any) => cl.asset_id === assetId);

    return {
      assetId,
      asset,
      history: historyRes.data || null,
      clauses,
      frameworks: complianceRes.data || []
    };
  } catch (err: any) {
    if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
      throw err;
    }
    throw error(404, `Actif "${assetId}" introuvable`);
  }
};

