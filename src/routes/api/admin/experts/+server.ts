import { json, error } from '@sveltejs/kit';
import { requireRole } from '$lib/auth/guard.server';
import { listKbExperts, inviteKbExpert } from '$lib/server/kbProfilesDb';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const InviteExpertSchema = z.object({
  name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  kbHandle: z.string().min(2, 'Le handle doit comporter au moins 2 caractères'),
  kbRoles: z
    .array(z.enum(['kb:review', 'kb:evaluate', 'kb:maintain', 'kb:admin']))
    .min(1, 'Au moins un rôle KB est requis'),
  ownedDomains: z.array(z.string()).default([])
});

/**
 * GET /api/admin/experts — Liste des experts KB (Admin uniquement)
 */
export const GET: RequestHandler = async ({ locals }) => {
  requireRole(locals, 'admin');

  const experts = await listKbExperts();
  return json({
    status: 'ok',
    data: experts
  });
};

/**
 * POST /api/admin/experts — Inviter un nouvel expert KB avec jeton 7 jours
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireRole(locals, 'admin');

  const body = await request.json();
  const parsed = InviteExpertSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw error(400, { message: msg });
  }

  try {
    const result = await inviteKbExpert(parsed.data);
    return json(
      {
        status: 'ok',
        data: result
      },
      { status: 201 }
    );
  } catch (err: any) {
    throw error(400, { message: err.message || 'Impossible d’inviter cet expert' });
  }
};
