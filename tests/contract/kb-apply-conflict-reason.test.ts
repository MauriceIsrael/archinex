import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import KbFrameworkDetailPage from '../../src/routes/kb/frameworks/[id]/+page.svelte';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { POST as applyPost } from '../../src/routes/api/frameworks/ingestions/[id]/apply/+server';
import type { FrameworkIngestion } from '$lib/types/llmops';

describe('Issue #156 — Hub 409 conflict reason extraction & separation of duties alert on apply', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockIngestion: FrameworkIngestion = {
    id: '42',
    framework_id: 'NIS2',
    framework_name: 'Directive NIS 2 (UE) 2022/2555',
    version: '2022/2555',
    file_name: 'nis2.txt',
    file_format: 'txt',
    file_size_bytes: 1024,
    created_at: '2026-04-20T10:00:00Z',
    status: 'reviewing',
    total_requirements: 2,
    reviewed_requirements: 1,
    requirements: [
      {
        id: 'REQ-1',
        framework_id: 'NIS2',
        section: 'Article 21',
        title: 'Politique de sécurité des systèmes d’information',
        text: 'Les entités adoptent des politiques relatives à la sécurité des systèmes d’information.',
        domain: 'security',
        status: 'accepted',
        reviewed_by: 'reviewer@example.com',
        reviewed_at: '2026-04-20T11:00:00Z',
        mapped_assets: []
      }
    ]
  };

  describe('LLMOpsClient.applyFrameworkIngestion', () => {
    it('extracts separation_of_duties reason from Hub 409 envelope', async () => {
      const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000' });
      const hubEnvelope = {
        status: 'invalid_argument',
        argument: 'apply',
        reason: 'separation_of_duties: reviewer@example.com decided REQ-1; a mandatory control is applied by a maintainer who did not decide it.',
        conflict: true
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(hubEnvelope), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res = await client.applyFrameworkIngestion('42', 'reviewer@example.com');
      expect(res.status).toBe('conflict');
      expect(res.error).toBe(hubEnvelope.reason);
      expect(res.code).toBe('separation_of_duties');
    });

    it('extracts generic conflict reason (e.g. abandoned ingestion) from Hub 409 envelope', async () => {
      const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'invalid_argument', reason: 'the ingestion is abandoned.', conflict: true }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res = await client.applyFrameworkIngestion('42', 'maintainer@example.com');
      expect(res.status).toBe('conflict');
      expect(res.error).toBe('the ingestion is abandoned.');
      expect(res.code).toBeUndefined();
    });

    it('falls back to default conflict error if body is empty or malformed on 409', async () => {
      const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('', { status: 409, headers: { 'Content-Type': 'application/json' } })
      );

      const res = await client.applyFrameworkIngestion('42', 'maintainer@example.com');
      expect(res.status).toBe('conflict');
      expect(res.error).toBe('Conflit lors de l’application');
    });

    it('extracts reason from non-ok responses (403, 400, 500)', async () => {
      const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:8000' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'forbidden', reason: 'Seul un mainteneur peut appliquer ce lot' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res403 = await client.applyFrameworkIngestion('42', 'user@example.com');
      expect(res403.status).toBe('forbidden');
      expect(res403.error).toBe('Seul un mainteneur peut appliquer ce lot');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: 'Validation de schéma échouée' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const res400 = await client.applyFrameworkIngestion('42', 'maintainer@example.com');
      expect(res400.status).toBe('error');
      expect(res400.error).toBe('Validation de schéma échouée');
    });
  });

  describe('POST /api/frameworks/ingestions/[id]/apply', () => {
    it('returns HTTP 409 and passes error, reason and code on conflict', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'invalid_argument',
            argument: 'apply',
            reason: 'separation_of_duties: reviewer@example.com decided REQ-1; a mandatory control is applied by a maintainer who did not decide it.',
            conflict: true
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await applyPost({
        params: { id: '42' },
        locals: { session: { user: { email: 'reviewer@example.com' } } }
      } as any);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.status).toBe('conflict');
      expect(body.error).toContain('separation_of_duties: reviewer@example.com decided REQ-1');
      expect(body.reason).toContain('separation_of_duties: reviewer@example.com decided REQ-1');
      expect(body.code).toBe('separation_of_duties');
    });
  });

  describe('UI alert rendering on /kb/frameworks/[id]', () => {
    it('displays the 4-eyes explanation when the reason mentions separation_of_duties', () => {
      const conflictMsg =
        'Publication impossible : separation_of_duties: reviewer@example.com decided REQ-1; a mandatory control is applied by a maintainer who did not decide it.';

      const { html } = render(KbFrameworkDetailPage, {
        props: {
          data: {
            user: { id: 'usr-1', name: 'User', email: 'reviewer@example.com', role: 'admin' },
            expert: { kbHandle: '@reviewer', kbRoles: ['kb:maintain'], ownedDomains: ['security'], registered: true },
            ingestion: mockIngestion,
            initialCoverageError: conflictMsg
          }
        }
      });

      expect(html).toContain('data-testid="coverage-error-banner"');
      expect(html).toContain('Séparation des fonctions requise (contrôle des 4 yeux)');
      expect(html).toContain(conflictMsg);
      expect(html).toContain('data-testid="separation-of-duties-explanation"');
      expect(html).toMatch(/Principe de la revue indépendante \(4 yeux — règle d(&#39;|')intégrité #91\)/);
      expect(html).toContain('doivent être appliqués par un autre mainteneur');
    });

    it('displays the exact Hub error without 4-eyes box for generic publication conflicts', () => {
      const conflictMsg = 'Publication impossible : the ingestion is abandoned.';

      const { html } = render(KbFrameworkDetailPage, {
        props: {
          data: {
            user: { id: 'usr-1', name: 'User', email: 'reviewer@example.com', role: 'admin' },
            expert: { kbHandle: '@reviewer', kbRoles: ['kb:maintain'], ownedDomains: ['security'], registered: true },
            ingestion: mockIngestion,
            initialCoverageError: conflictMsg
          }
        }
      });

      expect(html).toContain('data-testid="coverage-error-banner"');
      expect(html).toContain('Publication bloquée (Conflit 409)');
      expect(html).toContain(conflictMsg);
      expect(html).not.toContain('data-testid="separation-of-duties-explanation"');
    });
  });
});
