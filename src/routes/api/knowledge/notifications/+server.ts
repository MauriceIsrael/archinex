import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/auth/guard.server';
import { kbNotificationService } from '$lib/server/kbNotifications';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  requireAuth(locals);
  const userId = locals.session!.user.id;
  const unreadOnly = url.searchParams.get('unread') === 'true';

  const notifications = await kbNotificationService.getUserNotifications(userId, unreadOnly);

  return json({
    status: 'ok',
    data: notifications
  });
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  requireAuth(locals);
  const userId = locals.session!.user.id;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.all) {
    await kbNotificationService.markAllNotificationsRead(userId);
  } else if (body.id) {
    await kbNotificationService.markNotificationRead(body.id, userId);
  } else {
    return json({ status: 'error', error: 'Paramètre id ou all requis' }, { status: 400 });
  }

  return json({
    status: 'ok',
    success: true
  });
};
