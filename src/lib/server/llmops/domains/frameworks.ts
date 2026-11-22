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

function normalizeFrameworkRequirement(r: any, fwId: string): FrameworkRequirement {
  const reqId = r.requirement_id || r.id || 'REQ';
  const dom = Array.isArray(r.domain) ? (r.domain[0] || 'security') : (r.domain || 'security');
  const mapped = Array.isArray(r.links) ? r.links : (Array.isArray(r.mapped_assets) ? r.mapped_assets : []);
  const rawStatus = (r.decision || r.status || 'pending').toLowerCase();
  let status: FrameworkRequirementStatus = 'pending';
  if (rawStatus === 'accept' || rawStatus === 'accepted') status = 'accepted';
  else if (rawStatus === 'amend' || rawStatus === 'amended') status = 'amended';
  else if (rawStatus === 'reject' || rawStatus === 'rejected') status = 'rejected';

  return {
    id: reqId,
    framework_id: fwId,
    section: r.section || reqId,
    title: r.title || reqId,
    text: r.legal_text || r.text || '',
    domain: dom,
    status,
    mapped_assets: mapped,
    amendment_notes: status === 'amended' ? r.comment || r.amendment_notes : r.amendment_notes,
    rejection_reason: status === 'rejected' ? r.rejection_reason || r.comment : r.rejection_reason,
    reviewed_by: r.reviewer || r.reviewed_by,
    reviewed_at: r.reviewed_at,
    title_fr: r.title_fr || r.proposed_title_fr || undefined,
    source_ref: r.source_ref || undefined,
    in_kb: typeof r.in_kb === 'boolean' ? r.in_kb : undefined,
    proposed_acceptance_criteria: Array.isArray(r.proposed_acceptance_criteria) ? r.proposed_acceptance_criteria : [],
    proposed_links: Array.isArray(r.proposed_links) ? r.proposed_links : [],
    proposed_title_fr: r.proposed_title_fr || undefined,
    links_production_mode: r.links_production_mode || undefined,
    acceptance_criteria: Array.isArray(r.acceptance_criteria) ? r.acceptance_criteria : [],
    row_status: r.status || undefined,
    checks: Array.isArray(r.checks)
      ? r.checks.map((c: any) => ({
          asset_id: c.asset_id || reqId,
          typed_id: c.typed_id || `control:${c.asset_id || reqId}`,
          asset_type: c.asset_type || 'control',
          asset_title: c.asset_title || r.title || reqId,
          asset_title_fr: c.asset_title_fr || r.title_fr,
          framework: c.framework || fwId,
          severity: c.severity || 'mandatory',
          domain: Array.isArray(c.domain) ? c.domain : [dom],
          asset_excerpt: c.asset_excerpt || r.legal_text || r.text || '',
          revision: c.revision ?? 1,
          check_id: c.check_id || c.id || `${reqId}-C1`,
          kind: c.kind || 'requires',
          when: c.when || { terms_any: [] },
          expect: c.expect || null,
          message: c.message || null,
          status: c.status || 'draft',
          review: c.review || null,
          may_decide: typeof c.may_decide === 'boolean' ? c.may_decide : true
        }))
      : undefined
  };
}

function normalizeFrameworkIngestion(item: any): FrameworkIngestion {
  if (!item || typeof item !== 'object') {
    return {
      id: '0',
      framework_id: '',
      framework_name: '',
      version: '1.0',
      file_name: '',
      file_format: 'txt',
      file_size_bytes: 0,
      created_at: new Date().toISOString(),
      status: 'ready',
      total_requirements: 0,
      reviewed_requirements: 0,
      requirements: []
    };
  }

  const rawReqs = Array.isArray(item.requirements) ? item.requirements : [];
  const fwId = item.framework_id || item.framework || 'FRAMEWORK';
  const reqs = rawReqs.map((r: any) => normalizeFrameworkRequirement(r, fwId));
  const total = item.total_requirements ?? item.total ?? reqs.length ?? 0;
  const reviewed = item.reviewed_requirements ?? item.reviewed ?? item.decided ?? 0;

  return {
    id: String(item.id ?? fwId),
    framework_id: fwId,
    framework_name: item.framework_name || item.framework || fwId,
    version: item.version || '1.0',
    file_name: item.file_name || item.source_name || `${fwId.toLowerCase()}.txt`,
    file_format: item.file_format || 'txt',
    file_size_bytes: item.file_size_bytes || 0,
    created_at: item.created_at || new Date().toISOString(),
    created_by: item.created_by,
    status: item.status || 'ready',
    total_requirements: total,
    total,
    reviewed_requirements: reviewed,
    decided: item.decided ?? reviewed,
    requirements: reqs,
    abandoned_by: item.abandoned_by ?? null,
    abandoned_at: item.abandoned_at ?? null,
    abandon_reason: item.abandon_reason ?? null
  };
}

