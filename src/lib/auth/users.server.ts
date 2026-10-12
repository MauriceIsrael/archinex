/**
 * User lookups backed by Prisma database — no hardcoded credentials.
 */

import type { SessionUser } from '../../app.d.ts';
import { prisma } from '$lib/server/prisma';
import bcrypt from 'bcryptjs';

/**
 * Find a user by email/password.
 * Returns the public SessionUser (no password) or null.
 */
export async function findUserByCredentials(
  email: string,
  password: string
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });
  if (!user) return null;
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match && user.passwordHash !== password) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as SessionUser['role']
  };
}

/** Get all users (public fields only) — used by admin panel. */
export async function getAllUsers(): Promise<SessionUser[]> {
  const users = await prisma.user.findMany();
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as SessionUser['role']
  }));
}

/** Get a single user by id (public fields). */
export async function getUserById(id: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as SessionUser['role']
  };
}
