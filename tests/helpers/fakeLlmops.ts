import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  LLMOpsHealth,
  DoctrineContext,
  DoctrineItem,
  CheckResult,
  FrameworkCoverage,
  KbCandidate,
  LLMOpsBoardItem,
  LLMOpsStatement,
  LLMOpsConflict
} from '../../src/lib/types/llmops';

export interface FakeLlmopsState {
  health: LLMOpsHealth;
  doctrine: DoctrineItem[];
  frameworkCoverage: FrameworkCoverage;
  candidates: KbCandidate[];
  board: LLMOpsBoardItem[];
  statements: LLMOpsStatement[];
  conflicts: LLMOpsConflict[];
}

export function createDefaultFakeState(): FakeLlmopsState {
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
    candidates: [],
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

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // Helper for JSON responses
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Parse body for POST / PUT
    let body: any = null;
    if (method === 'POST' || method === 'PUT') {
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

    // Candidates: POST /kb/candidates
    if (pathname === '/kb/candidates' && method === 'POST') {
      const candidate: KbCandidate = {
        id: `cand-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        kind: body?.kind || 'new_asset',
        title: body?.title || 'Proposed Asset',
        summary: body?.summary || body?.rule || '',
        suggested_change: body?.suggested_change,
        rationale: body?.rationale || 'Co-design suggestion',
        source: {
          system: 'archinex',
          engagement: body?.sourceEngagementId || 'test-engagement'
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

    // Candidates: GET /kb/candidates
    if (pathname === '/kb/candidates' && method === 'GET') {
      return json(200, {
        status: 'ok',
        data: state.candidates
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
