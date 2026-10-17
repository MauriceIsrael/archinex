/**
 * Gestion centralisée des comptes (Issue #76)
 * Unifie en une seule vue et une seule fiche par personne :
 *  1. Le compte (nom, e-mail, mot de passe / lien d'activation 7j, état actif ou non)
 *  2. Le rôle applicatif Archinex (user / admin)
 *  3. Les rôles dans chaque espace de travail (Engagement.participants & ProjectMember)
 *  4. L'identité dans LLMOps (handle, rôles KB, domaines du registre GET /api/knowledge/owners)
 *
 * Règle de gouvernance : le registre LLMOps fait autorité pour la base de connaissances.
 * Aucune modification locale n'écrase implicitement owners.yaml ; toute mise à jour du registre
 * LLMOps passe par une action explicite et journalisée (syncAccountToLlmopsRegistry).
 */

import { prisma } from './prisma';
import { llmopsClient, type LLMOpsClient } from './llmops/client';
import { normalizeKbHandle } from './kbProfilesDb';
import type { KbRole, KbOwnersRegistry, KbOwner } from '$lib/types/llmops';
import type { ArchitectRole } from '$lib/types/epistemic';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

export interface ProjectParticipant {
  id: string;
  name: string;
  email?: string;
  role: ArchitectRole;
  isLead?: boolean;
}

export const ARCHITECT_ROLES: ArchitectRole[] = [
  'lead_architect',
  'infra_expert_architect',
  'security_architect',
  'domain_architect',
  'data_architect'
];

export const ARCHITECT_ROLE_LABELS: Record<string, string> = {
  lead_architect: 'Lead Architect (Arbitre)',
  infra_expert_architect: 'Architecte Infra / Réseau',
  security_architect: 'Architecte Sécurité NIS2',
  domain_architect: 'Architecte Métier & Domaine',
  data_architect: 'Architecte Données & IA'
};

export interface AccountWorkspaceRole {
  engagementId: string;
  engagementTitle: string;
  engagementShortName: string;
  role: ArchitectRole;
  isLead: boolean;
}

export interface AccountLlmopsIdentity {
  knownByEmail: boolean;
  matchedByHandle: boolean;
  handle: string | null;
  email: string | null;
  roles: KbRole[];
  domains: string[];
  delegated: boolean;
  status:
    | 'synced'
    | 'email_unknown'
    | 'handle_without_email'
    | 'drift'
    | 'none'
    | 'offline';
}

export interface CentralizedAccountRecord {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  isActive: boolean;
  invitationStatus: 'active' | 'pending_invitation' | 'expired_invitation' | 'disabled';
  invitationToken: string | null;
  invitationUrl: string | null;
  invitationExpiresAt: string | null;
  createdAt: string;
  workspaceRoles: AccountWorkspaceRole[];
  kbProfile: {
    id: string;
    kbHandle: string;
    kbRoles: KbRole[];
    ownedDomains: string[];
    delegated: boolean;
    isActive: boolean;
  } | null;
  llmopsIdentity: AccountLlmopsIdentity;
}

export interface WorkspaceSummary {
  id: string;
  title: string;
  shortName: string;
  status: string;
}

export interface DomainOverviewItem {
  domain: string;
  ownerHandle: string;
  ownerEmail: string | null;
  ownerRoles: KbRole[];
  linkedUserId: string | null;
  linkedUserName: string | null;
  hasAccount: boolean;
  hasEmailInLlmops: boolean;
}

export interface UnlinkedOwnerItem {
  handle: string;
  email: string | null;
  roles: KbRole[];
  domains: string[];
  delegated: boolean;
  reason: 'missing_email_in_llmops' | 'no_archinex_account';
}

export interface CentralizedAccountsView {
  accounts: CentralizedAccountRecord[];
  workspaces: WorkspaceSummary[];
  domainsOverview: DomainOverviewItem[];
  unlinkedOwners: UnlinkedOwnerItem[];
  ownersRegistry: KbOwnersRegistry;
}

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Calcule les domaines rattachés à chaque handle dans le registre LLMOps
 */
export function buildDomainsByHandle(domainsMap: Record<string, string> | undefined): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!domainsMap) return result;
  for (const [domain, rawHandle] of Object.entries(domainsMap)) {
    const h = rawHandle.trim().toLowerCase();
    const list = result.get(h) || [];
    if (!list.includes(domain)) {
      list.push(domain);
    }
    result.set(h, list);
  }
  for (const [h, list] of result.entries()) {
    result.set(h, list.sort());
  }
  return result;
}

