import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import {
  ensureArchinexUserRegisteredInLlmops,
  createCentralizedAccount
} from '$lib/server/accountsAdmin';
import type { KbOwnersRegistry } from '$lib/types/llmops';

class MockLlmopsSSoTClient extends LLMOpsClient {
  public putCalls: any[] = [];
  public getMeCalls: string[] = [];

  public registryState: KbOwnersRegistry = {
    owners: [
      {
        handle: '@maintainers',
        name: 'Maintainers',
        email: 'maintainers@example.org',
        roles: ['kb:maintain', 'kb:admin'],
        domains: ['architecture'],
        delegated: true
      }
    ],
    domains: {
      architecture: '@maintainers'
    },
    default_owner: '@maintainers',
    total: 1
  };

  override async getOwners(): Promise<KbOwnersRegistry> {
    return structuredClone(this.registryState);
  }

  override async getMe(actorEmail?: string) {
    if (!actorEmail) {
      return { status: 'unauthorized' as const, error: 'Unauthorized' };
    }
    this.getMeCalls.push(actorEmail);
    const owner = this.registryState.owners.find(
      (o) => o.email?.toLowerCase() === actorEmail.toLowerCase()
    );
    if (!owner) {
      return {
        status: 'not_registered' as const,
        error: 'Compte non synchronisé avec le registre souverain LLMOps.',
        reason: 'not a registered expert'
      };
    }
    const ownedDomains = Object.entries(this.registryState.domains || {})
      .filter(([_, h]) => h.toLowerCase() === owner.handle.toLowerCase())
      .map(([d]) => d);

    return {
      status: 'ok' as const,
      data: {
        handle: owner.handle,
        email: owner.email!,
        name: owner.name,
        kb_roles: owner.roles,
        owned_domains: ownedDomains,
        pending_reviews: 0
      }
    };
  }

  protected override async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    if (url.endsWith('/api/knowledge/owners') && options.method === 'PUT') {
      const payload = JSON.parse(options.body as string);
      this.putCalls.push(payload);

      this.registryState = {
        owners: payload.owners,
        domains: payload.domains,
        default_owner: payload.default_owner,
        total: payload.owners.length
      };

      return new Response(
        JSON.stringify({
          status: 'ok',
          owners_count: payload.owners.length,
          domains_count: Object.keys(payload.domains).length
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  }
}

describe('SSoT Unified Account Management & JIT Auto-Enrollment (Contrat Archinex/LLMOps)', () => {
  const testEmail = 'expert.ssot.test@archinex.local';
  let createdUserId: string | null = null;
  const mockClient = new MockLlmopsSSoTClient({ baseUrl: 'http://mock-llmops:8000' });

  beforeAll(async () => {
    // Nettoyage préalable
    const existing = await prisma.user.findUnique({ where: { email: testEmail } });
    if (existing) {
      await prisma.kbProfile.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
  });

  afterAll(async () => {
    if (createdUserId) {
      await prisma.kbProfile.deleteMany({ where: { userId: createdUserId } });
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
  });

  it('crée un compte avec compétences et l’inscrit automatiquement dans LLMOps sans saisie manuelle de synchronisation', async () => {
    const res = await createCentralizedAccount(
      {
        name: 'Expert Télécom 3GPP',
        email: testEmail,
        initialPassword: 'Password123!',
        enableKbReview: true,
        kbRoles: ['kb:review', 'kb:maintain'],
        ownedDomains: ['telecom-core', 'isolated-operation']
      },
      'admin@archinex.local',
      mockClient
    );

    createdUserId = res.userId;
    expect(res.userId).toBeDefined();
    expect(res.llmopsSync?.attempted).toBe(true);
    expect(res.llmopsSync?.success).toBe(true);
    expect(res.llmopsSync?.handle).toBe('@expert-ssot-test');

    // Vérifier que le registre LLMOps mock a bien été mis à jour
    const ownerInRegistry = mockClient.registryState.owners.find((o) => o.email === testEmail);
    expect(ownerInRegistry).toBeDefined();
    expect(ownerInRegistry?.handle).toBe('@expert-ssot-test');
    expect(mockClient.registryState.domains?.['telecom-core']).toBe('@expert-ssot-test');
    expect(mockClient.registryState.domains?.['isolated-operation']).toBe('@expert-ssot-test');
  });

  it('exécute un enrôlement Just-In-Time (JIT) transparent pour un utilisateur existant non synchronisé', async () => {
    // Simuler un compte présent dans Archinex mais retiré / absent du registre LLMOps
    mockClient.registryState.owners = mockClient.registryState.owners.filter(
      (o) => o.email !== testEmail
    );
    if (mockClient.registryState.domains) {
      delete mockClient.registryState.domains['telecom-core'];
      delete mockClient.registryState.domains['isolated-operation'];
    }

    // getMe retourne initialement not_registered
    const firstCheck = await mockClient.getMe(testEmail);
    expect(firstCheck.status).toBe('not_registered');

    // Appel de la fonction de réconciliation SSoT JIT
    const jitResult = await ensureArchinexUserRegisteredInLlmops(testEmail, mockClient);
    expect(jitResult.success).toBe(true);
    expect(jitResult.handle).toBe('@expert-ssot-test');

    // Après l'enrôlement JIT, getMe retourne immédiatement 'ok'
    const secondCheck = await mockClient.getMe(testEmail);
    expect(secondCheck.status).toBe('ok');
    expect(secondCheck.data?.handle).toBe('@expert-ssot-test');
    expect(secondCheck.data?.owned_domains).toEqual(
      expect.arrayContaining(['telecom-core', 'isolated-operation'])
    );
  });

  it('gère l’enrôlement JIT même si l’utilisateur Archinex n’avait pas encore de kbProfile local', async () => {
    const rawUserEmail = 'user.without.kb@archinex.local';
    const rawUser = await prisma.user.create({
      data: {
        name: 'User Sans KB',
        email: rawUserEmail,
        passwordHash: 'dummy',
        role: 'user'
      }
    });

    try {
      const jitResult = await ensureArchinexUserRegisteredInLlmops(rawUserEmail, mockClient);
      expect(jitResult.success).toBe(true);
      expect(jitResult.handle).toBe('@user-without-kb');

      // Un KbProfile local a été créé automatiquement
      const profile = await prisma.kbProfile.findUnique({
        where: { userId: rawUser.id }
      });
      expect(profile).toBeDefined();
      expect(profile?.kbHandle).toBe('@user-without-kb');
      expect(profile?.delegated).toBe(true);

      const checkMe = await mockClient.getMe(rawUserEmail);
      expect(checkMe.status).toBe('ok');
      expect(checkMe.data?.handle).toBe('@user-without-kb');
    } finally {
      await prisma.kbProfile.deleteMany({ where: { userId: rawUser.id } });
      await prisma.user.delete({ where: { id: rawUser.id } }).catch(() => {});
    }
  });
});
