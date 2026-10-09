/**
 * Configuration du client LLMOps : délais par opération, liste d'hôtes autorisés, absence d'identifiant factice
 * sur dépassement de délai. Serveur local simulé uniquement (aucun LLMOps requis).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LLMOpsClient, hostMatchesAllowList, LLMOPS_GOVERNANCE_TIMEOUT_MS } from '../../src/lib/server/llmops/client';

const URL_BASE = 'http://127.0.0.1:8000';
let server: Server | undefined;

afterEach(async () => {
  delete process.env.LLMOPS_ALLOWED_HOSTS;
  delete process.env.LLMOPS_TIMEOUT_MS;
  if (server) await new Promise((r) => server!.close(() => r(null)));
  server = undefined;
});

describe('Délais par opération', () => {
  const c = new LLMOpsClient({ baseUrl: URL_BASE });

  it('lectures moteur historiques : délai court conservé (repli hors-ligne voulu)', () => {
    expect(c.timeoutFor(`${URL_BASE}/health`)).toBe(1500);
    expect(c.timeoutFor(`${URL_BASE}/api/arbitration/board?engagement=e`)).toBe(1500);
  });

  it('gouvernance : délai suffisant pour les temps mesurés (soumission 2,4–2,9 s, simulation ~3 s, publication ~9 s)', () => {
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/candidates`, 'POST')).toBeGreaterThanOrEqual(30_000);
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/checks/simulate`, 'POST')).toBeGreaterThanOrEqual(30_000);
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/candidates/CAND-20260101-0001`, 'PATCH')).toBeGreaterThanOrEqual(30_000);
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/publications`, 'POST')).toBeGreaterThanOrEqual(300_000);
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/candidates/CAND-20260101-0001/promote`, 'POST')).toBeGreaterThanOrEqual(300_000);
    expect(c.timeoutFor(`${URL_BASE}/api/frameworks/ingestions`, 'POST')).toBeGreaterThanOrEqual(120_000);
    expect(c.timeoutFor(`${URL_BASE}/api/frameworks/ingestions/7/apply`, 'POST')).toBeGreaterThanOrEqual(300_000);
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/evals/check_option_v1/runs`, 'POST')).toBeGreaterThanOrEqual(60_000);
  });

  it('autres lectures de gouvernance (boîte, gabarits, événements…) : délai intermédiaire', () => {
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/reviews/inbox`)).toBe(LLMOPS_GOVERNANCE_TIMEOUT_MS);
    expect(c.timeoutFor(`${URL_BASE}/api/knowledge/templates/pattern`)).toBe(LLMOPS_GOVERNANCE_TIMEOUT_MS);
    expect(c.timeoutFor(`${URL_BASE}/api/frameworks/ingestions`)).toBe(LLMOPS_GOVERNANCE_TIMEOUT_MS);
  });

  it('un délai configuré (config ou LLMOPS_TIMEOUT_MS) prime sur les règles', () => {
    expect(new LLMOpsClient({ baseUrl: URL_BASE, timeoutMs: 777 }).timeoutFor(`${URL_BASE}/api/knowledge/publications`, 'POST')).toBe(777);
    process.env.LLMOPS_TIMEOUT_MS = '4321';
    expect(new LLMOpsClient({ baseUrl: URL_BASE }).timeoutFor(`${URL_BASE}/health`)).toBe(4321);
  });
});

describe('Liste d’hôtes autorisés (air-gap)', () => {
  const cloud = 'https://llmops-mcp-server-344571265365.europe-west1.run.app';

  it('par défaut, Cloud Run reste bloqué', () => {
    expect(new LLMOpsClient({ baseUrl: cloud }).isLocalNetworkUrl(`${cloud}/health`)).toBe(false);
  });

  it('un hôte nommé explicitement est autorisé, pas les autres', () => {
    const c = new LLMOpsClient({ baseUrl: cloud, allowedHosts: ['llmops-mcp-server-344571265365.europe-west1.run.app'] });
    expect(c.isLocalNetworkUrl(`${cloud}/api/knowledge/me`)).toBe(true);
    expect(c.isLocalNetworkUrl('https://autre-service-123.europe-west1.run.app/x')).toBe(false);
    expect(c.isLocalNetworkUrl('https://api.openai.com/v1')).toBe(false);
  });

  it('LLMOPS_ALLOWED_HOSTS (liste séparée par des virgules) est lue à la construction', () => {
    process.env.LLMOPS_ALLOWED_HOSTS = 'a.example.run.app, llmops-mcp-server-344571265365.europe-west1.run.app';
    const c = new LLMOpsClient({ baseUrl: cloud });
    expect(c.isLocalNetworkUrl(`${cloud}/health`)).toBe(true);
    expect(c.isLocalNetworkUrl('https://b.example.run.app/')).toBe(false);
  });

  it('motifs *.suffixe : sous-domaines seulement, jamais le domaine nu ni un suffixe voisin', () => {
    expect(hostMatchesAllowList('x.llmops.internal.example.com', ['*.llmops.internal.example.com'])).toBe(true);
    expect(hostMatchesAllowList('llmops.internal.example.com', ['*.llmops.internal.example.com'])).toBe(false);
    expect(hostMatchesAllowList('evil-llmops.internal.example.com', ['*.llmops.internal.example.com'])).toBe(false);
    expect(hostMatchesAllowList('anything', [])).toBe(false);
    expect(hostMatchesAllowList('x', ['', '  '])).toBe(false);
  });

  it('les appels de gouvernance vers un hôte non autorisé répondent « indisponible » sans sortir du réseau', async () => {
    const c = new LLMOpsClient({ baseUrl: cloud });
    const res = await c.getReviewInbox('alice@example.org');
    expect(res.status).toBe('unavailable');
  });
});

describe('Soumission lente : aucun identifiant factice', () => {
  async function slowServer(delayMs: number): Promise<string> {
    server = createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', data: { id: 'CAND-20260101-0001', status: 'in_review' } }));
      }, delayMs);
    });
    await new Promise((r) => server!.listen(0, '127.0.0.1', () => r(null)));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }
  const candidate = { kind: 'rex', title: 't', proposed_content: 'c', source: { system: 'archinex' } } as any;

  it('une réponse plus lente que l’ancien délai de 1,5 s aboutit avec le vrai identifiant', async () => {
    const base = await slowServer(1800);
    const res = await new LLMOpsClient({ baseUrl: base }).submitCandidate(candidate, 'a@example.org');
    expect(res.candidate_id).toBe('CAND-20260101-0001');
  });

  it('un dépassement de délai lève une erreur explicite, jamais CAND-LOCAL-…', async () => {
    const base = await slowServer(1500);
    await expect(new LLMOpsClient({ baseUrl: base, timeoutMs: 300 }).submitCandidate(candidate, 'a@example.org')).rejects.toThrow(
      /pas répondu à temps/
    );
  });

  it('serveur injoignable : le repli hors-ligne existant est conservé', async () => {
    const res = await new LLMOpsClient({ baseUrl: 'http://127.0.0.1:1' }).submitCandidate(candidate, 'a@example.org');
    expect(res.candidate_id).toMatch(/^CAND-LOCAL-/);
  });
});

describe('shredRfp et replis stricts (Issue #18)', () => {
  const rfpText = 'Le système doit garantir une disponibilité de 99.999% pour les services critiques.';

  it('si le vrai serveur LLMOps renvoie une 500, shredRfp lève une erreur et ne simule jamais localement', async () => {
    server = createServer((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'LLMOps internal error during shredding' }));
    });
    await new Promise((r) => server!.listen(0, '127.0.0.1', () => r(null)));
    const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;

    const client = new LLMOpsClient({ baseUrl: base });
    await expect(client.shredRfp(rfpText)).rejects.toThrow(/LLMOps internal error|Erreur HTTP 500/);
  });

  it('si le serveur est injoignable, shredRfp lève une erreur explicite', async () => {
    delete process.env.ALLOW_OFFLINE_MOCK;
    delete process.env.USE_FAKE_LLMOPS;
    const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 200 });
    await expect(client.shredRfp(rfpText)).rejects.toThrow(/Serveur LLMOps inaccessible/);
  });

  it('même avec ALLOW_OFFLINE_MOCK=1, shredRfp ne simule jamais localement', async () => {
    process.env.ALLOW_OFFLINE_MOCK = '1';
    try {
      const client = new LLMOpsClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 200 });
      await expect(client.shredRfp(rfpText, 'cctp-offline', '1.0')).rejects.toThrow(/Serveur LLMOps inaccessible/);
    } finally {
      delete process.env.ALLOW_OFFLINE_MOCK;
    }
  });
});

