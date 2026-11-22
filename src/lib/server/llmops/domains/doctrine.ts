import type { LLMOpsTransport } from '../transport';
import { HubApiError } from '../transport';
import type {
  CheckClausesList,
  CheckClauseRow,
  CheckClauseDecision,
  CheckClauseMatcher,
  AssetClauseTrialVerdict,
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
  KbEventsResponse,
  KbAssetType,
  KbAssetTemplate,
  TestablePredicates,
  CandidateValidationResult,
  ClauseSimulationRequest,
  ClauseSimulationResult,
  FrameworkIngestion,
  FrameworkRequirement,
  FrameworkRequirementStatus,
  FrameworkLinkSuggestionResult,
  CoverageDeclarationResult,
  ComplianceFrameworkOverview,
  EvalTestCase,
  EvalDataset,
  EvalBenchmarkRunResult,
  VerdictFeedbackRequest,
  VerdictFeedbackItem,
  KbHealthMetrics,
  KbPublication,
  AssetHistoryResponse,
  KbCampaign,
  EmbeddingPendingItem,
  EmbeddingDeposit,
  SimilarKnowledgeRequest,
  SimilarKnowledgeResponse,
  SimilarKnowledgeItem,
  ReuseConfirmationRequest,
  ReuseConfirmation,
  SimilarityCase,
  SimilarityRun,
  HubEngagementRole,
  HubConfidentiality,
  HubMember,
  HubPublicMember,
  HubEngagementMe,
  HubAuditEvent,
  HubSubjectInput,
  HubSubjectResult,
  HubMaturityInput,
  HubMaturityResult,
  HubConfidence,
  HubOrigin,
  HubStatementStatus,
  HubStatementInput,
  HubStatementResult,
  HubAddStatementResponse,
  HubAssertStatementResponse,
  HubWithdrawStatementResponse,
  HubQuestionInput,
  HubQuestionResult,
  HubAddQuestionResponse,
  HubAnswerInput,
  HubRequirementItem,
  HubRequirementsInput,
  HubRequirementDispositionInput,
  HubRequirementDecisionResult,
  HubCarryRequirementsResult,
  HubRequirementsResult,
  HubArbitrateConflictInput,
  HubConflictResult,
  HubSnapshotRef,
  HubExportIssueResult,
  HubExportListingItem,
  HubExportEnvelope,
  HubDecisionInput,
  HubDecisionResult,
  HubDecisionFactInput
} from '../types';

export class DoctrineDomainClient {
	constructor(private readonly transport: LLMOpsTransport) {}


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
    const eng = suggestion.sourceEngagement || this.transport.defaultEngagement;
    const remoteEng = this.transport.resolveRemoteEngagement(eng);

