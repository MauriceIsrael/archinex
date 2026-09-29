import { describe, it, expect } from 'vitest';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { deliberationStore } from '$lib/stores/deliberationStore.svelte';

describe('LLMOps Client Adapter & Dual-Mode Contract', () => {
  const client = new LLMOpsClient();

  it('1. getHealth retourne un schéma valide conforme au CONTRAT-KH-API-V1', async () => {
    const res = await client.getHealth();
    expect(res.data.status).toBe('ok');
    expect(res.data.service).toBe('llmops-mcp-server');
    expect(res.data.schema_version).toBe('1.0');
    expect(res.data.kb?.payload_sha256).toMatch(/^sha256:/);
    expect(['live', 'offline-fallback']).toContain(res.source);
  });

  it('2. getLatestSnapshot retourne un instantané scellé avec SHA-256', async () => {
    const res = await client.getLatestSnapshot();
    expect(res.data.snapshot_id).toBeTruthy();
    expect(res.data.payload_sha256).toMatch(/^sha256:/);
    expect(res.data.schema_version).toBe('1.0');
  });

  it('3. getBoard retourne les sujets réels de nordwave-mcx-2027', async () => {
    const res = await client.getBoard('nordwave-mcx-2027');
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(5);

    const subjects = res.data.map((s) => s.subject);
    expect(subjects).toContain('mcx-services');
    expect(subjects).toContain('floor-control');
    expect(subjects).toContain('mobile-core');
  });

  it('4. getStatements retourne les énoncés épistémiques avec triplet (sujet, prédicat, valeur)', async () => {
    const res = await client.getStatements('nordwave-mcx-2027');
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(5);

    const first = res.data[0];
    expect(first.id).toMatch(/^S-\d+/);
    expect(first.subject).toBeTruthy();
    expect(first.predicate).toBeTruthy();
    expect(first.value).toBeTruthy();
    expect(first.author).toBeTruthy();
    expect(first.confidence).toBeTruthy();
  });

  it('5. getConflicts retourne la contradiction détectée sur media-distribution', async () => {
    const res = await client.getConflicts('nordwave-mcx-2027');
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(1);

    const c2 = res.data.find((c) => c.id === 'C-0002');
    expect(c2).toBeDefined();
    expect(c2?.detail).toContain('media-distribution');
    expect(c2?.status).toBe('open');
  });

  it('6. shredRfp découpe un CCTP en clauses candidates typées', async () => {
    const cctpSample = "Le système MCX doit garantir une disponibilité de 99.999%. L'architecture doit être compatible 3GPP Rel 17.";
    const res = await client.shredRfp(cctpSample, 'cctp-test-01', '1.0', 'nordwave-mcx-2027');
    expect(res.status).toBe('ok');
    expect(res.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.candidates[0].sourceFragment.documentId).toBe('cctp-test-01');
    expect(res.candidates[0].originalText).toBeTruthy();
  });

  it('7. Mode Hors-Ligne (Offline-First) : bascule transparente sur le bundle scellé local si le serveur est injoignable', async () => {
    // Client pointant vers une URL volontairement inaccessible
    const offlineClient = new LLMOpsClient({
      baseUrl: 'http://127.0.0.1:59999/unreachable',
      timeoutMs: 100
    });

    const health = await offlineClient.getHealth();
    expect(health.source).toBe('offline-fallback');
    expect(health.data.status).toBe('ok');

    const board = await offlineClient.getBoard('nordwave-mcx-2027');
    expect(board.source).toBe('offline-fallback');
    expect(board.data.length).toBeGreaterThanOrEqual(1);

    const statements = await offlineClient.getStatements('nordwave-mcx-2027');
    expect(statements.source).toBe('offline-fallback');
    expect(statements.data.length).toBeGreaterThanOrEqual(1);
  });

  it('8. deliberationStore.syncWithLLMOps intègre les données et alimente les sujets et brouillons réactivement', async () => {
    // Mock du fetch pour le test unitaire du store
    const mockFetch = async () => {
      const syncPayload = await client.syncEngagement('nordwave-mcx-2027');
      return {
        ok: true,
        status: 200,
        json: async () => syncPayload
      } as Response;
    };

    const result = await deliberationStore.syncWithLLMOps('nordwave-mcx-2027', mockFetch as unknown as typeof fetch);
    expect(result.success).toBe(true);
    expect(['connected', 'offline']).toContain(deliberationStore.llmopsStatus);
    expect(deliberationStore.activeEngagementId).toBe('nordwave-mcx-2027');
    expect(deliberationStore.lastSyncTime).toBeTruthy();

    // Vérifier que les sujets ont été hydratés
    const subjectIds = deliberationStore.subjects.map((s) => s.id);
    expect(subjectIds).toContain('mcx-services');
    expect(subjectIds).toContain('floor-control');

    // Vérifier qu'un brouillon a été initialisé pour mcx-services
    const mcxDraft = deliberationStore.drafts['mcx-services'];
    expect(mcxDraft).toBeDefined();
    expect(mcxDraft.retenu.length).toBeGreaterThanOrEqual(1);
  });
});