/**
 * Charge la vue centralisée complète pour /admin
 */
export async function loadCentralizedAccountsView(
  actorEmail?: string,
  client: LLMOpsClient = llmopsClient
): Promise<CentralizedAccountsView> {
  const [users, engagements, ownersRegistry] = await Promise.all([
    prisma.user.findMany({
      include: { kbProfile: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.engagement.findMany({
      orderBy: { updatedAt: 'desc' }
    }),
    client.getOwners(actorEmail)
  ]);

  const workspaces: WorkspaceSummary[] = engagements.map((e) => ({
    id: e.id,
    title: e.title,
    shortName: e.shortName,
    status: e.status
  }));

  // Indexer les participants par engagement
  const engagementParticipants = engagements.map((eng) => ({
    id: eng.id,
    title: eng.title,
    shortName: eng.shortName,
    participants: parseJsonSafe<ProjectParticipant[]>(eng.participants, [])
  }));

  // Indexer le registre LLMOps par e-mail et par handle
  const ownersByEmail = new Map<string, KbOwner>();
  const ownersByHandle = new Map<string, KbOwner>();
  const domainsByHandle = buildDomainsByHandle(ownersRegistry.domains);

  for (const owner of ownersRegistry.owners || []) {
    const h = owner.handle.trim().toLowerCase();
    ownersByHandle.set(h, owner);
    if (owner.email) {
      ownersByEmail.set(owner.email.trim().toLowerCase(), owner);
    }
  }

  const now = new Date();

  const accounts: CentralizedAccountRecord[] = users.map((u) => {
    const emailNorm = u.email.trim().toLowerCase();
    const attrs = parseJsonSafe<Record<string, any>>(u.attributes, {});
    const p = u.kbProfile;

    const kbRoles = p ? parseJsonSafe<KbRole[]>(p.kbRoles, []) : [];
    const ownedDomains = p ? parseJsonSafe<string[]>(p.ownedDomains, []) : [];
    const hasKbProfile = Boolean(p && (kbRoles.length > 0 || p.kbHandle));

    const userActive = p ? p.isActive : attrs.isActive !== false;

    let invitationStatus: 'active' | 'pending_invitation' | 'expired_invitation' | 'disabled' =
      'active';
    if (!userActive) {
      invitationStatus = 'disabled';
    } else if (p?.invitationToken) {
      if (p.invitationExpiresAt && p.invitationExpiresAt > now) {
        invitationStatus = 'pending_invitation';
      } else {
        invitationStatus = 'expired_invitation';
      }
    }

    // Rôles par espace (engagement)
    const workspaceRoles: AccountWorkspaceRole[] = [];
    for (const eng of engagementParticipants) {
      const match = eng.participants.find(
        (part) =>
          (part.email && part.email.trim().toLowerCase() === emailNorm) ||
          part.id === u.id
      );
      if (match && match.role) {
        workspaceRoles.push({
          engagementId: eng.id,
          engagementTitle: eng.title,
          engagementShortName: eng.shortName,
          role: match.role,
          isLead: Boolean(match.isLead || match.role === 'lead_architect')
        });
      }
    }

    // Identité dans LLMOps
    const ownerByEmail = ownersByEmail.get(emailNorm);
    const localHandleNorm = p?.kbHandle ? normalizeKbHandle(p.kbHandle) : null;
    const ownerByHandle = localHandleNorm ? ownersByHandle.get(localHandleNorm) : undefined;
    const matchedOwner = ownerByEmail || ownerByHandle;

    let llmopsIdentity: AccountLlmopsIdentity;
    if (ownersRegistry.offline) {
      llmopsIdentity = {
        knownByEmail: false,
        matchedByHandle: false,
        handle: localHandleNorm,
        email: null,
        roles: kbRoles,
        domains: ownedDomains,
        delegated: Boolean(p?.delegated),
        status: 'offline'
      };
    } else if (ownerByEmail) {
      const h = ownerByEmail.handle.trim().toLowerCase();
      const regDomains = domainsByHandle.get(h) || [];
      const regRoles = (ownerByEmail.roles || []) as KbRole[];
      const handleDrift = Boolean(localHandleNorm && localHandleNorm !== h);
      const rolesDrift =
        hasKbProfile &&
        JSON.stringify([...kbRoles].sort()) !== JSON.stringify([...regRoles].sort());
      llmopsIdentity = {
        knownByEmail: true,
        matchedByHandle: Boolean(localHandleNorm === h),
        handle: h,
        email: ownerByEmail.email || emailNorm,
        roles: regRoles,
        domains: regDomains,
        delegated: Boolean(ownerByEmail.delegated),
        status: handleDrift || rolesDrift ? 'drift' : 'synced'
      };
    } else if (ownerByHandle) {
      const h = ownerByHandle.handle.trim().toLowerCase();
      const regDomains = domainsByHandle.get(h) || [];
      const regRoles = (ownerByHandle.roles || []) as KbRole[];
      llmopsIdentity = {
        knownByEmail: false,
        matchedByHandle: true,
        handle: h,
        email: ownerByHandle.email || null,
        roles: regRoles,
        domains: regDomains,
        delegated: Boolean(ownerByHandle.delegated),
        status: ownerByHandle.email ? 'drift' : 'handle_without_email'
      };
    } else if (hasKbProfile && kbRoles.length > 0) {
      llmopsIdentity = {
        knownByEmail: false,
        matchedByHandle: false,
        handle: localHandleNorm,
        email: null,
        roles: kbRoles,
        domains: ownedDomains,
        delegated: false,
        status: 'email_unknown'
      };
    } else {
      llmopsIdentity = {
        knownByEmail: false,
        matchedByHandle: false,
        handle: null,
        email: null,
        roles: [],
        domains: [],
        delegated: false,
        status: 'none'
      };
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: (u.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
      isActive: userActive,
      invitationStatus,
      invitationToken: p?.invitationToken ?? null,
      invitationUrl: p?.invitationToken ? `/invite?token=${p.invitationToken}` : null,
      invitationExpiresAt: p?.invitationExpiresAt ? p.invitationExpiresAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      workspaceRoles,
      kbProfile:
        p && kbRoles.length > 0
          ? {
              id: p.id,
              kbHandle: p.kbHandle,
              kbRoles,
              ownedDomains,
              delegated: p.delegated,
              isActive: p.isActive
            }
          : null,
      llmopsIdentity
    };
  });

  // Vue d'ensemble par domaine (issue #76 : voir d'un coup d'œil qui peut relire chaque domaine)
  const usersByEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]));
  const usersByHandle = new Map(
    users
      .filter((u) => u.kbProfile?.kbHandle)
      .map((u) => [normalizeKbHandle(u.kbProfile!.kbHandle), u])
  );

  const domainsOverview: DomainOverviewItem[] = Object.entries(ownersRegistry.domains || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, rawHandle]) => {
      const h = rawHandle.trim().toLowerCase();
      const owner = ownersByHandle.get(h);
      const ownerEmail = owner?.email ? owner.email.trim().toLowerCase() : null;
      const linkedUser =
        (ownerEmail ? usersByEmail.get(ownerEmail) : undefined) || usersByHandle.get(h);

      return {
        domain,
        ownerHandle: h,
        ownerEmail,
        ownerRoles: (owner?.roles || ['kb:review']) as KbRole[],
        linkedUserId: linkedUser?.id ?? null,
        linkedUserName: linkedUser?.name ?? null,
        hasAccount: Boolean(linkedUser),
        hasEmailInLlmops: Boolean(ownerEmail)
      };
    });

  // Responsables du registre LLMOps sans adresse e-mail ou sans compte Archinex (ex: @data-protection-officer)
  const unlinkedOwners: UnlinkedOwnerItem[] = [];
  for (const owner of ownersRegistry.owners || []) {
    const h = owner.handle.trim().toLowerCase();
    const ownerEmail = owner.email ? owner.email.trim().toLowerCase() : null;
    const domains = domainsByHandle.get(h) || [];
    if (!ownerEmail) {
      unlinkedOwners.push({
        handle: h,
        email: null,
        roles: (owner.roles || []) as KbRole[],
        domains,
        delegated: Boolean(owner.delegated),
        reason: 'missing_email_in_llmops'
      });
    } else if (!usersByEmail.has(ownerEmail)) {
      unlinkedOwners.push({
        handle: h,
        email: ownerEmail,
        roles: (owner.roles || []) as KbRole[],
        domains,
        delegated: Boolean(owner.delegated),
        reason: 'no_archinex_account'
      });
    }
  }

  return {
    accounts,
    workspaces,
    domainsOverview,
    unlinkedOwners,
    ownersRegistry
  };
}

