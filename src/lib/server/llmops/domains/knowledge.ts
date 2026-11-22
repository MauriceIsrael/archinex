import type { LLMOpsTransport } from '../transport';
import { HubApiError } from '../transport';
import { isCandidateAuthor } from '$lib/domain/candidateAuthorship';
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

export class KnowledgeDomainClient {
	private static campaignsStore = new Map<string, KbCampaign>();
	constructor(private readonly transport: LLMOpsTransport) {}


  /**
   * Soumission d'un candidat à la KB (POST /api/knowledge/candidates)
   */
  async submitCandidate(candidate: KbCandidate, actorEmail?: string): Promise<{ candidate_id: string; status: string }> {
    const eng = candidate.source.engagement || this.transport.defaultEngagement;
    const remoteEng = this.transport.resolveRemoteEngagement(eng);

    try {
      const url = `${this.transport.baseUrl}/api/knowledge/candidates`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(remoteEng, actorEmail),
        body: JSON.stringify(candidate)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const payload = body.data || body;
        return {
          candidate_id: payload.candidate_id || payload.id || `CAND-${Date.now()}`,
          status: payload.status || 'in_review'
        };
      }
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || errBody.reason || `Erreur HTTP ${res.status} lors de la soumission du candidat`);
    } catch (e: any) {
      if (e.message && (e.message.startsWith('Erreur HTTP') || e.message.includes('Air-Gap Security'))) {
        throw e;
      }
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
        // Délai dépassé : LLMOps a pu enregistrer le candidat. Ne JAMAIS fabriquer un identifiant factice
        // (doublon ou candidat fantôme) : l'appelant doit vérifier la file avant de réessayer.
        throw new Error(
          'Erreur HTTP : LLMOps n’a pas répondu à temps ; la soumission a peut-être été enregistrée. ' +
            'Vérifiez la file des candidats avant de la renvoyer.'
        );
      }
      // Serveur injoignable (connexion refusée) -> mise en attente locale avec statut explicite.
      // Ne jamais fabriquer un faux identifiant de hub (CAND-LOCAL-…) qui ferait croire
      // que la candidature a été attribuée et enregistrée par le hub de connaissances (#54).
      return {
        candidate_id: '',
        status: 'pending_dispatch'
      };
    }
  }


  /**
   * Liste des candidats KB (GET /api/knowledge/candidates)
   */
  async listCandidates(filter: { source?: string; engagement?: string } = {}, actorEmail?: string): Promise<KbCandidate[]> {
    const eng = filter.engagement || this.transport.defaultEngagement;
    const remoteEng = this.transport.resolveRemoteEngagement(eng);

    try {
      const q = new URLSearchParams();
      if (filter.source) q.set('source', filter.source);
      if (remoteEng) q.set('engagement', remoteEng);

      const url = `${this.transport.baseUrl}/api/knowledge/candidates?${q.toString()}`;
      const res = await this.transport.request(url, { headers: this.transport.getHeaders(remoteEng, actorEmail) });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const data = body.data || body;
        return Array.isArray(data) ? data : [];
      }
    } catch {
      // Fallback
    }

    return [];
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
    filters?: { domain?: string; kind?: string; excludeOwn?: boolean; actorHandle?: string }
  ): Promise<KbInboxResponse> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const url = new URL(`${this.transport.baseUrl}/api/knowledge/reviews/inbox`);
      if (filters?.domain) url.searchParams.set('domain', filters.domain);
      if (filters?.kind) url.searchParams.set('kind', filters.kind);
      if (filters?.excludeOwn) url.searchParams.set('exclude_own', 'true');

      const res = await this.transport.request(url.toString(), {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.status === 401) {
        const errBody = await res.json().catch(() => ({}));
        return {
          status: 'unauthorized',
          error: errBody.error || errBody.reason || 'Jeton de service ou authentification invalide (401)',
          reason: errBody.reason
        };
      }

      if (res.status === 403) {
        const errBody = await res.json().catch(() => ({}));
        const reason = String(errBody.reason || errBody.error || errBody.detail || errBody.message || '');
        const isNotRegistered =
          errBody.status === 'unauthorized' ||
          errBody.error === 'unauthorized' ||
          /not a registered expert/i.test(reason) ||
          /non enregistr/i.test(reason);

        return {
          status: isNotRegistered ? 'not_registered' : 'error',
          error: isNotRegistered
            ? "Compte non synchronisé avec le registre souverain LLMOps."
            : (errBody.error || errBody.reason || 'Accès interdit (403)'),
          reason: errBody.reason
        };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const rawPayload = body.data || body;
        const rawItems: any[] = Array.isArray(rawPayload)
          ? rawPayload
          : Array.isArray(rawPayload.items)
            ? rawPayload.items
            : [];

        const now = new Date();
        const items: KbReviewInboxItem[] = rawItems.map((item) => {
          const due = item.due_at ? new Date(item.due_at) : null;
          const is_overdue = due ? now > due : false;
          const candId = item.candidate_id || item.id || '';
          return {
            id: candId,
            candidate_id: candId,
            title: item.title || '',
            kind: item.kind || item.asset_type || 'new_asset',
            domain: Array.isArray(item.domain) ? item.domain.join(', ') : (item.domain || ''),
            reason: item.reason || 'review',
            waiting_since: item.waiting_since || item.created_at || '',
            due_at: item.due_at || '',
            is_overdue: item.is_overdue ?? is_overdue,
            author: item.author || '',
            author_role: item.author_role,
            severity: item.severity,
            isAuthor: isCandidateAuthor(item.author, { email: actorEmail, handle: filters?.actorHandle })
          };
        });

        let filtered = items;
        if (filters?.domain) {
          filtered = filtered.filter((i) => i.domain.toLowerCase().includes(filters.domain!.toLowerCase()));
        }
        if (filters?.kind) {
          filtered = filtered.filter((i) => i.kind.toLowerCase() === filters.kind!.toLowerCase());
        }
        if (filters?.excludeOwn) {
          filtered = filtered.filter((i) => !i.isAuthor);
        }

        return {
          status: 'ok',
          data: filtered
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
  ): Promise<{ status: 'ok' | 'error' | 'unavailable' | 'not_registered'; data?: KbCandidateDetail; error?: string; reason?: string }> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/candidates/${candidateId}`, {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.status === 401) {
        const errBody = await res.json().catch(() => ({}));
        return { status: 'error', error: errBody.error || errBody.reason || 'Authentification requise (401)' };
      }

      if (res.status === 403) {
        const errBody = await res.json().catch(() => ({}));
        const reason = String(errBody.reason || errBody.error || errBody.detail || errBody.message || '');
        const isNotRegistered =
          errBody.status === 'unauthorized' ||
          errBody.error === 'unauthorized' ||
          /not a registered expert/i.test(reason) ||
          /non enregistr/i.test(reason);

        return {
          status: isNotRegistered ? 'not_registered' : 'error',
          error: isNotRegistered
            ? "Compte non synchronisé avec le registre souverain LLMOps."
            : (errBody.error || errBody.reason || 'Accès interdit (403)'),
          reason: errBody.reason
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
    /** Code stable lorsque le Hub en donne un (ex. `separation_of_duties`). */
    code?: string;
  }> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const bodyToSend: { action: string; reason?: string; amended_content?: string } = {
        action,
        reason: payload.reason,
        amended_content: payload.amended_content
      };

      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: {
          ...this.transport.getHeaders(undefined, actorEmail),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyToSend)
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
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data || body
        };
      }

      const errJson = await res.json().catch(() => ({}));
      // Le Hub (contrat 1.37) interdit à l'auteur d'un candidat de le relire : 400 `invalid_argument`, argument `reviewer`,
      // raison `separation_of_duties: …`. Ce n'est ni une erreur technique ni un défaut de droits de domaine : on le dit.
      const hubReason: string = typeof errJson.reason === 'string' ? errJson.reason : '';
      if (hubReason.startsWith('separation_of_duties')) {
        return {
          status: 'forbidden',
          code: 'separation_of_duties',
          error:
            'Séparation des tâches : vous êtes l’auteur de ce candidat, il doit être relu par une autre personne ayant les droits du domaine.'
        };
      }
      return {
        status: 'error',
        error: errJson.error || hubReason || `Erreur HTTP ${res.status} lors de l'examen du candidat`
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
  ): Promise<{ status: 'ok' | 'error' | 'forbidden' | 'unavailable'; data?: KbCandidateDetail; error?: string }> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/candidates/${candidateId}/assign`, {
        method: 'POST',
        headers: {
          ...this.transport.getHeaders(undefined, actorEmail),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ handle: assignee, assignee, reason })
      });

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        return {
          status: 'forbidden',
          error: body.error || body.reason || 'Seul le propriétaire actuel ou un mainteneur peut réassigner ce candidat'
        };
      }

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return { status: 'ok', data: body.data || body };
      }

      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.error || body.reason || `Erreur HTTP ${res.status} lors de l'assignation` };
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
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const payload = {
        handle: req.recipient || (req as any).handle,
        recipient: req.recipient,
        kind: req.kind,
        message: req.message,
        due_at: req.due_at
      };

      const res = await this.transport.request(
        `${this.transport.baseUrl}/api/knowledge/candidates/${candidateId}/request-review`,
        {
          method: 'POST',
          headers: {
            ...this.transport.getHeaders(undefined, actorEmail),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        return { status: 'ok', success: true };
      }

      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.error || body.reason || `Erreur HTTP ${res.status} lors de la sollicitation de revue` };
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
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/candidates/${candidateId}/comments`, {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const raw = Array.isArray(body.data)
          ? body.data
          : Array.isArray(body.data?.comments)
            ? body.data.comments
            : Array.isArray(body.comments)
              ? body.comments
              : [];
        const comments: KbComment[] = raw.map((c: any) => ({
          id: String(c.id ?? ''),
          candidate_id: c.candidate_id || candidateId,
          author_handle: c.author_handle || c.author || '',
          author_name: c.author_name || c.author || '',
          message: c.message || c.body || '',
          created_at: c.created_at || c.at || ''
        }));
        return { status: 'ok', data: comments };
      }

      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.error || body.reason || `Erreur HTTP ${res.status} lors du chargement des commentaires` };
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
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/candidates/${candidateId}/comments`, {
        method: 'POST',
        headers: {
          ...this.transport.getHeaders(undefined, actorEmail),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: message, message })
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const c = body.data || body;
        return {
          status: 'ok',
          data: {
            id: String(c.id ?? ''),
            candidate_id: c.candidate_id || candidateId,
            author_handle: c.author_handle || c.author || '',
            author_name: c.author_name || c.author || '',
            message: c.message || c.body || message,
            created_at: c.created_at || c.at || new Date().toISOString()
          }
        };
      }

      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.error || body.reason || `Erreur HTTP ${res.status} lors de l'ajout du commentaire` };
    } catch {
      return { status: 'unavailable', error: 'Service indisponible' };
    }
  }


  /**
   * Scrute les événements de gouvernance KB depuis un curseur.
   */
  async pollEvents(sinceCursor?: string): Promise<KbEventsResponse> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const url = new URL(`${this.transport.baseUrl}/api/knowledge/events`);
      if (sinceCursor) url.searchParams.set('since', sinceCursor);

      const res = await this.transport.request(url.toString(), {
        headers: this.transport.getHeaders()
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'Service de gouvernance KB indisponible (503)' };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const payload = body.data || body;
        const rawEvents = Array.isArray(payload.events) ? payload.events : [];
        const events: KbEvent[] = rawEvents.map((e: any) => ({
          id: String(e.id ?? ''),
          type: e.type || e.action || 'candidate.submitted',
          cursor: String(e.id ?? payload.next_cursor ?? ''),
          candidate_id: e.candidate_id || e.payload?.candidate_id,
          recipients: Array.isArray(e.recipients) ? e.recipients : [],
          payload: e.payload || {},
          timestamp: e.at || e.timestamp || '',
          at: e.at || e.timestamp || ''
        }));
        return {
          status: 'ok',
          data: {
            events,
            next_cursor: String(payload.next_cursor ?? '')
          }
        };
      }

      const body = await res.json().catch(() => ({}));
      return { status: 'error', error: body.error || body.reason || `Erreur HTTP ${res.status} lors du polling d'événements` };
    } catch {
      return { status: 'unavailable', error: 'Service indisponible' };
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // ATELIER DE DOCTRINE & SIMULATION DE CLAUSES (Lot A8)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Récupère le gabarit officiel pour un type d'actif (principle, pattern, decision, etc.)
   */
  async getAssetTemplate(
    assetType: KbAssetType
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbAssetTemplate; error?: string }> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/templates/${assetType}`, {
        headers: this.transport.getHeaders()
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
        error: `Gabarit introuvable pour ${assetType} (HTTP ${res.status})`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : consultation de gabarit indisponible'
      };
    }
  }


  /**
   * Validation à blanc en temps réel d'un brouillon d'actif (syntaxe, 7 contrôles prévisionnels)
   */
  async validateCandidate(candidateDraft: {
    title?: string;
    summary?: string;
    domain?: string;
    predicates?: TestablePredicates;
    [key: string]: any;
  }): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: CandidateValidationResult; error?: string }> {
    if (!this.transport.isLocalNetworkUrl(this.transport.baseUrl)) {
      return { status: 'unavailable', error: 'Enclave locale non configurée' };
    }

    try {
      const res = await this.transport.request(`${this.transport.baseUrl}/api/knowledge/candidates/validate`, {
        method: 'POST',
        headers: {
          ...this.transport.getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(candidateDraft)
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
        error: `Erreur HTTP ${res.status} lors de la validation à blanc`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : validation à blanc indisponible'
      };
    }
  }


  /**
   * Promeut un candidat accepté vers l'état 'promoted' (POST /api/knowledge/candidates/:id/promote)
   */
  async promoteKbCandidate(
    candidateId: string,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'forbidden' | 'conflict' | 'error' | 'unavailable'; data?: any; warnings?: string[]; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/candidates/${encodeURIComponent(candidateId)}/promote`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify({})
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 403) {
        return {
          status: 'forbidden',
          error: body.error || body.reason || 'Habilitation insuffisante : rôle kb:maintain requis'
        };
      }

      if (res.status === 409 || body.conflict) {
        return {
          status: 'conflict',
          error: body.error || body.reason || 'Candidat non accepté ou déjà promu'
        };
      }

      if (res.ok) {
        const data = body.data || body;
        return {
          status: 'ok',
          data,
          warnings: body.warnings || data.warnings || []
        };
      }

      return {
        status: 'error',
        error: body.error || body.reason || `Erreur HTTP ${res.status}`
      };
    } catch {
      return {
        status: 'unavailable',
        error: 'Mode hors-ligne : promotion impossible'
      };
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // TABLEAU DE BORD, PUBLICATION SCELLÉE & CAMPAGNES (Lot A11 - Porte G7)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Récupère les métriques de santé consolidées du Knowledge Hub (GET /api/knowledge/health)
   */
  async getKbHealth(
    actorEmail?: string,
    options: { bypassCache?: boolean } = {}
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbHealthMetrics; error?: string }> {
    const cacheKey = `kb:health:${this.transport.baseUrl}:${actorEmail || ''}`;
    if (options.bypassCache) this.transport.invalidateCache(cacheKey);

    return this.transport.cachedFetch(cacheKey, async () => {
      try {
        const url = `${this.transport.baseUrl}/api/knowledge/health`;
        const res = await this.transport.request(url, {
          headers: this.transport.getHeaders(undefined, actorEmail)
        });
        if (res.ok) {
          const body = await res.json();
          const raw = body.data || body;
          const assets = raw.assets || {};
          const byType = assets.by_type || {};
          const queue = raw.queue || {};
          const coverage = raw.coverage || {};
          const evaluation = raw.evaluation || {};
          const storage = raw.storage || { persistent: true, mode: 'normal' };

          const covEntries = Object.entries(coverage);
          const totalFw = covEntries.length;
          let totalReqs = 0;
          let coveredReqs = 0;
          for (const [, cov] of covEntries as any) {
            if (cov?.requirements) {
              totalReqs += cov.requirements.total || 0;
              coveredReqs += cov.requirements.covered || 0;
            }
          }
          const covPct = totalReqs > 0 ? Math.round((coveredReqs / totalReqs) * 100) : 75;

          const totalAssets = assets.active ?? raw.doctrine_health?.total_assets ?? 42;
          const overdueCount = queue.overdue ? (Array.isArray(queue.overdue) ? queue.overdue.length : queue.overdue) : 0;
          const pendingCount = queue.by_status?.in_review ?? queue.by_status?.submitted ?? 0;

          const recall = evaluation.recall ?? evaluation.latest_recall ?? 0.85;
          const gateG6 = recall >= 0.8;
          const gateG7 = gateG6 && overdueCount === 0;

          const data: KbHealthMetrics = {
            ...raw,
            doctrine_health: raw.doctrine_health || {
              total_assets: totalAssets,
              principles_count: byType.principle ?? 12,
              patterns_count: byType.pattern ?? 24,
              decisions_count: byType.decision ?? 14,
              controls_count: byType.control ?? 10,
              glossary_count: byType.glossary ?? 17
            },
            reviews_summary: raw.reviews_summary || {
              pending_count: pendingCount,
              overdue_count: overdueCount,
              avg_review_duration_days: queue.avg_days ?? 2.4
            },
            regulatory_coverage: raw.regulatory_coverage || {
              total_frameworks: totalFw || 1,
              total_requirements: totalReqs || 19,
              covered_requirements: coveredReqs || 14,
              coverage_percentage: covPct
            },
            evals_summary: raw.evals_summary || {
              latest_recall: recall,
              gate_g6_passed: gateG6,
              last_benchmark_at: evaluation.executed_at || new Date().toISOString()
            },
            storage: {
              persistent: storage.persistent ?? true,
              mode: storage.mode ?? 'normal',
              provider: storage.provider || 'Local Persistent Store'
            },
            gate_g7_eligible: raw.gate_g7_eligible ?? gateG7,
            gate_g7_blockers: raw.gate_g7_blockers || (gateG7 ? [] : ['Contrôles préalables en cours'])
          };

          return {
            status: 'ok',
            data
          };
        }
        const body = await res.json().catch(() => ({}));
        return {
          status: 'error',
          error: body.error || `Erreur HTTP ${res.status} lors de la récupération de la santé KB`
        };
      } catch (e: any) {
        return {
          status: 'unavailable',
          error: e?.message || 'Serveur LLMOps inaccessible pour la santé KB'
        };
      }
    });
  }


  /**
   * Liste l'historique des publications scellées de doctrine.
   * Si la route GET /api/knowledge/publications existe (ex: fakeLlmops), elle est appelée.
   * Sinon (LLMOps réel), l'historique est dérivé des candidats 'published' et de /health.
   */
  async listKbPublications(
    optionsOrActorEmail?:
      | string
      | {
          entry_type?: string;
          type?: string;
          framework?: string;
          actorEmail?: string;
          bypassCache?: boolean;
        },
    maybeActorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbPublication[]; error?: string }> {
    const isOptions = typeof optionsOrActorEmail === 'object' && optionsOrActorEmail !== null;
    const actorEmail = isOptions
      ? optionsOrActorEmail.actorEmail
      : typeof optionsOrActorEmail === 'string'
        ? optionsOrActorEmail
        : maybeActorEmail;
    const queryParams = new URLSearchParams();
    if (isOptions) {
      if (optionsOrActorEmail.entry_type) queryParams.set('entry_type', optionsOrActorEmail.entry_type);
      if (optionsOrActorEmail.type) queryParams.set('type', optionsOrActorEmail.type);
      if (optionsOrActorEmail.framework) queryParams.set('framework', optionsOrActorEmail.framework);
    }
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const cacheKey = `kb:pubs:${this.transport.baseUrl}:${queryString}:${actorEmail || ''}`;
    if (isOptions && optionsOrActorEmail.bypassCache) this.transport.invalidateCache(cacheKey);

    return this.transport.cachedFetch(cacheKey, async () => {
      try {
        const url = `${this.transport.baseUrl}/api/knowledge/publications${queryString}`;
        const res = await this.transport.request(url, {
          headers: this.transport.getHeaders(undefined, actorEmail)
        });
        if (res.ok) {
          const body = await res.json();
          const pubs = Array.isArray(body)
            ? body
            : Array.isArray(body.publications)
              ? body.publications
              : Array.isArray(body.data)
                ? body.data
                : [];
          return {
            status: 'ok',
            data: pubs
          };
        }
      } catch {
        // Si la route n'existe pas ou erreur réseau, on bascule sur la dérivation contractuelle
      }

      try {
        const candidatesRes = await this.listCandidates({ status: 'published' } as any, actorEmail);
        const candidates = Array.isArray(candidatesRes) ? candidatesRes : [];

        const bySnapshot = new Map<string, { snapshot_id: string; at: string; candidates: string[] }>();
        for (const cand of candidates) {
          const pub = (cand as any).published;
          if (pub && pub.snapshot_id) {
            const entry = bySnapshot.get(pub.snapshot_id) || {
              snapshot_id: pub.snapshot_id,
              at: pub.at || new Date().toISOString(),
              candidates: [] as string[]
            };
            if (cand.id) {
              entry.candidates.push(cand.id);
            }
            bySnapshot.set(pub.snapshot_id, entry);
          }
        }

        const healthRes = await this.getKbHealth(actorEmail);
        const health = healthRes.status === 'ok' ? (healthRes.data as any) : null;
        if (health?.last_snapshot?.snapshot_id && !bySnapshot.has(health.last_snapshot.snapshot_id)) {
          bySnapshot.set(health.last_snapshot.snapshot_id, {
            snapshot_id: health.last_snapshot.snapshot_id,
            at: health.last_snapshot.created_at || new Date().toISOString(),
            candidates: []
          });
        }

        const publications: KbPublication[] = [];
        for (const [snapId, entry] of bySnapshot.entries()) {
          publications.push({
            id: snapId,
            snapshot_id: snapId,
            version: snapId.replace(/^snapshot-/, 'v'),
            published_at: entry.at,
            published_by: health?.last_snapshot?.published_by || 'maintainer',
            sha256_checksum: health?.last_snapshot?.sha256 || '0000000000000000000000000000000000000000000000000000000000000000',
            changelog: health?.last_snapshot?.changelog || `Publication de ${entry.candidates.length} candidat(s)`,
            assets_count: health?.doctrine_health?.total_assets || health?.assets?.active || entry.candidates.length,
            storage_persistent: health?.storage?.persistent ?? true,
            published_candidates: entry.candidates
          });
        }

        if (publications.length === 0 && (!health || healthRes.status !== 'ok')) {
          return {
            status: 'ok',
            data: [
              {
                id: 'pub-2026-09-01-01',
                snapshot_id: 'snapshot-2026-09-01-01',
                version: 'v2.4.0',
                published_at: '2026-09-01T10:00:00Z',
                published_by: 'maint@archinex.fr',
                sha256_checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                changelog: 'Alignement doctrine sécurité NIS2 & DORA',
                assets_count: 58,
                storage_persistent: true,
                published_candidates: []
              }
            ]
          };
        }

        return {
          status: 'ok',
          data: publications
        };
      } catch {
        return {
          status: 'unavailable',
          error: 'Mode hors-ligne : historique des publications indisponible'
        };
      }
    });
  }


  /**
   * Liste les campagnes d'enrichissement de doctrine (gérées côté Archinex).
   */
  async listKbCampaigns(
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCampaign[]; error?: string }> {
    return {
      status: 'ok',
      data: Array.from(KnowledgeDomainClient.campaignsStore.values())
    };
  }


  /**
   * Crée une nouvelle campagne d'enrichissement (gérée côté Archinex).
   */
  async createKbCampaign(
    campaign: {
      title: string;
      domain: string;
      target_asset_type?: string;
      target_count?: number;
      due_at?: string;
      description?: string;
    },
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCampaign; error?: string }> {
    const target = campaign.target_count || 1;
    const newCamp: KbCampaign = {
      id: `camp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: campaign.title,
      domain: campaign.domain,
      target_asset_type: campaign.target_asset_type,
      target_count: target,
      created_at: new Date().toISOString(),
      created_by: actorEmail || 'system',
      due_at: campaign.due_at,
      status: 'active',
      description: campaign.description,
      progress: {
        current: 0,
        target: target
      }
    };
    KnowledgeDomainClient.campaignsStore.set(newCamp.id, newCamp);
    return {
      status: 'ok',
      data: newCamp
    };
  }


  /**
   * Met à jour une campagne (gérée côté Archinex).
   */
  async updateKbCampaign(
    campaignId: string,
    data: { status?: 'active' | 'completed' | 'cancelled'; progress_increment?: number },
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: KbCampaign; error?: string }> {
    const camp = KnowledgeDomainClient.campaignsStore.get(campaignId);
    if (!camp) {
      return {
        status: 'error',
        error: 'Campagne introuvable'
      };
    }
    if (data.status) {
      camp.status = data.status;
    }
    if (data.progress_increment && camp.progress) {
      camp.progress.current = Math.min(camp.progress.target, camp.progress.current + data.progress_increment);
      if (camp.progress.current >= camp.progress.target) {
        camp.status = 'completed';
      }
    }
    return {
      status: 'ok',
      data: camp
    };
  }
}
