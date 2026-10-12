import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '$lib/server/prisma';
import { LLMOpsClient } from '$lib/server/llmops/client';
import {
  loadCentralizedAccountsView,
  createCentralizedAccount,
  updateCentralizedAccount,
  syncAccountToLlmopsRegistry
} from '$lib/server/accountsAdmin';
import { load as usersPageLoad } from '../../src/routes/users/+page.server';
import type { KbOwnersRegistry } from '$lib/types/llmops';

class MockRegistryLLMOpsClient extends LLMOpsClient {
  public registryState: KbOwnersRegistry = {
    owners: [
      {
        handle: '@ciso-office',
        name: 'CISO Office',
        email: 'ciso@example.org',
        roles: ['kb:review', 'kb:maintain'],
        domains: ['security'],
        delegated: true
      },
      {
        handle: '@data-protection-officer',
        name: 'DPO',
        email: '' as string,
        roles: ['kb:review'],
        domains: ['data-protection'],
        delegated: false
      },
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
      security: '@ciso-office',
      'data-protection': '@data-protection-officer',
      architecture: '@maintainers'
    },
    default_owner: '@maintainers',
    total: 3
  };

  public putPayloads: any[] = [];

  override async getOwners(): Promise<KbOwnersRegistry> {
    return structuredClone(this.registryState);
  }

  protected override async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    if (url.endsWith('/api/knowledge/owners') && options.method === 'PUT') {
      const body = JSON.parse(String(options.body || '{}'));
      this.putPayloads.push(body);
      this.registryState = {
        owners: body.owners,
        domains: body.domains,
        default_owner: body.default_owner,
        total: body.owners.length
      };
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            owners: body.owners.length,
            domains: Object.keys(body.domains || {}).length,
            default_owner: body.default_owner
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  }
}

