/**
 * Gestionnaire de persistance des profils d'experts KB et synchronisation Casbin / LLMOps
 * Lot A6 — Comptes Experts, Rôles KB & Propagation d'Identité
 */

import { prisma } from './prisma';
import { getEnforcer } from './casbin';
import { llmopsClient } from './llmops/client';
import type { KbRole, KbOwner } from '$lib/types/llmops';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

export interface KbExpertRecord {
  id: string; // User ID
  name: string;
  email: string;
  role: string; // Base user role (user/admin)
  kbProfileId: string;
  kbHandle: string;
  kbRoles: KbRole[];
  ownedDomains: string[];
  delegated: boolean;
  isActive: boolean;
  invitationStatus: 'active' | 'pending_invitation' | 'expired_invitation' | 'disabled';
  invitationToken: string | null;
  invitationExpiresAt: string | null;
  createdAt: string;
}

export interface InviteExpertInput {
  name: string;
  email: string;
  kbHandle: string;
  kbRoles: KbRole[];
  ownedDomains: string[];
}

export interface UpdateExpertInput {
  name?: string;
  kbHandle?: string;
  kbRoles?: KbRole[];
  ownedDomains?: string[];
  isActive?: boolean;
}

/**
 * Normalise un handle KB (doit commencer par @ ou être un slug alphanumérique propre)
 */
export function normalizeKbHandle(handle: string): string {
  const trimmed = handle.trim();
  if (trimmed.startsWith('@')) return trimmed.toLowerCase();
  return `@${trimmed.toLowerCase()}`;
}

/**
 * Synchronise les groupements Casbin d'un utilisateur avec ses rôles KB
 */
export async function syncUserCasbinKbRoles(userId: string, kbRoles: KbRole[]): Promise<void> {
  const ef = await getEnforcer();

  // Supprimer les anciens groupements KB pour cet utilisateur
  const currentGroups = await ef.getFilteredGroupingPolicy(0, userId);
  for (const group of currentGroups) {
    const role = group[1];
    if (role.startsWith('kb:')) {
      await ef.removeGroupingPolicy(userId, role);
    }
  }

  // Ajouter les nouveaux groupements KB
  for (const role of kbRoles) {
    await ef.addGroupingPolicy(userId, role);
  }

  await ef.savePolicy();
}

/**
 * Récupère la liste de tous les experts KB
 */
