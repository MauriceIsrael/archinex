import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as ingestFrameworkPost } from '../../src/routes/api/frameworks/ingestions/+server';
import { load as loadFrameworkReview } from '../../src/routes/kb/frameworks/[id]/+page.server';
import { userOwnsDomain } from '$lib/domain/regulatoryFrameworks';
import { llmopsClient } from '$lib/server/llmops/client';
import {
  lookupDefaultFrameworkVersion,
  isGenericFrameworkVersion
} from '$lib/domain/regulatoryFrameworks';

describe('Issue #93 — Version officielle au téléversement et revue des clauses vérifiables', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Version officielle et refus des versions génériques', () => {
    it('refuse expressément les versions génériques comme "1.0", "v1.0", "latest" (HTTP 400)', async () => {
      const genericVersions = ['1.0', '1', '1.0.0', 'v1.0', 'v1', 'latest', 'draft'];

      for (const ver of genericVersions) {
        const req = new Request('http://localhost/api/frameworks/ingestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            framework_id: 'NIS2',
            version: ver,
            file_name: 'nis2.txt',
            raw_text: 'Article 21. Mesures de gestion des risques'
          })
        });

        const res = await ingestFrameworkPost({
          request: req,
          locals: { session: { user: { email: 'expert@archinex.local' } } }
        } as any);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.status).toBe('error');
        expect(data.error).toContain(`La version « ${ver} » est générique`);
        expect(data.error).toContain('2022/2555 pour NIS2');
      }
    });

    it('pré-remplit automatiquement la version officielle si omise pour un référentiel connu', async () => {
      const ingestSpy = vi.spyOn(llmopsClient, 'ingestFramework').mockResolvedValueOnce({
        status: 'ok',
        data: {
          id: 'ing-nis2-1',
          framework_id: 'NIS2',
          framework_name: 'Directive NIS 2 (UE) 2022/2555',
          version: '2022/2555',
          file_name: 'nis2.txt',
          file_format: 'txt',
          file_size_bytes: 100,
          created_at: new Date().toISOString(),
          status: 'ready',
          total_requirements: 1,
          reviewed_requirements: 0,
          requirements: []
        }
      });

      const req = new Request('http://localhost/api/frameworks/ingestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          framework_id: 'NIS2',
          file_name: 'nis2.txt',
          raw_text: 'Article 21. Mesures de gestion des risques'
        })
      });

      const res = await ingestFrameworkPost({
        request: req,
        locals: { session: { user: { email: 'expert@archinex.local' } } }
      } as any);

      expect(res.status).toBe(201);
      expect(ingestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          framework_id: 'NIS2',
          version: '2022/2555'
        }),
        'expert@archinex.local'
      );
    });

    it('accepte une version officielle explicite (ex: 2024/2847 pour CRA)', async () => {
      const ingestSpy = vi.spyOn(llmopsClient, 'ingestFramework').mockResolvedValueOnce({
        status: 'ok',
        data: {
          id: 'ing-cra-1',
          framework_id: 'CRA',
          framework_name: 'Cyber Resilience Act',
          version: '2024/2847',
          file_name: 'cra.txt',
          file_format: 'txt',
          file_size_bytes: 100,
          created_at: new Date().toISOString(),
          status: 'ready',
          total_requirements: 1,
          reviewed_requirements: 0,
          requirements: []
        }
      });

      const req = new Request('http://localhost/api/frameworks/ingestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          framework_id: 'CRA',
          version: '2024/2847',
          file_name: 'cra.txt',
          raw_text: 'Article 14. Obligations de signalement'
        })
      });

      const res = await ingestFrameworkPost({
        request: req,
        locals: { session: { user: { email: 'expert@archinex.local' } } }
      } as any);

      expect(res.status).toBe(201);
      expect(ingestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          framework_id: 'CRA',
          version: '2024/2847'
        }),
        'expert@archinex.local'
      );
    });
  });

  describe('2. Clauses vérifiables sur l’écran de revue de référentiel', () => {
    it('charge et rattache les clauses vérifiables (checks) aux exigences du référentiel', async () => {
      vi.spyOn(llmopsClient, 'getFrameworkIngestion').mockResolvedValueOnce({
        status: 'ok',
        data: {
          id: 'ing-1',
          framework_id: 'NIS2',
          framework_name: 'Directive NIS 2',
          version: '2022/2555',
          file_name: 'nis2.pdf',
          file_format: 'pdf',
          file_size_bytes: 1000,
          created_at: new Date().toISOString(),
          status: 'ready',
          total_requirements: 2,
          reviewed_requirements: 0,
          requirements: [
            {
              id: 'NIS2-ART21-2C',
              framework_id: 'NIS2',
              section: 'Article 21.2.c',
              title: 'Continuité des activités et gestion de crise',
              text: 'Gestion des sauvegardes et reprise d’activité.',
              domain: 'security',
              status: 'pending',
              mapped_assets: []
            },
            {
              id: 'NIS2-ART21-2D',
              framework_id: 'NIS2',
              section: 'Article 21.2.d',
              title: 'Sécurité de la chaîne d’approvisionnement',
              text: 'Sécurité des relations avec les fournisseurs.',
              domain: 'architecture',
              status: 'pending',
              mapped_assets: []
            }
          ]
        }
      });

      vi.spyOn(llmopsClient, 'getMe').mockResolvedValueOnce({
        status: 'ok',
        data: {
          handle: '@security-lead',
          name: 'Security Lead',
          email: 'sec@archinex.local',
          kb_roles: ['kb:review', 'kb:maintain'],
          owned_domains: ['security', 'architecture'],
          pending_reviews: 0
        }
      });

      vi.spyOn(llmopsClient, 'listCheckClauses').mockResolvedValueOnce({
        status: 'ok',
        data: {
          clauses: [
            {
              asset_id: 'NIS2-ART21-2C',
              typed_id: 'control:NIS2-ART21-2C',
              asset_type: 'control',
              asset_title: 'Continuité des activités',
              domain: ['security'],
              asset_excerpt: 'Gestion des sauvegardes...',
              revision: 2,
              check_id: 'NIS2-ART21-2C-C1',
              kind: 'forbids',
              when: { terms_any: ['no backup', 'sans sauvegarde'] },
              message: 'Sauvegardes obligatoires et séparées.',
              status: 'draft',
              may_decide: true
            },
            {
              asset_id: 'NIS2-ART21-2C',
              typed_id: 'control:NIS2-ART21-2C',
              asset_type: 'control',
              asset_title: 'Continuité des activités',
              domain: ['security'],
              asset_excerpt: 'Gestion des sauvegardes...',
              revision: 2,
              check_id: 'NIS2-ART21-2C-C2',
              kind: 'requires',
              when: { terms_any: ['plan de reprise'] },
              expect: { terms_any: ['off-site', 'immutable'] },
              message: 'Plan de reprise avec copies immuables hors-site.',
              status: 'validated',
              may_decide: true
            }
          ],
          counts: { draft: 1, validated: 1, rejected: 0 },
          mandatory_without_clause: [],
          pending_publication: 0
        }
      });

      const pageData = (await loadFrameworkReview({
        params: { id: 'ing-1' },
        locals: {
          session: {
            user: { id: 'u1', name: 'Security Lead', email: 'sec@archinex.local', role: 'admin' }
          }
        }
      } as any)) as any;

      expect(pageData.ingestion).toBeDefined();
      expect(pageData.clauses).toHaveLength(2);

      const reqWithClauses = pageData.ingestion.requirements.find((r: any) => r.id === 'NIS2-ART21-2C');
      expect(reqWithClauses).toBeDefined();
      expect(reqWithClauses?.checks).toHaveLength(2);

      const c1 = reqWithClauses?.checks?.[0];
      expect(c1?.check_id).toBe('NIS2-ART21-2C-C1');
      expect(c1?.kind).toBe('forbids');
      expect(c1?.status).toBe('draft');
      expect(c1?.when.terms_any).toContain('no backup');

      const c2 = reqWithClauses?.checks?.[1];
      expect(c2?.check_id).toBe('NIS2-ART21-2C-C2');
      expect(c2?.kind).toBe('requires');
      expect(c2?.status).toBe('validated');
      expect(c2?.expect?.terms_any).toContain('off-site');
    });
  });

  describe('3. Droits de revue et contrôle de possession de domaine (userOwnsDomain)', () => {
    it('permet au mainteneur (kb:maintain) de relire tous les domaines', () => {
      expect(userOwnsDomain({ kbRoles: ['kb:maintain'], ownedDomains: [] }, 'security-governance')).toBe(true);
      expect(userOwnsDomain({ kbRoles: ['kb:maintain'], ownedDomains: [] }, 'anything')).toBe(true);
    });

    it('accorde la revue sur le domaine possédé exactement ou un sous-domaine hiérarchique avec slash', () => {
      const expert = { kbRoles: ['kb:review'], ownedDomains: ['it-infrastructure', 'security'] };
      expect(userOwnsDomain(expert, 'it-infrastructure')).toBe(true);
      expect(userOwnsDomain(expert, 'it-infrastructure/virtualization')).toBe(true);
      expect(userOwnsDomain(expert, 'security')).toBe(true);
      expect(userOwnsDomain(expert, 'security/network')).toBe(true);
    });

    it('interdit la revue si le domaine n\'est pas possédé, et ne traite PAS le tiret "-" comme un sous-domaine', () => {
      const expertAlice = { kbRoles: ['kb:review'], ownedDomains: ['network-automation', 'architecture', 'security'] };
      // security-governance est possédé par @security-compliance-team, PAS par security
      expect(userOwnsDomain(expertAlice, 'security-governance')).toBe(false);
      expect(userOwnsDomain(expertAlice, 'security-monitoring')).toBe(false);
      expect(userOwnsDomain(expertAlice, 'cloud-platform')).toBe(false);
    });
  });
});
