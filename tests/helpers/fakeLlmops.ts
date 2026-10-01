import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  LLMOpsHealth,
  DoctrineContext,
  DoctrineItem,
  CheckResult,
  FrameworkCoverage,
  KbCandidate,
  KbOwner,
  KbReviewInboxItem,
  KbCandidateDetail,
  KbAutomaticCheck,
  KbComment,
  KbEvent,
  LLMOpsBoardItem,
  LLMOpsStatement,
  LLMOpsConflict
} from '../../src/lib/types/llmops';

export interface FakeLlmopsState {
  health: LLMOpsHealth;
  doctrine: DoctrineItem[];
  frameworkCoverage: FrameworkCoverage;
  candidates: KbCandidate[];
  owners: KbOwner[];
  inbox: KbReviewInboxItem[];
  candidateDetails: Record<string, KbCandidateDetail>;
  comments: Record<string, KbComment[]>;
  events: KbEvent[];
  board: LLMOpsBoardItem[];
  statements: LLMOpsStatement[];
  conflicts: LLMOpsConflict[];
}

export function generateDefaultChecks(title: string, content: string = ''): KbAutomaticCheck[] {
  return [
    {
      name: 'schema_validity',
      label: 'Conformité Schéma d’Actif',
      passed: true,
      score: 100,
      details: 'Structure JSON et métadonnées conformes à la constitution',
      severity: 'info'
    },
    {
      name: 'clarity_score',
      label: 'Clarté Rédactionnelle & Concision',
      passed: true,
      score: 94,
      details: 'Formulation assertive claire sans ambiguïté',
      severity: 'info'
    },
    {
      name: 'testability',
      label: 'Testabilité des Prédicats',
      passed: !title.toLowerCase().includes('vague'),
      score: title.toLowerCase().includes('vague') ? 45 : 88,
      details: title.toLowerCase().includes('vague')
        ? 'Clauses trop vagues ou non testables'
        : 'Clauses vérifiables sous forme d’assertions when/expect',
      severity: 'warning'
    },
    {
      name: 'non_duplication',
      label: 'Absence de Duplication Doctrinale',
      passed: true,
      score: 95,
      details: 'Aucun doublon sémantique détecté dans le référentiel actif',
      severity: 'info'
    },
    {
      name: 'sovereign_compliance',
      label: 'Conformité Souveraine & Air-Gap',
      passed: !content.toLowerCase().includes('exfiltrat'),
      score: content.toLowerCase().includes('exfiltrat') ? 0 : 100,
      details: content.toLowerCase().includes('exfiltrat')
        ? 'Alerte : tentative d’exfiltration réseau détectée'
        : 'Aucune dépendance cloud public non certifiée',
      severity: 'error'
    },
    {
      name: 'domain_alignment',
      label: 'Alignement du Domaine Responsable',
      passed: true,
      score: 92,
      details: 'Conforme aux périmètres de compétences de gouvernance',
      severity: 'info'
    },
    {
      name: 'architectural_impact',
      label: 'Analyse d’Impact & Criticité',
      passed: true,
      score: 85,
      details: 'Effet de bord borné au périmètre défini',
      severity: 'warning'
    }
  ];
}

