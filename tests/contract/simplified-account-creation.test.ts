import { describe, it, expect, afterAll } from 'vitest';
import { render } from 'svelte/server';
import DomainsPicker from '$lib/components/admin/DomainsPicker.svelte';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import { createCentralizedAccount } from '$lib/server/accountsAdmin';
import type { KbOwnersRegistry } from '$lib/types/llmops';

class MockLlmopsRegistryClient extends LLMOpsClient {
  public putPayloads: any[] = [];

  public registryState: KbOwnersRegistry = {
    owners: [
      {
        handle: '@maintainers',
        name: 'Maintainers',
        email: 'maintainers@example.org',
        roles: ['kb:review', 'kb:maintain', 'kb:admin'],
        domains: ['architecture'],
        delegated: true
      }
    ],
    domains: {
      architecture: '@maintainers',
      conformance: '@3gpp-conformance-wg',
      'telecom-core': '@3gpp-security-wg',
      '5g-security': '@3gpp-security-wg',
      'network-exposure': '@3gpp-core-wg',
      sba: '@3gpp-security-wg',
      'mission-critical-security': '@3gpp-security-wg'
    },
    default_owner: '@maintainers',
    total: 1
  };

  override async getOwners(): Promise<KbOwnersRegistry> {
    return structuredClone(this.registryState);
  }

  protected override async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    if (url.endsWith('/api/knowledge/owners') && options.method === 'PUT') {
      const body = JSON.parse(String(options.body || '{}'));
      this.putPayloads.push(body);
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            handle: body.handle,
            email: body.email,
            owners_count: 2,
            domains_count: 7
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return super.fetchWithTimeout(url, options);
  }
}

describe('Simplified Account Creation & Multi-Domain Picker (3GPP Expert Spec)', () => {
  const testEmail = 'expert.3gpp@test-telecom.org';

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    if (user) {
      await prisma.kbProfile.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('1. Le composant DomainsPicker rend les packs thématiques et les domaines 3GPP sélectionnables', () => {
    const mockClient = new MockLlmopsRegistryClient();
    const { html } = render(DomainsPicker, {
      props: {
        selectedDomains: ['conformance', '5g-security'],
        ownersRegistry: mockClient.registryState
      }
    });
    expect(html).toContain('+ Pack 3GPP');
    expect(html).toContain('+ Pack Sécurité');
    expect(html).toContain('conformance');
    expect(html).toContain('telecom-core');
    expect(html).toContain('5g-security');
  });

  it('2. La création centralisée dérive automatiquement le handle LLMOps depuis l’email quand kbHandle est omis', async () => {
    // Vérification comportementale de la dérivation automatique de handle (ex: jane.doe@corp.org -> @jane-doe)
    const mockClient = new MockLlmopsRegistryClient();
    const tempEmail = `auto.handle.${Date.now()}@test-telecom.org`;
    try {
      const res = await createCentralizedAccount(
        {
          name: 'Auto Handle Expert',
          email: tempEmail,
          role: 'user',
          initialPassword: 'PasswordAuto123!',
          enableKbReview: true,
          kbRoles: ['kb:review'],
          ownedDomains: ['conformance'],
          registerInLlmops: true
        },
        'admin@archinex.local',
        mockClient
      );
      expect(res.llmopsSync?.success).toBe(true);
      expect(res.llmopsSync?.handle).toMatch(/^@auto-handle-/);
    } finally {
      const u = await prisma.user.findUnique({ where: { email: tempEmail } });
      if (u) {
        await prisma.kbProfile.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    }
  });

  it('3. Crée un compte avec compétences 3GPP multiples sans saisie manuelle de handle', async () => {
    const mockClient = new MockLlmopsRegistryClient();

    const multiple3gppDomains = [
      'conformance',
      'interoperability',
      'telecom-core',
      '5g-security',
      'network-exposure',
      'sba',
      'mission-critical-security'
    ];

    const result = await createCentralizedAccount(
      {
        name: 'Alexandre 3GPP Expert',
        email: testEmail,
        role: 'user',
        initialPassword: 'Password3gpp123!',
        // kbHandle délibérément omis : doit être auto-généré à partir de l'email
        enableKbReview: true,
        kbRoles: ['kb:review', 'kb:maintain'],
        ownedDomains: multiple3gppDomains,
        registerInLlmops: true
      },
      'admin@archinex.local',
      mockClient
    );

    expect(result.email).toBe(testEmail);
    expect(result.llmopsSync?.success).toBe(true);
    // Handle dérivé automatiquement de expert.3gpp@...
    expect(result.llmopsSync?.handle).toBe('@expert-3gpp');

    // Vérification de la persistance en base locale
    const dbUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { kbProfile: true }
    });
    expect(dbUser).toBeDefined();
    expect(dbUser?.kbProfile?.kbHandle).toBe('@expert-3gpp');
    const savedDomains = JSON.parse(dbUser?.kbProfile?.ownedDomains || '[]');
    expect(savedDomains).toEqual(expect.arrayContaining(multiple3gppDomains));

    // Vérification du payload transmis au registre LLMOps (schéma complet PUT /api/knowledge/owners)
    expect(mockClient.putPayloads.length).toBe(1);
    const putPayload = mockClient.putPayloads[0];
    expect(putPayload.owners).toBeDefined();
    const registeredOwner = putPayload.owners.find((o: any) => o.handle === '@expert-3gpp');
    expect(registeredOwner).toBeDefined();
    expect(registeredOwner.email).toBe(testEmail);
    expect(registeredOwner.roles).toContain('kb:review');
    expect(registeredOwner.roles).toContain('kb:maintain');

    // Vérification que tous les domaines 3GPP pointent bien vers @expert-3gpp
    for (const dom of multiple3gppDomains) {
      expect(putPayload.domains[dom]).toBe('@expert-3gpp');
    }
  });
});
