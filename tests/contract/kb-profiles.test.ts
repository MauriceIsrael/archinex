import { describe, it, expect } from 'vitest';
import {
  normalizeKbHandle,
  inviteKbExpert,
  getKbExpertByInvitationToken,
  getKbExpertByUserId,
  activateKbExpert,
  updateKbExpert,
  deleteKbExpert,
  listKbExperts
} from '../../src/lib/server/kbProfilesDb';
import { canUserPerformKbAction, hasKbRole } from '../../src/lib/auth/kbGuard.server';
import { prisma } from '../../src/lib/server/prisma';

describe('Contract: KB Expert Profiles, Roles & Casbin Habilitations (Lot A6)', () => {
  const timestamp = Date.now();
  const testEmail = `expert.test.${timestamp}@archinex.local`;
  const testHandle = `@sec-test-${timestamp}`;
  let createdUserId = '';
  let invitationToken = '';

  it('1. normalizeKbHandle garantit un format canonique en @minuscule', () => {
    expect(normalizeKbHandle('  Sec-Lead  ')).toBe('@sec-lead');
    expect(normalizeKbHandle('@CLOUD-ARCHITECT')).toBe('@cloud-architect');
    expect(normalizeKbHandle('data_engineer')).toBe('@data_engineer');
  });

  it('2. inviteKbExpert crée un utilisateur avec jeton 7 jours et rôle kb:review par défaut', async () => {
    const res = await inviteKbExpert({
      name: 'Claire Beauchamp',
      email: testEmail,
      kbHandle: testHandle,
      kbRoles: ['kb:review', 'kb:maintain'],
      ownedDomains: ['security', 'cryptography']
    });

    expect(res).toBeDefined();
    expect(res.invitationToken).toBeDefined();
    expect(res.invitationToken.length).toBeGreaterThanOrEqual(32);
    expect(res.invitationUrl).toBe(`/invite?token=${res.invitationToken}`);

    const expert = res.expert;
    createdUserId = expert.id;
    invitationToken = res.invitationToken;

    expect(expert.email).toBe(testEmail);
    expect(expert.kbHandle).toBe(testHandle);
    expect(expert.kbRoles).toEqual(['kb:review', 'kb:maintain']);
    expect(expert.ownedDomains).toEqual(['security', 'cryptography']);
    expect(expert.invitationStatus).toBe('pending_invitation');
    expect(expert.delegated).toBe(false);

    // Expiration à 7 jours (+/- 5 minutes)
    const expiresAt = new Date(expert.invitationExpiresAt!).getTime();
    const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(60 * 1000);
  });

  it('3. getKbExpertByInvitationToken retrouve l’expert invité', async () => {
    const expert = await getKbExpertByInvitationToken(invitationToken);
    expect(expert).not.toBeNull();
    expect(expert?.id).toBe(createdUserId);
    expect(expert?.email).toBe(testEmail);
    expect(expert?.invitationStatus).toBe('pending_invitation');
  });

  it('4. Refuse l’invitation en doublon pour le même email ou même handle', async () => {
    await expect(
      inviteKbExpert({
        name: 'Autre Nom',
        email: testEmail,
        kbHandle: `@other-${timestamp}`,
        kbRoles: ['kb:review'],
        ownedDomains: []
      })
    ).rejects.toThrow('existe déjà');

    await expect(
      inviteKbExpert({
        name: 'Autre Nom',
        email: `other.${timestamp}@archinex.local`,
        kbHandle: testHandle,
        kbRoles: ['kb:review'],
        ownedDomains: []
      })
    ).rejects.toThrow('déjà attribué');
  });

  it('5. activateKbExpert scelle le mot de passe et révoque le jeton d’invitation', async () => {
    const res = await activateKbExpert(invitationToken, 'SecretPassword123!');
    expect(res.success).toBe(true);

    const expert = res.expert;
    expect(expert.invitationStatus).toBe('active');
    expect(expert.invitationToken).toBeNull();
    expect(expert.delegated).toBe(true);

    // Une seconde tentative avec le même jeton doit échouer
    await expect(activateKbExpert(invitationToken, 'AnotherPassword123!')).rejects.toThrow(
      'invalide ou introuvable'
    );
  });

  it('6. Casbin & Habilitations : l’expert activé détient ses rôles KB', async () => {
    const hasReview = await hasKbRole(createdUserId, 'kb:review');
    const hasMaintain = await hasKbRole(createdUserId, 'kb:maintain');
    const hasAdmin = await hasKbRole(createdUserId, 'kb:admin');

    expect(hasReview).toBe(true);
    expect(hasMaintain).toBe(true);
    expect(hasAdmin).toBe(false);

    // L'administrateur a tous les droits
    const adminCanReview = await canUserPerformKbAction({ id: 'any-admin', role: 'admin' }, 'kb:candidate', 'review');
    expect(adminCanReview).toBe(true);
  });

  it('7. updateKbExpert met à jour les rôles, domaines et synchronise Casbin', async () => {
    const updated = await updateKbExpert(createdUserId, {
      kbRoles: ['kb:review', 'kb:evaluate'],
      ownedDomains: ['security', 'ai-governance']
    });

    expect(updated.kbRoles).toEqual(['kb:review', 'kb:evaluate']);
    expect(updated.ownedDomains).toEqual(['security', 'ai-governance']);

    const hasEval = await hasKbRole(createdUserId, 'kb:evaluate');
    const hasMaintain = await hasKbRole(createdUserId, 'kb:maintain');

    expect(hasEval).toBe(true);
    expect(hasMaintain).toBe(false);
  });

  it('8. Nettoyage : deleteKbExpert supprime le compte et révoque les règles Casbin', async () => {
    const deleted = await deleteKbExpert(createdUserId);
    expect(deleted).toBe(true);

    const expert = await getKbExpertByUserId(createdUserId);
    expect(expert).toBeNull();

    const hasReview = await hasKbRole(createdUserId, 'kb:review');
    expect(hasReview).toBe(false);
  });
});
