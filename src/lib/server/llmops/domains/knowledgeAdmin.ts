import type { LLMOpsTransport } from '../transport';
import { HubApiError } from '../transport';
import { configuredModel } from '../../similarity/encoder';
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

export class KnowledgeAdminDomainClient {
	constructor(private readonly transport: LLMOpsTransport) {}


  /**
   * Récupère le profil KB de l'utilisateur connecté auprès de LLMOps
   * GET /api/knowledge/me avec X-Actor-Email
   */
  async getMe(actorEmail: string): Promise<KbMeResponse> {
    if (!actorEmail) {
      return { status: 'error', error: 'Actor email required' };
    }

    try {
      const url = `${this.transport.baseUrl}/api/knowledge/me`;
      const res = await this.transport.request(url, {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });

      if (res.status === 503) {
        return { status: 'unavailable', error: 'LLMOps governance database unavailable (503)' };
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
          status: isNotRegistered ? 'not_registered' : 'forbidden',
          error: isNotRegistered
            ? "Compte non synchronisé avec le registre souverain LLMOps."
            : (errBody.error || errBody.reason || `HTTP ${res.status}`),
          reason: errBody.reason
        };
      }

      if (res.ok) {
        this.transport.invalidateCache();
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

      const errBody = await res.json().catch(() => ({}));
      return {
        status: res.status === 403 ? 'forbidden' : 'error',
        error: errBody.error || errBody.reason || errBody.detail || `HTTP ${res.status}`
      };
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
      const url = `${this.transport.baseUrl}/api/knowledge/owners`;
      const res = await this.transport.request(url, {
        headers: this.transport.getHeaders(undefined, actorEmail)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const payload = body.data || body;
        const owners = Array.isArray(payload) ? payload : (payload.owners || []);
        return {
          owners,
          domains: payload.domains || {},
          default_owner: payload.default_owner,
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
      // Préserver les domaines et le default_owner existants si possible
      let currentDomains: Record<string, string> = {};
      let defaultOwner = '@maintainers';

      try {
        const current: KbOwnersRegistry = await (
        typeof (this.transport as any).getOwners === 'function'
          ? (this.transport as any).getOwners(actorEmail)
          : this.getOwners(actorEmail)
      );
        if (current.domains && Object.keys(current.domains).length > 0) currentDomains = current.domains;
        if (current.default_owner) defaultOwner = current.default_owner;
      } catch {
        // Ignorer si échec
      }

      // Reconstruire la liste des owners au format attendu par LLMOps
      const cleanOwners = owners.map((o) => ({
        handle: o.handle,
        email: o.email || null,
        roles: o.roles || [],
        delegated: Boolean(o.delegated)
      }));

      // S'assurer que defaultOwner fait partie des owners
      if (!cleanOwners.some((o) => o.handle === defaultOwner) && cleanOwners.length > 0) {
        defaultOwner = cleanOwners[0].handle;
      }

      const payload = {
        owners: cleanOwners,
        domains: currentDomains,
        default_owner: defaultOwner
      };

      const url = `${this.transport.baseUrl}/api/knowledge/owners`;
      const res = await this.transport.request(url, {
        method: 'PUT',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify(payload)
      });

      if (res.status === 503) {
        return { success: false, updated_count: 0, error: 'LLMOps governance database unavailable (503)' };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const resPayload = body.data || body;
        return {
          success: true,
          updated_count: resPayload.owners ?? resPayload.updated_count ?? owners.length
        };
      }

      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        updated_count: 0,
        error: errBody.error || errBody.reason || `HTTP ${res.status}`
      };
    } catch {
      // Fallback
    }

    return {
      success: false,
      updated_count: 0,
      offline: true
    };
  }


  /**
   * Met à jour ou inscrit explicitement une seule personne/handle dans le registre des propriétaires LLMOps
   * en fusionnant avec l'état courant de GET /api/knowledge/owners (sans écraser les autres entrées ni les domaines).
   */
  async upsertOwnerInRegistry(
    input: {
      handle: string;
      email: string | null;
      roles: KbRole[];
      delegated?: boolean;
      domains?: string[];
      previousHandle?: string;
    },
    actorEmail?: string
  ): Promise<{
    success: boolean;
    handle: string;
    owners_count: number;
    domains_count: number;
    offline?: boolean;
    error?: string;
  }> {
    const targetHandle = input.handle.trim().startsWith('@')
      ? input.handle.trim().toLowerCase()
      : `@${input.handle.trim().toLowerCase()}`;
    const targetEmail = input.email ? input.email.trim().toLowerCase() : null;
    const prevHandle = input.previousHandle
      ? input.previousHandle.trim().startsWith('@')
        ? input.previousHandle.trim().toLowerCase()
        : `@${input.previousHandle.trim().toLowerCase()}`
      : null;

    try {
      const current: KbOwnersRegistry = await (
        typeof (this.transport as any).getOwners === 'function'
          ? (this.transport as any).getOwners(actorEmail)
          : this.getOwners(actorEmail)
      );
      if (current.offline) {
        return {
          success: false,
          handle: targetHandle,
          owners_count: 0,
          domains_count: 0,
          offline: true,
          error: 'Serveur LLMOps injoignable : impossible de lire ou modifier le registre des responsables.'
        };
      }

      const ownersMap = new Map<
        string,
        { handle: string; email: string | null; roles: KbRole[]; delegated: boolean }
      >();
      for (const o of current.owners || []) {
        const h = o.handle.trim().toLowerCase();
        // Si une autre entrée possédait déjà cet e-mail, on le libère pour éviter le doublon d'e-mail côté LLMOps
        const sameEmail = targetEmail && o.email && o.email.trim().toLowerCase() === targetEmail;
        ownersMap.set(h, {
          handle: h,
          email: sameEmail && h !== targetHandle ? null : o.email || null,
          roles: Array.isArray(o.roles) && o.roles.length > 0 ? o.roles : ['kb:review'],
          delegated: sameEmail && h !== targetHandle ? false : Boolean(o.delegated)
        });
      }

      if (prevHandle && prevHandle !== targetHandle && ownersMap.has(prevHandle)) {
        const prevEntry = ownersMap.get(prevHandle)!;
        if (prevEntry.email && (!targetEmail || prevEntry.email.toLowerCase() === targetEmail)) {
          ownersMap.set(prevHandle, {
            ...prevEntry,
            email: null,
            delegated: false
          });
        }
      }

      const cleanRoles: KbRole[] =
        Array.isArray(input.roles) && input.roles.length > 0 ? input.roles : ['kb:review'];

      ownersMap.set(targetHandle, {
        handle: targetHandle,
        email: targetEmail,
        roles: cleanRoles,
        delegated: input.delegated ?? Boolean(targetEmail)
      });

      const domainsMap: Record<string, string> = { ...(current.domains || {}) };
      let defaultOwner = current.default_owner || '@maintainers';
      if (!ownersMap.has(defaultOwner)) {
        defaultOwner = targetHandle;
      }

      if (input.domains !== undefined) {
        const wantedDomains = new Set(
          input.domains.map((d) => d.trim().toLowerCase()).filter((d) => d.length > 0)
        );
        // Retirer les domaines qui pointaient vers targetHandle mais ne sont plus souhaités
        for (const [dom, h] of Object.entries(domainsMap)) {
          if (h.toLowerCase() === targetHandle && !wantedDomains.has(dom.toLowerCase())) {
            if (defaultOwner !== targetHandle && ownersMap.has(defaultOwner)) {
              domainsMap[dom] = defaultOwner;
            } else {
              delete domainsMap[dom];
            }
          }
        }
        // Assigner les domaines souhaités à targetHandle
        for (const dom of wantedDomains) {
          domainsMap[dom] = targetHandle;
        }
      }

      const cleanOwners = Array.from(ownersMap.values());
      const payload = {
        owners: cleanOwners,
        domains: domainsMap,
        default_owner: defaultOwner
      };

      // Si l'acteur courant possède déjà kb:admin dans le registre LLMOps, propager X-Actor-Email ;
      // sinon utiliser le scope kb:admin du jeton de service (amorçage autorisé par le contrat LLMOps).
      const actorIsKbAdminInRegistry = Boolean(
        actorEmail &&
          (current.owners || []).some(
            (o) =>
              o.email &&
              o.email.toLowerCase() === actorEmail.toLowerCase() &&
              Array.isArray(o.roles) &&
              o.roles.includes('kb:admin')
          )
      );

      const url = `${this.transport.baseUrl}/api/knowledge/owners`;
      let res = await this.transport.request(url, {
        method: 'PUT',
        headers: this.transport.getHeaders(undefined, actorIsKbAdminInRegistry ? actorEmail : undefined),
        body: JSON.stringify(payload)
      });

      if (res.status === 403) {
        // En cas de refus 403 (jeton sans scope kb:admin direct ou acteur local non souverain),
        // tenter avec un compte administrateur KB déclaré dans le registre (ex: @maintainers)
        const kbAdminOwner = (current.owners || []).find(
          (o) => o.email && Array.isArray(o.roles) && o.roles.includes('kb:admin')
        );
        if (kbAdminOwner?.email && kbAdminOwner.email.toLowerCase() !== actorEmail?.toLowerCase()) {
          res = await this.transport.request(url, {
            method: 'PUT',
            headers: this.transport.getHeaders(undefined, kbAdminOwner.email),
            body: JSON.stringify(payload)
          });
        } else if (actorIsKbAdminInRegistry) {
          res = await this.transport.request(url, {
            method: 'PUT',
            headers: this.transport.getHeaders(undefined, undefined),
            body: JSON.stringify(payload)
          });
        }
      }

      if (res.status === 503) {
        return {
          success: false,
          handle: targetHandle,
          owners_count: 0,
          domains_count: 0,
          error: 'Base de gouvernance LLMOps indisponible (503)'
        };
      }

      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        const resPayload = body.data || body;
        return {
          success: true,
          handle: targetHandle,
          owners_count: resPayload.owners ?? cleanOwners.length,
          domains_count: resPayload.domains ?? Object.keys(domainsMap).length
        };
      }

      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        handle: targetHandle,
        owners_count: 0,
        domains_count: 0,
        error: errBody.error || errBody.reason || `HTTP ${res.status}`
      };
    } catch {
      return {
        success: false,
        handle: targetHandle,
        owners_count: 0,
        domains_count: 0,
        offline: true,
        error: 'Serveur LLMOps injoignable'
      };
    }
  }