export function createDefaultFakeState(): FakeLlmopsState {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const cand1Detail: KbCandidateDetail = {
    id: 'cand-sec-001',
    kind: 'new_asset',
    title: 'Chiffrement Homomorphe Inter-Services',
    summary: 'Obligation de chiffrement des flux inter-services par clés souveraines tournantes.',
    rationale: 'Exigence de protection contre les écoutes latérales',
    domain: 'security',
    source: { system: 'archinex', engagement: 'test-engagement' },
    author: 'architect@archinex.local',
    production_mode: 'human-authored',
    status: 'in_review',
    checks: generateDefaultChecks('Chiffrement Homomorphe Inter-Services'),
    all_checks_passed: true,
    assigned_to: '@sec-lead',
    assigned_reviewers: ['@sec-lead'],
    history: [
      {
        timestamp: new Date(now.getTime() - 3600000).toISOString(),
        actor: 'architect@archinex.local',
        action: 'submitted',
        details: 'Candidat généré suite à arbitrage G4'
      }
    ]
  };

  const cand2Detail: KbCandidateDetail = {
    id: 'cand-principle-002',
    kind: 'principle',
    title: 'Principe Fondamental d’Immuabilité des Traces Audit',
    summary: 'Toute trace d’audit doit être écrite en append-only non modifiable par l’administrateur système.',
    rationale: 'Principe régalien de non-répudiation',
    domain: 'security',
    source: { system: 'archinex', engagement: 'test-engagement' },
    author: 'sec-officer@archinex.local',
    production_mode: 'human-authored',
    status: 'in_review',
    checks: generateDefaultChecks('Principe Fondamental d’Immuabilité des Traces Audit'),
    all_checks_passed: true,
    assigned_to: '@sec-lead',
    assigned_reviewers: ['@sec-lead'],
    history: [
      {
        timestamp: new Date(now.getTime() - 7200000).toISOString(),
        actor: 'sec-officer@archinex.local',
        action: 'submitted',
        details: 'Nouveau principe fondamental'
      }
    ]
  };

  const cand3Detail: KbCandidateDetail = {
    id: 'cand-overdue-003',
    kind: 'amendment',
    title: 'Dérogation Temporaire Synchronisation NTP Hors-Ligne',
    summary: 'Tolérance d’un drift temporel maximal de 500ms sur les nœuds déconnectés.',
    rationale: 'Contrainte matérielle de déploiement terrain',
    domain: 'cloud',
    source: { system: 'archinex', engagement: 'test-engagement' },
    author: 'ops@archinex.local',
    production_mode: 'human-authored',
    status: 'in_review',
    checks: generateDefaultChecks('Dérogation Temporaire Synchronisation NTP Hors-Ligne'),
    all_checks_passed: true,
    assigned_to: '@sec-lead',
    assigned_reviewers: ['@sec-lead'],
    history: [
      {
        timestamp: fiveDaysAgo.toISOString(),
        actor: 'ops@archinex.local',
        action: 'submitted',
        details: 'Demande de dérogation'
      }
    ]
  };

  return {
    health: {
      status: 'ok',
      plane: 'control',
      schema_version: '1.0.0',
      service: 'fake-llmops',
      engine_version: '1.0.0-test',
      engine_commit: 'test-sha',
      kb: {
        snapshot_id: 'test-snapshot-1',
        source_revision: 'v1',
        payload_sha256: 'abc123test',
        created_at: new Date().toISOString()
      }
    },
    doctrine: [
      {
        id: 'DOC-TEST-001',
        type: 'rule',
        title: 'Test Redundancy Rule',
        content: 'High-availability services must feature N+1 redundancy across independent nodes.',
        framework: 'HA-STD',
        domain: 'architecture'
      }
    ],
    frameworkCoverage: {
      frameworks: [
        { name: 'High Availability Standard', required: true, covered_count: 5, total_count: 5, status: 'covered' }
      ],
      overall_coverage: 'covered',
      checked_at: new Date().toISOString()
    },
    candidates: [cand1Detail, cand2Detail, cand3Detail],
    owners: [
      {
        handle: '@sec-lead',
        name: 'Security Lead',
        email: 'expert@archinex.local',
        roles: ['kb:review', 'kb:maintain'],
        domains: ['security', 'cloud'],
        delegated: true
      },
      {
        handle: '@peer-reviewer',
        name: 'Peer Security Reviewer',
        email: 'peer@archinex.local',
        roles: ['kb:review'],
        domains: ['security'],
        delegated: true
      }
    ],
    inbox: [
      {
        id: 'rev-001',
        candidate_id: 'cand-sec-001',
        title: 'Chiffrement Homomorphe Inter-Services',
        kind: 'new_asset',
        domain: 'security',
        reason: 'review',
        waiting_since: new Date(now.getTime() - 3600000).toISOString(),
        due_at: threeDaysLater.toISOString(),
        is_overdue: false,
        author: 'architect@archinex.local',
        severity: 'major'
      },
      {
        id: 'rev-002',
        candidate_id: 'cand-principle-002',
        title: 'Principe Fondamental d’Immuabilité des Traces Audit',
        kind: 'principle',
        domain: 'security',
        reason: 'review',
        waiting_since: new Date(now.getTime() - 7200000).toISOString(),
        due_at: threeDaysLater.toISOString(),
        is_overdue: false,
        author: 'sec-officer@archinex.local',
        severity: 'critical'
      },
      {
        id: 'rev-003',
        candidate_id: 'cand-overdue-003',
        title: 'Dérogation Temporaire Synchronisation NTP Hors-Ligne',
        kind: 'amendment',
        domain: 'cloud',
        reason: 'advice',
        waiting_since: fiveDaysAgo.toISOString(),
        due_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        is_overdue: true,
        author: 'ops@archinex.local',
        severity: 'minor'
      }
    ],
    candidateDetails: {
      'cand-sec-001': cand1Detail,
      'cand-principle-002': cand2Detail,
      'cand-overdue-003': cand3Detail
    },
    comments: {
      'cand-sec-001': [
        {
          id: 'comm-1',
          candidate_id: 'cand-sec-001',
          author_handle: '@sec-lead',
          author_name: 'Security Lead',
          message: 'Les algorithmes homomorphes autorisés sont-ils limités à la liste ANSSI ?',
          created_at: new Date(now.getTime() - 1800000).toISOString()
        }
      ]
    },
    events: [
      {
        id: 'evt-001',
        type: 'candidate.submitted',
        cursor: 'cur-001',
        candidate_id: 'cand-sec-001',
        recipients: ['@sec-lead'],
        payload: {
          title: 'Chiffrement Homomorphe Inter-Services',
          domain: 'security',
          actor: 'architect@archinex.local'
        },
        timestamp: new Date(now.getTime() - 3600000).toISOString()
      },
      {
        id: 'evt-002',
        type: 'candidate.submitted',
        cursor: 'cur-002',
        candidate_id: 'cand-principle-002',
        recipients: ['@sec-lead'],
        payload: {
          title: 'Principe Fondamental d’Immuabilité des Traces Audit',
          domain: 'security',
          actor: 'sec-officer@archinex.local'
        },
        timestamp: new Date(now.getTime() - 7200000).toISOString()
      }
    ],
    board: [],
    statements: [],
    conflicts: []
  };
}

