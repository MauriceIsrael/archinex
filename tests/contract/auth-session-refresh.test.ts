import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '$lib/server/prisma';
import { getUserById, findUserByCredentials, getAllUsers } from '$lib/auth/users.server';
import { signRefreshToken, verifyRefreshToken, verifyAccessToken } from '$lib/auth/jwt.server';
import { POST as refreshHandler } from '../../src/routes/api/auth/refresh/+server';
import bcrypt from 'bcryptjs';

describe('Auth & Session Refresh (#80)', () => {
  it('aucun compte ni mot de passe en clair codé en dur dans users.server.ts', () => {
    const content = readFileSync('src/lib/auth/users.server.ts', 'utf-8');
    expect(content).not.toContain('admin123');
    expect(content).not.toContain('user123');
    expect(content).not.toContain('usr_admin_001');
    expect(content).not.toContain('usr_user_002');
  });

  it('retrouve un utilisateur existant en base Prisma via getUserById', async () => {
    // Création d'un utilisateur de test temporaire
    const testEmail = `test-refresh-${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    const created = await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Test Refresh User',
        passwordHash,
        role: 'user'
      }
    });

    try {
      const fetched = await getUserById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.email).toBe(testEmail);
      expect(fetched?.name).toBe('Test Refresh User');
      expect(fetched?.role).toBe('user');

      // Test findUserByCredentials avec mot de passe valide
      const authenticated = await findUserByCredentials(testEmail, 'Secret123!');
      expect(authenticated).not.toBeNull();
      expect(authenticated?.id).toBe(created.id);

      // Test findUserByCredentials avec mauvais mot de passe
      const failed = await findUserByCredentials(testEmail, 'WrongPassword');
      expect(failed).toBeNull();

      // Test rotation de refresh token via la route /api/auth/refresh
      const refreshToken = await signRefreshToken(created.id);
      const cookiesStore = new Map<string, any>();
      cookiesStore.set('refreshToken', refreshToken);

      const fakeCookies = {
        get: (name: string) => cookiesStore.get(name),
        set: (name: string, val: string, opts: any) => { cookiesStore.set(name, val); },
        delete: (name: string) => { cookiesStore.delete(name); }
      };

      const response = await refreshHandler({
        cookies: fakeCookies as any,
        request: new Request('http://localhost/api/auth/refresh', { method: 'POST' }),
        params: {},
        url: new URL('http://localhost/api/auth/refresh'),
        route: { id: '/api/auth/refresh' }
      } as any);

      expect(response.status).toBe(200);
      const newAccessToken = cookiesStore.get('accessToken');
      expect(newAccessToken).toBeDefined();

      const verified = await verifyAccessToken(newAccessToken);
      expect(verified?.sub).toBe(created.id);
      expect(verified?.email).toBe(testEmail);
    } finally {
      await prisma.user.delete({ where: { id: created.id } }).catch(() => {});
    }
  });
});
