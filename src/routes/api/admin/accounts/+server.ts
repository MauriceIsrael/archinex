import { json, error } from '@sveltejs/kit';
import { requireRole } from '$lib/auth/guard.server';
import { prisma } from '$lib/server/prisma';
import {
  loadCentralizedAccountsView,
  createCentralizedAccount,
  updateCentralizedAccount,
  logAdminAccountAction
} from '$lib/server/accountsAdmin';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const KbRoleEnum = z.enum(['kb:review', 'kb:evaluate', 'kb:maintain', 'kb:admin']);
const ArchitectRoleOrNoneEnum = z.enum([
  'lead_architect',
  'infra_expert_architect',
  'security_architect',
  'domain_architect',
  'data_architect',
  'none'
]);

const CreateAccountSchema = z.object({
  name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
  email: z.string().email('Adresse e-mail invalide'),
  role: z.enum(['admin', 'user']).optional().default('user'),
  initialPassword: z.string().optional(),
  generateActivationLink: z.boolean().optional().default(true),
  workspaceRoles: z.record(z.string(), ArchitectRoleOrNoneEnum).optional().default({}),
  enableKbReview: z.boolean().optional().default(false),
  kbHandle: z.string().optional(),
  kbRoles: z.array(KbRoleEnum).optional(),
  ownedDomains: z.array(z.string()).optional(),
  registerInLlmops: z.boolean().optional().default(false)
});

const UpdateAccountSchema = z.object({
  id: z.string().min(1, 'Identifiant du compte requis'),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
  newPassword: z
    .string()
    .refine((val) => !val || val.trim().length >= 6, {
      message: 'Le mot de passe doit comporter au moins 6 caractères'
    })
    .optional(),
  regenerateActivationLink: z.boolean().optional(),
  workspaceRoles: z.record(z.string(), ArchitectRoleOrNoneEnum.nullable()).optional(),
  enableKbReview: z.boolean().optional(),
  kbHandle: z.string().optional(),
  kbRoles: z.array(KbRoleEnum).optional(),
  ownedDomains: z.array(z.string()).optional()
});

/**
 * GET /api/admin/accounts — Vue centralisée des comptes, espaces et registre LLMOps
 */
export const GET: RequestHandler = async ({ locals }) => {
  requireRole(locals, 'admin');
  const actorEmail = locals.session?.user?.email;
  const view = await loadCentralizedAccountsView(actorEmail);
  return json({
    status: 'ok',
    data: view
  });
};

/**
 * POST /api/admin/accounts — Création guidée unifiée d'un compte
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireRole(locals, 'admin');
  const actorEmail = locals.session?.user?.email || 'admin@archinex.local';

  const body = await request.json().catch(() => ({}));
  const parsed = CreateAccountSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw error(400, { message: msg });
  }

  try {
    const result = await createCentralizedAccount(parsed.data, actorEmail);
    return json(
      {
        status: 'ok',
        data: result
      },
      { status: 201 }
    );
  } catch (err: any) {
    throw error(400, { message: err.message || 'Impossible de créer le compte' });
  }
};

/**
 * PATCH /api/admin/accounts — Mise à jour unifiée d'un compte (compte, rôle applicatif, rôles espaces, profil KB local)
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  requireRole(locals, 'admin');
  const actorEmail = locals.session?.user?.email || 'admin@archinex.local';

  const body = await request.json().catch(() => ({}));
  const parsed = UpdateAccountSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw error(400, { message: msg });
  }

  const { id, ...updates } = parsed.data;
  try {
    const result = await updateCentralizedAccount(id, updates, actorEmail);
    return json({
      status: 'ok',
      data: result
    });
  } catch (err: any) {
    throw error(400, { message: err.message || 'Impossible de mettre à jour le compte' });
  }
};

/**
 * DELETE /api/admin/accounts?id=xxx — Suppression d'un compte
 */
export const DELETE: RequestHandler = async ({ url, locals }) => {
  requireRole(locals, 'admin');
  const actorEmail = locals.session?.user?.email || 'admin@archinex.local';

  const id = url.searchParams.get('id');
  if (!id) {
    throw error(400, { message: 'Identifiant du compte manquant' });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw error(404, { message: 'Compte introuvable' });
  }

  await prisma.user.delete({ where: { id } });
  await logAdminAccountAction(actorEmail, 'ACCOUNT_DELETED', user.email, { userId: id });

  return json({
    status: 'ok',
    data: { success: true }
  });
};