export class FrameworksDomainClient {
	constructor(private readonly transport: LLMOpsTransport) {}


  /**
   * Vue d'ensemble des référentiels de conformité opposables et de leur couverture (GET /api/compliance/frameworks)
   */
  async getComplianceFrameworks(options: { bypassCache?: boolean } = {}): Promise<{
    status: 'ok' | 'error' | 'unavailable';
    data: ComplianceFrameworkOverview[];
    error?: string;
  }> {
    const cacheKey = `compliance:frameworks:${this.transport.baseUrl}`;
    if (options.bypassCache) this.transport.invalidateCache(cacheKey);

    return this.transport.cachedFetch(cacheKey, async () => {
      try {
        const url = `${this.transport.baseUrl}/api/compliance/frameworks`;
        const res = await this.transport.request(url, { headers: this.transport.getHeaders() });
        if (res.ok) {
          const body = await res.json();
          const rawList = Array.isArray(body.data)
            ? body.data
            : Array.isArray(body.frameworks)
              ? body.frameworks
              : Array.isArray(body)
                ? body
                : [];
          const byFw = new Map<string, ComplianceFrameworkOverview>();
          for (const item of rawList) {
            if (!item || typeof item !== 'object') continue;
            const fw = String(item.framework || item.name || item.id || '').trim();
            if (!fw) continue;
            const statusRaw = String(item.status || 'unknown').toLowerCase();
            const status: ComplianceFrameworkOverview['status'] =
              statusRaw === 'covered' || statusRaw === 'partial' || statusRaw === 'missing'
                ? statusRaw
                : 'unknown';
            const present = Number(item.present ?? item.control_count ?? 0);
            const validated = Number(item.validated ?? item.covered_count ?? 0);
            const expected =
              item.expected !== undefined && item.expected !== null
                ? Number(item.expected)
                : item.total_count !== undefined && item.total_count !== null
                  ? Number(item.total_count)
                  : null;
            const provisional =
              item.provisional !== undefined
                ? Number(item.provisional)
                : Math.max(0, present - validated);
            const validatedControls = Array.isArray(item.validated_controls)
              ? item.validated_controls.map((vc: any) => ({
                  id: String(vc.id || ''),
                  validated_by: Array.isArray(vc.validated_by) ? vc.validated_by.map(String) : [],
                  validated_at: vc.validated_at ?? null
                }))
              : [];

            const existing = byFw.get(fw);
            if (!existing) {
              byFw.set(fw, {
                framework: fw,
                version: String(item.version || '1.0'),
                title: String(item.title || item.framework_name || fw),
                jurisdiction: item.jurisdiction ? String(item.jurisdiction) : undefined,
                description: item.description ? String(item.description) : undefined,
                control_count: Number(item.control_count ?? present),
                status,
                expected,
                present,
                validated,
                provisional,
                declared_by: item.declared_by ?? null,
                declared_at: item.declared_at ?? null,
                validated_controls: validatedControls
              });
            } else {
              existing.control_count += Number(item.control_count ?? 0);
              if (!existing.version.includes(String(item.version || ''))) {
                existing.version = `${existing.version}, ${item.version}`;
              }
            }
          }
          return {
            status: 'ok',
            data: Array.from(byFw.values())
          };
        }
        return {
          status: 'error',
          data: [],
          error: `Erreur HTTP ${res.status} lors du chargement des référentiels de conformité`
        };
      } catch {
        return {
          status: 'unavailable',
          data: [],
          error: 'Mode hors-ligne : référentiels de conformité indisponibles'
        };
      }
    });
  }