describe('Issue #76 — Gestion centralisée des comptes (compte, rôle applicatif, rôles par espace, identité LLMOps)', () => {
  const stamp = Date.now();
  const testEngagementId = `eng-76-${stamp}`;
  const testEmail1 = `dpo.${stamp}@archinex.local`;
  const testEmail2 = `arch.${stamp}@archinex.local`;
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [{ id: { in: createdUserIds } }, { email: { in: [testEmail1, testEmail2] } }]
      }
    });
    await prisma.engagement.deleteMany({ where: { id: testEngagementId } });
    await prisma.resource.deleteMany({
      where: {
        type: 'audit:admin_account',
        identifier: { in: [testEmail1, testEmail2] }
      }
    });
  });

  it('1. Supprime les utilisateurs fictifs en dur de /users et redirige /users vers /admin', async () => {
    const svelteSource = readFileSync(
      resolve(process.cwd(), 'src/routes/users/+page.svelte'),
      'utf-8'
    );
    expect(svelteSource).not.toContain('Alice Johnson');
    expect(svelteSource).not.toContain('Bob Smith');
    expect(svelteSource).not.toContain('Charlie Brown');

    let redirectedTo = '';
    try {
      await (usersPageLoad as any)({});
    } catch (err: any) {
      redirectedTo = err?.location || '';
    }
    expect(redirectedTo).toBe('/admin');
  });

  it('2. Détecte les responsables du registre LLMOps sans adresse e-mail (ex: @data-protection-officer) et la couverture par domaine', async () => {
    await prisma.engagement.create({
      data: {
        id: testEngagementId,
        title: 'Espace Test #76',
        shortName: 'T76',
        type: 'project_rfp',
        badge: 'TEST',
        description: 'Engagement de test pour les rôles par espace',
        participants: '[]'
      }
    });

    const mockClient = new MockRegistryLLMOpsClient();
    const view = await loadCentralizedAccountsView('maintainers@example.org', mockClient);

    const dpoUnlinked = view.unlinkedOwners.find(
      (u) => u.handle === '@data-protection-officer'
    );
    expect(dpoUnlinked).toBeDefined();
    expect(dpoUnlinked?.reason).toBe('missing_email_in_llmops');
    expect(dpoUnlinked?.domains).toContain('data-protection');

    const dpDomain = view.domainsOverview.find((d) => d.domain === 'data-protection');
    expect(dpDomain).toBeDefined();
    expect(dpDomain?.ownerHandle).toBe('@data-protection-officer');
    expect(dpDomain?.hasEmailInLlmops).toBe(false);
  });

  it('3. Crée un compte via le parcours guidé en lui attribuant un rôle applicatif, un rôle par espace et en associant @data-protection-officer dans LLMOps sans écraser les autres responsables', async () => {
    const mockClient = new MockRegistryLLMOpsClient();

    const created = await createCentralizedAccount(
      {
        name: 'Diane DPO',
        email: testEmail1,
        role: 'user',
        initialPassword: 'PasswordDpo123!',
        workspaceRoles: {
          [testEngagementId]: 'security_architect'
        },
        enableKbReview: true,
        kbHandle: '@data-protection-officer',
        kbRoles: ['kb:review'],
        ownedDomains: ['data-protection'],
        registerInLlmops: true
      },
      'maintainers@example.org',
      mockClient
    );

    createdUserIds.push(created.userId);
    expect(created.invitationToken).toBeNull();
    expect(created.llmopsSync?.attempted).toBe(true);
    expect(created.llmopsSync?.success).toBe(true);
    expect(mockClient.putPayloads.length).toBe(1);

    // Vérifier qu'aucun autre owner ni domaine du registre LLMOps n'a été perdu
    const lastPut = mockClient.putPayloads[0];
    expect(lastPut.owners.some((o: any) => o.handle === '@ciso-office')).toBe(true);
    expect(lastPut.owners.some((o: any) => o.handle === '@maintainers')).toBe(true);
    const updatedDpo = lastPut.owners.find(
      (o: any) => o.handle === '@data-protection-officer'
    );
    expect(updatedDpo.email).toBe(testEmail1);
    expect(lastPut.domains.security).toBe('@ciso-office');
    expect(lastPut.domains['data-protection']).toBe('@data-protection-officer');

    // Vérifier que la vue centralisée reflète les 4 volets (compte, rôle app, rôle espace, identité LLMOps)
    const view = await loadCentralizedAccountsView('maintainers@example.org', mockClient);
    const acc = view.accounts.find((a) => a.id === created.userId);
    expect(acc).toBeDefined();
    expect(acc?.role).toBe('user');
    expect(acc?.invitationStatus).toBe('active');
    expect(
      acc?.workspaceRoles.find((wr) => wr.engagementId === testEngagementId)?.role
    ).toBe('security_architect');
    expect(acc?.llmopsIdentity.status).toBe('synced');
    expect(acc?.llmopsIdentity.handle).toBe('@data-protection-officer');
    expect(acc?.llmopsIdentity.domains).toContain('data-protection');
  });

  it('4. Modifie les rôles par espace et le profil local sans écraser implicitement LLMOps, puis synchronise explicitement et journalise l’action', async () => {
    const mockClient = new MockRegistryLLMOpsClient();

    // Création sans inscription LLMOps automatique
    const created = await createCentralizedAccount(
      {
        name: 'Marc Architecte',
        email: testEmail2,
        role: 'user',
        generateActivationLink: true,
        workspaceRoles: {
          [testEngagementId]: 'infra_expert_architect'
        },
        enableKbReview: true,
        kbHandle: `@marc-${stamp}`,
        kbRoles: ['kb:review'],
        ownedDomains: ['cloud-native'],
        registerInLlmops: false
      },
      'maintainers@example.org',
      mockClient
    );
    createdUserIds.push(created.userId);
    expect(created.invitationToken).toBeTruthy();
    expect(mockClient.putPayloads.length).toBe(0);

    // Mise à jour locale (changement de rôle applicatif et de rôle dans l'espace) : aucun appel implicite à LLMOps
    await updateCentralizedAccount(
      created.userId,
      {
        role: 'admin',
        workspaceRoles: {
          [testEngagementId]: 'lead_architect'
        }
      },
      'maintainers@example.org'
    );
    expect(mockClient.putPayloads.length).toBe(0);

    const viewBeforeSync = await loadCentralizedAccountsView('maintainers@example.org', mockClient);
    const accBefore = viewBeforeSync.accounts.find((a) => a.id === created.userId);
    expect(accBefore?.role).toBe('admin');
    expect(
      accBefore?.workspaceRoles.find((wr) => wr.engagementId === testEngagementId)?.role
    ).toBe('lead_architect');
    expect(accBefore?.llmopsIdentity.status).toBe('email_unknown');

    // Action explicite et journalisée vers LLMOps
    const syncRes = await syncAccountToLlmopsRegistry(
      {
        userId: created.userId,
        handle: `@marc-${stamp}`,
        email: testEmail2,
        roles: ['kb:review', 'kb:evaluate'],
        domains: ['cloud-native']
      },
      'maintainers@example.org',
      mockClient
    );
    expect(syncRes.success).toBe(true);
    expect(mockClient.putPayloads.length).toBe(1);

    const viewAfterSync = await loadCentralizedAccountsView('maintainers@example.org', mockClient);
    const accAfter = viewAfterSync.accounts.find((a) => a.id === created.userId);
    expect(accAfter?.llmopsIdentity.status).toBe('synced');
    expect(accAfter?.llmopsIdentity.domains).toContain('cloud-native');

    // Vérifier la journalisation de l'action
    const logs = await prisma.resource.findMany({
      where: {
        type: 'audit:admin_account',
        identifier: testEmail2
      }
    });
    expect(logs.some((l) => l.tags.includes('LLMOPS_OWNER_SYNCED'))).toBe(true);
  });
});