export async function listKbExperts(): Promise<KbExpertRecord[]> {
  const usersWithKb = await prisma.user.findMany({
    where: {
      kbProfile: { isNot: null }
    },
    include: {
      kbProfile: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const now = new Date();

  return usersWithKb.map((u) => {
    const p = u.kbProfile!;
    let roles: KbRole[] = [];
    try {
      roles = JSON.parse(p.kbRoles);
    } catch {
      roles = ['kb:review'];
    }

    let domains: string[] = [];
    try {
      domains = JSON.parse(p.ownedDomains);
    } catch {
      domains = [];
    }

    let status: 'active' | 'pending_invitation' | 'expired_invitation' | 'disabled' = 'active';
    if (!p.isActive) {
      status = 'disabled';
    } else if (p.invitationToken) {
      if (p.invitationExpiresAt && p.invitationExpiresAt > now) {
        status = 'pending_invitation';
      } else {
        status = 'expired_invitation';
      }
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      kbProfileId: p.id,
      kbHandle: p.kbHandle,
      kbRoles: roles,
      ownedDomains: domains,
      delegated: p.delegated,
      isActive: p.isActive,
      invitationStatus: status,
      invitationToken: p.invitationToken,
      invitationExpiresAt: p.invitationExpiresAt ? p.invitationExpiresAt.toISOString() : null,
      createdAt: u.createdAt.toISOString()
    };
  });
}

/**
 * Trouve un profil expert par User ID
 */
export async function getKbExpertByUserId(userId: string): Promise<KbExpertRecord | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { kbProfile: true }
  });

  if (!user || !user.kbProfile) return null;

  const p = user.kbProfile;
  const now = new Date();

  let roles: KbRole[] = [];
  try {
    roles = JSON.parse(p.kbRoles);
  } catch {
    roles = ['kb:review'];
  }

  let domains: string[] = [];
  try {
    domains = JSON.parse(p.ownedDomains);
  } catch {
    domains = [];
  }

  let status: 'active' | 'pending_invitation' | 'expired_invitation' | 'disabled' = 'active';
  if (!p.isActive) {
    status = 'disabled';
  } else if (p.invitationToken) {
    if (p.invitationExpiresAt && p.invitationExpiresAt > now) {
      status = 'pending_invitation';
    } else {
      status = 'expired_invitation';
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    kbProfileId: p.id,
    kbHandle: p.kbHandle,
    kbRoles: roles,
    ownedDomains: domains,
    delegated: p.delegated,
    isActive: p.isActive,
    invitationStatus: status,
    invitationToken: p.invitationToken,
    invitationExpiresAt: p.invitationExpiresAt ? p.invitationExpiresAt.toISOString() : null,
    createdAt: user.createdAt.toISOString()
  };
}

/**
 * Trouve un profil expert par token d'invitation
 */
export async function getKbExpertByInvitationToken(token: string): Promise<KbExpertRecord | null> {
  const profile = await prisma.kbProfile.findUnique({
    where: { invitationToken: token },
    include: { user: true }
  });

  if (!profile) return null;

  return getKbExpertByUserId(profile.userId);
}

/**
 * Invite un nouvel expert KB avec jeton valable 7 jours
 */
export async function inviteKbExpert(input: InviteExpertInput): Promise<{
  expert: KbExpertRecord;
  invitationToken: string;
  invitationUrl: string;
}> {
  const emailNorm = input.email.trim().toLowerCase();
  const handleNorm = normalizeKbHandle(input.kbHandle);

  // Vérifier doublon email
  const existingUser = await prisma.user.findUnique({
    where: { email: emailNorm }
  });
  if (existingUser) {
    throw new Error(`Un utilisateur avec l'email ${emailNorm} existe déjà`);
  }

  // Vérifier doublon handle
  const existingHandle = await prisma.kbProfile.findUnique({
    where: { kbHandle: handleNorm }
  });
  if (existingHandle) {
    throw new Error(`Le handle KB ${handleNorm} est déjà attribué`);
  }

  // Jeton unique valable 7 jours
  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Mot de passe temporaire verrouillé
  const tempPass = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

  const newUser = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: emailNorm,
      passwordHash: tempPass,
      role: 'user',
      attributes: JSON.stringify({
        department: 'Expertise KB',
        role: 'kb_expert'
      }),
      kbProfile: {
        create: {
          kbHandle: handleNorm,
          kbRoles: JSON.stringify(input.kbRoles.length > 0 ? input.kbRoles : ['kb:review']),
          ownedDomains: JSON.stringify(input.ownedDomains || []),
          delegated: false,
          invitationToken: token,
          invitationExpiresAt: expiresAt,
          isActive: true
        }
      }
    },
    include: {
      kbProfile: true
    }
  });

  // Habilitations Casbin
  await syncUserCasbinKbRoles(newUser.id, input.kbRoles);

  const expert = (await getKbExpertByUserId(newUser.id))!;

  return {
    expert,
    invitationToken: token,
    invitationUrl: `/invite?token=${token}`
  };
}

/**
 * Active le compte d'un expert avec son mot de passe définitif
 */
