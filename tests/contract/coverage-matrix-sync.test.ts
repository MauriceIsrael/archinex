import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import {
  createCentralizedAccount,
  updateCentralizedAccount,
  loadCentralizedAccountsView
} from '$lib/server/accountsAdmin';
import type { KbOwnersRegistry } from '$lib/types/llmops';

class MockLlmopsCoverageClient extends LLMOpsClient {
  public putPayloads: any[] = [];
  public requestedHeaders: HeadersInit[] = [];
  public simulateInitial403 = false;

  public registryState: KbOwnersRegistry = {
    owners: [
      {
        handle: '@maintainers',
        name: 'Maintainers',
        email: 'maintainers@example.org',
        roles: ['kb:maintain', 'kb:admin'],
        domains: ['architecture'],
        delegated: true
      },
      {
        handle: '@isolated-conformance-wg',
        name: 'Isolated Conformance WG',
        email: null as any,
        roles: ['kb:review'],
        domains: ['isolated-conformance', 'isolated-interop'],
        delegated: false
      },
      {
        handle: '@isolated-security-wg',
        name: 'Isolated Security WG',
        email: null as any,
        roles: ['kb:review'],
        domains: ['isolated-5g-sec', 'isolated-telco-core'],
        delegated: false
      }
    ],
    domains: {
      architecture: '@maintainers',
      'isolated-conformance': '@isolated-conformance-wg',
      'isolated-interop': '@isolated-conformance-wg',
      'isolated-5g-sec': '@isolated-security-wg',
      'isolated-telco-core': '@isolated-security-wg'
    },
    default_owner: '@maintainers',
    total: 3
  };

  override async getOwners(): Promise<KbOwnersRegistry> {
    return structuredClone(this.registryState);
  }

