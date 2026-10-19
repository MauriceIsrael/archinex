import bcrypt from 'bcryptjs';

/**
 * Vérifie un mot de passe contre le hash bcrypt stocké. Aucun repli : la valeur stockée n'est pas un mot de passe
 * valable (un hash fuité ne doit pas ouvrir la session, archinex#137), et un hash qui n'est pas du bcrypt ne correspond à rien.
 */
export async function verifyPassword(password: unknown, passwordHash: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length === 0) return false;
  return bcrypt.compare(password, passwordHash);
}