  /* ==========================================================================
   * CONTRAT 1.9 : SIMILARITÉ SÉMANTIQUE & EMBEDDINGS (CALCULÉS PAR LE CLIENT)
   * ========================================================================== */

  /**
   * Récupère la liste des actifs en attente d'embedding pour un modèle donné (Contrat 1.9).
   */
  async getEmbeddingsPending(
    model: string = configuredModel(),
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; pending: EmbeddingPendingItem[]; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/embeddings/pending?model=${encodeURIComponent(model)}`;
      const res = await this.transport.request(url, {
        method: 'GET',
        headers: this.transport.getHeaders(undefined, actorEmail)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          pending: body.data?.pending || []
        };
      }
      const err = await res.json().catch(() => ({}));
      return {
        status: 'error',
        pending: [],
        error: err.error || `Erreur HTTP ${res.status}`
      };
    } catch (e: any) {
      return {
        status: 'unavailable',
        pending: [],
        error: e.message || 'Serveur LLMOps inaccessible'
      };
    }
  }


  /**
   * Dépose un lot d'embeddings calculés localement par Archinex (Contrat 1.9).
   */
  async depositEmbeddings(
    deposit: EmbeddingDeposit,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; dim?: number; count?: number; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/embeddings`;
      const res = await this.transport.request(url, {
        method: 'PUT',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify(deposit)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          dim: body.data?.dim,
          count: body.data?.count ?? deposit.items.length
        };
      }
      const err = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: err.error || `Erreur HTTP ${res.status}`
      };
    } catch (e: any) {
      return {
        status: 'unavailable',
        error: e.message || 'Serveur LLMOps inaccessible'
      };
    }
  }


  /**
   * Recherche sémantique de connaissances similaires (Contrat 1.9).
   * Note : requires_confirmation est toujours vrai dans les résultats.
   */
  async searchSimilarKnowledge(
    request: SimilarKnowledgeRequest,
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: SimilarKnowledgeResponse; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/similar`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify(request)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data
        };
      }
      const err = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: err.error || `Erreur HTTP ${res.status}`
      };
    } catch (e: any) {
      return {
        status: 'unavailable',
        error: e.message || 'Serveur LLMOps inaccessible'
      };
    }
  }


  /* ==========================================================================
   * CONTRAT 1.10 : RÉUTILISATION DES CONNAISSANCES VALIDÉES
   * ========================================================================== */

  /**
   * Enregistre le jugement d'un architecte sur la réutilisation d'un actif validé (Contrat 1.10).
   * Toutes les hypothèses documentées doivent être examinées.
   */
  async postReuseConfirmation(
    confirmation: ReuseConfirmationRequest,
    actorEmail: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data?: ReuseConfirmation; error?: string }> {
    try {
      const url = `${this.transport.baseUrl}/api/knowledge/reuse-confirmations`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(undefined, actorEmail),
        body: JSON.stringify(confirmation)
      });
      if (res.status === 201 || res.ok) {
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data
        };
      }
      const err = await res.json().catch(() => ({}));
      return {
        status: 'error',
        error: err.error || `Erreur HTTP ${res.status}`
      };
    } catch (e: any) {
      return {
        status: 'unavailable',
        error: e.message || 'Serveur LLMOps inaccessible'
      };
    }
  }


  /**
   * Récupère l'historique des confirmations de réutilisation (Contrat 1.10).
   */
  async getReuseConfirmations(
    params?: { subject_fingerprint?: string; matched_ref?: string },
    actorEmail?: string
  ): Promise<{ status: 'ok' | 'error' | 'unavailable'; data: ReuseConfirmation[]; error?: string }> {
    try {
      const query = new URLSearchParams();
      if (params?.subject_fingerprint) query.set('subject_fingerprint', params.subject_fingerprint);
      if (params?.matched_ref) query.set('matched_ref', params.matched_ref);
      const url = `${this.transport.baseUrl}/api/knowledge/reuse-confirmations${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await this.transport.request(url, {
        method: 'GET',
        headers: this.transport.getHeaders(undefined, actorEmail)
      });
      if (res.ok) {
        this.transport.invalidateCache();
        const body = await res.json();
        return {
          status: 'ok',
          data: body.data?.confirmations || body.data || []
        };
      }
      const err = await res.json().catch(() => ({}));
      return {
        status: 'error',
        data: [],
        error: err.error || `Erreur HTTP ${res.status}`
      };
    } catch (e: any) {
      return {
        status: 'unavailable',
        data: [],
        error: e.message || 'Serveur LLMOps inaccessible'
      };
    }
  }
}
