import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOpsClient, llmopsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';
import { deliberationStore } from '../../src/lib/stores/deliberationStore.svelte';
import { GET as inboxGet } from '../../src/routes/api/knowledge/reviews/inbox/+server';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

describe('Contract: Distinction 403 non-enregistré / 401 / 503 & maintien pastille connectée (Issue #145)', () => {
  let fakeLlmops: FakeLlmopsServer;
  let client: LLMOpsClient;
  let originalBaseUrl: string | undefined;

  const registeredEmail = 'maint@example.org';
  const unregisteredEmail = 'admin@archinex.local';

  beforeAll(async () => {
    fakeLlmops = await startFakeLlmopsServer({
      rejectUnregisteredExperts: true,
      owners: [
        {
          handle: '@maintainers',
          name: 'Knowledge Maintainer',
          email: registeredEmail,
          roles: ['kb:maintain', 'kb:review'],
          domains: ['security', 'cloud'],
          delegated: true
        }
      ]
    });

    originalBaseUrl = (llmopsClient as any).baseUrl;
    (llmopsClient as any).baseUrl = fakeLlmops.url;

    client = new LLMOpsClient({
      baseUrl: fakeLlmops.url,
      authToken: 'test-token',
      timeoutMs: 3000
    });
  });

  afterAll(async () => {
    if (originalBaseUrl) {
      (llmopsClient as any).baseUrl = originalBaseUrl;
    }
    await fakeLlmops.close();
  });

  it('1. Un expert enregistré accède à sa boîte de revue et son profil /me avec statut ok', async () => {
    const meRes = await client.getMe(registeredEmail);
    expect(meRes.status).toBe('ok');
    expect(meRes.data?.email).toBe(registeredEmail);
    expect(meRes.data?.handle).toBe('@maintainers');
    expect(meRes.data?.offline).toBeFalsy();

    const inboxRes = await client.getReviewInbox(registeredEmail);
    expect(inboxRes.status).toBe('ok');
    expect(Array.isArray(inboxRes.data)).toBe(true);
  });

  it('2. Un expert non enregistré au Hub reçoit status not_registered et le message d’orientation dédié sur /me', async () => {
    const meRes = await client.getMe(unregisteredEmail);
    expect(meRes.status).toBe('not_registered');
    expect(meRes.data).toBeUndefined();
    expect(meRes.error).toBe(
      "Votre adresse n'est pas inscrite dans le registre des experts du Hub : demandez à un administrateur (Administration → Inscrire dans le registre LLMOps)"
    );
  });

  it('3. Un expert non enregistré au Hub reçoit status not_registered et le message d’orientation dédié sur la boîte de revue', async () => {
    const inboxRes = await client.getReviewInbox(unregisteredEmail);
    expect(inboxRes.status).toBe('not_registered');
    expect(inboxRes.data).toBeUndefined();
    expect(inboxRes.error).toBe(
      "Votre adresse n'est pas inscrite dans le registre des experts du Hub : demandez à un administrateur (Administration → Inscrire dans le registre LLMOps)"
    );
  });

  it('4. Distingue 401 (jeton invalide), 503 (service indisponible) et 403 (non enregistré)', async () => {
    const customServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname.includes('/401')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unauthorized', error: 'Invalid service token' }));
      } else if (url.pathname.includes('/503')) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unavailable', error: 'Database down' }));
      } else if (url.pathname.includes('/403-other')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'forbidden', error: 'Access forbidden for other reasons' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', data: [] }));
      }
    });

    await new Promise<void>((resolve) => customServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (customServer.address() as AddressInfo).port;
    const testClient = new LLMOpsClient({
      baseUrl: `http://127.0.0.1:${port}/401`,
      authToken: 'token'
    });

    const res401 = await testClient.getReviewInbox('any@example.org');
    expect(res401.status).toBe('unauthorized');

    const testClient503 = new LLMOpsClient({
      baseUrl: `http://127.0.0.1:${port}/503`,
      authToken: 'token'
    });
    const res503 = await testClient503.getReviewInbox('any@example.org');
    expect(res503.status).toBe('unavailable');

    const testClient403Other = new LLMOpsClient({
      baseUrl: `http://127.0.0.1:${port}/403-other`,
      authToken: 'token'
    });
    const res403Other = await testClient403Other.getReviewInbox('any@example.org');
    expect(res403Other.status).toBe('error');

    await new Promise<void>((resolve) => customServer.close(() => resolve()));
  });

  it('5. La pastille d’en-tête ne passe pas à « Local » sur une réponse 403 du Hub', async () => {
    // Le Hub est joignable (health = live), mais l'utilisateur n'est pas autorisé
    const mockFetcher = async () =>
      new Response(JSON.stringify({ status: 'unauthorized', reason: 'not a registered expert' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });

    const result = await deliberationStore.syncWithLLMOps('default-project', mockFetcher as any);
    expect(result.success).toBe(true);
    // Le statut dans le store reste 'connected' (et non 'offline' ou 'error')
    expect(deliberationStore.llmopsStatus).toBe('connected');
  });

  it('6. syncEngagement conserve source: live quand le health est live même si un sous-endpoint répond 403', async () => {
    const payload = await client.syncEngagement('test-engagement');
    expect(payload.source).toBe('live');
    expect(payload.health.status).toBe('ok');
  });

  it('7. Route GET /api/knowledge/reviews/inbox renvoie 403 status not_registered pour un expert non enregistré', async () => {
    const mockEvent = {
      locals: {
        session: {
          user: {
            id: 'u-unregistered',
            email: unregisteredEmail,
            name: 'Admin',
            role: 'admin'
          }
        }
      },
      url: new URL('http://localhost/api/knowledge/reviews/inbox')
    };

    const res = await inboxGet(mockEvent as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe('not_registered');
    expect(body.error).toContain("Votre adresse n'est pas inscrite dans le registre des experts du Hub");
  });
});
