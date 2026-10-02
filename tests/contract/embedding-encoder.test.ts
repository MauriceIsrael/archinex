import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveEncoder, ollamaEncoder, EncoderUnavailableError } from '../../src/lib/server/similarity/encoder';
import { syncEmbeddingsWithLLMOps, encodeToyBow } from '../../src/lib/server/similarity/embeddings';

/** Faux serveur Ollama déterministe : un seul modèle installé, « bge-m3 », empreinte fixe. */
let server: http.Server;
let url = '';
const DIGEST = 'sha256:abc123def456';
const vectorOf = (text: string) => [text.length, text.split(' ').length, 1, 0.5];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'bge-m3:latest', model: 'bge-m3:latest', digest: DIGEST }] }));
      if (req.url === '/api/embed') {
        const { model, input } = JSON.parse(raw);
        if (model !== 'bge-m3') { res.statusCode = 404; return res.end('{}'); }
        return res.end(JSON.stringify({ embeddings: [vectorOf(input)] }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => openai.close(() => r()));
});

/** Serveur compatible OpenAI seul (pas d'API native) : /v1/models et /v1/embeddings. */
let openai: http.Server;
let openaiUrl = '';
beforeAll(async () => {
  openai = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'bge-m3', created: 1730000000, owned_by: 'library' }] }));
      if (req.url === '/v1/embeddings') {
        const { model, input } = JSON.parse(raw);
        if (model !== 'bge-m3') { res.statusCode = 404; return res.end('{}'); }
        return res.end(JSON.stringify({ data: [{ embedding: vectorOf(input) }] }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => openai.listen(0, '127.0.0.1', r));
  openaiUrl = `http://127.0.0.1:${(openai.address() as AddressInfo).port}`;
});

describe('Encodeur d’embeddings : un modèle = un espace de vecteurs', () => {
  it('l’encodeur jouet est le défaut de test, refusé en production sans autorisation explicite', () => {
    expect(resolveEncoder(undefined, {} as any).model).toBe('toy-bow');
    expect(() => resolveEncoder('toy-bow', { NODE_ENV: 'production' } as any)).toThrow(EncoderUnavailableError);
    expect(resolveEncoder('toy-bow', { NODE_ENV: 'production', ALLOW_TOY_EMBEDDINGS: '1' } as any).model).toBe('toy-bow');
  });

  it('un modèle non configuré est refusé, jamais remplacé en silence', () => {
    expect(() => resolveEncoder('bge-m3', {} as any)).toThrow(/EMBEDDING_OLLAMA_URL/);
  });

  it('Ollama : la version est l’empreinte des poids et le vecteur vient du serveur', async () => {
    const enc = resolveEncoder('bge-m3', { EMBEDDING_OLLAMA_URL: url } as any);
    expect(enc.model).toBe('bge-m3');
    expect(await enc.version()).toBe(DIGEST);
    expect(await enc.encode('bonjour le monde')).toEqual(vectorOf('bonjour le monde'));
  });

  it('API compatible OpenAI (/v1/models, /v1/embeddings) : détectée automatiquement, URL avec ou sans /v1', async () => {
    for (const base of [openaiUrl, `${openaiUrl}/v1`]) {
      const enc = ollamaEncoder({ baseUrl: base, model: 'bge-m3' });
      expect(await enc.version()).toBe('openai-compat:1730000000');
      expect(await enc.encode('bonjour le monde')).toEqual(vectorOf('bonjour le monde'));
    }
    await expect(ollamaEncoder({ baseUrl: openaiUrl, model: 'absent' }).version()).rejects.toThrow(/n'est pas servi/);
  });

  it('un modèle non installé ou un serveur injoignable lève une erreur explicite', async () => {
    await expect(ollamaEncoder({ baseUrl: url, model: 'absent' }).version()).rejects.toThrow(/n'est pas installé/);
    await expect(ollamaEncoder({ baseUrl: url, model: 'absent' }).encode('x')).rejects.toThrow(EncoderUnavailableError);
    await expect(ollamaEncoder({ baseUrl: 'http://127.0.0.1:1', model: 'bge-m3', timeoutMs: 500 }).encode('x')).rejects.toThrow(/injoignable/);
  });

  it('la synchronisation dépose les vecteurs du modèle demandé sous SON nom et SA version', async () => {
    const deposits: any[] = [];
    const client = {
      getEmbeddingsPending: async () => ({ status: 'ok', pending: [{ ref: 'P-002', text: 'Approbation humaine préalable', text_sha256: 'x' }] as any }),
      depositEmbeddings: async (d: any) => { deposits.push(d); return { status: 'ok', count: d.items.length }; }
    };
    const res = await syncEmbeddingsWithLLMOps(client as any, { model: 'bge-m3', encoder: ollamaEncoder({ baseUrl: url, model: 'bge-m3' }) });
    expect(res).toMatchObject({ status: 'ok', count: 1 });
    expect(deposits[0].model).toBe('bge-m3');
    expect(deposits[0].model_version).toBe(DIGEST);
    expect(deposits[0].items[0].vector).toEqual(vectorOf('Approbation humaine préalable'));
    expect(deposits[0].items[0].vector).not.toEqual(encodeToyBow('Approbation humaine préalable')); // pas le jouet sous un autre nom
  });

  it('un modèle indisponible n’envoie rien à LLMOps', async () => {
    let called = false;
    const client = {
      getEmbeddingsPending: async () => ({ status: 'ok', pending: [{ ref: 'P-002', text: 'texte', text_sha256: 'x' }] as any }),
      depositEmbeddings: async () => { called = true; return { status: 'ok', count: 1 }; }
    };
    const res = await syncEmbeddingsWithLLMOps(client as any, { model: 'bge-m3', encoder: ollamaEncoder({ baseUrl: 'http://127.0.0.1:1', model: 'bge-m3', timeoutMs: 500 }) });
    expect(res.status).toBe('unavailable');
    expect(called).toBe(false);
  });
});
