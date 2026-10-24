import { verifyAccessToken, verifyRefreshToken, signAccessToken, signRefreshToken, assertValidJwtSecret } from '$lib/auth/jwt.server';
import type { Handle, ServerInit } from '@sveltejs/kit';
import type { Session } from './app.d.ts';
import { prisma } from '$lib/server/prisma';

export const init: ServerInit = async () => {
  if (process.env.NODE_ENV === 'production') {
    assertValidJwtSecret();
  }
};

const SESSION_REQUIRED_PREFIXES = ['/api/knowledge/', '/api/frameworks/'];

export function requiresSession(pathname: string): boolean {
  if (pathname.includes('/bundle-export') || pathname.includes('/export-bundle')) {
    return true;
  }
  return SESSION_REQUIRED_PREFIXES.some((p) => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
  const accessToken = event.cookies.get('accessToken');
  let session: Session | null = null;

  try {
    if (accessToken) {
      const payload = await verifyAccessToken(accessToken);
      if (payload && payload.sub) {
        // Fetch fresh user data + ABAC attributes from DB
        const user = await prisma.user.findUnique({
          where: { id: payload.sub }
        });

        if (user) {
          session = {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role as 'admin' | 'user',
              // @ts-ignore
              attributes: JSON.parse(user.attributes || '{}'),
            },
            expires: new Date((payload.exp ?? 0) * 1000).toISOString(),
          };
        }
      }
    }

    // Renouvellement automatique transparent si l'accessToken est expiré ou absent mais que le refreshToken est valide
    if (!session) {
      const refreshToken = event.cookies.get('refreshToken');
      if (refreshToken) {
        const userId = await verifyRefreshToken(refreshToken);
        if (userId) {
          const user = await prisma.user.findUnique({
            where: { id: userId }
          });

          if (user) {
            const [newAccessToken, newRefreshToken] = await Promise.all([
              signAccessToken({
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role as 'admin' | 'user',
              }),
              signRefreshToken(user.id),
            ]);

            const cookieOpts = {
              path: '/',
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax' as const,
            };

            event.cookies.set('accessToken', newAccessToken, {
              ...cookieOpts,
              maxAge: 60 * 15,
            });
            event.cookies.set('refreshToken', newRefreshToken, {
              ...cookieOpts,
              maxAge: 60 * 60 * 24 * 7,
            });

            session = {
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role as 'admin' | 'user',
                // @ts-ignore
                attributes: JSON.parse(user.attributes || '{}'),
              },
              expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            };
          }
        }
      }
    }
  } catch (err) {
    console.error('[Hook Error] Session population failed:', err);
    // Continue without session if DB is down or error occurred
  }

  event.locals.session = session;

  // Les routes qui parlent à LLMOps au nom d'un expert exigent une session : l'identité envoyée à LLMOps
  // (X-Actor-Email) vient de cette session et d'elle seule, jamais d'un en-tête fourni par le navigateur.
  if (!session && requiresSession(event.url.pathname)) {
    return new Response(
      JSON.stringify({ status: 'error', error: 'Non authentifié : session requise' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const response = await resolve(event);
  return response;
};

export const handleError = ({ error, event }: { error: unknown; event: any }) => {
  console.error('[SvelteKit Server Error]', error, 'URL:', event.url.href);
  return {
    message: error instanceof Error ? error.message : 'Internal Error'
  };
};
