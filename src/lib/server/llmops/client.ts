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
  LLMOpsSyncPayload
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
    this.baseUrl = (config.baseUrl || process.env.LLMOPS_BASE_URL || 'https://llmops-mcp-server-344571265365.europe-west1.run.app').replace(/\/+$/, '');
    this.authToken = config.authToken || process.env.LLMOPS_AUTH_TOKEN || 'demo-public-2026-08';
    this.defaultEngagement = config.defaultEngagement || process.env.LLMOPS_ENGAGEMENT || 'nordwave-mcx-2027';
    this.timeoutMs = config.timeoutMs || 4000;
  }

  /**
   * Mappe les identifiants d'engagements locaux vers l'identifiant reconnu par le serveur distant GCP.
   * L'instance GCP de démonstration est restreinte au périmètre 'nordwave-mcx-2027'.
   */
  resolveRemoteEngagement(engagement?: string): string {
    if (!engagement || engagement === 'cctp-mcx-nordwave' || engagement === 'eng_cctp_nordwave' || engagement === 'nordwave-mcx-2027') {
      return 'nordwave-mcx-2027';
    }
    return engagement;
  }

  private getHeaders(engagement?: string): Record<string, string> {
    const eng = this.resolveRemoteEngagement(engagement || this.defaultEngagement);
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
      'X-Engagement-Id': eng
    };
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
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
      resolve(process.cwd(), 'src/lib/fixtures/llmops-nordwave-bundle.json'),
      resolve(process.cwd(), '../LLMOps/data/snapshots/latest.json')
    ];

    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed.health && parsed.board && parsed.statements) {
            return parsed;
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
          subject: 'mcx-services',
          name: 'mcx-services',
          level: 'L2_decomposed',
          origin: 'blueprint',
          days_at_level: 0,
          updated_at: new Date().toISOString(),
          is_stalled: false,
          open_question_ref: null,
          assigned_role: 'mcx-service-architect',
          dependent_sections: ['4.1']
        }
      ],
      statements: [
        {
          id: 'S-OFFLINE-01',
          section: '4.1',
          subject: 'mcx-services',
          predicate: 'implements',
          value: '3GPP Release 17 MCX Voice/Data Service Layer',
          unit: null,
          author: 'archinex-offline',
          role: 'system',
          confidence: 'verified',
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

    const fixturePath = resolve(process.cwd(), 'src/lib/fixtures/llmops-sealed-snapshot.json');
    if (existsSync(fixturePath)) {
      const raw = readFileSync(fixturePath, 'utf-8');
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
   * Synchronisation globale composite (Board + Statements + Conflicts + Health)
   */
  async syncEngagement(engagement?: string): Promise<LLMOpsSyncPayload> {
    const localEng = engagement || this.defaultEngagement;
    const remoteEng = this.resolveRemoteEngagement(localEng);

    // Si l'engagement est un blueprint générique 100% local (ex: SUSE Telco Cloud),
    // on sert directement le bundle local scellé pour garantir l'absence de fuite et de latence.
    if (localEng === 'suse-telco-cloud-generic') {
      const bundle = this.loadOfflineBundle();
      return {
        source: 'offline-fallback',
        engagement: localEng,
        syncedAt: new Date().toISOString(),
        health: {
          ...bundle.health,
          service: 'archinex-sovereign-local'
        },
        board: bundle.board,
        statements: bundle.statements,
        conflicts: bundle.conflicts,
        snapshotMeta: bundle.health.kb
      };
    }

    const [healthRes, boardRes, statementsRes, conflictsRes] = await Promise.all([
      this.getHealth(),
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
