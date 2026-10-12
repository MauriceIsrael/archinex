import { redirect, error } from '@sveltejs/kit';
import type { UserRole, Session } from '../../app.d.ts';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 1,
  admin: 2,
};

/**
 * Ensure the request is authenticated.
 */
export function requireAuth(
  locals: App.Locals,
  redirectTo = '/login'
): asserts locals is App.Locals & { session: Session } {
  if (!locals.session) {
    redirect(302, redirectTo);
  }
}

/**
 * Ensure the user has at least the required role.
 */
export function requireRole(locals: App.Locals, requiredRole: UserRole): void {
  requireAuth(locals);
  const userLevel = ROLE_HIERARCHY[locals.session!.user.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  if (userLevel < requiredLevel) {
    error(403, { message: 'Insufficient permissions' });
  }
}

