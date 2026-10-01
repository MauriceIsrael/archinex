import { json, error } from '@sveltejs/kit';
import { requireRole } from '$lib/auth/guard.server';
import { updateKbExpert, deleteKbExpert, getKbExpertByUserId } from '$lib/server/kbProfilesDb';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const UpdateExpertSchema = z.object({
  name: z.string().min(2).optional(),
  kbHandle: z.string().min(2).optional(),
  kbRoles: z
    .array(z.enum(['kb:review', 'kb:evaluate', 'kb:maintain', 'kb:admin']))
    .min(1)
    .optional(),
  ownedDomains: z.array(z.string()).optional(),
  isActive: z.boolean().optional()
});

/**
 * PATCH /api/admin/experts/[id] — Mettre à jour un expert KB (Admin uniquement)
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireRole(locals, 'admin');

  const userId = params.id;
  if (!userId) {
    throw error(400, { message: 'ID utilisateur manquant' });
  }

  const body = await request.json();
  const parsed = UpdateExpertSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw error(400, { message: msg });
  }

  try {
    const updated = await updateKbExpert(userId, parsed.data, locals.session!.user.email);
    return json({
      status: 'ok',
      data: updated
    });
  } catch (err: any) {
    throw error(400, { message: err.message || 'Mise à jour impossible' });
  }
};

/**
 * DELETE /api/admin/experts/[id] — Supprimer un expert KB (Admin uniquement)
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  requireRole(locals, 'admin');

  const userId = params.id;
  if (!userId) {
    throw error(400, { message: 'ID utilisateur manquant' });
  }

  const existing = await getKbExpertByUserId(userId);
  if (!existing) {
    throw error(404, { message: 'Expert introuvable' });
  }

  await deleteKbExpert(userId);

  return json({
    status: 'ok',
    data: { success: true }
  });
};
