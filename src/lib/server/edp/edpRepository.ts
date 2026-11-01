import { prisma } from '../prisma.js';

export class InvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolationError';
  }
}

export class UnauthorizedRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedRoleError';
  }
}

export class FeatureDisabledError extends Error {
  constructor(message: string = 'Fonctionnalité EDP inactive (drapeau ARCHINEX_EXPERIMENTAL_EDP absent).') {
    super(message);
    this.name = 'FeatureDisabledError';
  }
}

export const AUTHORIZED_VALIDATOR_ROLES = new Set([
  'Lead Architect',
  'Domain Expert Architect',
  'Enterprise Architect',
  'Solution Architect',
  'Security Architect'
]);

export interface EdpPackageInput {
  id: string;
  decisionId: string;
  subjectId: string;
  revision?: number;
  status?: 'draft' | 'proposed' | 'validated' | 'stale' | 'retracted';
  content: unknown;
  policyHash: string;
  ontologyRefs?: Array<{ urn: string; revision: number | string }>;
  productionMode?: 'human-authored' | 'llm-proposed-human-approved' | 'llm-derived';
  validatorId?: string;
  validatorRole?: string;
  validatedAt?: Date | string;
  staleReason?: string;
}

export interface TransitionStatusOptions {
  id: string;
  newStatus: 'draft' | 'proposed' | 'validated' | 'stale' | 'retracted';
  userRole?: string;
  userId?: string;
  reason?: string;
}

/**
 * Vérifie si le drapeau expérimental EDP est activé.
 */
export function isEdpFeatureEnabled(): boolean {
  return process.env.ARCHINEX_EXPERIMENTAL_EDP === '1';
}

/**
 * Enregistre ou met à jour un Paquet de Décision Exécutable dans la base (Issue #174).
 */
export async function saveEdpPackage(data: EdpPackageInput) {
  if (!isEdpFeatureEnabled()) {
    throw new FeatureDisabledError();
  }

  // Application de l'Invariant II à la création
  if (data.status === 'validated') {
    if (data.productionMode === 'llm-derived') {
      if (!data.validatorId || !data.validatorRole) {
        throw new InvariantViolationError(
          'Invariant II : Un EDP produit par un LLM (llm-derived) ne peut jamais porter le statut "validated" sans un validateur humain habilité.'
        );
      }
      if (!AUTHORIZED_VALIDATOR_ROLES.has(data.validatorRole)) {
        throw new UnauthorizedRoleError(
          `Invariant VII : Le rôle "${data.validatorRole}" n'est pas habilité à valider un EDP.`
        );
      }
    }
  }

  const contentStr = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
  const ontologyRefsStr = typeof data.ontologyRefs === 'string' ? data.ontologyRefs : JSON.stringify(data.ontologyRefs || []);

  return await (prisma as any).executableDecisionPackage.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      decisionId: data.decisionId,
      subjectId: data.subjectId,
      revision: data.revision ?? 1,
      status: data.status ?? 'draft',
      content: contentStr,
      policyHash: data.policyHash,
      ontologyRefs: ontologyRefsStr,
      productionMode: data.productionMode ?? 'llm-proposed-human-approved',
      validatorId: data.validatorId,
      validatorRole: data.validatorRole,
      validatedAt: data.validatedAt ? new Date(data.validatedAt) : null,
      staleReason: data.staleReason
    },
    update: {
      decisionId: data.decisionId,
      subjectId: data.subjectId,
      revision: data.revision ?? 1,
      status: data.status ?? 'draft',
      content: contentStr,
      policyHash: data.policyHash,
      ontologyRefs: ontologyRefsStr,
      productionMode: data.productionMode ?? 'llm-proposed-human-approved',
      validatorId: data.validatorId,
      validatorRole: data.validatorRole,
      validatedAt: data.validatedAt ? new Date(data.validatedAt) : null,
      staleReason: data.staleReason
    }
  });
}

/**
 * Récupère un EDP par son identifiant.
 */
export async function getEdpPackage(id: string) {
  if (!isEdpFeatureEnabled()) {
    throw new FeatureDisabledError();
  }

  const pkg = await (prisma as any).executableDecisionPackage.findUnique({
    where: { id }
  });

  if (!pkg) return null;

  return {
    ...pkg,
    content: JSON.parse(pkg.content),
    ontologyRefs: JSON.parse(pkg.ontologyRefs)
  };
}