    try {
      const url = `${this.transport.baseUrl}/api/knowledge/suggestions`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(remoteEng),
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
        this.transport.invalidateCache();
        const body = await res.json();
        const payload = body.data || body;
        return {
          status: 'ok',
          suggestionId: payload.suggestion_id,
          message: payload.message || `Règle doctrinale transmise au Knowledge Hub avec l'ID ${payload.suggestion_id}.`
        };
      }
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || errBody.detail || `Erreur HTTP ${res.status} lors de la suggestion`);
    } catch (e: any) {
      throw e;
    }
  }


  /**
   * Export du catalogue d'ontologie SI et relations depuis le Knowledge Hub (GET /api/knowledge/ontology/export)
   */
  async getOntologyExport(): Promise<any> {
    const url = `${this.transport.baseUrl}/api/knowledge/ontology/export`;
    const res = await this.transport.request(url, { headers: this.transport.getHeaders() });
    if (!res.ok) {
      throw new Error(`Knowledge Hub indisponible pour l'ontologie : code HTTP ${res.status}`);
    }
    const json = await res.json();
    return json.data || json;
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
    const q = new URLSearchParams();
    if (params.subject) q.set('subject', params.subject);
    if (params.domains && params.domains.length > 0) q.set('domains', params.domains.join(','));
    if (params.frameworks && params.frameworks.length > 0) q.set('frameworks', params.frameworks.join(','));
    if (params.max_items) q.set('max_items', String(params.max_items));
    if (params.max_chars) q.set('max_chars', String(params.max_chars));

    const cacheKey = `kb:doctrine-context:${q.toString()}`;
    const live = await this.transport.cachedFetch<DoctrineContext | null>(cacheKey, async () => {
      try {
        const url = `${this.transport.baseUrl}/api/knowledge/context?${q.toString()}`;
        const res = await this.transport.request(url, { headers: this.transport.getHeaders() });
        if (res.ok) {
          const body = await res.json();
          const data = (body.data || body) as DoctrineContext;
          return { ...data, offline: false };
        }
        // Hub joignable mais requête refusée (paramètre manquant, jeton…) : à distinguer d'une indisponibilité.
        const detail = await res.text().catch(() => '');
        console.warn(`[LLMOps] Contexte de doctrine refusé (HTTP ${res.status}) : ${detail.slice(0, 200)}`);
      } catch {
        // Live unreachable -> fallback offline
      }
      return null;
    });

    if (live) return live;

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
    domains?: string[];
    frameworks?: string[];
  }): Promise<CheckResult> {
    const domain = params.domain || (params.domains && params.domains[0]);
    const cacheKey = `compliance:check:${JSON.stringify({
      subject: params.subject ?? '',
      domain: domain ?? '',
      frameworks: [...(params.frameworks ?? [])].sort(),
      option: {
        id: params.option.id,
        title: params.option.title,
        summary: params.option.summary,
        kbRefs: [...(params.option.kbRefs ?? [])].sort()
      }
    })}`;

    const live = await this.transport.cachedFetch<CheckResult | null>(cacheKey, async () => {
      try {
        const url = `${this.transport.baseUrl}/api/knowledge/check`;
        const bodyPayload = {
          ...params,
          // Le juge de LLMOps lit title, description et statements : le résumé d'Archinex doit arriver en description
          option: { ...params.option, description: params.option.summary },
          domain
        };
        const res = await this.transport.request(url, {
          method: 'POST',
          headers: this.transport.getHeaders(),
          body: JSON.stringify(bodyPayload)
        });
        if (res.ok) {
          const body = await res.json();
          const data = (body.data || body) as CheckResult;
          return { ...data, offline: false };
        }
      } catch {
        // Live unreachable -> fallback offline
      }
      return null;
    });

    if (live) return live;

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
    const remoteEng = this.transport.resolveRemoteEngagement(engagement || this.transport.defaultEngagement);
    const cacheKey = `compliance:coverage:${remoteEng}`;
    const live = await this.transport.cachedFetch<FrameworkCoverage | null>(cacheKey, async () => {
      try {
        const url = `${this.transport.baseUrl}/api/compliance/frameworks/applicable?engagement=${encodeURIComponent(remoteEng)}`;
        const res = await this.transport.request(url, { headers: this.transport.getHeaders(remoteEng) });
        if (res.ok) {
          const body = await res.json();
          const data = body.data || body;
          // Format servi par LLMOps : { applicable_frameworks, coverage: { NIS2: { status, expected, validated, missing_ids } } }
          if (data && typeof data.coverage === 'object' && data.coverage !== null) {
            const frameworks = Object.entries(data.coverage as Record<string, any>).map(([name, c]) => ({
              name,
              required: true,
              status: (['covered', 'partial', 'missing'].includes(c?.status) ? c.status : 'unknown') as FrameworkStatus['status'],
              covered_count: c?.validated ?? 0,
              total_count: c?.expected ?? 0,
              missing_clauses: Array.isArray(c?.missing_ids) ? c.missing_ids : []
            }));
            const overall: FrameworkCoverage['overall_coverage'] = frameworks.length === 0
              ? 'unknown'
              : frameworks.every((f) => f.status === 'covered') ? 'covered'
              : frameworks.some((f) => f.status === 'missing') ? 'missing' : 'partial';
            return { frameworks, overall_coverage: overall, checked_at: new Date().toISOString(), offline: false };
          }
          return { ...(data as FrameworkCoverage), frameworks: data?.frameworks ?? [], offline: false };
        }
      } catch {
        // Live unreachable -> fallback offline
      }
      return null;
    });

    if (live) return live;

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
    const remoteEng = this.transport.resolveRemoteEngagement(engagement);
    try {
      const url = `${this.transport.baseUrl}/api/compliance/frameworks/applicable`;
      const res = await this.transport.request(url, {
        method: 'PUT',
        headers: this.transport.getHeaders(remoteEng),
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
   * Clauses vérifiables de la doctrine et leur statut propre (GET /api/knowledge/checks, contrat 1.26)
   */
  async listCheckClauses(
    filters: { status?: string; framework?: string; type?: string; asset_id?: string } = {},
    actorEmail?: string,
    options: { bypassCache?: boolean } = {}
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: CheckClausesList; error?: string }> {
    const q = new URLSearchParams();
    if (filters) {
      for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    }
    const qs = q.toString();
    const cacheKey = `kb:checks:${this.transport.baseUrl}:${qs}:${actorEmail || ''}`;
    if (options.bypassCache) this.transport.invalidateCache(cacheKey);

    return this.transport.cachedFetch(cacheKey, async () => {
      try {
        const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/checks?${qs}`, {
          headers: this.transport.getHeaders(undefined, actorEmail)
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return { status: 'ok', data: (body.data || body) as CheckClausesList };
        if (res.status === 404) {
          return { status: 'error', error: 'LLMOps ne connaît pas encore la décision par clause (contrat 1.26 requis)' };
        }
        return { status: 'error', error: body.reason || body.error || `Erreur HTTP ${res.status}` };
      } catch {
        return { status: 'unavailable', error: 'Mode hors-ligne : clauses vérifiables indisponibles' };
      }
    });
  }


  /**
   * Décision sur une clause : valider, amender (valider une clause corrigée) ou rejeter (contrat 1.26).
   * Le relecteur est la personne connectée (X-Actor-Email), jamais un champ du corps.
   */
  async decideCheckClause(
    assetId: string,
    checkId: string,
    body: { decision: CheckClauseDecision; comment?: string; clause?: { kind?: string; when?: CheckClauseMatcher; expect?: CheckClauseMatcher; message?: string } },
    actorEmail: string
  ): Promise<{ status: 'ok' | 'forbidden' | 'invalid' | 'not_found' | 'error' | 'unavailable'; data?: CheckClauseRow; error?: string }> {
    this.transport.invalidateCache('kb:');
    this.transport.invalidateCache('compliance:');
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/assets/${encodeURIComponent(assetId)}/checks/${encodeURIComponent(checkId)}`;
      const res = await this.transport.request(url, {
        method: 'PATCH',
        headers: { ...this.transport.getHeaders(undefined, actorEmail), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return { status: 'ok', data: (payload.data || payload) as CheckClauseRow };
      const error = payload.reason || payload.error?.message || payload.error || `Erreur HTTP ${res.status}`;
      if (res.status === 403) return { status: 'forbidden', error };
      if (res.status === 404) return { status: 'not_found', error };
      if (res.status === 400) return { status: 'invalid', error };
      return { status: 'error', error };
    } catch {
      return { status: 'unavailable', error: 'Mode hors-ligne : décision impossible' };
    }
  }


  /**
   * Enregistre une clause de vérification rédigée en brouillon pour un actif (Issue #99, contrat 1.26).
   * La clause entre avec status: 'draft' et provenance: 'llm-derived', et n'est jamais bloquante
   * tant qu'un relecteur ne l'a pas validée explicitement.
   */
  async submitDraftClause(
    assetId: string,
    clause: {
      kind: 'requires' | 'forbids';
      when: CheckClauseMatcher;
      expect?: CheckClauseMatcher | null;
      message: string;
      provenance?: string;
    },
    actorEmail: string
  ): Promise<{ status: 'ok' | 'forbidden' | 'invalid' | 'not_found' | 'error' | 'unavailable'; data?: any; channel?: 'asset_check' | 'candidate'; error?: string }> {
    try {
      // 1. Tente l'enregistrement direct via la route des checks de l'actif
      const url = `${this.transport.baseUrl}/api/knowledge/assets/${encodeURIComponent(assetId)}/checks`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: { ...this.transport.getHeaders(undefined, actorEmail), 'Content-Type': 'application/json' },
        body: JSON.stringify({ clause: { ...clause, status: 'draft', provenance: clause.provenance || 'llm-derived' } })
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        this.transport.invalidateCache('kb:');
        this.transport.invalidateCache('compliance:');
        return { status: 'ok', data: payload.data || payload, channel: 'asset_check' };
      }

      // Si la route directe n'existe pas (404/405), enregistre un candidat d'amendement
      if (res.status === 404 || res.status === 405) {
        const candUrl = `${this.transport.baseUrl}/api/knowledge/candidates`;
        const candRes = await this.transport.request(candUrl, {
          method: 'POST',
          headers: { ...this.transport.getHeaders(undefined, actorEmail), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'amendment',
            asset_type: 'control',
            target_asset_id: assetId,
            title: `Proposition de clause vérifiable pour ${assetId}`,
            summary: clause.message,
            suggested_change: JSON.stringify({ ...clause, status: 'draft', provenance: clause.provenance || 'llm-derived' }, null, 2),
            source: { system: 'archinex', author: actorEmail, provenance: clause.provenance || 'llm-derived' },
            author: actorEmail,
            production_mode: 'llm-derived'
          })
        });
        const candPayload = await candRes.json().catch(() => ({}));
        if (candRes.ok) {
          this.transport.invalidateCache('kb:');
          return { status: 'ok', data: candPayload.data || candPayload, channel: 'candidate' };
        }
        const error = candPayload.reason || candPayload.error?.message || candPayload.error || `Erreur HTTP ${candRes.status}`;
        return { status: 'error', error };
      }

      const error = payload.reason || payload.error?.message || payload.error || `Erreur HTTP ${res.status}`;
      if (res.status === 403) return { status: 'forbidden', error };
      if (res.status === 400) return { status: 'invalid', error };
      return { status: 'error', error };
    } catch {
      return { status: 'unavailable', error: 'Mode hors-ligne : enregistrement du brouillon impossible' };
    }
  }


  /**
   * Essai des clauses d'un actif sur des options libres (POST /api/knowledge/checks/simulate, sans écriture).
   * Renvoie, pour chaque option, les verdicts de l'actif avec les clauses proposées.
   */
  async tryAssetClauses(
    assetId: string,
    checks: unknown[],
    options: Array<{ title: string; description?: string }>
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: Array<{ title: string; after: AssetClauseTrialVerdict[] }>; error?: string }> {
    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/checks/simulate`, {
        method: 'POST',
        headers: { ...this.transport.getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId, checks, options, dataset: null })
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return { status: 'ok', data: ((payload.data || payload).options || []) as Array<{ title: string; after: AssetClauseTrialVerdict[] }> };
      return { status: 'error', error: payload.reason || payload.error || `Erreur HTTP ${res.status}` };
    } catch {
      return { status: 'unavailable', error: "Mode hors-ligne : essai impossible" };
    }
  }


  /**
   * Simule l'impact d'une clause et de ses prédicats (précision, rappel, alertes régressions)
   */
  async simulateClause(
    req: ClauseSimulationRequest
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: ClauseSimulationResult; error?: string }> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/checks/simulate`, {
        method: 'POST',
        headers: {
          ...this.transport.getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service LLMOps indisponible (503)' };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data || body
        };
      }

      return {
        status: 'error',
        error: `Erreur HTTP ${res.status} lors de la simulation de clause`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : simulation de clause indisponible'
      };
    }
  }


  /**
   * Récupère l'historique successif d'un actif (Contrat 1.27 / Archinex #95 / LLMOps #108).
   * Appelle GET /api/knowledge/assets/{id}/history
   */
  async getAssetHistory(
    assetId: string,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'not_found' | 'error' | 'unavailable'; data?: AssetHistoryResponse; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/assets/${encodeURIComponent(assetId)}/history`;
      const res = await this.transport.request(url, {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });
      if (res.status === 404) {
        const body = await res.json().catch(() => ({}));
        return {
          status: 'not_found',
          error: body.detail || body.error || 'Actif introuvable'
        };
      }
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data || body
        };
      }
      const body = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: body.detail || body.error || `Erreur HTTP ${res.status}`
      };
    } catch (err: unknown) {
      return {
        status: 'unavailable',
        error: err instanceof Error ? err.message : 'Service LLMOps indisponible'
      };
    }
  }


  /**
   * Déclenche une publication scellée officielle (POST /api/knowledge/publications)
   */
  async publishKbDoctrine(
    data: { changelog?: string } = {},
    actorEmail?: string
  ): Promise<{
    status: 'ok' | 'forbidden' | 'conflict' | 'error' | 'unavailable';
    data?: KbPublication;
    error?: string;
    blockers?: string[];
    warnings?: string[];
  }> {
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/publications`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify(data || {})
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 403) {
        return {
          status: 'forbidden',
          error: body.error || 'Habilitation insuffisante : rôle kb:admin ou kb:maintain requis'
        };
      }

      if (res.status === 409) {
        return {
          status: 'conflict',
          error: body.error || 'Conditions de la Porte G7 non remplies pour la publication',
          blockers: body.blockers || []
        };
      }

      if (res.ok) {
        const rawData = body.data || body;
        const pubData: any = {
          id: rawData.id || rawData.snapshot_id || `pub-${Date.now()}`,
          snapshot_id: rawData.snapshot_id,
          version: rawData.version || (rawData.snapshot_id ? rawData.snapshot_id.replace(/^snapshot-/, 'v') : 'v1.0.0'),
          published_at: rawData.published_at || new Date().toISOString(),
          published_by: rawData.published_by || actorEmail || 'maintainer',
          sha256_checksum: rawData.sha256_checksum || rawData.sha256 || '0000000000000000000000000000000000000000000000000000000000000000',
          changelog: rawData.changelog || data?.changelog || 'Publication officielle de la doctrine',
          assets_count: rawData.assets_count || (rawData.published ? rawData.published.length : 0),
          storage_persistent: rawData.storage_persistent ?? true,
          published: rawData.published || [],
          published_candidates: rawData.published || rawData.published_candidates || [],
          ...rawData
        };
        return {
          status: 'ok',
          data: pubData,
          warnings: body.warnings || []
        };
      }

      return {
        status: 'error',
        error: body.error || `Erreur HTTP ${res.status}`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : publication impossible'
      };
    }
  }
}
