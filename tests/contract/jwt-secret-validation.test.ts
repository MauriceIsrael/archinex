import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validateJwtSecret,
  assertValidJwtSecret,
  InsecureJwtSecretError,
  KNOWN_INSECURE_JWT_SECRETS,
  DEV_FALLBACK_JWT_SECRET,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getJwtSecretKey,
} from '$lib/auth/jwt.server';
import { SignJWT } from 'jose';

describe('Validation et Sécurité de JWT_SECRET (Issue #141)', () => {
  const validProductionSecret = 'c0a80101f3e74b5c89a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2';
  const dummyUser = {
    id: 'usr_test_123',
    email: 'admin@example.org',
    name: 'Admin Test',
    role: 'admin' as const,
  };

  describe('validateJwtSecret & assertValidJwtSecret en production', () => {
    it('refuse le démarrage si JWT_SECRET est absent en production', () => {
      const resultUnset = validateJwtSecret(undefined, 'production');
      expect(resultUnset.valid).toBe(false);
      expect(resultUnset.error).toContain('JWT_SECRET est absent en production');

      const resultEmpty = validateJwtSecret('', 'production');
      expect(resultEmpty.valid).toBe(false);
      expect(resultEmpty.error).toContain('JWT_SECRET est absent en production');

      const resultWhitespace = validateJwtSecret('   ', 'production');
      expect(resultWhitespace.valid).toBe(false);
      expect(resultWhitespace.error).toContain('JWT_SECRET est absent en production');

      expect(() => assertValidJwtSecret(undefined, 'production')).toThrow(InsecureJwtSecretError);
    });

    it('refuse le démarrage si JWT_SECRET fait moins de 32 caractères en production', () => {
      const shortSecret = 'court-moins-de-32-chars';
      const result = validateJwtSecret(shortSecret, 'production');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('trop court');
      expect(result.error).toContain('minimum 32 requis');

      expect(() => assertValidJwtSecret(shortSecret, 'production')).toThrow(InsecureJwtSecretError);
    });

    it('refuse chacune des valeurs publiques connues en production', () => {
      for (const knownInsecure of KNOWN_INSECURE_JWT_SECRETS) {
        const result = validateJwtSecret(knownInsecure, 'production');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('valeur publique connue et non sécurisée');

        expect(() => assertValidJwtSecret(knownInsecure, 'production')).toThrow(InsecureJwtSecretError);
        expect(() => assertValidJwtSecret(knownInsecure.toUpperCase(), 'production')).toThrow(InsecureJwtSecretError);
      }
    });

    it('accepte un secret fort et aléatoire de 32+ caractères en production', () => {
      const result = validateJwtSecret(validProductionSecret, 'production');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();

      expect(() => assertValidJwtSecret(validProductionSecret, 'production')).not.toThrow();
    });

    it('autorise le repli de développement hors production', () => {
      const devResult = validateJwtSecret(undefined, 'development');
      expect(devResult.valid).toBe(true);

      const testResult = validateJwtSecret(undefined, 'test');
      expect(testResult.valid).toBe(true);
    });
  });

  describe('Rejet des sessions signées avec les anciennes clés publiques', () => {
    it("refuse un jeton forgé avec l'ancienne clé du Dockerfile", async () => {
      const dockerfileSecret = new TextEncoder().encode('archinex-super-secret-production-jwt-key-2026');
      const forgedToken = await new SignJWT({
        email: 'attacker@hacker.net',
        name: 'Attacker Admin',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('usr_attacker')
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(dockerfileSecret);

      // Vérifié avec un secret de production valide
      const verified = await verifyAccessToken(forgedToken, validProductionSecret, 'production');
      expect(verified).toBeNull();
    });

    it('refuse un jeton forgé avec la clé de repli de dev', async () => {
      const devSecret = new TextEncoder().encode(DEV_FALLBACK_JWT_SECRET);
      const forgedToken = await new SignJWT({
        email: 'attacker@hacker.net',
        name: 'Attacker Admin',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('usr_attacker')
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(devSecret);

      const verified = await verifyAccessToken(forgedToken, validProductionSecret, 'production');
      expect(verified).toBeNull();
    });

    it('signe et vérifie avec succès un jeton quand un secret valide est configuré', async () => {
      const token = await signAccessToken(dummyUser, validProductionSecret, 'production');
      expect(typeof token).toBe('string');

      const verified = await verifyAccessToken(token, validProductionSecret, 'production');
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe(dummyUser.id);
      expect(verified?.email).toBe(dummyUser.email);
      expect(verified?.role).toBe('admin');
    });

    it('signe et vérifie un refresh token valide et refuse un refresh token signé avec la mauvaise clé', async () => {
      const refreshToken = await signRefreshToken(dummyUser.id, validProductionSecret, 'production');
      const verifiedUserId = await verifyRefreshToken(refreshToken, validProductionSecret, 'production');
      expect(verifiedUserId).toBe(dummyUser.id);

      // Mauvaise clé
      const otherSecret = 'another-random-32-chars-secret-key-9999999';
      const rejectedUserId = await verifyRefreshToken(refreshToken, otherSecret, 'production');
      expect(rejectedUserId).toBeNull();
    });

    it('bloque la signature en production si le secret est manquant ou public', async () => {
      await expect(
        signAccessToken(dummyUser, 'archinex-super-secret-production-jwt-key-2026', 'production')
      ).rejects.toThrow(InsecureJwtSecretError);

      await expect(
        signAccessToken(dummyUser, undefined, 'production')
      ).rejects.toThrow(InsecureJwtSecretError);
    });
  });

  describe('Conformité statique Dockerfile et docker-entrypoint.sh', () => {
    it('le Dockerfile ne définit aucune valeur par défaut pour JWT_SECRET', () => {
      const dockerfileContent = readFileSync('Dockerfile', 'utf-8');
      expect(dockerfileContent).not.toContain('archinex-super-secret-production-jwt-key-2026');
      expect(dockerfileContent).not.toContain('ENV JWT_SECRET');
    });

    it("docker-entrypoint.sh contient la vérification d'invalidation de JWT_SECRET", () => {
      const entrypointContent = readFileSync('docker-entrypoint.sh', 'utf-8');
      expect(entrypointContent).toContain('JWT_SECRET');
      expect(entrypointContent).toContain('archinex-super-secret-production-jwt-key-2026');
      expect(entrypointContent).toContain('openssl rand -hex 32');
      expect(entrypointContent).toContain('exit 1');
    });
  });
});
