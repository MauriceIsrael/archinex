import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/server/prisma';
import { verifyPassword } from '../../src/lib/auth/password.server';
import { POST as login } from '../../src/routes/api/auth/login/+server';

// archinex#137 : le hash stocké n'est pas un mot de passe. Qui lit users.passwordHash ne doit pas pouvoir se connecter en le soumettant.
describe('Login : aucun repli « texte clair »', () => {
  const email = `login.sansrepli.${Date.now()}@exemple.org`;
  const password = 'un-vrai-mot-de-passe';
  let hash: string;
  let userId: string;

  beforeAll(async () => {
    hash = await bcrypt.hash(password, 4);
    userId = (await prisma.user.create({ data: { email, name: 'Test login', role: 'user', passwordHash: hash } })).id;
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  const attempt = async (pw: unknown) => {
    const cookies = { set: () => undefined } as never;
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });
    return login({ request, cookies, url: new URL(request.url) } as never);
  };

  it('accepte le bon mot de passe', async () => {
    expect((await attempt(password)).status).toBe(200);
  });

  it('refuse le hash bcrypt lui-même', async () => {
    expect((await attempt(hash)).status).toBe(401);
  });

  it('refuse un mauvais mot de passe', async () => {
    expect((await attempt('autre')).status).toBe(401);
  });

  it('refuse un mot de passe qui n’est pas une chaîne', async () => {
    expect((await attempt(['x'])).status).not.toBe(200);
  });

  it('verifyPassword : un « hash » qui n’est pas du bcrypt ne correspond à rien, même en clair', async () => {
    expect(await verifyPassword('h', 'h')).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
    expect(await verifyPassword(undefined, hash)).toBe(false);
    expect(await verifyPassword(password, hash)).toBe(true);
  });
});
