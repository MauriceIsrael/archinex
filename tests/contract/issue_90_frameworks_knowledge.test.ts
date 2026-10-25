import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import KbFrameworksPage from '../../src/routes/kb/frameworks/+page.svelte';
import KbFrameworkDetailPage from '../../src/routes/kb/frameworks/[id]/+page.svelte';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { POST as abandonPost } from '../../src/routes/api/frameworks/ingestions/[id]/abandon/+server';
import { GET as listIngestionsGet } from '../../src/routes/api/frameworks/ingestions/+server';
import { load as loadKnowledge } from '../../src/routes/knowledge/+page.server';

describe('Issue #90 — Opposable frameworks overview, ingestion abandon & /knowledge validation status', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getComplianceFrameworks normalizes coverage status, expected/validated counts, declaration metadata and validated_controls', async () => {
    const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          count: 2,
          data: [
            {
              framework: 'NIS2',
              version: 'EU 2022/2555',
              title: 'Directive NIS2',
              control_count: 10,
              status: 'partial',
              expected: 10,
              present: 10,
              validated: 2,
              provisional: 8,
              declared_by: '@ciso-office',
              declared_at: '2026-04-12T10:00:00Z',
              validated_controls: [
                { id: 'NIS2-ART21-2A', validated_by: ['@ciso-office'], validated_at: '2026-04-12' },
                { id: 'NIS2-ART21-2D', validated_by: ['@ciso-office'], validated_at: '2026-04-12' }
              ]
            },
            {
              framework: 'SecNumCloud',
              version: '3.2',
              title: 'ANSSI SecNumCloud',
              control_count: 14,
              status: 'partial',
              expected: null,
              present: 14,
              validated: 0,
              provisional: 14,
              declared_by: null,
              declared_at: null,
              validated_controls: []
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const res = await client.getComplianceFrameworks();
    expect(res.status).toBe('ok');
    expect(res.data).toHaveLength(2);
    expect(res.data[0]).toMatchObject({
      framework: 'NIS2',
      status: 'partial',
      expected: 10,
      present: 10,
      validated: 2,
      provisional: 8,
      declared_by: '@ciso-office',
      declared_at: '2026-04-12T10:00:00Z'
    });
    expect(res.data[0].validated_controls).toHaveLength(2);
    expect(res.data[1]).toMatchObject({
      framework: 'SecNumCloud',
      expected: null,
      validated: 0,
      provisional: 14,
      declared_by: null
    });
  });

  it('listFrameworkIngestions passes status query parameter and preserves abandon metadata', async () => {
    const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          data: [
            {
              id: 7,
              framework: 'NIS2',
              version: '2022/2555',
              source_name: 'nis2.pdf',
              status: 'abandoned',
              abandoned_by: '@maintainers',
              abandoned_at: '2026-04-19T12:00:00Z',
              abandon_reason: 'Doublon de test'
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const res = await client.listFrameworkIngestions('expert@example.org', 'abandoned');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/frameworks/ingestions?status=abandoned',
      expect.anything()
    );
    expect(res.status).toBe('ok');
    expect(res.data?.[0]).toMatchObject({
      id: '7',
      framework_id: 'NIS2',
      status: 'abandoned',
      abandoned_by: '@maintainers',
      abandoned_at: '2026-04-19T12:00:00Z',
      abandon_reason: 'Doublon de test'
    });
  });

  it('POST /api/frameworks/ingestions/[id]/abandon validates reason and maps LLMOps responses', async () => {
    const badReq = new Request('http://localhost/api/frameworks/ingestions/4/abandon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '   ' })
    });
    const badRes = await abandonPost({
      params: { id: '4' },
      request: badReq,
      locals: { session: { user: { email: 'expert@example.org' } } }
    } as any);
    expect(badRes.status).toBe(400);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            id: 4,
            framework: 'NIS2',
            version: '1.0',
            status: 'abandoned',
            abandoned_by: '@maintainers',
            abandoned_at: '2026-04-19T12:05:00Z',
            abandon_reason: 'Essai obsolète',
            requirements: []
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const okReq = new Request('http://localhost/api/frameworks/ingestions/4/abandon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Essai obsolète' })
    });
    const okRes = await abandonPost({
      params: { id: '4' },
      request: okReq,
      locals: { session: { user: { email: 'expert@example.org' } } }
    } as any);
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body.data.status).toBe('abandoned');
    expect(body.data.abandon_reason).toBe('Essai obsolète');
  });

  it('GET /api/frameworks/ingestions forwards status query parameter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const res = await listIngestionsGet({
      url: new URL('http://localhost/api/frameworks/ingestions?status=reviewing'),
      locals: { session: { user: { email: 'expert@example.org' } } }
    } as any);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/frameworks/ingestions?status=reviewing'),
      expect.anything()
    );
  });

  it('/knowledge +page.server.ts enriches controls with validated_by and passes initialFramework', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            snapshot_id: 'snap-1',
            created_at: '2026-04-19T00:00:00Z',
            assets: [],
            controls: [
              { id: 'NIS2-ART21-2A', framework: 'NIS2', title: 'Politique analyse de risque', domain: 'security' },
              { id: 'NIS2-ART21-2B', framework: 'NIS2', title: 'Gestion des incidents', domain: 'security' }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            data: [
              {
                framework: 'NIS2',
                version: '2022/2555',
                title: 'NIS2',
                control_count: 2,
                status: 'partial',
                expected: 2,
                present: 2,
                validated: 1,
                provisional: 1,
                declared_by: null,
                declared_at: null,
                validated_controls: [
                  { id: 'NIS2-ART21-2A', validated_by: ['@ciso-office'], validated_at: '2026-04-12' }
                ]
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const data = (await loadKnowledge({
      url: new URL('http://localhost/knowledge?framework=NIS2')
    } as any)) as any;

    expect(data.initialFramework).toBe('NIS2');
    expect(data.snapshot.controls[0].validated_by).toEqual(['@ciso-office']);
    expect(data.snapshot.controls[1].validated_by).toEqual([]);
  });

  it('renders direct links to pending ingestions when no compliance framework is in active snapshot', () => {
    const mockIngestion = {
      id: '1',
      framework_id: 'NIS2',
      framework_name: 'Directive NIS 2 (UE) 2022/2555',
      version: '2022/2555',
      file_name: 'nis2.txt',
      file_format: 'txt',
      file_size_bytes: 100,
      created_at: new Date().toISOString(),
      status: 'reviewing',
      total_requirements: 10,
      reviewed_requirements: 2,
      requirements: []
    };

    const { html } = render(KbFrameworksPage, {
      props: {
        data: {
          user: { id: 'usr-1', name: 'User', email: 'user@example.com', role: 'admin' },
          expert: { kbHandle: '@expert', kbRoles: ['kb:maintain'], ownedDomains: ['security'] },
          frameworks: [mockIngestion as any],
          complianceFrameworks: [],
          offline: false
        }
      }
    });

    expect(html).toContain('Aucun référentiel de conformité recensé dans le snapshot actif.');
    expect(html).toContain('href="/kb/frameworks/1"');
    expect(html).toContain('Directive NIS 2 (UE) 2022/2555 (#1)');
  });

  it('excludes abandoned ingestions from empty-state links and default active list', () => {
    const activeIngestion = {
      id: '1',
      framework_id: 'NIS2',
      framework_name: 'Directive NIS 2 (UE) 2022/2555',
      version: '2022/2555',
      file_name: 'nis2.txt',
      file_format: 'txt',
      file_size_bytes: 100,
      created_at: new Date().toISOString(),
      status: 'reviewing',
      total_requirements: 10,
      reviewed_requirements: 2,
      requirements: []
    };
    const abandonedIngestion = {
      id: '99',
      framework_id: 'CRA_OBSOLETE',
      framework_name: 'Cyber Resilience Act (abandonné)',
      version: '2024/0000',
      file_name: 'cra_old.pdf',
      file_format: 'pdf',
      file_size_bytes: 200,
      created_at: new Date().toISOString(),
      status: 'abandoned',
      abandon_reason: 'Version PDF obsolète',
      total_requirements: 5,
      reviewed_requirements: 0,
      requirements: []
    };

    const { html } = render(KbFrameworksPage, {
      props: {
        data: {
          user: { id: 'usr-1', name: 'User', email: 'user@example.com', role: 'admin' },
          expert: { kbHandle: '@expert', kbRoles: ['kb:maintain'], ownedDomains: ['security'] },
          frameworks: [activeIngestion as any, abandonedIngestion as any],
          complianceFrameworks: [],
          statusFilter: 'all',
          offline: false
        }
      }
    });

    // Active ingestion must be present in empty state and card list
    expect(html).toContain('href="/kb/frameworks/1"');
    expect(html).toContain('Directive NIS 2 (UE) 2022/2555');

    // Abandoned ingestion must NOT be present in default view or empty state
    expect(html).not.toContain('href="/kb/frameworks/99"');
    expect(html).not.toContain('Cyber Resilience Act (abandonné)');
    expect(html).toContain("1 lot d'ingestion est disponible en revue");
  });

  it('displays abandoned ingestions only when statusFilter is abandoned', () => {
    const abandonedIngestion = {
      id: '99',
      framework_id: 'CRA_OBSOLETE',
      framework_name: 'Cyber Resilience Act (abandonné)',
      version: '2024/0000',
      file_name: 'cra_old.pdf',
      file_format: 'pdf',
      file_size_bytes: 200,
      created_at: new Date().toISOString(),
      status: 'abandoned',
      abandon_reason: 'Version PDF obsolète',
      total_requirements: 5,
      reviewed_requirements: 0,
      requirements: []
    };

    const { html } = render(KbFrameworksPage, {
      props: {
        data: {
          user: { id: 'usr-1', name: 'User', email: 'user@example.com', role: 'admin' },
          expert: { kbHandle: '@expert', kbRoles: ['kb:maintain'], ownedDomains: ['security'] },
          frameworks: [abandonedIngestion as any],
          complianceFrameworks: [],
          statusFilter: 'abandoned',
          offline: false
        }
      }
    });

    expect(html).toContain('Cyber Resilience Act (abandonné)');
    expect(html).toContain('Version PDF obsolète');
    expect(html).toContain('href="/kb/frameworks/99"');
  });

  it('displays an explicit banner and disables action buttons when an ingestion is abandoned on /kb/frameworks/[id]', () => {
    const abandonedIngestion = {
      id: '42',
      framework_id: 'CRA',
      framework_name: 'Cyber Resilience Act (UE 2024/2847)',
      version: '2024/2847',
      file_name: 'cra.pdf',
      file_format: 'pdf',
      file_size_bytes: 12000,
      created_at: new Date().toISOString(),
      status: 'abandoned',
      abandon_reason: 'Doublon avec lot #43',
      abandoned_by: '@maintainers',
      abandoned_at: '2026-04-20T10:00:00Z',
      total_requirements: 10,
      reviewed_requirements: 0,
      requirements: []
    };

    const { html } = render(KbFrameworkDetailPage, {
      props: {
        data: {
          user: { id: 'usr-1', name: 'User', email: 'user@example.com', role: 'admin' },
          expert: { kbHandle: '@expert', kbRoles: ['kb:maintain'], ownedDomains: ['security'], registered: true },
          ingestion: abandonedIngestion as any
        }
      }
    });

    // Check banner, badge, and disabled buttons
    expect(html).toContain('data-testid="abandoned-ingestion-banner"');
    expect(html).toContain("Ce lot d'ingestion a été abandonné");
    expect(html).toContain('Doublon avec lot #43');
    expect(html).toContain('data-testid="abandoned-badge"');
    expect(html).toContain('Abandonnée');
    expect(html).not.toContain('data-testid="input-proposals"');
  });
});
