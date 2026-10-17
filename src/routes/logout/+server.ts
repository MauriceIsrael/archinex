import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function clearAuthCookies(cookies: any, isSecure: boolean) {
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
  };
  cookies.delete('accessToken', cookieOpts);
  cookies.delete('refreshToken', cookieOpts);
}

/**
 * GET /logout — Cleanly clear session cookies and redirect to /login.
 * Using a direct server redirect avoids client-side router caching issues.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
  const isSecure = process.env.NODE_ENV === 'production' && url.protocol === 'https:';
  clearAuthCookies(cookies, isSecure);
  throw redirect(302, '/login');
};

/**
 * POST /logout — Support form action logout.
 */
export const POST: RequestHandler = async ({ cookies, url }) => {
  const isSecure = process.env.NODE_ENV === 'production' && url.protocol === 'https:';
  clearAuthCookies(cookies, isSecure);
  throw redirect(302, '/login');
};

