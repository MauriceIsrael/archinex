import { requireRole } from '$lib/auth/guard.server';
import { prisma } from '$lib/server/prisma';
import { listKbExperts } from '$lib/server/kbProfilesDb';
import type { PageServerLoad } from './$types';

/**
 * Admin Load — RBAC protected user and expert list.
 */
export const load: PageServerLoad = async ({ locals }) => {
  // Enforce role
  requireRole(locals, 'admin');

  // Fetch all users from DB
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });

  // Fetch KB experts
  const experts = await listKbExperts();

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      // @ts-ignore
      attributes: JSON.parse(u.attributes || '{}')
    })),
    experts
  };
};