  protected override async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    if (url.endsWith('/api/knowledge/owners') && options.method === 'PUT') {
      const headers = (options.headers || {}) as Record<string, string>;
      this.requestedHeaders.push(headers);

      // Si simulation 403 activée et que l'en-tête X-Actor-Email n'est pas le kb:admin (maintainers@example.org)
      if (this.simulateInitial403 && headers['X-Actor-Email'] !== 'maintainers@example.org') {
        return new Response(
          JSON.stringify({
            status: 'unauthorized',
            reason: "the 'kb:admin' role or token scope is required."
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const body = JSON.parse(String(options.body || '{}'));
      this.putPayloads.push(body);

      // Mettre à jour l'état simulé en mémoire pour refléter la sauvegarde
      if (body.owners) this.registryState.owners = body.owners;
      if (body.domains) this.registryState.domains = body.domains;
      if (body.default_owner) this.registryState.default_owner = body.default_owner;
      this.registryState.total = this.registryState.owners.length;

      return new Response(
        JSON.stringify({
          status: 'ok',
          count: this.registryState.total,
          data: {
            owners: this.registryState.owners.length,
            domains: Object.keys(this.registryState.domains || {}).length,
            default_owner: this.registryState.default_owner
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return super.fetchWithTimeout(url, options);
  }
}

describe('LLMOps Coverage Matrix Synchronization & Dynamic Update', () => {
  const testEmail = 'expert.telecom.matrix@archinex.test';
  let createdUserId: string | null = null;

  beforeAll(async () => {
    // Nettoyer si existant
    const existing = await prisma.user.findUnique({ where: { email: testEmail } });
    if (existing) {
      await prisma.kbProfile.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
  });

  afterAll(async () => {
    if (createdUserId) {
      await prisma.kbProfile.deleteMany({ where: { userId: createdUserId } });
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
  });

  it('1. Initialement, les domaines isolés sont orphelins (unlinkedOwners) et sans compte associé', async () => {
    const mockClient = new MockLlmopsCoverageClient();
    const view = await loadCentralizedAccountsView('admin@archinex.local', mockClient);

    const conformanceItem = view.domainsOverview.find((d) => d.domain === 'isolated-conformance');
    expect(conformanceItem).toBeDefined();
    expect(conformanceItem?.hasAccount).toBe(false);
    expect(conformanceItem?.ownerHandle).toBe('@isolated-conformance-wg');

    const unlinkedHandles = view.unlinkedOwners.map((uo) => uo.handle);
    expect(unlinkedHandles).toContain('@isolated-conformance-wg');
    expect(unlinkedHandles).toContain('@isolated-security-wg');
  });

  it('2. Créer un compte avec le domaine isolated-conformance met à jour la matrice de couverture et LLMOps', async () => {
    const mockClient = new MockLlmopsCoverageClient();

    const result = await createCentralizedAccount(
      {
        name: 'Expert Conformance 3GPP',
        email: testEmail,
        role: 'user',
        initialPassword: 'password123',
        enableKbReview: true,
        kbHandle: '@expert-isolated-telecom',
        kbRoles: ['kb:review'],
        ownedDomains: ['isolated-conformance'],
        registerInLlmops: true
      },
      'admin@archinex.local',
      mockClient
    );

    createdUserId = result.userId;
    expect(result.llmopsSync?.success).toBe(true);
    expect(mockClient.putPayloads.length).toBeGreaterThan(0);

    const latestPut = mockClient.putPayloads[mockClient.putPayloads.length - 1];
    expect(latestPut.domains['isolated-conformance']).toBe('@expert-isolated-telecom');

    // Vérifier la vue après création
    const updatedView = await loadCentralizedAccountsView('admin@archinex.local', mockClient);
    const updatedConformance = updatedView.domainsOverview.find((d) => d.domain === 'isolated-conformance');
    expect(updatedConformance?.hasAccount).toBe(true);
    expect(updatedConformance?.ownerHandle).toBe('@expert-isolated-telecom');
    expect(updatedConformance?.ownerEmail).toBe(testEmail);

    // @isolated-conformance-wg a encore 'isolated-interop'
    const conformanceWg = updatedView.unlinkedOwners.find((uo) => uo.handle === '@isolated-conformance-wg');
    expect(conformanceWg?.domains).toEqual(['isolated-interop']);
  });

  it('3. updateCentralizedAccount synchronise automatiquement les nouveaux domaines vers LLMOps', async () => {
    const mockClient = new MockLlmopsCoverageClient();
    expect(createdUserId).toBeTruthy();

    // L'utilisateur prend maintenant aussi isolated-interop et isolated-5g-sec
    const updateRes = await updateCentralizedAccount(
      createdUserId!,
      {
        ownedDomains: ['isolated-conformance', 'isolated-interop', 'isolated-5g-sec'],
        kbRoles: ['kb:review', 'kb:maintain'],
        registerInLlmops: true
      },
      'admin@archinex.local',
      mockClient
    );

    expect(updateRes.llmopsSync?.success).toBe(true);

    const updatedView = await loadCentralizedAccountsView('admin@archinex.local', mockClient);

    // 'isolated-interop' et 'isolated-5g-sec' sont maintenant couverts par le compte
    const interopItem = updatedView.domainsOverview.find((d) => d.domain === 'isolated-interop');
    expect(interopItem?.hasAccount).toBe(true);
    expect(interopItem?.ownerHandle).toBe('@expert-isolated-telecom');

    const sec5gItem = updatedView.domainsOverview.find((d) => d.domain === 'isolated-5g-sec');
    expect(sec5gItem?.hasAccount).toBe(true);
    expect(sec5gItem?.ownerHandle).toBe('@expert-isolated-telecom');

    // @isolated-conformance-wg n'a plus AUCUN domaine : il ne figure plus dans les alertes d'orphelins
    const unlinkedHandles = updatedView.unlinkedOwners.map((uo) => uo.handle);
    expect(unlinkedHandles).not.toContain('@isolated-conformance-wg');

    // @isolated-security-wg ne contient plus que isolated-telco-core
    const secWg = updatedView.unlinkedOwners.find((uo) => uo.handle === '@isolated-security-wg');
    expect(secWg?.domains).toEqual(['isolated-telco-core']);
  });

  it('4. Rebondit avec le compte kb:admin en fallback lors d’un refus 403 sans bloquer l’enregistrement', async () => {
    const mockClient = new MockLlmopsCoverageClient();
    mockClient.simulateInitial403 = true; // Déclenche un 403 si l'acteur n'est pas @maintainers

    const updateRes = await updateCentralizedAccount(
      createdUserId!,
      {
        ownedDomains: [
          'isolated-conformance',
          'isolated-interop',
          'isolated-5g-sec',
          'isolated-telco-core'
        ],
        registerInLlmops: true
      },
      'admin@archinex.local', // Acteur local qui n'a pas kb:admin dans LLMOps
      mockClient
    );

    expect(updateRes.llmopsSync?.success).toBe(true);

    // Vérifier que le fallback X-Actor-Email a bien été utilisé lors du second appel
    const hasAdminFallbackHeader = mockClient.requestedHeaders.some(
      (h: any) => h['X-Actor-Email'] === 'maintainers@example.org'
    );
    expect(hasAdminFallbackHeader).toBe(true);

    const updatedView = await loadCentralizedAccountsView('admin@archinex.local', mockClient);
    const unlinkedHandles = updatedView.unlinkedOwners.map((uo) => uo.handle);
    // Tous les domaines 3GPP isolés étant couverts, aucun groupe orphelin ne subsiste
    expect(unlinkedHandles).not.toContain('@isolated-security-wg');
    expect(unlinkedHandles).not.toContain('@isolated-conformance-wg');
  });
});