export async function activateKbExpert(
  token: string,
  newPassword: string
): Promise<{ success: boolean; expert: KbExpertRecord }> {
  if (!token) {
    throw new Error("Jeton d'invitation manquant");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Le mot de passe doit comporter au moins 6 caractères');
  }

  const profile = await prisma.kbProfile.findUnique({
    where: { invitationToken: token },
    include: { user: true }
  });

  if (!profile) {
    throw new Error("Jeton d'invitation invalide ou introuvable");
  }

  const now = new Date();
  if (profile.invitationExpiresAt && profile.invitationExpiresAt < now) {
    throw new Error("Ce jeton d'invitation a expiré (validité de 7 jours dépassée)");
  }

  // Hacher le nouveau mot de passe
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Mettre à jour l'utilisateur et sceller l'activation
  await prisma.$transaction([
    prisma.user.update({
      where: { id: profile.userId },
      data: { passwordHash }
    }),
    prisma.kbProfile.update({
      where: { id: profile.id },
      data: {
        invitationToken: null,
        invitationExpiresAt: null,
        delegated: true,
        isActive: true
      }
    })
  ]);

  const expert = (await getKbExpertByUserId(profile.userId))!;

  // Synchronisation avec LLMOps (marquage delegated: true)
  try {
    const allExperts = await listKbExperts();
    const activeOwners: KbOwner[] = allExperts
      .filter((e) => e.isActive && e.invitationStatus === 'active')
      .map((e) => ({
        handle: e.kbHandle,
        name: e.name,
        email: e.email,
        roles: e.kbRoles,
        domains: e.ownedDomains,
        delegated: e.delegated
      }));

    await llmopsClient.updateOwners(activeOwners, expert.email);
  } catch (err) {
    console.warn('[KbProfile] Avertissement synchronisation LLMOps lors de l’activation :', err);
    // Tolérance : ne pas faire échouer l'activation locale si LLMOps est offline / 503
  }

  return {
    success: true,
    expert
  };
}

/**
 * Met à jour les informations d'un expert KB
 */
export async function updateKbExpert(
  userId: string,
  updates: UpdateExpertInput,
  actorEmail?: string
): Promise<KbExpertRecord> {
  const existing = await getKbExpertByUserId(userId);
  if (!existing) {
    throw new Error('Expert introuvable');
  }

  const dataToUpdateProfile: any = {};
  const dataToUpdateUser: any = {};

  if (updates.name !== undefined) {
    dataToUpdateUser.name = updates.name.trim();
  }

  if (updates.kbHandle !== undefined) {
    const handleNorm = normalizeKbHandle(updates.kbHandle);
    if (handleNorm !== existing.kbHandle) {
      const duplicate = await prisma.kbProfile.findUnique({
        where: { kbHandle: handleNorm }
      });
      if (duplicate && duplicate.userId !== userId) {
        throw new Error(`Le handle ${handleNorm} est déjà utilisé`);
      }
      dataToUpdateProfile.kbHandle = handleNorm;
    }
  }

  if (updates.kbRoles !== undefined) {
    dataToUpdateProfile.kbRoles = JSON.stringify(updates.kbRoles);
    await syncUserCasbinKbRoles(userId, updates.kbRoles);
  }

  if (updates.ownedDomains !== undefined) {
    dataToUpdateProfile.ownedDomains = JSON.stringify(updates.ownedDomains);
  }

  if (updates.isActive !== undefined) {
    dataToUpdateProfile.isActive = updates.isActive;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...dataToUpdateUser,
      kbProfile: {
        update: dataToUpdateProfile
      }
    }
  });

  const updatedExpert = (await getKbExpertByUserId(userId))!;

  // Synchronisation avec LLMOps
  try {
    const allExperts = await listKbExperts();
    const activeOwners: KbOwner[] = allExperts
      .filter((e) => e.isActive && e.invitationStatus === 'active')
      .map((e) => ({
        handle: e.kbHandle,
        name: e.name,
        email: e.email,
        roles: e.kbRoles,
        domains: e.ownedDomains,
        delegated: e.delegated
      }));

    await llmopsClient.updateOwners(activeOwners, actorEmail || updatedExpert.email);
  } catch (err) {
    console.warn('[KbProfile] Synchronisation LLMOps échouée lors de la mise à jour :', err);
  }

  return updatedExpert;
}

/**
 * Supprime un expert KB
 */
export async function deleteKbExpert(userId: string): Promise<boolean> {
  const ef = await getEnforcer();
  await ef.removeFilteredGroupingPolicy(0, userId);
  await ef.savePolicy();

  await prisma.user.delete({
    where: { id: userId }
  });

  return true;
}