/**
 * Synchronise les rôles d'une personne dans chaque espace (Engagement.participants + ProjectMember)
 */
export async function syncUserWorkspaceRoles(
  user: { id: string; name: string; email: string },
  workspaceRoles: Record<string, ArchitectRole | 'none' | null>
): Promise<void> {
  const emailNorm = user.email.trim().toLowerCase();
  const engagementIds = Object.keys(workspaceRoles);
  if (engagementIds.length === 0) return;

  for (const engId of engagementIds) {
    const desiredRole = workspaceRoles[engId];
    const eng = await prisma.engagement.findUnique({ where: { id: engId } });
    if (!eng) continue;

    const participants = parseJsonSafe<ProjectParticipant[]>(eng.participants, []);
    const existingIdx = participants.findIndex(
      (p) =>
        (p.email && p.email.trim().toLowerCase() === emailNorm) || p.id === user.id
    );

    if (!desiredRole || desiredRole === 'none') {
      if (existingIdx !== -1) {
        participants.splice(existingIdx, 1);
        await prisma.engagement.update({
          where: { id: engId },
          data: { participants: JSON.stringify(participants) }
        });
      }
      // Supprimer aussi de ProjectMember si le projet existe
      await prisma.projectMember
        .deleteMany({
          where: { projectId: engId, userId: user.id }
        })
        .catch(() => {});
    } else {
      const updatedParticipant: ProjectParticipant = {
        id: existingIdx !== -1 ? participants[existingIdx].id : user.id,
        name: user.name,
        email: emailNorm,
        role: desiredRole,
        isLead: desiredRole === 'lead_architect'
      };
      if (existingIdx !== -1) {
        participants[existingIdx] = updatedParticipant;
      } else {
        participants.push(updatedParticipant);
      }
      await prisma.engagement.update({
        where: { id: engId },
        data: { participants: JSON.stringify(participants) }
      });

      // Synchroniser ProjectMember si le Project normalisé existe
      const proj = await prisma.project.findUnique({ where: { id: engId } });
      if (proj) {
        await prisma.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId: engId,
              userId: user.id
            }
          },
          create: {
            projectId: engId,
            userId: user.id,
            role: desiredRole,
            domains: '[]'
          },
          update: {
            role: desiredRole
          }
        });
      }
    }
  }
}