  /**
   * Liste des référentiels réglementaires ingérés (GET /api/frameworks/ingestions)
   */
  async listFrameworkIngestions(
    actorEmail?: string,
    status?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: FrameworkIngestion[]; error?: string }> {
    try {
      const q = new URLSearchParams();
      if (status && status.trim()) q.set('status', status.trim());
      const qs = q.toString();
      const url = `${this.transport.baseUrl}/api/frameworks/ingestions${qs ? `?${qs}` : ''}`;
      const res = await this.transport.request(url, {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const payload = body.data || body;
        const rawList = Array.isArray(payload.ingestions)
          ? payload.ingestions
          : Array.isArray(payload)
            ? payload
            : [];
        return {
          status: 'ok',
          data: rawList.map(normalizeFrameworkIngestion)
        };
      }
      const errBody = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: errBody.error || errBody.reason || `Erreur HTTP ${res.status} lors de la récupération des référentiels`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : référentiels réglementaires indisponibles'
      };
    }
  }


  /**
   * Abandon d'une ingestion de référentiel (POST /api/frameworks/ingestions/:id/abandon)
   */
  async abandonFrameworkIngestion(
    ingestionId: string | number,
    reason: string,
    actorEmail?: string
  ): Promise<{
    status: 'ok' | 'error' | 'forbidden' | 'conflict' | 'bad_request' | 'unavailable';
    data?: FrameworkIngestion;
    error?: string;
  }> {
    if (!reason || !reason.trim()) {
      return {
        status: 'bad_request',
        error: 'Un motif d’abandon (reason) est requis.'
      };
    }
    try {
      const url = `${this.transport.baseUrl}/api/frameworks/ingestions/${encodeURIComponent(String(ingestionId))}/abandon`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify({ reason: reason.trim() })
      });

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        return { status: 'forbidden', error: body.error || body.reason || 'Action réservée aux mainteneurs' };
      }
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return {
          status: 'conflict',
          error: body.error || body.reason || 'Conflit d’état : impossible d’abandonner une ingestion déjà appliquée'
        };
      }
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        return { status: 'bad_request', error: body.error || body.reason || 'Requête invalide' };
      }
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return { status: 'ok', data: normalizeFrameworkIngestion(body.data || body) };
      }
      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.error || body.reason || `Erreur HTTP ${res.status}` };
    } catch {
      return { status: 'unavailable', error: 'Mode hors-ligne : abandon d’ingestion indisponible' };
    }
  }


  /**
   * Détails d'une ingestion de référentiel (GET /api/frameworks/ingestions/:id)
   */
  async getFrameworkIngestion(
    ingestionId: string,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: FrameworkIngestion; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/frameworks/ingestions/${encodeURIComponent(ingestionId)}`;
      const res = await this.transport.request(url, {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const payload = body.data || body;
        return {
          status: 'ok',
          data: normalizeFrameworkIngestion(payload)
        };
      }
      return {
        status: 'error',
        error: `Erreur HTTP ${res.status} lors de la consultation du référentiel`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : consultation du référentiel indisponible'
      };
    }
  }


  /**
   * Ingestion / Téléversement d'un référentiel (POST /api/frameworks/ingestions)
   */
  async ingestFramework(
    payload: {
      framework_id?: string;
      framework?: string;
      framework_name?: string;
      version?: string;
      tag?: string;
      domain?: string;
      file_name?: string;
      file_format?: string;
      file_size_bytes?: number;
      file_content?: Buffer | Uint8Array | Blob | string;
      raw_text?: string;
      requirements?: any[];
    },
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable' | 'too_large'; data?: FrameworkIngestion; error?: string }> {
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const declaredSize = payload.file_size_bytes ?? 0;
    const bufferSize = payload.file_content
      ? (payload.file_content as any).length ?? (payload.file_content as any).byteLength ?? 0
      : payload.raw_text
        ? Buffer.byteLength(payload.raw_text)
        : 0;
    if (Math.max(declaredSize, bufferSize) > MAX_FILE_SIZE) {
      return {
        status: 'too_large',
        error: 'Fichier trop volumineux (taille maximale autorisée : 20 Mo)'
      };
    }

    try {
      const url = `${this.transport.baseUrl}/api/frameworks/ingestions`;
      const fwName = payload.framework || payload.framework_id || 'NIS2';
      const version = payload.version || '1.0';
      const fileName = payload.file_name || `${fwName.toLowerCase()}.txt`;

      // Build multipart/form-data for live LLMOps server
      const formData = new FormData();
      formData.append('framework', fwName);
      formData.append('framework_id', fwName);
      formData.append('version', version);
      if (payload.tag) formData.append('tag', payload.tag);
      if (payload.domain) formData.append('domain', payload.domain);
      if (payload.framework_name) formData.append('framework_name', payload.framework_name);
      if (payload.file_format) formData.append('file_format', payload.file_format);
      if (payload.file_size_bytes) formData.append('file_size_bytes', String(payload.file_size_bytes));
      if (payload.requirements) formData.append('requirements', JSON.stringify(payload.requirements));

      const content = payload.file_content ?? payload.raw_text ?? '';
      const blob = content instanceof Blob
        ? content
        : new Blob([content], { type: 'text/plain' });
      formData.append('file', blob, fileName);

      // Note: when sending FormData, omit 'Content-Type' so fetch generates multipart boundary
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.transport.authToken}`
      };
      if (actorEmail) headers['X-Actor-Email'] = actorEmail;

      const res = await this.transport.request(url, {
        method: 'POST',
        headers,
        body: formData
      });

      if (res.status === 413) {
        return {
          status: 'too_large',
          error: 'Fichier trop volumineux (taille maximale autorisée : 20 Mo)'
        };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const payload = body.data || body;
        return {
          status: 'ok',
          data: normalizeFrameworkIngestion(payload)
        };
      }

      const body = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: body.error || body.reason || `Erreur HTTP ${res.status} lors de l'ingestion`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : ingestion de référentiel indisponible'
      };
    }
  }


  /**
   * Revue unitaire d'une exigence réglementaire (PATCH /api/frameworks/ingestions/:id/rows/:reqId)
   */
  async reviewFrameworkRequirement(
    ingestionId: string,
    reqId: string,
    review: {
      status?: FrameworkRequirementStatus;
      decision?: 'accept' | 'amend' | 'reject' | '';
      links?: string[];
      mapped_assets?: string[];
      amendment_notes?: string;
      rejection_reason?: string;
      comment?: string;
      acceptance_criteria?: string | string[];
      title_fr?: string;
    },
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'bad_request' | 'unavailable'; data?: FrameworkRequirement; error?: string }> {
    try {
      // Normaliser decision
      let decision = review.decision;
      if (!decision && review.status) {
        if (review.status === 'accepted' || (review.status as any) === 'compliant') decision = 'accept';
        else if (review.status === 'amended' || (review.status as any) === 'amendment_needed') decision = 'amend';
        else if (review.status === 'rejected' || (review.status as any) === 'not_applicable') decision = 'reject';
        else decision = review.status as any;
      }
      // Liens transmis seulement s'ils sont fournis : sinon LLMOps garde les liens proposés de la ligne.
      const providedLinks = review.links ?? review.mapped_assets;
      const links = providedLinks && providedLinks.length > 0 ? providedLinks : undefined;
      const comment = review.comment ?? review.amendment_notes ?? review.rejection_reason;
      const criteria = Array.isArray(review.acceptance_criteria)
        ? review.acceptance_criteria
        : typeof review.acceptance_criteria === 'string' && review.acceptance_criteria.trim()
          ? [review.acceptance_criteria.trim()]
          : undefined;

      const bodyToSend = {
        decision: decision ?? '',
        links,
        comment,
        acceptance_criteria: criteria,
        ...(review.title_fr ? { title_fr: review.title_fr } : {}),
        status: review.status,
        mapped_assets: review.mapped_assets,
        amendment_notes: review.amendment_notes,
        rejection_reason: review.rejection_reason
      };

      // In LLMOps, the route is /api/frameworks/ingestions/:id/rows/:reqId
      let url = `${this.transport.baseUrl}/api/frameworks/ingestions/${encodeURIComponent(ingestionId)}/rows/${encodeURIComponent(reqId)}`;
      let res = await this.transport.request(url, {
        method: 'PATCH',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify(bodyToSend)
      });

      // Fallback to /requirements/:reqId if 404 (for legacy/fake compatibility)
      if (res.status === 404) {
        url = `${this.transport.baseUrl}/api/frameworks/ingestions/${encodeURIComponent(ingestionId)}/requirements/${encodeURIComponent(reqId)}`;
        res = await this.transport.request(url, {
          method: 'PATCH',
          headers: this.transport.getHeaders(undefined, actorEmail),
          body: JSON.stringify(bodyToSend)
        });
      }

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        return {
          status: 'forbidden',
          error: body.error || body.reason || 'Interdit : domaine non possédé'
        };
      }

      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        return {
          status: 'bad_request',
          error: body.error || body.reason || 'Requête invalide ou motif de rejet manquant'
        };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          data: normalizeFrameworkRequirement(body.data || body, (body.data || body).framework || '')
        };
      }

      const body = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: body.error || body.reason || `Erreur HTTP ${res.status}`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : revue d’exigence indisponible'
      };
    }
  }


  /**
   * Suggestion assistée de correspondances doctrinales (POST .../suggest-links)
   */
  async suggestFrameworkRequirementLinks(
    ingestionId: string,
    reqId: string,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: FrameworkLinkSuggestionResult; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/frameworks/ingestions/${encodeURIComponent(ingestionId)}/requirements/${encodeURIComponent(reqId)}/suggest-links`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify({})
      });

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
        error: `Erreur HTTP ${res.status}`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : suggestion doctrinale indisponible'
      };
    }
  }


  /**
   * Déclaration formelle de couverture d'un référentiel (POST /api/frameworks/:fw/coverage-declaration)
   */
  async declareFrameworkCoverage(
    frameworkId: string,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'conflict' | 'unavailable'; data?: CoverageDeclarationResult; error?: string; missing_requirements?: string[] }> {
    try {
      const url = `${this.transport.baseUrl}/api/frameworks/${encodeURIComponent(frameworkId)}/coverage-declaration`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify({})
      });

      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return {
          status: 'conflict',
          error: body.error || 'Des exigences non couvertes subsistent dans le référentiel',
          missing_requirements: body.missing_requirements || []
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
        error: body.error || `Erreur HTTP ${res.status}`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : déclaration de couverture indisponible'
      };
    }
  }


  /**
   * Application de l'ingestion d'un référentiel (POST /api/frameworks/ingestions/:id/apply)
   */
  async applyFrameworkIngestion(
    ingestionId: string | number,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'conflict' | 'unavailable'; data?: any; error?: string; code?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/frameworks/ingestions/${encodeURIComponent(String(ingestionId))}/apply`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify({})
      });

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        return { status: 'forbidden', error: body.reason || body.error || 'Action réservée aux mainteneurs' };
      }
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const reason = body.reason || body.error;
        return {
          status: 'conflict',
          error: reason || 'Conflit lors de l’application',
          code: typeof reason === 'string' && reason.startsWith('separation_of_duties') ? 'separation_of_duties' : undefined
        };
      }
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return { status: 'ok', data: body.data || body };
      }
      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.reason || body.error || `Erreur HTTP ${res.status}` };
    } catch {
      return { status: 'unavailable', error: 'Mode hors-ligne : application d’ingestion indisponible' };
    }
  }


  /**
   * Ajout de propositions de liens IA sur un référentiel (POST /api/frameworks/ingestions/:id/link-proposals)
   */
  async addFrameworkLinkProposals(
    ingestionId: string | number,
    bodyData: { model?: string; proposals: Array<{ requirement_id: string; satisfied_by?: string[]; acceptance_criteria?: string[] }> },
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'unavailable'; data?: any; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/frameworks/ingestions/${encodeURIComponent(String(ingestionId))}/link-proposals`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify(bodyData)
      });

      if (res.status === 403) {
        return { status: 'forbidden', error: 'Action réservée aux mainteneurs' };
      }
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return { status: 'ok', data: body.data || body };
      }
      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.error || `Erreur HTTP ${res.status}` };
    } catch {
      return { status: 'unavailable', error: 'Mode hors-ligne : propositions de liens indisponibles' };
    }
  }


  async getFrameworkLinkProposals(
    ingestionId: string | number,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'unavailable'; data?: any; error?: string }> {
    return this.addFrameworkLinkProposals(ingestionId, { proposals: [] }, actorEmail);
  }
}
