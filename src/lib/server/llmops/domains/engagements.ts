import type { LLMOpsTransport } from '../transport';
import { HubApiError } from '../transport';
import { parseHubFactVocabulary, type HubFactVocabulary } from '$lib/domain/hubFactVocabulary';
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

export class EngagementsDomainClient {
	constructor(private readonly transport: LLMOpsTransport) {}


  /**
   * Tableau de maturité d'architecture (L0-L4)
   */
  async getBoard(engagement?: string): Promise<{ data: LLMOpsBoardItem[]; source: 'live' | 'offline-fallback' }> {
    const remoteEng = this.transport.resolveRemoteEngagement(engagement || this.transport.defaultEngagement);
    try {
      const url = `${this.transport.baseUrl}/api/arbitration/board?engagement=${encodeURIComponent(remoteEng)}`;
      const res = await this.transport.request(url, { headers: this.transport.getHeaders(remoteEng) });
      if (res.ok) {
        const env = (await res.json()) as LLMOpsResponseEnvelope<LLMOpsBoardItem[]>;
        if (env.status === 'ok' && Array.isArray(env.data)) {
          return { data: env.data, source: 'live' };
        }
      } else if (res.status === 403 || res.status === 401) {
        return { data: [], source: 'live' };
      }
    } catch {
      // Fallback
    }

    return { data: [], source: 'offline-fallback' };
  }


  /**
   * Liste des énoncés d'architecture
   */
  async getStatements(
    engagement?: string,
    subject?: string
  ): Promise<{ data: LLMOpsStatement[]; source: 'live' | 'offline-fallback' }> {
    const remoteEng = this.transport.resolveRemoteEngagement(engagement || this.transport.defaultEngagement);
    try {
      let url = `${this.transport.baseUrl}/api/arbitration/statements?engagement=${encodeURIComponent(remoteEng)}`;
      if (subject) {
        url += `&subject=${encodeURIComponent(subject)}`;
      }
      const res = await this.transport.request(url, { headers: this.transport.getHeaders(remoteEng) });
      if (res.ok) {
        const env = (await res.json()) as LLMOpsResponseEnvelope<LLMOpsStatement[]>;
        if (env.status === 'ok' && Array.isArray(env.data)) {
          return { data: env.data, source: 'live' };
        }
      } else if (res.status === 403 || res.status === 401) {
        return { data: [], source: 'live' };
      }
    } catch {
      // Fallback
    }

    return { data: [], source: 'offline-fallback' };
  }


  /**
   * Liste des conflits / contradictions
   */
  async getConflicts(
    engagement?: string,
    status = 'open'
  ): Promise<{ data: LLMOpsConflict[]; source: 'live' | 'offline-fallback' }> {
    const remoteEng = this.transport.resolveRemoteEngagement(engagement || this.transport.defaultEngagement);
    try {
      const url = `${this.transport.baseUrl}/api/arbitration/conflicts?engagement=${encodeURIComponent(remoteEng)}&status=${encodeURIComponent(status)}`;
      const res = await this.transport.request(url, { headers: this.transport.getHeaders(remoteEng) });
      if (res.ok) {
        const env = (await res.json()) as LLMOpsResponseEnvelope<LLMOpsConflict[]>;
        if (env.status === 'ok' && Array.isArray(env.data)) {
          return { data: env.data, source: 'live' };
        }
      } else if (res.status === 403 || res.status === 401) {
        return { data: [], source: 'live' };
      }
    } catch {
      // Fallback
    }

    return { data: [], source: 'offline-fallback' };
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
    const eng = engagement || this.transport.defaultEngagement;
    try {
      const url = `${this.transport.baseUrl}/api/rfp/shred-to-candidates`;
      const res = await this.transport.request(url, {
        method: 'POST',
        headers: this.transport.getHeaders(eng),
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
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || errBody.detail || `Erreur HTTP ${res.status} lors du dépouillement RFP`);
    } catch (e: any) {
      if (e.message && (e.message.startsWith('Erreur HTTP') || e.message.includes('Air-Gap Security'))) {
        throw e;
      }
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
        throw new Error('Erreur HTTP : Délai dépassé lors du dépouillement RFP');
      }

      throw new Error(`Serveur LLMOps inaccessible pour le dépouillement RFP : ${e.message}`);
    }
  }


  // --- K14: Managed Engagements (Contract 1.16) --------------------------------

