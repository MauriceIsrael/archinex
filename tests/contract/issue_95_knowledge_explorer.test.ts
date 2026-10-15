import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { load as loadKnowledge } from '../../src/routes/knowledge/+page.server';
import { load as loadAssetDetail } from '../../src/routes/knowledge/[id]/+page.server';

describe('Archinex #95 & LLMOps #108 - Explorateur de doctrine complet & historique d’actif', () => {
  const FAKE_BASE = 'http://localhost:3000';
  let client: LLMOpsClient;

  beforeEach(() => {
    client = new LLMOpsClient({ baseUrl: FAKE_BASE, authToken: 'test-token' });
  });

  describe('1. LLMOps Client - Publications & Asset History (Contrat 1.27)', () => {
    it('listKbPublications() appelle GET /api/knowledge/publications et retourne la liste avec entry_path', async () => {
      const mockPubs = [
        {
          id: 'pub-001',
          snapshot_id: 'snapshot-2026-09-29-75fa05f',
          version: 'v1.0.0',
          published_at: '2026-09-29T10:00:00Z',
          published_by: '@maintainers',
          sha256_checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          changelog: 'Socle initial de référence',
          assets_count: 60,
          storage_persistent: true,
          entry_path: {
            type: 'initial_baseline',
            description: 'Socle initial'
          },
          reviewers: ['@maintainers'],
          assets_added: ['P-001', 'P-002'],
          assets_revised: [],
          assets_removed: []
        },
        {
          id: 'pub-002',
          snapshot_id: 'snapshot-2026-10-12-8d76db5',
          version: 'v1.1.0',
          published_at: '2026-10-12T10:00:00Z',
          published_by: '@maintainers',
          sha256_checksum: '3551fbf856d2e65ffc445a87ede903f0da097e27edddf1f1a781597ef0396302',
          changelog: 'Ingestion Cyber Resilience Act',
          assets_count: 90,
          storage_persistent: true,
          entry_path: {
            type: 'framework_ingestion',
            framework: 'CRA',
            version: '2024/0284(COD)',
            source_sha256: '3551fbf856d2e65ffc445a87ede903f0da097e27edddf1f1a781597ef0396302'
          },
          reviewers: ['@maintainers'],
          assets_added: ['CRA-ART14-1'],
          assets_revised: [],
          assets_removed: []
        }
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            count: 2,
            publications: mockPubs
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await client.listKbPublications({ entry_type: 'framework_ingestion' });
      expect(res.status).toBe('ok');
      expect(res.data).toHaveLength(2);
      expect(res.data?.[1].entry_path?.type).toBe('framework_ingestion');
      expect(res.data?.[1].entry_path?.framework).toBe('CRA');
      expect(res.data?.[1].entry_path?.source_sha256).toBe('3551fbf856d2e65ffc445a87ede903f0da097e27edddf1f1a781597ef0396302');
    });

    it('getAssetHistory() appelle GET /api/knowledge/assets/:id/history et retourne l’historique successif', async () => {
      const mockHistory = {
        status: 'ok',
        asset_id: 'CRA-ART14-1',
        asset_type: 'control',
        title: 'Obligations des fabricants pour le signalement des vulnérabilités',
        domain: ['vulnerability-management'],
        framework: 'CRA',
        status_doctrine: 'active',
        checks_status: 'validated',
        initial_date: '2026-10-12',
        entry_path: {
          type: 'framework_ingestion',
          framework: 'CRA',
          version: '2024/0284(COD)',
          source_sha256: '3551fbf856d2e65ffc445a87ede903f0da097e27edddf1f1a781597ef0396302'
        },
        validators: ['@maintainers'],
        revisions: [
          {
            revision: 1,
            date: '2026-10-12',
            snapshot_id: 'snapshot-2026-10-12-8d76db5',
            author: '@maintainers',
            reviewers: ['@maintainers'],
            change_summary: 'Ingestion initiale du texte CRA'
          }
        ],
        clause_decisions: [
          {
            check_id: 'CRA-ART14-1-C1',
            at: '2026-10-12T10:00:00Z',
            by: '@security-team',
            decision: 'validate',
            comment: 'Validé en conformité'
          }
        ]
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'ok', data: mockHistory }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await client.getAssetHistory('CRA-ART14-1');
      expect(res.status).toBe('ok');
      expect(res.data?.asset_id).toBe('CRA-ART14-1');
      expect(res.data?.entry_path?.type).toBe('framework_ingestion');
      expect(res.data?.revisions).toHaveLength(1);
      expect(res.data?.revisions[0].snapshot_id).toBe('snapshot-2026-10-12-8d76db5');
      expect(res.data?.validators).toContain('@maintainers');
      expect(res.data?.clause_decisions).toHaveLength(1);
    });

    it('getAssetHistory() retourne not_found lorsque l’actif n’existe pas (HTTP 404)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'not_found', error: 'Actif introuvable' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await client.getAssetHistory('NON-EXISTENT-XYZ');
      expect(res.status).toBe('not_found');
      expect(res.error).toContain('Actif introuvable');
    });
  });

  describe('2. /knowledge +page.server.ts - Chargement et socle vide', () => {
    it('charge la snapshot, les clauses et les publications', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              snapshot_id: 'snap-1',
              assets: [{ id: 'P-002', title: 'Isolation des pannes', type: 'principle', domain: 'resilience' }],
              controls: [{ id: 'NIS2-ART21-2A', framework: 'NIS2', title: 'Politique de risque' }]
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'ok', data: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: 'ok',
              data: {
                clauses: [
                  {
                    asset_id: 'P-002',
                    check_id: 'P-002-C1',
                    kind: 'requires',
                    when: { terms_any: ['panne'] },
                    expect: { terms_any: ['isolation'] },
                    status: 'validated'
                  }
                ],
                counts: { validated: 1, draft: 0, rejected: 0 },
                mandatory_without_clause: []
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: 'ok',
              publications: [
                {
                  snapshot_id: 'snapshot-2026-09-29-75fa05f',
                  entry_path: { type: 'initial_baseline' }
                }
              ]
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );

      const res = (await loadKnowledge({
        url: new URL('http://localhost/knowledge?tab=opposable')
      } as any)) as any;

      expect(res.snapshot.assets).toHaveLength(1);
      expect(res.checkClauses).toHaveLength(1);
      expect(res.checkClauses[0].status).toBe('validated');
      expect(res.publications).toHaveLength(1);
      expect(res.initialTab).toBe('opposable');
    });

    it('gère explicitement le repli en cas d’erreur (socle vide)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connexion refusée'));

      const res = (await loadKnowledge({
        url: new URL('http://localhost/knowledge')
      } as any)) as any;

      expect(res.snapshot.assets).toEqual([]);
      expect(res.snapshot.controls).toEqual([]);
      expect(res.source).toBe('offline-error');
      expect(res.error).toContain('Connexion refusée');
    });
  });

  describe('3. /knowledge/[id] +page.server.ts - Fiche d’un actif', () => {
    it('charge l’actif, son historique et ses clauses', async () => {
      const mockHistory = {
        status: 'ok',
        asset_id: 'P-002',
        title: 'Principe Isolation des pannes',
        entry_path: { type: 'initial_baseline' },
        validators: ['@maintainers'],
        revisions: [{ revision: 1, date: '2026-09-29', snapshot_id: 'snapshot-2026-09-29-75fa05f' }]
      };

      vi.spyOn(globalThis, 'fetch')
        // 1. getAssetHistory
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'ok', data: mockHistory }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        // 2. getLatestSnapshot
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              assets: [{ id: 'P-002', title: 'Principe Isolation des pannes', type: 'principle', summary: 'Texte intégral' }],
              controls: []
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        // 3. listCheckClauses
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: 'ok',
              data: {
                clauses: [{ asset_id: 'P-002', check_id: 'P-002-C1', status: 'validated', kind: 'requires' }]
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        // 4. getComplianceFrameworks
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'ok', data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        );

      const res = (await loadAssetDetail({
        params: { id: 'P-002' }
      } as any)) as any;

      expect(res.assetId).toBe('P-002');
      expect(res.asset?.title).toBe('Principe Isolation des pannes');
      expect(res.history?.entry_path?.type).toBe('initial_baseline');
      expect(res.clauses).toHaveLength(1);
      expect(res.clauses[0].status).toBe('validated');
    });

    it('lève une erreur 404 quand l’actif est introuvable', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ assets: [], controls: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', data: { clauses: [] } }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', data: [] }), { status: 200 }));

      await expect(
        loadAssetDetail({ params: { id: 'NON-EXISTENT-XYZ' } } as any)
      ).rejects.toThrow();
    });
  });
});

