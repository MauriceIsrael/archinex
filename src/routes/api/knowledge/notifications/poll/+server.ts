import { json } from '@sveltejs/kit';
import { kbNotificationService } from '$lib/server/kbNotifications';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  const result = await kbNotificationService.pollAndDispatchEvents();
  return json({
    status: 'ok',
    data: result
  });
};