/**
 * Liste les EDP associés à une décision.
 */
export async function listEdpPackagesByDecision(decisionId: string) {
  if (!isEdpFeatureEnabled()) {
    throw new FeatureDisabledError();
  }

  const list = await (prisma as any).executableDecisionPackage.findMany({
    where: { decisionId },
    orderBy: { revision: 'desc' }
  });

  return list.map((pkg: any) => ({
    ...pkg,
    content: JSON.parse(pkg.content),
    ontologyRefs: JSON.parse(pkg.ontologyRefs)
  }));
}

/**
 * Effectue une transition de statut sous contrôle strict des Invariants II et VII (Issue #174).
 */
export async function transitionEdpStatus(options: TransitionStatusOptions) {
  if (!isEdpFeatureEnabled()) {
    throw new FeatureDisabledError();
  }

  const existing = await (prisma as any).executableDecisionPackage.findUnique({
    where: { id: options.id }
  });

  if (!existing) {
    throw new Error(`EDP introuvable : ${options.id}`);
  }

  // Application stricte de l'Invariant II pour toute transition vers 'validated'
  if (options.newStatus === 'validated') {
    if (!options.userRole || !options.userId) {
      throw new InvariantViolationError(
        'Invariant II : La validation d’un EDP exige formellement un validateur humain identifié avec son rôle.'
      );
    }

    if (!AUTHORIZED_VALIDATOR_ROLES.has(options.userRole)) {
      throw new UnauthorizedRoleError(
        `Invariant VII : Le rôle "${options.userRole}" n'a pas l'autorité requise pour homologuer ou valider un EDP.`
      );
    }

    if (existing.productionMode === 'llm-derived' && !options.userId) {
      throw new InvariantViolationError(
        'Invariant II : Un EDP produit par un LLM (llm-derived) ne peut jamais être validé sans un validateur humain identifié.'
      );
    }
  }

  return await (prisma as any).executableDecisionPackage.update({
    where: { id: options.id },
    data: {
      status: options.newStatus,
      validatorId: options.newStatus === 'validated' ? options.userId : existing.validatorId,
      validatorRole: options.newStatus === 'validated' ? options.userRole : existing.validatorRole,
      validatedAt: options.newStatus === 'validated' ? new Date() : existing.validatedAt,
      staleReason: options.newStatus === 'stale' ? options.reason || 'Transition manuelle vers stale' : existing.staleReason
    }
  });
}

/**
 * Rétracte ou passe un EDP à l'état 'stale' lors de la caducité d'un antécédent (Invariant VI - Issue #177).
 */
export async function retractEdpOnAntecedentChange(
  antecedentIdOrUrn: string,
  details?: { oldRevision?: string | number; newRevision?: string | number }
) {
  if (!isEdpFeatureEnabled()) {
    return { affectedCount: 0 };
  }

  const allPackages = await (prisma as any).executableDecisionPackage.findMany({
    where: {
      status: { in: ['proposed', 'validated'] }
    }
  });

  let affectedCount = 0;

  for (const pkg of allPackages) {
    let shouldStale = false;
    let reason = '';

    // 1. Caducité de la décision d'architecture source
    if (pkg.decisionId === antecedentIdOrUrn) {
      shouldStale = true;
      reason = `La décision d'architecture antécédente "${antecedentIdOrUrn}" a été rétractée ou révisée.`;
    }

    // 2. Décalage de révision d'ontologie liée
    const refs: Array<{ urn: string; revision: number | string }> = JSON.parse(pkg.ontologyRefs || '[]');
    const matchingRef = refs.find((r) => r.urn === antecedentIdOrUrn);
    if (matchingRef) {
      shouldStale = true;
      reason = `L'URN d'ontologie liée "${antecedentIdOrUrn}" a évolué vers la révision ${details?.newRevision || 'suivante'} (liée à la révision ${matchingRef.revision}).`;
    }

    if (shouldStale) {
      await (prisma as any).executableDecisionPackage.update({
        where: { id: pkg.id },
        data: {
          status: 'stale',
          staleReason: reason
        }
      });
      affectedCount++;
    }
  }

  return { affectedCount };
}