  async createManagedEngagement(
    params: { engagement: string; confidentiality: HubConfidentiality; admin_email: string; admin_handle: string },
    actorEmail?: string
  ): Promise<{ engagement: string; confidentiality: HubConfidentiality; members: HubPublicMember[] }> {
    const url = `${this.transport.baseUrl}/api/engagements`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(params.engagement, actorEmail),
      body: JSON.stringify(params)
    });
    return this.transport.parseOrThrow(res);
  }


  async getEngagementMembers(engagementId: string, actorEmail?: string): Promise<HubMember[] | HubPublicMember[]> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/members`;
    const res = await this.transport.request(url, {
      method: 'GET',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    const data = await this.transport.parseOrThrow<{ engagement: string; members: HubMember[] }>(res);
    return data.members || [];
  }


  async setEngagementMembers(engagementId: string, members: HubMember[], actorEmail?: string): Promise<HubMember[]> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/members`;
    const res = await this.transport.request(url, {
      method: 'PUT',
      headers: this.transport.getHeaders(engagementId, actorEmail),
      body: JSON.stringify({ members })
    });
    const data = await this.transport.parseOrThrow<{ engagement: string; members: HubMember[] }>(res);
    return data.members || [];
  }


  async getEngagementMe(engagementId: string, actorEmail?: string): Promise<HubEngagementMe> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/me`;
    const res = await this.transport.request(url, {
      method: 'GET',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    return this.transport.parseOrThrow<HubEngagementMe>(res);
  }


  async getEngagementAudit(engagementId: string, limit = 100, actorEmail?: string): Promise<HubAuditEvent[]> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/audit?limit=${limit}`;
    const res = await this.transport.request(url, {
      method: 'GET',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    const data = await this.transport.parseOrThrow<{ engagement: string; events: HubAuditEvent[] }>(res);
    return data.events || [];
  }


  // --- K15: Managed Engagement Writes (Contract 1.17) --------------------------

  async addSubject(engagementId: string, input: HubSubjectInput, actorEmail?: string): Promise<HubSubjectResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/subjects`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubSubjectResult>(res);
  }


  async advanceSubjectMaturity(
    engagementId: string,
    subjectName: string,
    level: HubMaturityInput['level'],
    actorEmail?: string
  ): Promise<HubMaturityResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/subjects/${encodeURIComponent(subjectName)}/maturity`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail),
      body: JSON.stringify({ level })
    });
    return this.transport.parseOrThrow<HubMaturityResult>(res);
  }


  async addStatement(
    engagementId: string,
    input: HubStatementInput,
    actorEmail?: string,
    idempotencyKey?: string
  ): Promise<HubAddStatementResponse> {
    const key = idempotencyKey || input.idempotency_key;
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/statements`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail, key),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubAddStatementResponse>(res);
  }


  async assertStatement(
    engagementId: string,
    statementId: string,
    actorEmail?: string
  ): Promise<HubAssertStatementResponse> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/statements/${encodeURIComponent(statementId)}/assert`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    return this.transport.parseOrThrow<HubAssertStatementResponse>(res);
  }


  async withdrawStatement(
    engagementId: string,
    statementId: string,
    actorEmail?: string
  ): Promise<HubWithdrawStatementResponse> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/statements/${encodeURIComponent(statementId)}/withdraw`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    return this.transport.parseOrThrow<HubWithdrawStatementResponse>(res);
  }


  async addQuestion(
    engagementId: string,
    input: HubQuestionInput,
    actorEmail?: string,
    idempotencyKey?: string
  ): Promise<HubAddQuestionResponse> {
    const key = idempotencyKey || input.idempotency_key;
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/questions`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail, key),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubAddQuestionResponse>(res);
  }


  async answerQuestion(
    engagementId: string,
    questionId: string,
    input: HubAnswerInput,
    actorEmail?: string,
    idempotencyKey?: string
  ): Promise<HubAddStatementResponse> {
    const key = idempotencyKey || input.idempotency_key;
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/questions/${encodeURIComponent(questionId)}/answers`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail, key),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubAddStatementResponse>(res);
  }


  async addRequirements(
    engagementId: string,
    input: HubRequirementsInput,
    actorEmail?: string
  ): Promise<HubRequirementsResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/requirements`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubRequirementsResult>(res);
  }


  // --- Contract 1.27: decision on a requirement, requirements carried by a subject ---------------------

  async proposeRequirementDisposition(
    engagementId: string,
    requirementId: string,
    input: HubRequirementDispositionInput,
    actorEmail?: string
  ): Promise<HubRequirementDecisionResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/requirements/${encodeURIComponent(requirementId)}/disposition`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubRequirementDecisionResult>(res);
  }


  async assertRequirementDisposition(
    engagementId: string,
    requirementId: string,
    actorEmail?: string
  ): Promise<HubRequirementDecisionResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/requirements/${encodeURIComponent(requirementId)}/disposition/assert`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    return this.transport.parseOrThrow<HubRequirementDecisionResult>(res);
  }


  async withdrawRequirementDisposition(
    engagementId: string,
    requirementId: string,
    actorEmail?: string
  ): Promise<HubRequirementDecisionResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/requirements/${encodeURIComponent(requirementId)}/disposition/withdraw`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    return this.transport.parseOrThrow<HubRequirementDecisionResult>(res);
  }


  async carrySubjectRequirements(
    engagementId: string,
    subjectName: string,
    input: { add?: string[]; remove?: string[] },
    actorEmail?: string
  ): Promise<HubCarryRequirementsResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/subjects/${encodeURIComponent(subjectName)}/requirements`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubCarryRequirementsResult>(res);
  }


  async arbitrateConflict(
    engagementId: string,
    conflictId: string,
    input: HubArbitrateConflictInput,
    actorEmail?: string
  ): Promise<HubConflictResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/conflicts/${encodeURIComponent(conflictId)}/arbitrate`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubConflictResult>(res);
  }


  // --- Decisions & Machine-Readable Facts (K16 & K18) -----------------------

  /** Vocabulaire des faits du Hub (K18), tel que le porte son instantané de connaissance scellé. */
  async getFactVocabulary(): Promise<HubFactVocabulary> {
    const { data } = await this.transport.getLatestSnapshot();
    return parseHubFactVocabulary(data);
  }


  async addDecision(
    engagementId: string,
    input: HubDecisionInput,
    actorEmail?: string,
    idempotencyKey?: string
  ): Promise<HubDecisionResult> {
    const key = idempotencyKey || input.idempotency_key;
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/decisions`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail, key),
      body: JSON.stringify(input)
    });
    return this.transport.parseOrThrow<HubDecisionResult>(res);
  }


  async assertDecision(
    engagementId: string,
    decisionId: string,
    actorEmail?: string,
    idempotencyKey?: string
  ): Promise<HubDecisionResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/decisions/${encodeURIComponent(decisionId)}/assert`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail, idempotencyKey)
    });
    return this.transport.parseOrThrow<HubDecisionResult>(res);
  }


  // --- K11: Sealed Engagement Snapshot (Contract 1.18) -----------------------

  async exportEngagementSnapshot(engagementId: string, actorEmail?: string): Promise<HubExportIssueResult> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/exports`;
    const res = await this.transport.request(url, {
      method: 'POST',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    return this.transport.parseOrThrow<HubExportIssueResult>(res);
  }


  async listEngagementExports(engagementId: string, actorEmail?: string): Promise<HubExportListingItem[]> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/exports`;
    const res = await this.transport.request(url, {
      method: 'GET',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    const data = await this.transport.parseOrThrow<{ engagement: string; exports: HubExportListingItem[] }>(res);
    return data.exports || [];
  }


  async getEngagementExport(engagementId: string, snapshotId: string, actorEmail?: string): Promise<HubExportEnvelope> {
    const url = `${this.transport.baseUrl}/api/engagements/${encodeURIComponent(engagementId)}/exports/${encodeURIComponent(snapshotId)}`;
    const res = await this.transport.request(url, {
      method: 'GET',
      headers: this.transport.getHeaders(engagementId, actorEmail)
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const code = errBody.error || errBody.status || `HTTP_${res.status}`;
      const reason = errBody.reason || errBody.message || `Erreur HTTP ${res.status}`;
      throw new HubApiError(res.status, code, reason, errBody);
    }
    return (await res.json()) as HubExportEnvelope;
  }


  /**
   * Synchronisation globale composite (Board + Statements + Conflicts + Health)
   * Bascule automatiquement en local si offline
   */
  async syncEngagement(engagement?: string): Promise<LLMOpsSyncPayload> {
    const localEng = engagement || this.transport.defaultEngagement;
    const remoteEng = this.transport.resolveRemoteEngagement(localEng);

    // Fast-fail health check : si Cloud Run / serveur est injoignable, on bascule immédiatement en local sans attendre
    const healthRes = await this.transport.getHealth();
    if (healthRes.source !== 'live') {
      return {
        source: 'offline-fallback',
        engagement: localEng,
        syncedAt: new Date().toISOString(),
        health: healthRes.data,
        board: [],
        statements: [],
        conflicts: []
      };
    }

    const [boardRes, statementsRes, conflictsRes] = await Promise.all([
      this.getBoard(remoteEng),
      this.getStatements(remoteEng),
      this.getConflicts(remoteEng)
    ]);

    const isLive = healthRes.source === 'live';

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
