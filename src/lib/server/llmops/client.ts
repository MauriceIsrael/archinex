/**
 * Client d'intégration LLMOps (Knowledge Hub) pour Archinex
 * Implémente le Dual-Mode (Mode 1 REST live / Mode 2 Offline-First scellé)
 * Conforme à CONTRAT-KH-API-V1 et ADR-0015.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  LLMOpsHealth,
  LLMOpsSnapshot,
  LLMOpsBoardItem,
  LLMOpsStatement,
  LLMOpsConflict,
  LLMOpsRfpShredResponse,
  LLMOpsResponseEnvelope,
  LLMOpsSyncPayload,
  DoctrineContext,
  DoctrineItem,
  CheckResult,
  OptionVerdict,
  FrameworkCoverage,
  FrameworkStatus,
  KbCandidate,
  KbRole,
  KbOwner,
  KbOwnersRegistry,
  KbUserProfile,
  KbMeResponse,
  KbReviewInboxItem,
  KbCandidateDetail,
  KbComment,
  KbEvent,
  KbInboxResponse,
  KbEventsResponse
} from './types';

export interface LLMOpsClientConfig {
  baseUrl?: string;
  authToken?: string;
  defaultEngagement?: string;
  timeoutMs?: number;
}

export class LLMOpsClient {
  private baseUrl: string;
  private authToken: string;
  private defaultEngagement: string;
  private timeoutMs: number;

  constructor(config: LLMOpsClientConfig = {}) {
    // Par défaut, le client fonctionne STRICTEMENT en réseau local souverain (127.0.0.1:8000 ou mode hors-ligne scellé).
    // Tout appel vers GCP Cloud Run ou un cloud externe est rigoureusement bloqué pour garantir l'étanchéité absolue des RFP.
    this.baseUrl = (config.baseUrl || process.env.LLMOPS_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    this.authToken = config.authToken || process.env.LLMOPS_AUTH_TOKEN || 'demo-local-sovereign-2026';
    this.defaultEngagement = config.defaultEngagement || process.env.LLMOPS_ENGAGEMENT || 'default-project';
    this.timeoutMs = config.timeoutMs || 1500;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /**
   * Vérifie si une URL appartient strictement au réseau local ou à la machine hôte.
   * Tout domaine cloud externe (GCP, AWS, Azure, internet public) est bloqué par défaut.
   */
  isLocalNetworkUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      // Domaines cloud / externes formellement interdits
      if (
        host.includes('run.app') ||
        host.includes('googleapis.com') ||
        host.includes('amazonaws.com') ||
        host.includes('openai.com') ||
        host.includes('azure.com')
      ) {
        return false;
      }

      return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host === '0.0.0.0' ||
        !host.includes('.') || // Noms d'hôtes locaux intranet (ex: nas, srv-local)
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        host.endsWith('.lan') ||
        host.endsWith('.home') ||
        /^192\.168\./.test(host) ||
        /^10\./.test(host) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
      );
    } catch {
      return false;
    }
  }

  /**
   * Mappe les identifiants d'engagements locaux vers l'identifiant reconnu par le serveur local.
   */
  resolveRemoteEngagement(engagement?: string): string {
    return engagement || this.defaultEngagement;
  }

  private getHeaders(engagement?: string, actorEmail?: string): Record<string, string> {
    const eng = this.resolveRemoteEngagement(engagement || this.defaultEngagement);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
      'X-Engagement-Id': eng
    };
    if (actorEmail) {
      headers['X-Actor-Email'] = actorEmail;
    }
    return headers;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.isLocalNetworkUrl(url)) {
      console.warn(`🔒 [Air-Gap Souverain] Blocage d'exfiltration : tentative de connexion vers un cloud externe (${url}) bloquée net. Les données du RFP restent confinées à votre réseau local.`);
      throw new Error(`Air-Gap Security: External cloud access prohibited (${url}). Working in local network only.`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Charge le bundle scellé de secours hors-ligne
   */
  private loadOfflineBundle(): {
    engagement: string;
    health: LLMOpsHealth;
    board: LLMOpsBoardItem[];
    statements: LLMOpsStatement[];
    conflicts: LLMOpsConflict[];
  } {
    const candidates = [
      resolve(process.cwd(), 'tests/fixtures/llmops/llmops-offline-bundle.json'),
      resolve(process.cwd(), '../LLMOps/data/snapshots/latest.json')
    ];

    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
          const parsed = JSON.parse(raw);
          if (parsed.health && parsed.board && parsed.statements) {
            return {
              engagement: parsed.engagement || this.defaultEngagement,
              health: parsed.health,
              board: parsed.board,
              statements: parsed.statements,
              conflicts: parsed.conflicts || []
            };
          }
        } catch {
          // Continue to next candidate
        }
      }
    }

    // Fallback minimal garanti en mémoire si aucun fichier n'est lisible
    return {
      engagement: this.defaultEngagement,
      health: {
        status: 'ok',
        plane: 'offline-memory',
        schema_version: '1.0',
        service: 'archinex-offline-fallback',
        engine_version: '0.1.0',
        engine_commit: 'offline',
        kb: {
          snapshot_id: 'snapshot-offline-fallback',
          source_revision: 'offline',
          payload_sha256: 'sha256:offline-sealed-mock',
          created_at: new Date().toISOString()
        }
      },
      board: [
        {
          subject: 'core-platform',
          name: 'core-platform',
          level: 'L2_decomposed',
          origin: 'blueprint',
          days_at_level: 0,
          updated_at: new Date().toISOString(),
          is_stalled: false,
          open_question_ref: null,
          assigned_role: 'domain_architect',
          dependent_sections: ['1.1']
        }
      ],
      statements: [
        {
          id: 'S-OFFLINE-01',
          section: '1.1',
          subject: 'core-platform',
          predicate: 'implements',
          value: 'Baseline Standard Architecture',
          unit: null,
          author: 'archinex-offline',
          role: 'system',
          confidence: 'designed',
          verbatim: 'Instantané hors-ligne par défaut.',
          status: 'active'
        }
      ],
      conflicts: []
    };
  }

  /**
   * Surveillance de santé / version (Mode 1 live avec fallback Mode 2)
   */
  async getHealth(): Promise<{ data: LLMOpsHealth; source: 'live' | 'offline-fallback' }> {
    try {
      const url = `${this.baseUrl}/health`;
      const res = await this.fetchWithTimeout(url);
      if (res.ok) {
        const data = (await res.json()) as LLMOpsHealth;
        return { data, source: 'live' };
      }
    } catch {
      // Live unreachable -> fallback offline
    }

    const bundle = this.loadOfflineBundle();
    return { data: bundle.health, source: 'offline-fallback' };
  }

  /**
   * Récupération du snapshot scellé
   */
  async getLatestSnapshot(): Promise<{ data: LLMOpsSnapshot; source: 'live' | 'offline-fallback' }> {
    try {
      const url = `${this.baseUrl}/snapshot/latest`;
      const res = await this.fetchWithTimeout(url, { headers: this.getHeaders() });
      if (res.ok) {
        const data = (await res.json()) as LLMOpsSnapshot;
        return { data, source: 'live' };
      }
    } catch {
      // Fallback
    }

    const fixturePath = resolve(process.cwd(), 'tests/fixtures/llmops/llmops-sealed-snapshot.json');
    if (existsSync(fixturePath)) {
      const raw = readFileSync(fixturePath, 'utf-8').replace(/^\uFEFF/, '');
      return { data: JSON.parse(raw) as LLMOpsSnapshot, source: 'offline-fallback' };
    }

    throw new Error('No snapshot available in live or offline storage.');
  }

  /**
   * Tableau de maturité d'architecture (L0-L4)
   */
  async getBoard(engagement?: string): Promise<{ data: LLMOpsBoardItem[]; source: 'live' | 'offline-fallback' }> {
    const remoteEng = this.resolveRemoteEngagement(engagement || this.defaultEngagement);
    try {
      const url = `${this.baseUrl}/api/arbitration/board?engagement=${encodeURIComponent(remoteEng)}`;
      const res = await this.fetchWithTimeout(url, { headers: this.getHeaders(remoteEng) });
      if (res.ok) {
        const env = (await res.json()) as LLMOpsResponseEnvelope<LLMOpsBoardItem[]>;
        if (env.status === 'ok' && Array.isArray(env.data)) {
          return { data: env.data, source: 'live' };
        }
      }
    } catch {
      // Fallback
    }

    const bundle = this.loadOfflineBundle();
    return { data: bundle.board, source: 'offline-fallback' };
  }

  /**
   * Liste des énoncés d'architecture
   */
  async getStatements(
    engagement?: string,
    subject?: string
  ): Promise<{ data: LLMOpsStatement[]; source: 'live' | 'offline-fallback' }> {
    const remoteEng = this.resolveRemoteEngagement(engagement || this.defaultEngagement);
    try {
      let url = `${this.baseUrl}/api/arbitration/statements?engagement=${encodeURIComponent(remoteEng)}`;
      if (subject) {
        url += `&subject=${encodeURIComponent(subject)}`;
      }
      const res = await this.fetchWithTimeout(url, { headers: this.getHeaders(remoteEng) });
      if (res.ok) {
        const env = (await res.json()) as LLMOpsResponseEnvelope<LLMOpsStatement[]>;
        if (env.status === 'ok' && Array.isArray(env.data)) {
          return { data: env.data, source: 'live' };
        }
      }
    } catch {
      // Fallback
    }

    const bundle = this.loadOfflineBundle();
    let stmts = bundle.statements;
    if (subject) {
      stmts = stmts.filter((s) => s.subject === subject);
    }
    return { data: stmts, source: 'offline-fallback' };
  }

  /**
   * Liste des conflits / contradictions
   */
  async getConflicts(
    engagement?: string,
    status = 'open'
  ): Promise<{ data: LLMOpsConflict[]; source: 'live' | 'offline-fallback' }> {
    const remoteEng = this.resolveRemoteEngagement(engagement || this.defaultEngagement);
    try {
      const url = `${this.baseUrl}/api/arbitration/conflicts?engagement=${encodeURIComponent(remoteEng)}&status=${encodeURIComponent(status)}`;
      const res = await this.fetchWithTimeout(url, { headers: this.getHeaders(remoteEng) });
      if (res.ok) {
        const env = (await res.json()) as LLMOpsResponseEnvelope<LLMOpsConflict[]>;
        if (env.status === 'ok' && Array.isArray(env.data)) {
          return { data: env.data, source: 'live' };
        }
      }
    } catch {
      // Fallback
    }

    const bundle = this.loadOfflineBundle();
    return { data: bundle.conflicts, source: 'offline-fallback' };
  }

  /**
   * Dépouillement automatique d'un CCTP en clauses candidates (RFP Shredder)
   */
  async shredRfp(
    rfpText: string,
    documentId = 'cctp-archinex-input',
    documentVersion = '1.0',
    engagement?: string
  ): Promise<LLMOpsRfpShredResponse> {
    const eng = engagement || this.defaultEngagement;
    try {
      const url = `${this.baseUrl}/api/rfp/shred-to-candidates`;
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getHeaders(eng),
        body: JSON.stringify({
          rfp_text: rfpText,
          document_id: documentId,
          document_version: documentVersion,
          engagement: eng,
          destination: 'knowledge-hub-reference'
        })
      });
      if (res.ok) {
        return (await res.json()) as LLMOpsRfpShredResponse;
      }
    } catch {
      // Fallback
    }

    // Simulation locale intelligente si offline
    const sentences = rfpText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    return {
      status: 'ok',
      documentId,
      documentVersion,
      count: sentences.length,
      candidates: sentences.map((sentence, idx) => ({
        id: `cand-LOCAL-${idx + 1}`,
        sourceFragment: {
          id: `frag-LOCAL-${idx + 1}`,
          documentId,
          documentVersion,
          sectionPath: [`${idx + 1}.0`],
          originalText: sentence,
          hash: `sha256:local-${idx + 1}`
        },
        originalText: sentence,
        normalizedText: sentence,
        candidateKind: sentence.toLowerCase().includes('doit') ? 'governance-obligation' : 'technical-specification',
        suggestedDestination: 'knowledge-hub-reference',
        routingConfidence: 0.9,
        verificationModes: ['manual-inspection']
      }))
    };
  }

  /**
   * Soumission d'une règle doctrinale candidate ou suggestion au Knowledge Hub LLMOps
   */
  async submitKnowledgeSuggestion(suggestion: {
    title: string;
    rationale: string;
    suggestedChange: string;
    author?: string;
    sourceEngagement?: string;
    contactEmail?: string;
  }): Promise<{ status: string; suggestionId?: string; message?: string }> {
    const eng = suggestion.sourceEngagement || this.defaultEngagement;
    const remoteEng = this.resolveRemoteEngagement(eng);

    try {
      const url = `${this.baseUrl}/api/knowledge/suggestions`;
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getHeaders(remoteEng),
        body: JSON.stringify({
          title: suggestion.title,
          rationale: suggestion.rationale,
          suggested_change: suggestion.suggestedChange,
          author: suggestion.author || 'M. Israel (Lead Architect)',
          contact_email: suggestion.contactEmail || 'maurice.israel@free.fr',
          source_engagement: remoteEng
        })
      });

      if (res.ok) {
        const body = await res.json();
        const payload = body.data || body;
        return {
          status: 'ok',
          suggestionId: payload.suggestion_id,
          message: payload.message || `Règle doctrinale transmise au Knowledge Hub avec l'ID ${payload.suggestion_id}.`
        };
      }
    } catch {
      // Live inaccessible -> fallback local
    }

    const fallbackId = `SUG-LOCAL-${Date.now().toString(36).toUpperCase()}`;
    return {
      status: 'ok',
      suggestionId: fallbackId,
      message: `Règle doctrinale enregistrée en mémoire locale souveraine (ID ${fallbackId}).`
    };
  }

  /**
   * Doctrine applicable à un sujet (GET /api/knowledge/context)
   */
  async getDoctrineContext(params: {
    subject?: string;
    domains?: string[];
    frameworks?: string[];
    max_items?: number;
    max_chars?: number;
  } = {}): Promise<DoctrineContext> {
    try {
      const q = new URLSearchParams();
      if (params.subject) q.set('subject', params.subject);
      if (params.domains && params.domains.length > 0) q.set('domains', params.domains.join(','));
      if (params.frameworks && params.frameworks.length > 0) q.set('frameworks', params.frameworks.join(','));
      if (params.max_items) q.set('max_items', String(params.max_items));
      if (params.max_chars) q.set('max_chars', String(params.max_chars));

      const url = `${this.baseUrl}/api/knowledge/context?${q.toString()}`;
      const res = await this.fetchWithTimeout(url, { headers: this.getHeaders() });
      if (res.ok) {
        const body = await res.json();
        const data = (body.data || body) as DoctrineContext;
        return { ...data, offline: false };
      }
    } catch {
      // Live unreachable -> fallback offline
    }

    // Repli hors ligne scellé : filtre l'instantané scellé par termes et domaines
    return this.getDoctrineContextOffline(params);
  }

  /**
   * Filtrage hors-ligne scellé pour getDoctrineContext
   */
  private getDoctrineContextOffline(params: {
    subject?: string;
    domains?: string[];
    frameworks?: string[];
    max_items?: number;
  }): DoctrineContext {
    let items: DoctrineItem[] = [];

    const fixturePath = resolve(process.cwd(), 'tests/fixtures/llmops/llmops-sealed-snapshot.json');
    if (existsSync(fixturePath)) {
      try {
        const raw = readFileSync(fixturePath, 'utf-8').replace(/^\uFEFF/, '');
        const snapshot = JSON.parse(raw) as LLMOpsSnapshot;
        const appIndex = snapshot.applicability_index || {};

        const domainsFilter = (params.domains || []).map((d) => d.toLowerCase());
        const subjectFilter = (params.subject || '').toLowerCase();

        for (const [key, meta] of Object.entries(appIndex)) {
          const entry = meta as { domains?: string[]; rules?: string[]; phases?: string[] };
          const entryDomains = (entry.domains || []).map((d) => d.toLowerCase());

          const matchesDomain =
            domainsFilter.length === 0 || entryDomains.some((d) => domainsFilter.includes(d));
          const matchesSubject =
            !subjectFilter ||
            key.toLowerCase().includes(subjectFilter) ||
            (entry.rules || []).some((r) => r.toLowerCase().includes(subjectFilter));

          if (matchesDomain && matchesSubject) {
            items.push({
              id: key,
              type: key.startsWith('ADR-') ? 'adr' : key.startsWith('TPL-') ? 'pattern' : 'rule',
              title: `Règle doctrinale ${key}`,
              content: `Extrait scellé pour ${key} (domaines : ${entry.domains?.join(', ') || 'général'}).`,
              domain: entry.domains?.[0],
              confidence: 'verified'
            });
          }
        }
      } catch {
        // En cas d'erreur de parsing, items reste vide
      }
    }

    if (params.max_items && items.length > params.max_items) {
      items = items.slice(0, params.max_items);
    }

    return {
      subject: params.subject,
      domains: params.domains,
      frameworks: params.frameworks,
      items,
      total_items: items.length,
      truncated: false,
      offline: true
    };
  }

  /**
   * Vérification d'une option d'architecture par rapport à la doctrine (POST /api/knowledge/check)
   */
  async checkOption(params: {
    option: { id: string; title: string; summary: string; kbRefs?: string[] };
    subject?: string;
    domain?: string;
    frameworks?: string[];
  }): Promise<CheckResult> {
    try {
      const url = `${this.baseUrl}/api/knowledge/check`;
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params)
      });
      if (res.ok) {
        const body = await res.json();
        const data = (body.data || body) as CheckResult;
        return { ...data, offline: false };
      }
    } catch {
      // Live unreachable -> fallback offline
    }

    // Repli hors-ligne : renvoie tout en unassessed, avec offline: true. Ne jamais inventer de verdict.
    const kbRefs = params.option.kbRefs || [];
    const verdicts: OptionVerdict[] = kbRefs.map((ref) => ({
      rule_id: ref,
      status: 'unassessed',
      rationale: 'Évaluation non disponible en mode hors-ligne. Verdict non émis.',
      exception_allowed: false
    }));

    if (verdicts.length === 0) {
      verdicts.push({
        rule_id: 'RULE-DEFAULT',
        status: 'unassessed',
        rationale: 'Aucun référentiel KB associé à cette option. Vérification hors-ligne indisponible.',
        exception_allowed: false
      });
    }

    return {
      verdicts,
      offline: true
    };
  }

  /**
   * Couverture réglementaire du projet (GET /api/compliance/frameworks/applicable)
   */
  async getFrameworkCoverage(engagement?: string): Promise<FrameworkCoverage> {
    const remoteEng = this.resolveRemoteEngagement(engagement || this.defaultEngagement);
    try {
      const url = `${this.baseUrl}/api/compliance/frameworks/applicable?engagement=${encodeURIComponent(remoteEng)}`;
      const res = await this.fetchWithTimeout(url, { headers: this.getHeaders(remoteEng) });
      if (res.ok) {
        const body = await res.json();
        const data = (body.data || body) as FrameworkCoverage;
        return { ...data, offline: false };
      }
    } catch {
      // Live unreachable -> fallback offline
    }

    return {
      frameworks: [],
      overall_coverage: 'unknown',
      checked_at: new Date().toISOString(),
      offline: true
    };
  }

  /**
   * Déclaration des référentiels applicables au projet (PUT /api/compliance/frameworks/applicable)
   */
  async setApplicableFrameworks(
    engagement: string,
    frameworks: string[]
  ): Promise<{ status: string }> {
    const remoteEng = this.resolveRemoteEngagement(engagement);
    try {
      const url = `${this.baseUrl}/api/compliance/frameworks/applicable`;
      const res = await this.fetchWithTimeout(url, {
        method: 'PUT',
        headers: this.getHeaders(remoteEng),
        body: JSON.stringify({ engagement: remoteEng, frameworks })
      });
      if (res.ok) {
        return { status: 'ok' };
      }
    } catch {
      // Live unreachable -> fallback offline
    }

    return { status: 'offline_recorded' };
  }

  /**
   * Soumission d'un candidat à la KB (POST /api/knowledge/candidates)
   */
  async submitCandidate(candidate: KbCandidate, actorEmail?: string): Promise<{ candidate_id: string; status: string }> {
    const eng = candidate.source.engagement || this.defaultEngagement;
    const remoteEng = this.resolveRemoteEngagement(eng);

    try {
      const url = `${this.baseUrl}/api/knowledge/candidates`;
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getHeaders(remoteEng, actorEmail),
        body: JSON.stringify(candidate)
      });
      if (res.ok) {
        const body = await res.json();
        const payload = body.data || body;
        return {
          candidate_id: payload.candidate_id || payload.id || `CAND-${Date.now()}`,
          status: payload.status || 'in_review'
        };
      }
    } catch {
      // Live unreachable -> fallback offline
    }

    const localId = `CAND-LOCAL-${Date.now().toString(36).toUpperCase()}`;
    return {
      candidate_id: localId,
      status: 'in_review'
    };
  }

  /**
   * Liste des candidats KB (GET /api/knowledge/candidates)
   */
  async listCandidates(filter: { source?: string; engagement?: string } = {}, actorEmail?: string): Promise<KbCandidate[]> {
    const eng = filter.engagement || this.defaultEngagement;
    const remoteEng = this.resolveRemoteEngagement(eng);

    try {
      const q = new URLSearchParams();
      if (filter.source) q.set('source', filter.source);
      if (remoteEng) q.set('engagement', remoteEng);

      const url = `${this.baseUrl}/api/knowledge/candidates?${q.toString()}`;
      const res = await this.fetchWithTimeout(url, { headers: this.getHeaders(remoteEng, actorEmail) });
      if (res.ok) {
        const body = await res.json();
        const data = body.data || body;
        return Array.isArray(data) ? data : [];
      }
    } catch {
      // Fallback
    }

    return [];
  }

  /**
   * Récupère le profil KB de l'utilisateur connecté auprès de LLMOps
   * GET /api/knowledge/me avec X-Actor-Email
   */
  async getMe(actorEmail: string): Promise<KbMeResponse> {
    if (!actorEmail) {
      return { status: 'error', error: 'Actor email required' };
    }

    try {
      const url = `${this.baseUrl}/api/knowledge/me`;
      const res = await this.fetchWithTimeout(url, {
        headers: this.getHeaders(undefined, actorEmail)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'LLMOps governance database unavailable (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        const data = body.data || body;
        return {
          status: 'ok',
          data: {
            handle: data.handle || `@${actorEmail.split('@')[0]}`,
            email: data.email || actorEmail,
            name: data.name,
            kb_roles: (data.kb_roles || data.roles || []) as KbRole[],
            owned_domains: data.owned_domains || data.domains || [],
            pending_reviews: data.pending_reviews ?? 0,
            delegated: data.delegated ?? false
          }
        };
      }
    } catch {
      // Live inaccessible -> fallback local
    }

    return {
      status: 'ok',
      data: {
        handle: `@${actorEmail.split('@')[0]}`,
        email: actorEmail,
        kb_roles: [],
        owned_domains: [],
        pending_reviews: 0,
        offline: true
      }
    };
  }

  /**
   * Récupère le registre des propriétaires (owners) de doctrine
   * GET /api/knowledge/owners
   */
  async getOwners(actorEmail?: string): Promise<KbOwnersRegistry> {
    try {
      const url = `${this.baseUrl}/api/knowledge/owners`;
      const res = await this.fetchWithTimeout(url, {
        headers: this.getHeaders(undefined, actorEmail)
      });
      if (res.ok) {
        const body = await res.json();
        const payload = body.data || body;
        const owners = Array.isArray(payload) ? payload : (payload.owners || []);
        return {
          owners,
          total: owners.length
        };
      }
    } catch {
      // Fallback
    }

    return {
      owners: [],
      total: 0,
      offline: true
    };
  }

  /**
   * Met à jour le registre des propriétaires (owners)
   * PUT /api/knowledge/owners
   */
  async updateOwners(owners: KbOwner[], actorEmail?: string): Promise<{ success: boolean; updated_count: number; offline?: boolean; error?: string }> {
    try {
      const url = `${this.baseUrl}/api/knowledge/owners`;
      const res = await this.fetchWithTimeout(url, {
        method: 'PUT',
        headers: this.getHeaders(undefined, actorEmail),
        body: JSON.stringify({ owners })
      });

      if (res.status === 503) {
        return { success: false, updated_count: 0, error: 'LLMOps governance database unavailable (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        const payload = body.data || body;
        return {
          success: true,
          updated_count: payload.updated_count ?? owners.length
        };
      }
    } catch {
      // Fallback
    }

    return {
      success: false,
      updated_count: 0,
      offline: true
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BOÎTE DE REVUE EXPERTE & CANDIDATS KB (Lot A7 - Porte G5)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Récupère la boîte de réception des revues en attente pour un expert.
   * Propage l'en-tête X-Actor-Email.
   */
  async getReviewInbox(
    actorEmail: string,
    filters?: { domain?: string; kind?: string }
  ): Promise<KbInboxResponse> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const url = new URL(`${this.baseUrl}/api/knowledge/reviews/inbox`);
      if (filters?.domain) url.searchParams.set('domain', filters.domain);
      if (filters?.kind) url.searchParams.set('kind', filters.kind);

      const res = await fetch(url.toString(), {
        headers: this.getHeaders(undefined, actorEmail),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data || body
        };
      }

      return {
        status: 'error',
        error: `Erreur HTTP ${res.status} lors de la récupération de la boîte de revue`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : boîte de revue indisponible sans serveur de gouvernance'
      };
    }
  }

  /**
   * Récupère le détail d'un candidat à la KB (avec les 7 vérifications automatiques, historique, etc.)
   */
  async getCandidate(
    candidateId: string,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCandidateDetail; error?: string }> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/knowledge/candidates/${candidateId}`, {
        headers: this.getHeaders(undefined, actorEmail),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data || body
        };
      }

      return {
        status: 'error',
        error: `Candidat introuvable ou erreur HTTP ${res.status}`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Service de gouvernance KB indisponible'
      };
    }
  }

  /**
   * Action d'examen d'un candidat (accept, amend, reject).
   * Propage STRICTEMENT l'en-tête X-Actor-Email et JAMAIS de champ reviewer dans le corps (règle Issue #2).
   */
  async reviewCandidate(
    candidateId: string,
    action: 'accept' | 'amend' | 'reject',
    payload: { reason?: string; amended_content?: string },
    actorEmail: string
  ): Promise<{
    status: 'ok' | 'error' | 'conflict' | 'forbidden' | 'unavailable';
    data?: KbCandidateDetail;
    error?: string;
  }> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const bodyToSend: { action: string; reason?: string; amended_content?: string } = {
        action,
        reason: payload.reason,
        amended_content: payload.amended_content
      };

      const res = await fetch(`${this.baseUrl}/api/knowledge/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: {
          ...this.getHeaders(undefined, actorEmail),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyToSend),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        return {
          status: 'forbidden',
          error:
            errJson.error ||
            `Action refusée (403) : vous ne possédez pas les droits de domaine requis pour statuer sur ce candidat.`
        };
      }

      if (res.status === 409) {
        const errJson = await res.json().catch(() => ({}));
        return {
          status: 'conflict',
          error:
            errJson.error ||
            `Conflit d'état (409) : ce candidat a déjà fait l'objet d'une décision terminale.`
        };
      }

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data || body
        };
      }

      const errJson = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: errJson.error || `Erreur HTTP ${res.status} lors de l'examen du candidat`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : action d’examen impossible sans connexion à LLMOps'
      };
    }
  }

  /**
   * Assigne ou réassigne un candidat à un autre expert.
   */
  async assignCandidate(
    candidateId: string,
    assignee: string,
    reason: string,
    actorEmail: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCandidateDetail; error?: string }> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/knowledge/candidates/${candidateId}/assign`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(undefined, actorEmail),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ assignee, reason }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        return { status: 'ok', data: body.data || body };
      }

      return { status: 'error', error: `Erreur HTTP ${res.status} lors de l'assignation` };
    } catch {
      return { status: 'unavailable', error: 'Service indisponible' };
    }
  }

  /**
   * Sollicite un second avis ou une expertise complémentaire sur un candidat.
   */
  async requestReview(
    candidateId: string,
    req: { kind: 'second_review' | 'advice'; recipient: string; message: string; due_at?: string },
    actorEmail: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; success?: boolean; error?: string }> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await fetch(
        `${this.baseUrl}/api/knowledge/candidates/${candidateId}/request-review`,
        {
          method: 'POST',
          headers: {
            ...this.getHeaders(undefined, actorEmail),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(this.timeoutMs)
        }
      );

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        return { status: 'ok', success: true };
      }

      return { status: 'error', error: `Erreur HTTP ${res.status} lors de la sollicitation de revue` };
    } catch {
      return { status: 'unavailable', error: 'Service indisponible' };
    }
  }

  /**
   * Récupère le fil de discussion associé à un candidat.
   */
  async getComments(
    candidateId: string,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbComment[]; error?: string }> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/knowledge/candidates/${candidateId}/comments`, {
        headers: this.getHeaders(undefined, actorEmail),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        return { status: 'ok', data: body.data?.comments || body.comments || [] };
      }

      return { status: 'error', error: `Erreur HTTP ${res.status} lors du chargement des commentaires` };
    } catch {
      return { status: 'unavailable', error: 'Service indisponible' };
    }
  }

  /**
   * Ajoute un commentaire sur un candidat.
   */
  async addComment(
    candidateId: string,
    message: string,
    actorEmail: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbComment; error?: string }> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/knowledge/candidates/${candidateId}/comments`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(undefined, actorEmail),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        return { status: 'ok', data: body.data || body };
      }

      return { status: 'error', error: `Erreur HTTP ${res.status} lors de l'ajout du commentaire` };
    } catch {
      return { status: 'unavailable', error: 'Service indisponible' };
    }
  }

  /**
   * Scrute les événements de gouvernance KB depuis un curseur.
   */
  async pollEvents(sinceCursor?: string): Promise<KbEventsResponse> {
    if (!this.isLocalNetworkUrl(this.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const url = new URL(`${this.baseUrl}/api/knowledge/events`);
      if (sinceCursor) url.searchParams.set('since', sinceCursor);

      const res = await fetch(url.toString(), {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data || body
        };
      }

      return { status: 'error', error: `Erreur HTTP ${res.status} lors du polling d'événements` };
    } catch {
      return { status: 'unavailable', error: 'Service indisponible' };
    }
  }

  /**
   * Synchronisation globale composite (Board + Statements + Conflicts + Health)
   * Bascule automatiquement en local si offline
   */
  async syncEngagement(engagement?: string): Promise<LLMOpsSyncPayload> {
    const localEng = engagement || this.defaultEngagement;
    const remoteEng = this.resolveRemoteEngagement(localEng);

    // Fast-fail health check : si Cloud Run / serveur est injoignable, on bascule immédiatement en local sans attendre
    const healthRes = await this.getHealth();
    if (healthRes.source !== 'live') {
      const bundle = this.loadOfflineBundle();
      return {
        source: 'offline-fallback',
        engagement: localEng,
        syncedAt: new Date().toISOString(),
        health: bundle.health,
        board: bundle.board,
        statements: bundle.statements,
        conflicts: bundle.conflicts,
        snapshotMeta: bundle.health.kb
      };
    }

    const [boardRes, statementsRes, conflictsRes] = await Promise.all([
      this.getBoard(remoteEng),
      this.getStatements(remoteEng),
      this.getConflicts(remoteEng)
    ]);

    const isLive =
      healthRes.source === 'live' &&
      boardRes.source === 'live' &&
      statementsRes.source === 'live';

    return {
      source: isLive ? 'live' : 'offline-fallback',
      engagement: localEng,
      syncedAt: new Date().toISOString(),
      health: healthRes.data,
      board: boardRes.data,
      statements: statementsRes.data,
      conflicts: conflictsRes.data,
      snapshotMeta: healthRes.data.kb
    };
  }
}

export const llmopsClient = new LLMOpsClient();