/**
 * Journalise une action d'administration dans la table Resource (type = 'audit:admin_account')
 */
export async function logAdminAccountAction(
  actorEmail: string,
  action: string,
  targetIdentifier: string,
  details: Record<string, any>
): Promise<void> {
  try {
    await prisma.resource.create({
      data: {
        type: 'audit:admin_account',
        identifier: targetIdentifier,
        ownerId: actorEmail,
        tags: JSON.stringify({
          action,
          actorEmail,
          timestamp: new Date().toISOString(),
          ...details
        })
      }
    });
  } catch {
    // Non bloquant
  }
}

export interface CreateCentralizedAccountInput {
  name: string;
  email: string;
  role?: 'admin' | 'user';
  /** Mot de passe initial fixé par l'admin : compte actif tout de suite (aucun e-mail envoyé). */
  initialPassword?: string;
  /** Si true et pas de mot de passe initial, génère un lien d'activation valable 7 jours. */
  generateActivationLink?: boolean;
  /** Rôles dans les espaces : engagementId -> ArchitectRole | 'none' */
  workspaceRoles?: Record<string, ArchitectRole | 'none'>;
  /** Question guidée : « Cette personne doit-elle relire la base de connaissances ? » */
  enableKbReview?: boolean;
  kbHandle?: string;
  kbRoles?: KbRole[];
  ownedDomains?: string[];
  /** Action explicite et journalisée : inscrire ou lier cette personne dans le registre LLMOps */
  registerInLlmops?: boolean;
}

/**
 * Parcours de création guidé unique (fusionne création utilisateur + invitation expert KB + rôles espaces + liaison LLMOps optionnelle)
 */
