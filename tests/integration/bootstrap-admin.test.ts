import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaClient, type PrismaClient } from '../../src/lib/server/prismaFactory';
import { bootstrapAdmin } from '../../prisma/bootstrap-admin';

// Premier administrateur d'une installation neuve (docker-entrypoint.sh) : sans lui, personne ne peut se connecter,
// et le seed de démonstration (mots de passe publics) n'est plus lancé par défaut.
describe('bootstrapAdmin', () => {
  let dir: string;
  let prisma: PrismaClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'archinex-bootstrap-'));
    const file = join(dir, 'test.db');
    const db = new Database(file);
    db.exec(`CREATE TABLE "users" (
      "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'user', "attributes" TEXT NOT NULL DEFAULT '{}',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
      CREATE UNIQUE INDEX "users_email_key" ON "users"("email");`);
    db.close();
    prisma = createPrismaClient(`file:${file}`);
  });
  afterEach(async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it('ne crée aucun compte sans adresse', async () => {
    expect(await bootstrapAdmin(prisma, {})).toEqual({ status: 'skipped' });
    expect(await prisma.user.count()).toBe(0);
  });

  it('crée l’administrateur avec le mot de passe fourni, haché, adresse normalisée', async () => {
    const r = await bootstrapAdmin(prisma, {
      ARCHINEX_BOOTSTRAP_ADMIN_EMAIL: '  Boss@Exemple.ORG ',
      ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD: 'un-mot-de-passe-solide'
    });
    expect(r).toEqual({ status: 'created', email: 'boss@exemple.org', generatedPassword: undefined });
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'boss@exemple.org' } });
    expect(u.role).toBe('admin');
    expect(u.passwordHash).not.toContain('un-mot-de-passe-solide');
    expect(await bcrypt.compare('un-mot-de-passe-solide', u.passwordHash)).toBe(true);
  });

  it('génère un mot de passe fort quand aucun n’est fourni, et il ouvre le compte', async () => {
    const r = await bootstrapAdmin(prisma, { ARCHINEX_BOOTSTRAP_ADMIN_EMAIL: 'boss@exemple.org' });
    expect(r.status).toBe('created');
    const pw = (r as { generatedPassword?: string }).generatedPassword!;
    expect(pw.length).toBeGreaterThanOrEqual(20);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'boss@exemple.org' } });
    expect(await bcrypt.compare(pw, u.passwordHash)).toBe(true);
  });

  it('refuse un mot de passe trop court et une adresse invalide, sans rien créer', async () => {
    await expect(
      bootstrapAdmin(prisma, { ARCHINEX_BOOTSTRAP_ADMIN_EMAIL: 'boss@exemple.org', ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD: 'court' })
    ).rejects.toThrow(/12 caractères/);
    await expect(bootstrapAdmin(prisma, { ARCHINEX_BOOTSTRAP_ADMIN_EMAIL: 'pas-une-adresse' })).rejects.toThrow(/adresse valide/);
    expect(await prisma.user.count()).toBe(0);
  });

  it('est idempotent : un administrateur existant n’est ni recréé ni modifié', async () => {
    const env = { ARCHINEX_BOOTSTRAP_ADMIN_EMAIL: 'boss@exemple.org', ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD: 'un-mot-de-passe-solide' };
    await bootstrapAdmin(prisma, env);
    const before = await prisma.user.findUniqueOrThrow({ where: { email: 'boss@exemple.org' } });
    expect(await bootstrapAdmin(prisma, { ...env, ARCHINEX_BOOTSTRAP_ADMIN_EMAIL: 'autre@exemple.org' })).toEqual({ status: 'exists' });
    expect(await prisma.user.count()).toBe(1);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: 'boss@exemple.org' } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('promeut une adresse déjà inscrite sans toucher à son mot de passe', async () => {
    const hash = await bcrypt.hash('mot-de-passe-existant', 4);
    await prisma.user.create({ data: { name: 'Déjà là', email: 'boss@exemple.org', passwordHash: hash, role: 'user' } });
    expect(await bootstrapAdmin(prisma, { ARCHINEX_BOOTSTRAP_ADMIN_EMAIL: 'boss@exemple.org' })).toEqual({
      status: 'promoted',
      email: 'boss@exemple.org'
    });
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'boss@exemple.org' } });
    expect(u.role).toBe('admin');
    expect(u.passwordHash).toBe(hash);
  });
});
