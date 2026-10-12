import { json, error } from '@sveltejs/kit';
import { requireRole } from '$lib/auth/guard.server';
import { syncAccountToLlmopsRegistry } from '$lib/server/accountsAdmin';
import { llmopsClient } from '$lib/server/llmops/client';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const SyncOwnerSchema = z.object({
  userId: z.string().optional(),
  handle: z.string().min(2, 'Le handle doit comporter au moins 2 caractères'),
  email: z.string().email('Adresse e-mail invalide'),
  roles: z
    .array(z.enum(['kb:review', 'kb:evaluate', 'kb:maintain', 'kb:admin']))
    .min(1, 'Au moins un rôle KB est requis'),
  domains: z.array(z.string()).default([])
});

/**
 * GET /api/admin/llmops-owners — Lit le registre des responsables dans LLMOps
 */
export const GET: RequestHandler = async ({ locals }) => {
  requireRole(locals, 'admin');
  const actorEmail = locals.session?.user?.email;
  const registry = await llmopsClient.getOwners(actorEmail);
  return json({
    status: 'ok',
    data: registry
  });
};

/**
 * POST /api/admin/llmops-owners — Action explicite et journalisée pour inscrire ou mettre à jour
 * l'identité d'une personne dans le registre des responsables LLMOps (sans écraser les autres entrées).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireRole(locals, 'admin');
  const actorEmail = locals.session?.user?.email || 'admin@archinex.local';

  const body = await request.json().catch(() => ({}));
  const parsed = SyncOwnerSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw error(400, { message: msg });
  }

  const res = await syncAccountToLlmopsRegistry(parsed.data, actorEmail);
  if (!res.success) {
    throw error(res.error?.includes('injoignable') ? 503 : 400, {
      message: res.error || 'Échec de la mise à jour du registre LLMOps'
    });
  }

  return json({
    status: 'ok',
    data: res
  });
};

