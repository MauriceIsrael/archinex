import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** POST /api/auth/logout — clear both auth cookies */
export const POST: RequestHandler = async ({ cookies, url }) => {
  const isSecure = process.env.NODE_ENV === 'production' && url.protocol === 'https:';
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
  };
  cookies.delete('accessToken', cookieOpts);
  cookies.delete('refreshToken', cookieOpts);
  return json({ ok: true });
};
