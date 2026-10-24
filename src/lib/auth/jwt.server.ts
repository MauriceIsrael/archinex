/**
 * JWT utilities — server-side only.
 *
 * Uses `jose` (Web Crypto API, edge-compatible).
 * Algorithm: HS256 (symmetric — suitable for same-server auth).
 *
 * @alternative Auth.js v5
 *   Replace this file entirely with @auth/sveltekit.
 *   The session shape in app.d.ts remains the same.
 *
 * Environment variables required:
 *   JWT_SECRET      — min 32-char random string (openssl rand -hex 32)
 *   (fallback to a dev secret if not set in non-production — NEVER use in production)
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { SessionUser } from '../../app.d.ts';

export const DEV_FALLBACK_JWT_SECRET = 'dev-secret-change-me-in-production-min-32-chars!!';

export const KNOWN_INSECURE_JWT_SECRETS = [
  'archinex-super-secret-production-jwt-key-2026',
  'dev-secret-change-me-in-production-min-32-chars!!',
  'change-me-min-32-chars-random-string-000',
  'archinex-super-secret-key-change-in-production',
  'ci-only-secret-not-used-anywhere-else-0123456789',
] as const;

export class InsecureJwtSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsecureJwtSecretError';
  }
}

export interface JwtSecretValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valide la conformité de JWT_SECRET :
 * En production (NODE_ENV=production), le secret est obligatoire, doit faire au moins 32 caractères
 * et ne doit correspondre à aucune des valeurs publiques d'exemple ou de développement (#141).
 */
export function validateJwtSecret(
  secret: string | undefined = process.env.JWT_SECRET,
  nodeEnv: string = process.env.NODE_ENV ?? 'development'
): JwtSecretValidationResult {
  const isProduction = nodeEnv === 'production';
  const trimmed = secret?.trim();

  if (!trimmed) {
    if (isProduction) {
      return {
        valid: false,
        error:
          "JWT_SECRET est absent en production. Vous devez définir un secret aléatoire fort d'au moins 32 caractères (ex. `openssl rand -hex 32`) via la variable d'environnement JWT_SECRET ou un gestionnaire de secrets (--set-secrets JWT_SECRET=archinex-jwt-secret:latest)."
      };
    }
    return { valid: true };
  }

  if (trimmed.length < 32) {
    if (isProduction) {
      return {
        valid: false,
        error: `JWT_SECRET est trop court (${trimmed.length} caractères, minimum 32 requis en production). Générez un secret aléatoire fort avec \`openssl rand -hex 32\`.`
      };
    }
  }

  if (isProduction) {
    const isKnownInsecure = KNOWN_INSECURE_JWT_SECRETS.some(
      (known) => known.toLowerCase() === trimmed.toLowerCase()
    );
    if (isKnownInsecure) {
      return {
        valid: false,
        error: `JWT_SECRET utilise une valeur publique connue et non sécurisée ("${trimmed}"). Générez un secret aléatoire propre d'au moins 32 caractères avec \`openssl rand -hex 32\` et injectez-le via votre gestionnaire de secrets (ex. Cloud Run : --set-secrets JWT_SECRET=archinex-jwt-secret:latest).`
      };
    }
  }

  return { valid: true };
}

/**
 * Lève InsecureJwtSecretError si JWT_SECRET est invalide en production.
 */
export function assertValidJwtSecret(
  secret: string | undefined = process.env.JWT_SECRET,
  nodeEnv: string = process.env.NODE_ENV ?? 'development'
): void {
  const result = validateJwtSecret(secret, nodeEnv);
  if (!result.valid) {
    throw new InsecureJwtSecretError(result.error!);
  }
}

let cachedRawSecret: string | undefined = undefined;
let cachedEnv: string | undefined = undefined;
let cachedKey: Uint8Array | null = null;

export function getJwtSecretKey(
  secretOverride?: string,
  nodeEnvOverride?: string
): Uint8Array {
  const secret = secretOverride ?? process.env.JWT_SECRET;
  const env = nodeEnvOverride ?? process.env.NODE_ENV ?? 'development';

  if (
    secretOverride === undefined &&
    nodeEnvOverride === undefined &&
    cachedKey &&
    cachedRawSecret === secret &&
    cachedEnv === env
  ) {
    return cachedKey;
  }

  assertValidJwtSecret(secret, env);

  const effectiveSecret = secret?.trim() || DEV_FALLBACK_JWT_SECRET;
  const key = new TextEncoder().encode(effectiveSecret);

  if (secretOverride === undefined && nodeEnvOverride === undefined) {
    cachedRawSecret = secret;
    cachedEnv = env;
    cachedKey = key;
  }

  return key;
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

export type AccessTokenPayload = JWTPayload & {
  sub: string;        // user id
  email: string;
  name: string;
  role: string;
  image?: string;
};

/**
 * Sign a short-lived access token (15 min).
 */
export async function signAccessToken(
  user: SessionUser,
  secretOverride?: string,
  nodeEnvOverride?: string
): Promise<string> {
  const key = getJwtSecretKey(secretOverride, nodeEnvOverride);
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    image: user.image,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(key);
}

/**
 * Sign a long-lived refresh token (7 days).
 * Only stores the user id — minimal surface area.
 */
export async function signRefreshToken(
  userId: string,
  secretOverride?: string,
  nodeEnvOverride?: string
): Promise<string> {
  const key = getJwtSecretKey(secretOverride, nodeEnvOverride);
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(key);
}

/**
 * Verify and decode an access token.
 * Returns the typed payload or null if invalid/expired.
 */
export async function verifyAccessToken(
  token: string,
  secretOverride?: string,
  nodeEnvOverride?: string
): Promise<AccessTokenPayload | null> {
  const key = getJwtSecretKey(secretOverride, nodeEnvOverride);
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verify a refresh token and return the user id (sub) or null.
 */
export async function verifyRefreshToken(
  token: string,
  secretOverride?: string,
  nodeEnvOverride?: string
): Promise<string | null> {
  const key = getJwtSecretKey(secretOverride, nodeEnvOverride);
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.type !== 'refresh' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