export async function createCentralizedAccount(
  input: CreateCentralizedAccountInput,
  actorEmail = 'admin@archinex.local',
  client: LLMOpsClient = llmopsClient
): Promise<{
  userId: string;
  email: string;
  invitationToken: string | null;
  invitationUrl: string | null;
  llmopsSync?: {
    attempted: boolean;
    success: boolean;
    handle?: string;
    error?: string;
  };
}> {
  const emailNorm = input.email.trim().toLowerCase();
  const nameTrimmed = input.name.trim();
  const appRole = input.role === 'admin' ? 'admin' : 'user';

  const existingUser = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (existingUser) {
    throw new Error(`Un compte avec l'adresse ${emailNorm} existe déjà.`);
  }

  const withPassword = Boolean(input.initialPassword && input.initialPassword.trim().length >= 6);
  const wantActivationLink = !withPassword && (input.generateActivationLink !== false);

  if (!withPassword && !wantActivationLink) {
    throw new Error(
      'Fournissez un mot de passe initial (6 caractères minimum) ou demandez la génération d’un lien d’activation.'
    );
  }

  const enableKb = Boolean(input.enableKbReview || (input.kbRoles && input.kbRoles.length > 0));
  const rawHandle =
    input.kbHandle && input.kbHandle.trim().length > 0
      ? input.kbHandle
      : `@${emailNorm.split('@')[0].replace(/[^a-z0-9_-]/gi, '-')}`;
  const handleNorm = normalizeKbHandle(rawHandle);

  if (enableKb || wantActivationLink) {
    const existingHandle = await prisma.kbProfile.findUnique({
      where: { kbHandle: handleNorm }
    });
    if (existingHandle) {
      throw new Error(`Le handle ${handleNorm} est déjà attribué à un autre compte.`);
    }
  }

  const token = wantActivationLink ? randomBytes(24).toString('hex') : null;
  const expiresAt = wantActivationLink
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    : null;
  const passwordHash = await bcrypt.hash(
    withPassword ? input.initialPassword!.trim() : randomBytes(32).toString('hex'),
    10
  );

  const kbRolesToSave: KbRole[] = enableKb
    ? input.kbRoles && input.kbRoles.length > 0
      ? input.kbRoles
      : ['kb:review']
    : [];
  const domainsToSave = enableKb ? input.ownedDomains || [] : [];

  const createdUser = await prisma.user.create({
    data: {
      name: nameTrimmed,
      email: emailNorm,
      passwordHash,
      role: appRole,
      attributes: JSON.stringify({
        isActive: true,
        ...(enableKb ? { department: 'Expertise KB', role: 'kb_expert' } : {})
      }),
      ...(enableKb || wantActivationLink
        ? {
            kbProfile: {
              create: {
                kbHandle: handleNorm,
                kbRoles: JSON.stringify(kbRolesToSave),
                ownedDomains: JSON.stringify(domainsToSave),
                delegated: Boolean(enableKb && withPassword),
                invitationToken: token,
                invitationExpiresAt: expiresAt,
                isActive: true
              }
            }
          }
        : {})
    }
  });

  if (input.workspaceRoles && Object.keys(input.workspaceRoles).length > 0) {
    await syncUserWorkspaceRoles(
      { id: createdUser.id, name: createdUser.name, email: createdUser.email },
      input.workspaceRoles
    );
  }

  await logAdminAccountAction(actorEmail, 'ACCOUNT_CREATED', emailNorm, {
    userId: createdUser.id,
    role: appRole,
    enableKbReview: enableKb,
    kbHandle: enableKb ? handleNorm : null,
    activationMode: withPassword ? 'initial_password' : 'activation_link_7d'
  });

  let llmopsSync:
    | { attempted: boolean; success: boolean; handle?: string; error?: string }
    | undefined;

  if (enableKb && input.registerInLlmops) {
    const syncRes = await syncAccountToLlmopsRegistry(
      {
        userId: createdUser.id,
        handle: handleNorm,
        email: emailNorm,
        roles: kbRolesToSave,
        domains: domainsToSave
      },
      actorEmail,
      client
    );
    llmopsSync = {
      attempted: true,
      success: syncRes.success,
      handle: syncRes.handle,
      error: syncRes.error
    };
  }

  return {
    userId: createdUser.id,
    email: createdUser.email,
    invitationToken: token,
    invitationUrl: token ? `/invite?token=${token}` : null,
    llmopsSync
  };
}

export interface UpdateCentralizedAccountInput {
  name?: string;
  email?: string;
  role?: 'admin' | 'user';
  isActive?: boolean;
  newPassword?: string;
  regenerateActivationLink?: boolean;
  workspaceRoles?: Record<string, ArchitectRole | 'none' | null>;
  enableKbReview?: boolean;
  kbHandle?: string;
  kbRoles?: KbRole[];
  ownedDomains?: string[];
}