export interface FakeLlmopsServer {
  server: http.Server;
  url: string;
  state: FakeLlmopsState;
  close: () => Promise<void>;
  reset: () => void;
}

export async function startFakeLlmopsServer(initialState?: Partial<FakeLlmopsState>): Promise<FakeLlmopsServer> {
  const state: FakeLlmopsState = {
    ...createDefaultFakeState(),
    ...initialState
  };

  let eventSeq = 10;
  const generateCursor = () => `cur-${String(++eventSeq).padStart(4, '0')}`;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // Helper for JSON responses
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Parse body for POST / PUT / PATCH
    let body: any = null;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString();
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }
    }

    // Health
    if (pathname === '/health' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.health
      });
    }

    // Doctrine context: GET /doctrine/context
    if (pathname === '/doctrine/context' && method === 'GET') {
      const topics = parsedUrl.searchParams.get('topics')?.split(',') || [];
      let filtered = state.doctrine;
      if (topics.length > 0 && topics[0] !== '') {
        filtered = state.doctrine.filter((d) =>
          topics.some((t) => d.title.toLowerCase().includes(t.toLowerCase()) || d.content.toLowerCase().includes(t.toLowerCase()))
        );
      }
      const ctx: DoctrineContext = {
        items: filtered,
        total_items: filtered.length,
        truncated: false
      };
      return json(200, {
        status: 'ok',
        data: ctx
      });
    }

    // Check option: POST /doctrine/check
    if (pathname === '/doctrine/check' && method === 'POST') {
      const { option_id, option_label, criteria } = body || {};
      const isConform = !option_label?.toLowerCase().includes('fail');
      const checkResult: CheckResult = {
        verdicts: [
          {
            rule_id: 'DOC-TEST-001',
            status: isConform ? 'supports' : 'violates',
            rationale: isConform ? 'Option meets redundancy criteria' : 'Single point of failure detected',
            severity: isConform ? undefined : 'error'
          }
        ]
      };
      return json(200, {
        status: 'ok',
        data: checkResult
      });
    }

    // Frameworks: GET /doctrine/frameworks
    if (pathname === '/doctrine/frameworks' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.frameworkCoverage
      });
    }

    // Frameworks: POST /doctrine/frameworks
    if (pathname === '/doctrine/frameworks' && method === 'POST') {
      const { frameworks } = body || {};
      if (Array.isArray(frameworks)) {
        for (const fw of state.frameworkCoverage.frameworks) {
          fw.required = frameworks.includes(fw.name);
        }
      }
      return json(200, {
        status: 'ok',
        data: {
          success: true,
          applicable: frameworks || []
        }
      });
    }

    // Candidates: POST /kb/candidates ou /api/knowledge/candidates
    if ((pathname === '/kb/candidates' || pathname === '/api/knowledge/candidates') && method === 'POST') {
      const candidate: KbCandidate = {
        id: `cand-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        kind: body?.kind || 'new_asset',
        title: body?.title || 'Proposed Asset',
        summary: body?.summary || body?.rule || '',
        suggested_change: body?.suggested_change,
        rationale: body?.rationale || 'Co-design suggestion',
        source: {
          system: 'archinex',
          engagement: body?.sourceEngagementId || body?.source?.engagement || 'test-engagement'
        },
        status: 'in_review',
        author: body?.author || 'Test Author',
        production_mode: 'llm-proposed-human-approved',
        created_at: new Date().toISOString()
      };
      state.candidates.push(candidate);
      return json(201, {
        status: 'ok',
        data: candidate
      });
    }

    // Candidates: GET /kb/candidates ou /api/knowledge/candidates
    if ((pathname === '/kb/candidates' || pathname === '/api/knowledge/candidates') && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.candidates
      });
    }

    // Inbox: GET /api/knowledge/reviews/inbox ou /kb/reviews/inbox
    if ((pathname === '/api/knowledge/reviews/inbox' || pathname === '/kb/reviews/inbox') && method === 'GET') {
      const domainFilter = parsedUrl.searchParams.get('domain');
      const kindFilter = parsedUrl.searchParams.get('kind');

      let items = state.inbox;
      if (domainFilter) {
        items = items.filter((i) => i.domain.toLowerCase() === domainFilter.toLowerCase());
      }
      if (kindFilter) {
        items = items.filter((i) => i.kind.toLowerCase() === kindFilter.toLowerCase());
      }

      const now = Date.now();
      const enriched = items.map((i) => ({
        ...i,
        is_overdue: new Date(i.due_at).getTime() < now
      }));

      return json(200, {
        status: 'ok',
        data: enriched
      });
    }

    // Candidates sub-paths: /api/knowledge/candidates/:id[/sub]
    const candSubMatch = pathname.match(
      /^\/(api\/knowledge|kb)\/candidates\/([a-zA-Z0-9_-]+)(\/(assign|request-review|comments))?$/
    );
    if (candSubMatch) {
      const candidateId = candSubMatch[2];
      const subAction = candSubMatch[4];
      const candidate =
        state.candidateDetails[candidateId] ||
        ((state.candidates.find((c) => c.id === candidateId) as unknown) as KbCandidateDetail | undefined);

      // GET /api/knowledge/candidates/:id
      if (!subAction && method === 'GET') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }
        return json(200, { status: 'ok', data: candidate });
      }

      // PATCH /api/knowledge/candidates/:id
      if (!subAction && method === 'PATCH') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }

        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        if (!actorEmail) {
          return json(401, { status: 'error', error: 'Missing X-Actor-Email header' });
        }

        const owner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
        const candidateDomain = candidate.domain || 'security';

        // 403 if domain not owned
        if (!owner || !owner.domains.some((d) => d.toLowerCase() === candidateDomain.toLowerCase())) {
          return json(403, {
            status: 'error',
            error: `Interdit: l’expert ${actorEmail} ne possède pas le domaine '${candidateDomain}' requis pour cette revue`
          });
        }

        // 409 if candidate is already in terminal state
        if (candidate.status === 'accepted' || candidate.status === 'rejected') {
          return json(409, {
            status: 'error',
            error: `Conflit: le candidat ${candidateId} est déjà dans l'état final '${candidate.status}'`
          });
        }

        const { action, reason, amended_content } = body || {};
        if (!action || !['accept', 'amend', 'reject'].includes(action)) {
          return json(400, { status: 'error', error: 'Action invalide. Doit être accept, amend ou reject' });
        }

        if (action === 'reject' && (!reason || reason.trim() === '')) {
          return json(400, { status: 'error', error: 'Le rejet exige un motif obligatoire' });
        }

        if (action === 'accept') {
          if (candidate.kind === 'principle' && !candidate.second_review_requested) {
            candidate.second_review_requested = true;
            candidate.status = 'in_review';
            candidate.history.push({
              timestamp: new Date().toISOString(),
              actor: actorEmail,
              actor_name: owner.name,
              action: 'accepted',
              details:
                'Premier avis favorable (principe). Deuxième revue collégiale requise automatiquement.'
            });

            state.inbox.push({
              id: `rev-second-${Date.now()}`,
              candidate_id: candidate.id!,
              title: candidate.title,
              kind: 'principle',
              domain: candidate.domain,
              reason: 'second_review',
              waiting_since: new Date().toISOString(),
              due_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
              is_overdue: false,
              author: candidate.author,
              severity: 'critical'
            });

            state.events.push({
              id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              type: 'review.requested',
              cursor: generateCursor(),
              candidate_id: candidate.id!,
              recipients: ['@peer-reviewer'],
              payload: {
                title: candidate.title,
                domain: candidate.domain,
                actor: actorEmail,
                action: 'second_review_requested'
              },
              timestamp: new Date().toISOString()
            });
          } else {
            candidate.status = 'accepted';
            candidate.history.push({
              timestamp: new Date().toISOString(),
              actor: actorEmail,
              actor_name: owner.name,
              action: 'accepted',
              details: reason || 'Accepté sans réserve'
            });
          }
        } else if (action === 'amend') {
          candidate.status = 'in_review';
          candidate.amended_content = amended_content || candidate.amended_content;
          candidate.history.push({
            timestamp: new Date().toISOString(),
            actor: actorEmail,
            actor_name: owner.name,
            action: 'amended',
            details: reason || 'Amendé par l’expert'
          });
        } else if (action === 'reject') {
          candidate.status = 'rejected';
          candidate.rejection_reason = reason;
          candidate.history.push({
            timestamp: new Date().toISOString(),
            actor: actorEmail,
            actor_name: owner.name,
            action: 'rejected',
            details: reason
          });
        }

        // Clean inbox
        state.inbox = state.inbox.filter((item) => {
          if (item.candidate_id !== candidateId) return true;
          if (
            candidate.kind === 'principle' &&
            candidate.second_review_requested &&
            item.reason === 'second_review'
          ) {
            return true;
          }
          return false;
        });

        // Emit candidate.reviewed
        state.events.push({
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          type: 'candidate.reviewed',
          cursor: generateCursor(),
          candidate_id: candidate.id!,
          recipients: candidate.assigned_to ? [candidate.assigned_to] : [owner.handle],
          payload: {
            title: candidate.title,
            domain: candidate.domain,
            actor: actorEmail,
            action
          },
          timestamp: new Date().toISOString()
        });

        return json(200, { status: 'ok', data: candidate });
      }

      // POST /assign
      if (subAction === 'assign' && method === 'POST') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }
        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        const { assignee, reason } = body || {};
        candidate.assigned_to = assignee;
        candidate.history.push({
          timestamp: new Date().toISOString(),
          actor: actorEmail || 'expert',
          action: 'assigned',
          details: `Assigné à ${assignee}: ${reason || ''}`
        });

        state.events.push({
          id: `evt-${Date.now()}`,
          type: 'candidate.assigned',
          cursor: generateCursor(),
          candidate_id: candidate.id!,
          recipients: [assignee],
          payload: {
            title: candidate.title,
            domain: candidate.domain,
            actor: actorEmail,
            message: reason
          },
          timestamp: new Date().toISOString()
        });

        return json(200, { status: 'ok', data: candidate });
      }

      // POST /request-review
      if (subAction === 'request-review' && method === 'POST') {
        if (!candidate) {
          return json(404, { status: 'error', error: `Candidate ${candidateId} not found` });
        }
        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        const { kind, recipient, message, due_at } = body || {};
        const due = due_at || new Date(Date.now() + 3 * 86400000).toISOString();

        state.inbox.push({
          id: `rev-${Date.now()}`,
          candidate_id: candidate.id!,
          title: candidate.title,
          kind: candidate.kind as any,
          domain: candidate.domain,
          reason: kind || 'advice',
          waiting_since: new Date().toISOString(),
          due_at: due,
          is_overdue: false,
          author: actorEmail,
          severity: 'major'
        });

        candidate.history.push({
          timestamp: new Date().toISOString(),
          actor: actorEmail || 'expert',
          action: 'review_requested',
          details: `Sollicitation ${kind} envoyée à ${recipient}: ${message || ''}`
        });

        state.events.push({
          id: `evt-${Date.now()}`,
          type: 'review.requested',
          cursor: generateCursor(),
          candidate_id: candidate.id!,
          recipients: [recipient],
          payload: {
            title: candidate.title,
            domain: candidate.domain,
            actor: actorEmail,
            message,
            due_at: due
          },
          timestamp: new Date().toISOString()
        });

        return json(200, { status: 'ok', data: { success: true } });
      }

      // Comments: GET /comments
      if (subAction === 'comments' && method === 'GET') {
        return json(200, {
          status: 'ok',
          data: {
            comments: state.comments[candidateId] || []
          }
        });
      }

      // Comments: POST /comments
      if (subAction === 'comments' && method === 'POST') {
        const actorEmail = (req.headers['x-actor-email'] as string) || '';
        const { message } = body || {};
        const owner = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
        const comment: KbComment = {
          id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          candidate_id: candidateId,
          author_handle: owner?.handle || `@${actorEmail.split('@')[0] || 'expert'}`,
          author_name: owner?.name || actorEmail || 'Expert',
          message: message || '',
          created_at: new Date().toISOString()
        };

        if (!state.comments[candidateId]) {
          state.comments[candidateId] = [];
        }
        state.comments[candidateId].push(comment);

        if (candidate) {
          candidate.history.push({
            timestamp: comment.created_at,
            actor: actorEmail,
            actor_name: comment.author_name,
            action: 'commented',
            details: message
          });
        }

        state.events.push({
          id: `evt-${Date.now()}`,
          type: 'candidate.commented',
          cursor: generateCursor(),
          candidate_id: candidateId,
          recipients: candidate?.assigned_to ? [candidate.assigned_to] : ['@sec-lead'],
          payload: {
            title: candidate?.title,
            actor: actorEmail,
            message
          },
          timestamp: new Date().toISOString()
        });

        return json(201, { status: 'ok', data: comment });
      }
    }

    // Events: GET /api/knowledge/events ou /kb/events
    if ((pathname === '/api/knowledge/events' || pathname === '/kb/events') && method === 'GET') {
      const since = parsedUrl.searchParams.get('since');
      let eventsToSend = state.events;
      if (since) {
        const idx = state.events.findIndex((e) => e.cursor === since);
        if (idx !== -1) {
          eventsToSend = state.events.slice(idx + 1);
        }
      }
      const nextCursor =
        eventsToSend.length > 0 ? eventsToSend[eventsToSend.length - 1].cursor : since || 'cur-0';

      return json(200, {
        status: 'ok',
        data: {
          events: eventsToSend,
          next_cursor: nextCursor
        }
      });
    }

    // Owners: GET /api/knowledge/owners ou /kb/owners
    if ((pathname === '/api/knowledge/owners' || pathname === '/kb/owners') && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: {
          owners: state.owners,
          total: state.owners.length
        }
      });
    }

    // Owners: PUT /api/knowledge/owners ou /kb/owners
    if ((pathname === '/api/knowledge/owners' || pathname === '/kb/owners') && method === 'PUT') {
      const { owners } = body || {};
      if (Array.isArray(owners)) {
        state.owners = owners;
      }
      return json(200, {
        status: 'ok',
        data: {
          success: true,
          updated_count: state.owners.length
        }
      });
    }

    // Me: GET /api/knowledge/me ou /kb/me
    if ((pathname === '/api/knowledge/me' || pathname === '/kb/me') && method === 'GET') {
      const actorEmail = (req.headers['x-actor-email'] as string) || '';
      if (!actorEmail) {
        return json(401, {
          status: 'error',
          error: 'Missing X-Actor-Email header'
        });
      }

      const found = state.owners.find((o) => o.email.toLowerCase() === actorEmail.toLowerCase());
      if (found) {
        return json(200, {
          status: 'ok',
          data: {
            handle: found.handle,
            email: found.email,
            name: found.name,
            kb_roles: found.roles,
            owned_domains: found.domains,
            pending_reviews: 1,
            delegated: found.delegated
          }
        });
      }

      return json(200, {
        status: 'ok',
        data: {
          handle: `@${actorEmail.split('@')[0]}`,
          email: actorEmail,
          kb_roles: [],
          owned_domains: [],
          pending_reviews: 0,
          delegated: false
        }
      });
    }

    // Board: GET /board
    if (pathname === '/board' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.board
      });
    }

    // Statements: GET /statements
    if (pathname === '/statements' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.statements
      });
    }

    // Conflicts: GET /conflicts
    if (pathname === '/conflicts' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.conflicts
      });
    }

    // Default 404
    return json(404, {
      status: 'error',
      error: `Not found: ${method} ${pathname}`
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;

  return {
    server,
    url,
    state,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    reset: () => {
      const fresh = createDefaultFakeState();
      Object.assign(state, fresh);
    }
  };
}