/**
 * Met à jour la fiche unifiée d'une personne (compte, rôle applicatif, rôles par espace, profil KB local).
 * Ne modifie JAMAIS implicitement le registre LLMOps.
 */
export async function updateCentralizedAccount(
  userId: string,
  input: UpdateCentralizedAccountInput,
  actorEmail = 'admin@archinex.local'
): Promise<{
  userId: string;
  invitationToken: string | null;
  invitationUrl: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { kbProfile: true }
  });
  if (!user) {
    throw new Error('Compte introuvable.');
  }

  const userUpdateData: Record<string, any> = {};
  if (input.name !== undefined && input.name.trim().length >= 2) {
    userUpdateData.name = input.name.trim();
  }
  if (input.email !== undefined && input.email.trim().length > 0) {
    const nextEmail = input.email.trim().toLowerCase();
    if (nextEmail !== user.email.toLowerCase()) {
      const dup = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (dup && dup.id !== userId) {
        throw new Error(`L'adresse ${nextEmail} est déjà utilisée par un autre compte.`);
      }
      userUpdateData.email = nextEmail;
    }
  }
  if (input.role !== undefined) {
    userUpdateData.role = input.role === 'admin' ? 'admin' : 'user';
  }
  if (input.newPassword !== undefined && input.newPassword.trim().length > 0) {
    const trimmedPwd = input.newPassword.trim();
    if (trimmedPwd.length < 6) {
      throw new Error('Le mot de passe doit comporter au moins 6 caractères.');
    }
    userUpdateData.passwordHash = await bcrypt.hash(trimmedPwd, 10);
  }

  const currentAttrs = parseJsonSafe<Record<string, any>>(user.attributes, {});
  if (input.isActive !== undefined) {
    currentAttrs.isActive = input.isActive;
    userUpdateData.attributes = JSON.stringify(currentAttrs);
  }

  if (Object.keys(userUpdateData).length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: userUpdateData
    });
  }

  const effectiveEmail = (userUpdateData.email as string) || user.email;
  const effectiveName = (userUpdateData.name as string) || user.name;

  // Mise à jour ou création du profil KB local / jeton d'activation
  let invitationToken: string | null = user.kbProfile?.invitationToken ?? null;

  const wantKb =
    input.enableKbReview !== undefined
      ? input.enableKbReview
      : Boolean(user.kbProfile && parseJsonSafe<KbRole[]>(user.kbProfile.kbRoles, []).length > 0);

  if (wantKb || input.regenerateActivationLink || user.kbProfile) {
    const desiredHandle = input.kbHandle
      ? normalizeKbHandle(input.kbHandle)
      : user.kbProfile?.kbHandle ||
        normalizeKbHandle(`@${effectiveEmail.split('@')[0].replace(/[^a-z0-9_-]/gi, '-')}`);

    if (!user.kbProfile || desiredHandle !== user.kbProfile.kbHandle) {
      const dupHandle = await prisma.kbProfile.findUnique({
        where: { kbHandle: desiredHandle }
      });
      if (dupHandle && dupHandle.userId !== userId) {
        throw new Error(`Le handle ${desiredHandle} est déjà utilisé par un autre compte.`);
      }
    }

    const nextRoles: KbRole[] = wantKb
      ? input.kbRoles && input.kbRoles.length > 0
        ? input.kbRoles
        : user.kbProfile
          ? parseJsonSafe<KbRole[]>(user.kbProfile.kbRoles, ['kb:review'])
          : ['kb:review']
      : [];

    const nextDomains: string[] = wantKb
      ? input.ownedDomains !== undefined
        ? input.ownedDomains
        : user.kbProfile
          ? parseJsonSafe<string[]>(user.kbProfile.ownedDomains, [])
          : []
      : [];

    let nextToken = user.kbProfile?.invitationToken ?? null;
    let nextExpires = user.kbProfile?.invitationExpiresAt ?? null;
    let nextDelegated = user.kbProfile?.delegated ?? false;

    if (input.newPassword && input.newPassword.trim().length >= 6) {
      // Un mot de passe fixé par l'admin active immédiatement le compte et consomme tout lien en attente
      nextToken = null;
      nextExpires = null;
      nextDelegated = wantKb;
    } else if (input.regenerateActivationLink) {
      nextToken = randomBytes(24).toString('hex');
      nextExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    invitationToken = nextToken;

    if (user.kbProfile) {
      await prisma.kbProfile.update({
        where: { id: user.kbProfile.id },
        data: {
          kbHandle: desiredHandle,
          kbRoles: JSON.stringify(nextRoles),
          ownedDomains: JSON.stringify(nextDomains),
          delegated: nextDelegated,
          invitationToken: nextToken,
          invitationExpiresAt: nextExpires,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
        }
      });
    } else {
      await prisma.kbProfile.create({
        data: {
          userId,
          kbHandle: desiredHandle,
          kbRoles: JSON.stringify(nextRoles),
          ownedDomains: JSON.stringify(nextDomains),
          delegated: Boolean(wantKb && input.newPassword),
          invitationToken: nextToken,
          invitationExpiresAt: nextExpires,
          isActive: input.isActive ?? true
        }
      });
    }
  }

  if (input.workspaceRoles) {
    await syncUserWorkspaceRoles(
      { id: userId, name: effectiveName, email: effectiveEmail },
      input.workspaceRoles
    );
  }

  await logAdminAccountAction(actorEmail, 'ACCOUNT_UPDATED', effectiveEmail, {
    userId,
    updatedFields: Object.keys(input)
  });

  return {
    userId,
    invitationToken,
    invitationUrl: invitationToken ? `/invite?token=${invitationToken}` : null
  };
}

/**
 * Action explicite et journalisée : inscrit ou met à jour l'identité d'une personne
 * dans le registre des responsables LLMOps (PUT /api/knowledge/owners par fusion sans perte)
 * et aligne le KbProfile local.
 */
export async function syncAccountToLlmopsRegistry(
  input: {
    userId?: string;
    handle: string;
    email: string;
    roles: KbRole[];
    domains: string[];
  },
  actorEmail = 'admin@archinex.local',
  client: LLMOpsClient = llmopsClient
): Promise<{
  success: boolean;
  handle: string;
  owners_count: number;
  domains_count: number;
  error?: string;
}> {
  const handleNorm = normalizeKbHandle(input.handle);
  const emailNorm = input.email.trim().toLowerCase();
  const cleanRoles: KbRole[] =
    Array.isArray(input.roles) && input.roles.length > 0 ? input.roles : ['kb:review'];
  const cleanDomains = (input.domains || [])
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);

  let previousHandle: string | undefined;
  let targetUser = input.userId
    ? await prisma.user.findUnique({
        where: { id: input.userId },
        include: { kbProfile: true }
      })
    : await prisma.user.findUnique({
        where: { email: emailNorm },
        include: { kbProfile: true }
      });

  if (targetUser?.kbProfile?.kbHandle) {
    previousHandle = targetUser.kbProfile.kbHandle;
  }

  const res = await client.upsertOwnerInRegistry(
    {
      handle: handleNorm,
      email: emailNorm,
      roles: cleanRoles,
      delegated: true,
      domains: cleanDomains,
      previousHandle
    },
    actorEmail
  );

  if (res.success && targetUser) {
    // Aligner le KbProfile local avec l'identité enregistrée dans LLMOps
    const conflict = await prisma.kbProfile.findUnique({
      where: { kbHandle: handleNorm }
    });
    if (!conflict || conflict.userId === targetUser.id) {
      if (targetUser.kbProfile) {
        await prisma.kbProfile.update({
          where: { id: targetUser.kbProfile.id },
          data: {
            kbHandle: handleNorm,
            kbRoles: JSON.stringify(cleanRoles),
            ownedDomains: JSON.stringify(cleanDomains),
            delegated: true
          }
        });
      } else {
        await prisma.kbProfile.create({
          data: {
            userId: targetUser.id,
            kbHandle: handleNorm,
            kbRoles: JSON.stringify(cleanRoles),
            ownedDomains: JSON.stringify(cleanDomains),
            delegated: true,
            isActive: true
          }
        });
      }
    }
  }

  await logAdminAccountAction(actorEmail, 'LLMOPS_OWNER_SYNCED', emailNorm, {
    userId: targetUser?.id ?? null,
    handle: handleNorm,
    roles: cleanRoles,
    domains: cleanDomains,
    success: res.success,
    error: res.error ?? null
  });

  return res;
}

